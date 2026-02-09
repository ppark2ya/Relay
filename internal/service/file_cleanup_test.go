package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"relay/internal/repository"
	"relay/internal/testutil"
)

func createTestUploadedFile(t *testing.T, q *repository.Queries, storedName string) int64 {
	t.Helper()
	f, err := q.CreateUploadedFile(context.Background(), repository.CreateUploadedFileParams{
		WorkspaceID:  1,
		OriginalName: "original-" + storedName,
		StoredName:   storedName,
		ContentType:  "application/octet-stream",
		Size:         100,
	})
	if err != nil {
		t.Fatalf("CreateUploadedFile: %v", err)
	}
	return f.ID
}

func TestCleanup_UnreferencedDBFile(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	storedName := "orphan-file.bin"
	createTestUploadedFile(t, q, storedName)
	// Create the file on disk too
	os.WriteFile(filepath.Join(dir, storedName), []byte("data"), 0644)

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, true)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Orphans) != 1 {
		t.Fatalf("expected 1 orphan, got %d", len(result.Orphans))
	}
	if result.Orphans[0].Type != "unreferenced" {
		t.Errorf("expected type unreferenced, got %q", result.Orphans[0].Type)
	}
	if result.Orphans[0].StoredName != storedName {
		t.Errorf("expected storedName %q, got %q", storedName, result.Orphans[0].StoredName)
	}
}

func TestCleanup_DiskOnlyFile(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	// File on disk but not in DB
	diskOnly := "disk-only.bin"
	os.WriteFile(filepath.Join(dir, diskOnly), []byte("stale"), 0644)

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, true)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Orphans) != 1 {
		t.Fatalf("expected 1 orphan, got %d", len(result.Orphans))
	}
	if result.Orphans[0].Type != "disk_only" {
		t.Errorf("expected type disk_only, got %q", result.Orphans[0].Type)
	}
	if result.Orphans[0].StoredName != diskOnly {
		t.Errorf("expected storedName %q, got %q", diskOnly, result.Orphans[0].StoredName)
	}
}

func TestCleanup_ReferencedFileNotOrphan(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	storedName := "referenced.bin"
	fileID := createTestUploadedFile(t, q, storedName)
	os.WriteFile(filepath.Join(dir, storedName), []byte("data"), 0644)

	// Create a request that references this file via formdata body
	body, _ := json.Marshal([]map[string]interface{}{
		{"key": "file", "value": "test.txt", "type": "file", "enabled": true, "fileId": fileID},
	})
	_, err = db.Exec(
		`INSERT INTO requests (workspace_id, name, method, url, body_type, body) VALUES (1, 'test', 'POST', 'http://example.com', 'formdata', ?)`,
		string(body),
	)
	if err != nil {
		t.Fatal(err)
	}

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, true)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Orphans) != 0 {
		t.Errorf("expected 0 orphans, got %d: %+v", len(result.Orphans), result.Orphans)
	}
}

func TestCleanup_FlowStepReference(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	storedName := "flow-ref.bin"
	fileID := createTestUploadedFile(t, q, storedName)
	os.WriteFile(filepath.Join(dir, storedName), []byte("data"), 0644)

	// Create a flow and a step that references this file
	_, err = db.Exec(`INSERT INTO flows (workspace_id, name) VALUES (1, 'test flow')`)
	if err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal([]map[string]interface{}{
		{"key": "upload", "value": "doc.pdf", "type": "file", "enabled": true, "fileId": fileID},
	})
	_, err = db.Exec(
		`INSERT INTO flow_steps (flow_id, step_order, workspace_id, name, method, url, body_type, body) VALUES (1, 1, 1, 'step1', 'POST', 'http://example.com', 'formdata', ?)`,
		string(body),
	)
	if err != nil {
		t.Fatal(err)
	}

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, true)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Orphans) != 0 {
		t.Errorf("expected 0 orphans, got %d: %+v", len(result.Orphans), result.Orphans)
	}
}

func TestCleanup_DryRunDoesNotDelete(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	storedName := "dry-run.bin"
	createTestUploadedFile(t, q, storedName)
	diskPath := filepath.Join(dir, storedName)
	os.WriteFile(diskPath, []byte("keep me"), 0644)

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, true)
	if err != nil {
		t.Fatal(err)
	}

	if !result.DryRun {
		t.Error("expected dryRun=true")
	}
	if result.Deleted != 0 {
		t.Errorf("expected 0 deleted in dry run, got %d", result.Deleted)
	}

	// Verify file still exists on disk
	if _, err := os.Stat(diskPath); os.IsNotExist(err) {
		t.Error("file should still exist after dry run")
	}

	// Verify DB record still exists
	files, err := q.ListAllUploadedFiles(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 DB record after dry run, got %d", len(files))
	}
}

