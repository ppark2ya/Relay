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
		case "POST /api/bridge/v1/transfers/transfer-1/download-ack":
			var acknowledgement struct {
				UserName string `json:"userName"`
			}
			if err := json.NewDecoder(request.Body).Decode(&acknowledgement); err != nil || acknowledgement.UserName != "배포 담당자" {
				t.Fatalf("download acknowledgement = %#v, %v", acknowledgement, err)
			}
			writer.WriteHeader(http.StatusNoContent)
		case "DELETE /api/bridge/v1/transfers/transfer-1":
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
	created, err := client.Upload(context.Background(), Manifest{ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal", SourceRef: transfer.SourceRef, TargetRef: transfer.TargetRef, HeadSHA: transfer.HeadSHA, BundleSHA256: transfer.BundleSHA256, UserName: "개발자 A"}, bundlePath)
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
	if err := client.AcknowledgeDownload(context.Background(), transfer.ID, "배포 담당자"); err != nil {
		t.Fatal(err)
	}
	if err := client.Delete(context.Background(), transfer.ID); err != nil {
		t.Fatal(err)
	}
}

func TestClientFileUploadListDownloadAndAcknowledge(t *testing.T) {
	content := []byte("general file")
	hash := sha256.Sum256(content)
	transfer := FileTransfer{ID: "file-1", ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal", Filename: "release.zip", SHA256: hex.EncodeToString(hash[:])}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.Method + " " + request.URL.Path {
		case "POST /api/bridge/v1/files":
			if err := request.ParseMultipartForm(1024 * 1024); err != nil {
				t.Fatal(err)
			}
			file, _, err := request.FormFile("file")
			if err != nil {
				t.Fatal(err)
			}
			body, _ := io.ReadAll(file)
			if string(body) != string(content) {
				t.Fatalf("file = %q", body)
			}
			writer.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(writer).Encode(transfer)
		case "GET /api/bridge/v1/files":
			_ = json.NewEncoder(writer).Encode([]FileTransfer{transfer})
		case "GET /api/bridge/v1/files/file-1/content":
			_, _ = writer.Write(content)
		case "POST /api/bridge/v1/files/file-1/download-ack":
			var acknowledgement struct {
				UserName string `json:"userName"`
			}
			if err := json.NewDecoder(request.Body).Decode(&acknowledgement); err != nil || acknowledgement.UserName != "배포 담당자" {
				t.Fatalf("file download acknowledgement = %#v, %v", acknowledgement, err)
			}
			writer.WriteHeader(http.StatusNoContent)
		case "DELETE /api/bridge/v1/files/file-1":
			writer.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected request %s %s", request.Method, request.URL.Path)
		}
	}))
	defer server.Close()
	client, err := NewClient(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(t.TempDir(), "release.zip")
	if err := os.WriteFile(source, content, 0600); err != nil {
		t.Fatal(err)
	}
	created, err := client.UploadFile(context.Background(), FileManifest{ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal", Filename: "release.zip", SHA256: hex.EncodeToString(hash[:]), UserName: "개발자 A"}, source)
	if err != nil || created.ID != transfer.ID {
		t.Fatalf("UploadFile = %#v, %v", created, err)
	}
	files, err := client.ListFiles(context.Background(), "project-a", "internal")
	if err != nil || len(files) != 1 {
		t.Fatalf("ListFiles = %#v, %v", files, err)
	}
	destination := filepath.Join(t.TempDir(), "download", "release.zip")
	if err := client.DownloadFile(context.Background(), transfer.ID, destination, transfer.SHA256); err != nil {
		t.Fatal(err)
	}
	received, err := os.ReadFile(destination)
	if err != nil || string(received) != string(content) {
		t.Fatalf("download = %q, %v", received, err)
	}
	if err := client.AcknowledgeFileDownload(context.Background(), transfer.ID, "배포 담당자"); err != nil {
		t.Fatal(err)
	}
	if err := client.DeleteFile(context.Background(), transfer.ID); err != nil {
		t.Fatal(err)
	}
}
