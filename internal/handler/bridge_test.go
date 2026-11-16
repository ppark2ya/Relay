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

func newBridgeRouter(t *testing.T) http.Handler {
	t.Helper()
	db, _ := testutil.SetupTestDBWithConn(t)
	storage, err := service.NewBridgeStorage(t.TempDir(), 1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	bridge := handler.NewBridgeHandler(service.NewBridgeService(db, storage, 30*24*time.Hour))
	router := chi.NewRouter()
	router.Post("/api/bridge/v1/transfers", bridge.Upload)
	router.Get("/api/bridge/v1/transfers", bridge.List)
	router.Get("/api/bridge/v1/transfers/{id}/bundle", bridge.Download)
	router.Post("/api/bridge/v1/transfers/{id}/download-ack", bridge.AcknowledgeDownload)
	router.Delete("/api/bridge/v1/transfers/{id}", bridge.Delete)
	return router
}

func bridgeUploadRequest(t *testing.T, url string, content []byte) *http.Request {
	t.Helper()
	hash := sha256.Sum256(content)
	manifest, _ := json.Marshal(service.BridgeManifest{
		ProjectID: "project-a", SourceNetwork: "B", TargetNetwork: "A",
		SourceRef: "refs/heads/feature/payment", TargetRef: "refs/heads/main", HeadSHA: "deadbeef",
		BundleSHA256: hex.EncodeToString(hash[:]),
	})
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("manifest", string(manifest)); err != nil {
		t.Fatal(err)
	}
	part, err := writer.CreateFormFile("bundle", "payment.bundle")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, &body)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestBridgeHandlerRoundTrip(t *testing.T) {
	server := httptest.NewServer(newBridgeRouter(t))
	defer server.Close()
	content := []byte("bundle payload")
	response, err := http.DefaultClient.Do(bridgeUploadRequest(t, server.URL+"/api/bridge/v1/transfers", content))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("upload status = %s", response.Status)
	}
	var transfer service.BridgeTransfer
	if err := json.NewDecoder(response.Body).Decode(&transfer); err != nil {
		t.Fatal(err)
	}
	response.Body.Close()

	response, err = http.Get(server.URL + "/api/bridge/v1/transfers?projectId=project-a&targetNetwork=A")
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("list = %v, %v", response.Status, err)
	}
	var transfers []service.BridgeTransfer
	if err := json.NewDecoder(response.Body).Decode(&transfers); err != nil || len(transfers) != 1 {
		t.Fatalf("list decode = %v, %#v", err, transfers)
	}
	response.Body.Close()

	response, err = http.Get(server.URL + "/api/bridge/v1/transfers/" + transfer.ID + "/bundle")
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("download = %v, %v", response.Status, err)
	}
	downloaded, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || !bytes.Equal(downloaded, content) {
		t.Fatalf("downloaded = %q, %v", downloaded, err)
	}
}
