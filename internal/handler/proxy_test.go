package handler_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

func setupProxyTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	_, q := testutil.SetupTestDBWithConn(t)
	ph := handler.NewProxyHandler(q)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	r.Get("/api/proxies", ph.List)
	r.Post("/api/proxies", ph.Create)
	r.Get("/api/proxies/{id}", ph.Get)
	r.Put("/api/proxies/{id}", ph.Update)
	r.Delete("/api/proxies/{id}", ph.Delete)
	r.Post("/api/proxies/{id}/activate", ph.Activate)
	r.Post("/api/proxies/{id}/test", ph.Test)
	r.Post("/api/proxies/deactivate", ph.Deactivate)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

// ---------------------------------------------------------------------------
// Proxy CRUD
// ---------------------------------------------------------------------------

func TestProxy_CRUD(t *testing.T) {
	ts := setupProxyTestServer(t)

	// Create
	resp, err := postJSON(ts.URL+"/api/proxies", `{"name":"My Proxy","url":"http://proxy.example.com:8080"}`)
	if err != nil {
		t.Fatalf("create proxy: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var created handler.ProxyResponse
	readJSON(t, resp, &created)

	if created.Name != "My Proxy" {
		t.Errorf("expected name 'My Proxy', got %q", created.Name)
	}
	if created.URL != "http://proxy.example.com:8080" {
		t.Errorf("expected url 'http://proxy.example.com:8080', got %q", created.URL)
	}
	if created.IsActive {
		t.Errorf("expected isActive false on creation")
	}

	// List
	resp, err = http.Get(ts.URL + "/api/proxies")
	if err != nil {
		t.Fatalf("list proxies: %v", err)
	}
	var proxies []handler.ProxyResponse
	readJSON(t, resp, &proxies)

	if len(proxies) != 1 {
		t.Fatalf("expected 1 proxy, got %d", len(proxies))
	}
	if proxies[0].ID != created.ID {
		t.Errorf("expected proxy ID %d, got %d", created.ID, proxies[0].ID)
	}

	// Get
	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/proxies/%d", created.ID))
	if err != nil {
		t.Fatalf("get proxy: %v", err)
	}
	var got handler.ProxyResponse
	readJSON(t, resp, &got)

	if got.Name != "My Proxy" {
		t.Errorf("expected name 'My Proxy', got %q", got.Name)
	}

	// Update
	resp, err = putJSON(ts.URL+fmt.Sprintf("/api/proxies/%d", created.ID), `{"name":"Updated Proxy","url":"http://proxy2.example.com:9090"}`)
	if err != nil {
		t.Fatalf("update proxy: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	var updated handler.ProxyResponse
	readJSON(t, resp, &updated)

	if updated.Name != "Updated Proxy" {
		t.Errorf("expected name 'Updated Proxy', got %q", updated.Name)
	}
	if updated.URL != "http://proxy2.example.com:9090" {
		t.Errorf("expected updated url, got %q", updated.URL)
	}

	// Delete
	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/proxies/%d", created.ID), nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete proxy: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", resp.StatusCode)
	}

	// Verify deleted
	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/proxies/%d", created.ID))
	if err != nil {
		t.Fatalf("get deleted proxy: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404 after delete, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Proxy Activate / Deactivate singleton pattern
// ---------------------------------------------------------------------------

func TestProxy_Activate_Deactivate(t *testing.T) {
	ts := setupProxyTestServer(t)

	// Create two proxies
	resp, _ := postJSON(ts.URL+"/api/proxies", `{"name":"Proxy A","url":"http://a.proxy:8080"}`)
	var proxyA handler.ProxyResponse
	readJSON(t, resp, &proxyA)

	resp, _ = postJSON(ts.URL+"/api/proxies", `{"name":"Proxy B","url":"http://b.proxy:8080"}`)
	var proxyB handler.ProxyResponse
	readJSON(t, resp, &proxyB)

	// Activate proxy A
	resp, err := postJSON(ts.URL+fmt.Sprintf("/api/proxies/%d/activate", proxyA.ID), `{}`)
	if err != nil {
		t.Fatalf("activate proxy A: %v", err)
	}
	var activatedA handler.ProxyResponse
	readJSON(t, resp, &activatedA)

	if !activatedA.IsActive {
		t.Errorf("expected proxy A to be active")
	}

	// Activate proxy B — should deactivate A
	resp, err = postJSON(ts.URL+fmt.Sprintf("/api/proxies/%d/activate", proxyB.ID), `{}`)
	if err != nil {
		t.Fatalf("activate proxy B: %v", err)
	}
	var activatedB handler.ProxyResponse
	readJSON(t, resp, &activatedB)

	if !activatedB.IsActive {
		t.Errorf("expected proxy B to be active")
	}

	// Verify A is now inactive
	resp, _ = http.Get(ts.URL + fmt.Sprintf("/api/proxies/%d", proxyA.ID))
	var fetchedA handler.ProxyResponse
	readJSON(t, resp, &fetchedA)

	if fetchedA.IsActive {
		t.Errorf("expected proxy A to be deactivated after activating B")
	}

	// Deactivate all
	resp, err = postJSON(ts.URL+"/api/proxies/deactivate", `{}`)
	if err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", resp.StatusCode)
	}

	// Verify B is now inactive
	resp, _ = http.Get(ts.URL + fmt.Sprintf("/api/proxies/%d", proxyB.ID))
	var fetchedB handler.ProxyResponse
	readJSON(t, resp, &fetchedB)

	if fetchedB.IsActive {
		t.Errorf("expected proxy B to be deactivated after deactivate all")
	}
}

// ---------------------------------------------------------------------------
// Proxy Test endpoint (invalid URL → connection failure)
// ---------------------------------------------------------------------------

func TestProxy_Test(t *testing.T) {
	ts := setupProxyTestServer(t)

	// Create proxy with unreachable URL
	resp, _ := postJSON(ts.URL+"/api/proxies", `{"name":"Bad Proxy","url":"http://127.0.0.1:1"}`)
	var proxy handler.ProxyResponse
	readJSON(t, resp, &proxy)

	// Test — should return success:false because proxy is unreachable
	resp, err := postJSON(ts.URL+fmt.Sprintf("/api/proxies/%d/test", proxy.ID), `{}`)
	if err != nil {
		t.Fatalf("test proxy: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var result map[string]any
	readJSON(t, resp, &result)

	if result["success"] != false {
		t.Errorf("expected success=false for unreachable proxy, got %v", result["success"])
	}
}

// ---------------------------------------------------------------------------
// Proxy Invalid ID
// ---------------------------------------------------------------------------

func TestProxy_InvalidID(t *testing.T) {
	ts := setupProxyTestServer(t)

	resp, err := http.Get(ts.URL + "/api/proxies/abc")
	if err != nil {
		t.Fatalf("get proxy with invalid ID: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Proxy Not Found
// ---------------------------------------------------------------------------

func TestProxy_NotFound(t *testing.T) {
	ts := setupProxyTestServer(t)

	resp, err := http.Get(ts.URL + "/api/proxies/999")
	if err != nil {
		t.Fatalf("get proxy: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", resp.StatusCode)
	}
}