func TestCleanup_ActualDelete(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	// Unreferenced DB file
	storedName := "delete-me.bin"
	createTestUploadedFile(t, q, storedName)
	diskPath := filepath.Join(dir, storedName)
	os.WriteFile(diskPath, []byte("bye"), 0644)

	// Disk-only file
	diskOnly := "disk-only-delete.bin"
	diskOnlyPath := filepath.Join(dir, diskOnly)
	os.WriteFile(diskOnlyPath, []byte("also bye"), 0644)

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, false)
	if err != nil {
		t.Fatal(err)
	}

	if result.DryRun {
		t.Error("expected dryRun=false")
	}
	if result.Deleted != 2 {
		t.Errorf("expected 2 deleted, got %d", result.Deleted)
	}

	// Verify files are gone from disk
	for _, p := range []string{diskPath, diskOnlyPath} {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Errorf("file %s should have been deleted", p)
		}
	}

	// Verify DB record is gone
	files, err := q.ListAllUploadedFiles(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 0 {
		t.Errorf("expected 0 DB records after cleanup, got %d", len(files))
	}
}

func TestCleanup_NoOrphans(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	// Create a file and reference it
	storedName := "good-file.bin"
	fileID := createTestUploadedFile(t, q, storedName)
	os.WriteFile(filepath.Join(dir, storedName), []byte("data"), 0644)

	body, _ := json.Marshal([]map[string]interface{}{
		{"key": "file", "value": "test.txt", "type": "file", "enabled": true, "fileId": fileID},
	})
	_, err = db.Exec(
		`INSERT INTO requests (workspace_id, name, method, url, body_type, body) VALUES (1, 'test', 'POST', 'http://example.com', 'formdata', ?)`,
		string(body),
	)
	if err != nil {
		t.Fatal(err)
	}

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, false)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Orphans) != 0 {
		t.Errorf("expected 0 orphans, got %d", len(result.Orphans))
	}
	if result.Deleted != 0 {
		t.Errorf("expected 0 deleted, got %d", result.Deleted)
	}
}

func TestCleanup_MixedOrphans(t *testing.T) {
	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatal(err)
	}

	// Referenced file (should NOT be orphan)
	refStored := "referenced.bin"
	refID := createTestUploadedFile(t, q, refStored)
	os.WriteFile(filepath.Join(dir, refStored), []byte("ref"), 0644)

	body, _ := json.Marshal([]map[string]interface{}{
		{"key": "file", "value": "f.txt", "type": "file", "enabled": true, "fileId": refID},
	})
	_, err = db.Exec(
		`INSERT INTO requests (workspace_id, name, method, url, body_type, body) VALUES (1, 'r', 'POST', 'http://x.com', 'formdata', ?)`,
		string(body),
	)
	if err != nil {
		t.Fatal(err)
	}

	// Unreferenced DB file
	unrefStored := "unreferenced.bin"
	createTestUploadedFile(t, q, unrefStored)
	os.WriteFile(filepath.Join(dir, unrefStored), []byte("unref"), 0644)

	// Disk-only file
	diskOnly := "stale.bin"
	os.WriteFile(filepath.Join(dir, diskOnly), []byte("stale"), 0644)

	result, err := CleanupOrphanFiles(context.Background(), db, q, fs, false)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Orphans) != 2 {
		t.Fatalf("expected 2 orphans, got %d: %+v", len(result.Orphans), result.Orphans)
	}
	if result.Deleted != 2 {
		t.Errorf("expected 2 deleted, got %d", result.Deleted)
	}

	// Referenced file should still exist
	if _, err := os.Stat(filepath.Join(dir, refStored)); os.IsNotExist(err) {
		t.Error("referenced file should not be deleted")
	}

	// Orphans should be gone
	for _, name := range []string{unrefStored, diskOnly} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Errorf("orphan %q should have been deleted", name)
		}
	}

	// Only referenced file should remain in DB
	files, err := q.ListAllUploadedFiles(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 DB record, got %d", len(files))
	}

	// Check orphan types
	typeMap := map[string]bool{}
	for _, o := range result.Orphans {
		typeMap[fmt.Sprintf("%s:%s", o.Type, o.StoredName)] = true
	}
	if !typeMap["unreferenced:"+unrefStored] {
		t.Error("missing unreferenced orphan")
	}
	if !typeMap["disk_only:"+diskOnly] {
		t.Error("missing disk_only orphan")
	}
}
