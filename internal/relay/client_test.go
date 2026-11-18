package relay

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestClientUploadListDownloadAndAcknowledge(t *testing.T) {
	bundle := []byte("bundle data")
	hash := sha256.Sum256(bundle)
	transfer := Transfer{ID: "transfer-1", ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal", SourceRef: "refs/heads/feature", TargetRef: "refs/heads/main", HeadSHA: "abc", BundleSHA256: hex.EncodeToString(hash[:])}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.Method + " " + request.URL.Path {
		case "POST /api/bridge/v1/transfers":
			if err := request.ParseMultipartForm(1024); err != nil {
				t.Fatal(err)
			}
			file, _, err := request.FormFile("bundle")
			if err != nil {
				t.Fatal(err)
			}
			defer file.Close()
			if body, _ := io.ReadAll(file); string(body) != string(bundle) {
				t.Fatalf("uploaded bundle = %q", body)
			}
			writer.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(writer).Encode(transfer)
		case "GET /api/bridge/v1/transfers":
			if request.URL.Query().Get("projectId") != "project-a" || request.URL.Query().Get("targetNetwork") != "internal" {
				t.Fatalf("unexpected inbox query: %s", request.URL.RawQuery)
			}
			_ = json.NewEncoder(writer).Encode([]Transfer{transfer})
		case "GET /api/bridge/v1/transfers/transfer-1/bundle":
			_, _ = writer.Write(bundle)
		case "POST /api/bridge/v1/transfers/transfer-1/download-ack", "DELETE /api/bridge/v1/transfers/transfer-1":
			writer.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client, err := NewClient(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	bundlePath := filepath.Join(t.TempDir(), "source.bundle")
	if err := os.WriteFile(bundlePath, bundle, 0600); err != nil {
		t.Fatal(err)
	}
	created, err := client.Upload(context.Background(), Manifest{ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal", SourceRef: transfer.SourceRef, TargetRef: transfer.TargetRef, HeadSHA: transfer.HeadSHA, BundleSHA256: transfer.BundleSHA256}, bundlePath)
	if err != nil || created.ID != transfer.ID {
		t.Fatalf("Upload = %#v, %v", created, err)
	}
	items, err := client.List(context.Background(), "project-a", "internal")
	if err != nil || len(items) != 1 {
		t.Fatalf("List = %#v, %v", items, err)
	}
	destination := filepath.Join(t.TempDir(), "received.bundle")
	if err := client.Download(context.Background(), transfer.ID, destination); err != nil {
		t.Fatal(err)
	}
	if received, _ := os.ReadFile(destination); string(received) != string(bundle) {
		t.Fatalf("downloaded = %q", received)
	}
	if err := client.AcknowledgeDownload(context.Background(), transfer.ID); err != nil {
		t.Fatal(err)
	}
	if err := client.Delete(context.Background(), transfer.ID); err != nil {
		t.Fatal(err)
	}
}
