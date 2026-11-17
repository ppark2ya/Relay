package git

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type BundleInfo struct {
	Path      string
	SourceRef string
	HeadSHA   string
	BaseSHA   string
	SHA256    string
}

type ImportResult struct {
	IncomingRef string
	Branch      string
	HeadSHA     string
}

func run(ctx context.Context, repo string, args ...string) (string, error) {
	command := exec.CommandContext(ctx, "git", append([]string{"-C", repo}, args...)...)
	output, err := command.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(output)))
	}
	return strings.TrimSpace(string(output)), nil
}

func EnsureRepository(ctx context.Context, repo string) error {
	_, err := run(ctx, repo, "rev-parse", "--git-dir")
	return err
}

func EnsureTrackedWorkingTreeClean(ctx context.Context, repo string) error {
	status, err := run(ctx, repo, "status", "--porcelain", "--untracked-files=no")
	if err != nil {
		return err
	}
	if status != "" {
		return fmt.Errorf("working tree has tracked changes; commit, stash, or discard them before continuing")
	}
	return nil
}

func NormalizeBranchRef(ref string) (string, error) {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return "", fmt.Errorf("branch is required")
	}
	if strings.HasPrefix(ref, "refs/heads/") {
		return ref, nil
	}
	if strings.HasPrefix(ref, "refs/") {
		return "", fmt.Errorf("only local branch refs are supported")
	}
	return "refs/heads/" + ref, nil
}

func CreateBundle(ctx context.Context, repo, sourceRef, targetRef, destination string) (BundleInfo, error) {
	if err := EnsureRepository(ctx, repo); err != nil {
		return BundleInfo{}, err
	}
	if err := EnsureTrackedWorkingTreeClean(ctx, repo); err != nil {
		return BundleInfo{}, err
	}
	sourceRef, err := NormalizeBranchRef(sourceRef)
	if err != nil {
		return BundleInfo{}, err
	}
	targetRef, err = NormalizeBranchRef(targetRef)
	if err != nil {
		return BundleInfo{}, err
	}
	headSHA, err := run(ctx, repo, "rev-parse", "--verify", sourceRef+"^{commit}")
	if err != nil {
		return BundleInfo{}, err
	}
	baseSHA, err := run(ctx, repo, "merge-base", sourceRef, targetRef)
	if err != nil {
		return BundleInfo{}, fmt.Errorf("find source/target base: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
		return BundleInfo{}, err
	}
	if _, err := run(ctx, repo, "bundle", "create", destination, sourceRef); err != nil {
		return BundleInfo{}, err
	}
	hash, err := SHA256File(destination)
	if err != nil {
		return BundleInfo{}, err
	}
	return BundleInfo{Path: destination, SourceRef: sourceRef, HeadSHA: headSHA, BaseSHA: baseSHA, SHA256: hash}, nil
}

func SHA256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func safeBranchComponent(ref string) string {
	ref = strings.TrimPrefix(ref, "refs/heads/")
	replacer := strings.NewReplacer("/", "-", "\\", "-", " ", "-", "~", "-", "^", "-", ":", "-")
	return replacer.Replace(ref)
}

func ImportAndCheckout(ctx context.Context, repo, bundlePath, transferID, sourceNetwork, sourceRef, expectedSHA string) (ImportResult, error) {
	if err := EnsureRepository(ctx, repo); err != nil {
		return ImportResult{}, err
	}
	if err := EnsureTrackedWorkingTreeClean(ctx, repo); err != nil {
		return ImportResult{}, err
	}
	if actual, err := SHA256File(bundlePath); err != nil {
		return ImportResult{}, err
	} else if actual != expectedSHA {
		return ImportResult{}, fmt.Errorf("downloaded bundle SHA-256 does not match transfer metadata")
	}
	if _, err := run(ctx, repo, "bundle", "verify", bundlePath); err != nil {
		return ImportResult{}, err
	}
	sourceRef, err := NormalizeBranchRef(sourceRef)
	if err != nil {
		return ImportResult{}, err
	}
	incomingRef := "refs/bridge/incoming/" + transferID
	if _, err := run(ctx, repo, "fetch", "--no-tags", bundlePath, "+"+sourceRef+":"+incomingRef); err != nil {
		return ImportResult{}, err
	}
	headSHA, err := run(ctx, repo, "rev-parse", incomingRef+"^{commit}")
	if err != nil {
		return ImportResult{}, err
	}
	shortID := transferID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}
	branch := "bridge/" + sourceNetwork + "/" + safeBranchComponent(sourceRef) + "/" + shortID
	if _, err := run(ctx, repo, "show-ref", "--verify", "--quiet", "refs/heads/"+branch); err != nil {
		if _, err := run(ctx, repo, "branch", branch, incomingRef); err != nil {
			return ImportResult{}, err
		}
	}
	if _, err := run(ctx, repo, "switch", branch); err != nil {
		return ImportResult{}, err
	}
	return ImportResult{IncomingRef: incomingRef, Branch: branch, HeadSHA: headSHA}, nil
}
