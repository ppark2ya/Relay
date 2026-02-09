package handler_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/service"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

func setupFileTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	db, q := testutil.SetupTestDBWithConn(t)
	dir := t.TempDir()
	fs, err := service.NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage: %v", err)
	}
	fh := handler.NewFileHandler(db, q, fs)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)
	r.Post("/api/files/upload", fh.Upload)
	r.Get("/api/files/{id}", fh.Get)
	r.Delete("/api/files/{id}", fh.Delete)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

func uploadTestFile(t *testing.T, tsURL string, filename string, content []byte) handler.UploadedFileResponse {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatalf("CreateFormFile: %v", err)
	}
	part.Write(content)
	writer.Close()

	resp, err := http.Post(tsURL+"/api/files/upload", writer.FormDataContentType(), &buf)
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("upload expected 201, got %d: %s", resp.StatusCode, body)
	}

	var uploaded handler.UploadedFileResponse
	json.NewDecoder(resp.Body).Decode(&uploaded)
	return uploaded
}

// ---------------------------------------------------------------------------
// Upload Tests
// ---------------------------------------------------------------------------

func TestFileUpload_Success(t *testing.T) {
	ts := setupFileTestServer(t)

	uploaded := uploadTestFile(t, ts.URL, "test.txt", []byte("hello world"))

	if uploaded.ID == 0 {
		t.Error("expected non-zero ID")
	}
	if uploaded.OriginalName != "test.txt" {
		t.Errorf("originalName: got %q, want %q", uploaded.OriginalName, "test.txt")
	}
	if uploaded.Size != 11 {
		t.Errorf("size: got %d, want 11", uploaded.Size)
	}
	if uploaded.CreatedAt == "" {
		t.Error("expected createdAt to be set")
	}
}

func TestFileUpload_NoFile(t *testing.T) {
	ts := setupFileTestServer(t)

	// Post without a file field
	resp, err := http.Post(ts.URL+"/api/files/upload", "multipart/form-data; boundary=xxx", bytes.NewReader([]byte("--xxx--\r\n")))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestFileUpload_LargeFile(t *testing.T) {
	ts := setupFileTestServer(t)

	// 1MB file
	content := make([]byte, 1024*1024)
	for i := range content {
		content[i] = byte(i % 256)
	}

	uploaded := uploadTestFile(t, ts.URL, "large.bin", content)

	if uploaded.Size != int64(len(content)) {
		t.Errorf("size: got %d, want %d", uploaded.Size, len(content))
	}
}

// ---------------------------------------------------------------------------
// Get Tests
// ---------------------------------------------------------------------------

func TestFileGet_Success(t *testing.T) {
	ts := setupFileTestServer(t)

	uploaded := uploadTestFile(t, ts.URL, "readme.md", []byte("# README"))

	resp, err := http.Get(ts.URL + fmt.Sprintf("/api/files/%d", uploaded.ID))
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var got handler.UploadedFileResponse
	json.NewDecoder(resp.Body).Decode(&got)

	if got.ID != uploaded.ID {
		t.Errorf("id: got %d, want %d", got.ID, uploaded.ID)
	}
	if got.OriginalName != "readme.md" {
		t.Errorf("originalName: got %q, want %q", got.OriginalName, "readme.md")
	}
	if got.Size != 8 {
		t.Errorf("size: got %d, want 8", got.Size)
	}
}

func TestFileGet_NotFound(t *testing.T) {
	ts := setupFileTestServer(t)

	resp, err := http.Get(ts.URL + "/api/files/999")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestFileGet_InvalidID(t *testing.T) {
	ts := setupFileTestServer(t)

	resp, err := http.Get(ts.URL + "/api/files/abc")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Delete Tests
// ---------------------------------------------------------------------------

func TestFileDelete_Success(t *testing.T) {
	ts := setupFileTestServer(t)

	uploaded := uploadTestFile(t, ts.URL, "delete-me.txt", []byte("bye"))

	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/files/%d", uploaded.ID), nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	// Verify it's gone
	getResp, _ := http.Get(ts.URL + fmt.Sprintf("/api/files/%d", uploaded.ID))
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 after delete, got %d", getResp.StatusCode)
	}
}

func TestFileDelete_NotFound(t *testing.T) {
	ts := setupFileTestServer(t)

	req, _ := http.NewRequest("DELETE", ts.URL+"/api/files/999", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestFileDelete_InvalidID(t *testing.T) {
	ts := setupFileTestServer(t)

	req, _ := http.NewRequest("DELETE", ts.URL+"/api/files/abc", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Upload + Get round-trip
// ---------------------------------------------------------------------------

func TestFileUploadAndGet_RoundTrip(t *testing.T) {
	ts := setupFileTestServer(t)

	// Upload two files
	f1 := uploadTestFile(t, ts.URL, "file1.txt", []byte("content1"))
	f2 := uploadTestFile(t, ts.URL, "file2.json", []byte(`{"key":"value"}`))

	if f1.ID == f2.ID {
		t.Error("expected different IDs for different files")
	}

	// Get both
	resp1, _ := http.Get(ts.URL + fmt.Sprintf("/api/files/%d", f1.ID))
	var got1 handler.UploadedFileResponse
	json.NewDecoder(resp1.Body).Decode(&got1)
	resp1.Body.Close()

	resp2, _ := http.Get(ts.URL + fmt.Sprintf("/api/files/%d", f2.ID))
	var got2 handler.UploadedFileResponse
	json.NewDecoder(resp2.Body).Decode(&got2)
	resp2.Body.Close()

	if got1.OriginalName != "file1.txt" {
		t.Errorf("file1 name: got %q", got1.OriginalName)
	}
	if got2.OriginalName != "file2.json" {
		t.Errorf("file2 name: got %q", got2.OriginalName)
	}

	// Delete first, second should still exist
	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/files/%d", f1.ID), nil)
	http.DefaultClient.Do(req)

	getResp, _ := http.Get(ts.URL + fmt.Sprintf("/api/files/%d", f2.ID))
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusOK {
		t.Errorf("file2 should still exist after deleting file1, got %d", getResp.StatusCode)
	}
}
