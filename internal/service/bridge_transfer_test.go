package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"testing"
	"time"

	"relay/internal/testutil"
)

func bridgeManifest(content []byte) BridgeManifest {
	hash := sha256.Sum256(content)
	return BridgeManifest{
		ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal",
		SourceRef: "refs/heads/feature/payment", TargetRef: "refs/heads/main",
		HeadSHA: "abcdef1234", BaseSHA: "1234abcdef", BundleSHA256: hex.EncodeToString(hash[:]),
	}
}

func TestBridgeServiceCreateListOpenAndAcknowledge(t *testing.T) {
	db, _ := testutil.SetupTestDBWithConn(t)
	storage, err := NewBridgeStorage(t.TempDir(), 1024)
	if err != nil {
		t.Fatal(err)
	}
	service := NewBridgeService(db, storage, 30*24*time.Hour)
	content := []byte("git bundle content")
	transfer, err := service.Create(context.Background(), bridgeManifest(content), bytes.NewReader(content))
	if err != nil {
		t.Fatal(err)
	}
	if transfer.ID == "" || transfer.Size != int64(len(content)) {
		t.Fatalf("unexpected transfer: %+v", transfer)
	}

	transfers, err := service.List(context.Background(), "project-a", "internal")
	if err != nil || len(transfers) != 1 {
		t.Fatalf("List: %v, %#v", err, transfers)
	}
	_, reader, err := service.Open(context.Background(), transfer.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	loaded, err := io.ReadAll(reader)
	if err != nil || !bytes.Equal(loaded, content) {
		t.Fatalf("stored bundle = %q, %v", loaded, err)
	}

	if err := service.AcknowledgeDownload(context.Background(), transfer.ID); err != nil {
		t.Fatal(err)
	}
	transfers, err = service.List(context.Background(), "project-a", "internal")
	if err != nil || transfers[0].DownloadedAt == nil {
		t.Fatalf("acknowledgement was not persisted: %v %#v", err, transfers)
	}
}

func TestBridgeServiceRejectsHashMismatchAndRemovesTemporaryFile(t *testing.T) {
	db, _ := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	storage, err := NewBridgeStorage(dir, 1024)
	if err != nil {
		t.Fatal(err)
	}
	service := NewBridgeService(db, storage, time.Hour)
	manifest := bridgeManifest([]byte("expected"))
	if _, err := service.Create(context.Background(), manifest, bytes.NewReader([]byte("actual"))); err == nil {
		t.Fatal("expected hash mismatch")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("hash mismatch left files behind: %#v", entries)
	}
}

func TestBridgeServiceCleansExpiredTransfers(t *testing.T) {
	db, _ := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	storage, err := NewBridgeStorage(dir, 1024)
	if err != nil {
		t.Fatal(err)
	}
	service := NewBridgeService(db, storage, time.Hour)
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }
	transfer, err := service.Create(context.Background(), bridgeManifest([]byte("bundle")), bytes.NewReader([]byte("bundle")))
	if err != nil {
		t.Fatal(err)
	}
	service.now = func() time.Time { return now.Add(2 * time.Hour) }
	count, err := service.CleanupExpired(context.Background())
	if err != nil || count != 1 {
		t.Fatalf("CleanupExpired = %d, %v", count, err)
	}
	if _, _, err := service.Open(context.Background(), transfer.ID); err == nil {
		t.Fatal("expired transfer is still available")
	}
}
