package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"testing"
	"time"

	"relay/internal/testutil"
)

func bridgeFileManifest(content []byte) BridgeFileManifest {
	hash := sha256.Sum256(content)
	return BridgeFileManifest{ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal", Filename: "release.zip", SHA256: hex.EncodeToString(hash[:]), UserName: "개발자 A"}
}

func TestBridgeFileServiceRoundTrip(t *testing.T) {
	db, _ := testutil.SetupTestDBWithConn(t)
	storage, err := NewBridgeFileStorage(t.TempDir(), 1024)
	if err != nil {
		t.Fatal(err)
	}
	service := NewBridgeFileService(db, storage, time.Hour)
	content := []byte("release artifact")
	transfer, err := service.Create(context.Background(), bridgeFileManifest(content), bytes.NewReader(content))
	if err != nil {
		t.Fatal(err)
	}
	files, err := service.List(context.Background(), "project-a", "internal", DefaultBridgeGroupID)
	if err != nil || len(files) != 1 || files[0].Filename != "release.zip" {
		t.Fatalf("List = %#v, %v", files, err)
	}
	_, reader, err := service.Open(context.Background(), transfer.ID)
	if err != nil {
		t.Fatal(err)
	}
	received, err := io.ReadAll(reader)
	reader.Close()
	if err != nil || !bytes.Equal(received, content) {
		t.Fatalf("Open = %q, %v", received, err)
	}
	if err := service.AcknowledgeDownload(context.Background(), transfer.ID, "배포 담당자"); err != nil {
		t.Fatal(err)
	}
	files, err = service.List(context.Background(), "project-a", "internal", DefaultBridgeGroupID)
	if err != nil || files[0].UploadedBy != "개발자 A" || len(files[0].Downloads) != 1 || files[0].Downloads[0].UserName != "배포 담당자" {
		t.Fatalf("download history = %#v, %v", files, err)
	}
	if err := service.Delete(context.Background(), transfer.ID); err != nil {
		t.Fatal(err)
	}
	files, err = service.List(context.Background(), "project-a", "internal", DefaultBridgeGroupID)
	if err != nil || len(files) != 0 {
		t.Fatalf("List after delete = %#v, %v", files, err)
	}
}

func TestBridgeFileServiceRejectsInvalidFileAndCleansExpired(t *testing.T) {
	db, _ := testutil.SetupTestDBWithConn(t)
	storage, err := NewBridgeFileStorage(t.TempDir(), 4)
	if err != nil {
		t.Fatal(err)
	}
	service := NewBridgeFileService(db, storage, time.Hour)
	content := []byte("abc")
	manifest := bridgeFileManifest(content)
	manifest.Filename = "../secret.txt"
	if _, err := service.Create(context.Background(), manifest, bytes.NewReader(content)); err == nil {
		t.Fatal("Create accepted unsafe filename")
	}
	manifest = bridgeFileManifest([]byte("different"))
	if _, err := service.Create(context.Background(), manifest, bytes.NewReader(content)); err == nil {
		t.Fatal("Create accepted checksum mismatch")
	}
	manifest = bridgeFileManifest([]byte("large"))
	if _, err := service.Create(context.Background(), manifest, bytes.NewReader([]byte("large"))); err == nil {
		t.Fatal("Create accepted oversized file")
	}

	service.storage.maxBytes = 1024
	transfer, err := service.Create(context.Background(), bridgeFileManifest(content), bytes.NewReader(content))
	if err != nil {
		t.Fatal(err)
	}
	now := transfer.ExpiresAt.Add(time.Second)
	service.now = func() time.Time { return now }
	count, err := service.CleanupExpired(context.Background())
	if err != nil || count != 1 {
		t.Fatalf("CleanupExpired = %d, %v", count, err)
	}
}
