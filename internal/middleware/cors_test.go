package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// ---------------------------------------------------------------------------
// CORS Headers on normal request
// ---------------------------------------------------------------------------

func TestCORS_Headers(t *testing.T) {
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	handler := CORS(next)

	req := httptest.NewRequest("GET", "/api/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !called {
		t.Fatal("expected next handler to be called for GET request")
	}

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("expected Access-Control-Allow-Origin '*', got %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, PUT, DELETE, OPTIONS" {
		t.Errorf("expected Access-Control-Allow-Methods, got %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type, Authorization, X-Workspace-ID" {
		t.Errorf("expected Access-Control-Allow-Headers, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// CORS Preflight (OPTIONS) — 200 + next handler NOT called
// ---------------------------------------------------------------------------

func TestCORS_Preflight(t *testing.T) {
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	})

	handler := CORS(next)

	req := httptest.NewRequest("OPTIONS", "/api/test", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if called {
		t.Fatal("expected next handler NOT to be called for OPTIONS preflight")
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200 for preflight, got %d", rec.Code)
	}

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("expected Access-Control-Allow-Origin '*', got %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, PUT, DELETE, OPTIONS" {
		t.Errorf("expected Access-Control-Allow-Methods, got %q", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type, Authorization, X-Workspace-ID" {
		t.Errorf("expected Access-Control-Allow-Headers, got %q", got)
	}
}
