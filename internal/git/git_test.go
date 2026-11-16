package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func testGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", append([]string{"-C", dir}, args...)...)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v: %s", strings.Join(args, " "), err, output)
	}
	return strings.TrimSpace(string(output))
}

func TestCreateBundleAndImportPreservesIgnoredEnvironmentFile(t *testing.T) {
	ctx := context.Background()
	origin := t.TempDir()
	testGit(t, origin, "init", "-b", "main")
	testGit(t, origin, "config", "user.email", "test@example.com")
	testGit(t, origin, "config", "user.name", "Test User")
	if err := os.WriteFile(filepath.Join(origin, ".gitignore"), []byte(".env\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(origin, "app.txt"), []byte("base\n"), 0644); err != nil {
		t.Fatal(err)
	}
	testGit(t, origin, "add", ".")
	testGit(t, origin, "commit", "-m", "base")
	testGit(t, origin, "switch", "-c", "feature/payment")
	if err := os.WriteFile(filepath.Join(origin, "app.txt"), []byte("payment\n"), 0644); err != nil {
		t.Fatal(err)
	}
	testGit(t, origin, "commit", "-am", "payment")

	receiverParent := t.TempDir()
	receiver := filepath.Join(receiverParent, "receiver")
	command := exec.Command("git", "clone", origin, receiver)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("clone: %v: %s", err, output)
	}
	testGit(t, receiver, "switch", "main")
	if err := os.WriteFile(filepath.Join(receiver, ".env"), []byte("A_DATABASE_URL=secret\n"), 0600); err != nil {
		t.Fatal(err)
	}

	bundlePath := filepath.Join(t.TempDir(), "payment.bundle")
	bundle, err := CreateBundle(ctx, origin, "feature/payment", "main", bundlePath)
	if err != nil {
		t.Fatal(err)
	}
	result, err := ImportAndCheckout(ctx, receiver, bundle.Path, "transfer-12345678", "B", bundle.SourceRef, bundle.SHA256)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(result.Branch, "bridge/B/feature-payment/") {
		t.Fatalf("unexpected branch %q", result.Branch)
	}
	app, err := os.ReadFile(filepath.Join(receiver, "app.txt"))
	if err != nil || string(app) != "payment\n" {
		t.Fatalf("checked out app = %q, %v", app, err)
	}
	env, err := os.ReadFile(filepath.Join(receiver, ".env"))
	if err != nil || string(env) != "A_DATABASE_URL=secret\n" {
		t.Fatalf("ignored .env was not preserved: %q, %v", env, err)
	}
}

func TestImportRejectsTrackedWorkingTreeChanges(t *testing.T) {
	dir := t.TempDir()
	testGit(t, dir, "init", "-b", "main")
	testGit(t, dir, "config", "user.email", "test@example.com")
	testGit(t, dir, "config", "user.name", "Test User")
	if err := os.WriteFile(filepath.Join(dir, "app.txt"), []byte("base"), 0644); err != nil {
		t.Fatal(err)
	}
	testGit(t, dir, "add", ".")
	testGit(t, dir, "commit", "-m", "base")
	if err := os.WriteFile(filepath.Join(dir, "app.txt"), []byte("dirty"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := EnsureTrackedWorkingTreeClean(context.Background(), dir); err == nil {
		t.Fatal("expected dirty working tree rejection")
	}
}
