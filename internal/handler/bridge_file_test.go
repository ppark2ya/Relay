package handler_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"relay/internal/handler"
	"relay/internal/service"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

func newBridgeFileRouter(t *testing.T) http.Handler {
	t.Helper()
	db, _ := testutil.SetupTestDBWithConn(t)
	storage, err := service.NewBridgeFileStorage(t.TempDir(), 1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	files := handler.NewBridgeFileHandler(service.NewBridgeFileService(db, storage, 14*24*time.Hour))
	router := chi.NewRouter()
	router.Post("/api/bridge/v1/files", files.Upload)
	router.Get("/api/bridge/v1/files", files.List)
	router.Get("/api/bridge/v1/files/{id}/content", files.Download)
	router.Post("/api/bridge/v1/files/{id}/download-ack", files.AcknowledgeDownload)
	router.Delete("/api/bridge/v1/files/{id}", files.Delete)
	return router
}

func TestBridgeFileHandlerRoundTrip(t *testing.T) {
	server := httptest.NewServer(newBridgeFileRouter(t))
	defer server.Close()
	content := []byte("file payload")
	hash := sha256.Sum256(content)
	manifest, _ := json.Marshal(service.BridgeFileManifest{ProjectID: "project-a", SourceNetwork: "external", TargetNetwork: "internal", Filename: "note.txt", SHA256: hex.EncodeToString(hash[:])})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	_ = writer.WriteField("manifest", string(manifest))
	part, err := writer.CreateFormFile("file", "note.txt")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(content)
	_ = writer.Close()
	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, server.URL+"/api/bridge/v1/files", &body)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := http.DefaultClient.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("upload = %v, %v", response, err)
	}
	var transfer service.BridgeFile
	if err := json.NewDecoder(response.Body).Decode(&transfer); err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	response, err = http.Get(server.URL + "/api/bridge/v1/files?projectId=project-a&targetNetwork=internal")
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("list = %v, %v", response, err)
	}
	var files []service.BridgeFile
	if err := json.NewDecoder(response.Body).Decode(&files); err != nil || len(files) != 1 {
		t.Fatalf("files = %#v, %v", files, err)
	}
	response.Body.Close()
	response, err = http.Get(server.URL + "/api/bridge/v1/files/" + transfer.ID + "/content")
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("download = %v, %v", response, err)
	}
	received, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || !bytes.Equal(received, content) {
		t.Fatalf("received = %q, %v", received, err)
	}
}
