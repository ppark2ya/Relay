package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWorkspaceID_DefaultWhenNoHeader(t *testing.T) {
	var gotID int64
	handler := WorkspaceID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = GetWorkspaceID(r.Context())
	}))

	req := httptest.NewRequest("GET", "/", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if gotID != 1 {
		t.Errorf("expected default workspace ID 1, got %d", gotID)
	}
}

func TestWorkspaceID_ValidHeader(t *testing.T) {
	var gotID int64
	handler := WorkspaceID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = GetWorkspaceID(r.Context())
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Workspace-ID", "42")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if gotID != 42 {
		t.Errorf("expected workspace ID 42, got %d", gotID)
	}
}

func TestWorkspaceID_InvalidHeader_NonNumeric(t *testing.T) {
	var gotID int64
	handler := WorkspaceID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = GetWorkspaceID(r.Context())
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Workspace-ID", "abc")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if gotID != 1 {
		t.Errorf("expected default workspace ID 1 for non-numeric header, got %d", gotID)
	}
}

func TestWorkspaceID_InvalidHeader_Zero(t *testing.T) {
	var gotID int64
	handler := WorkspaceID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = GetWorkspaceID(r.Context())
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Workspace-ID", "0")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if gotID != 1 {
		t.Errorf("expected default workspace ID 1 for zero header, got %d", gotID)
	}
}

func TestWorkspaceID_InvalidHeader_Negative(t *testing.T) {
	var gotID int64
	handler := WorkspaceID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = GetWorkspaceID(r.Context())
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Workspace-ID", "-5")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if gotID != 1 {
		t.Errorf("expected default workspace ID 1 for negative header, got %d", gotID)
	}
}

func TestWorkspaceID_EmptyHeader(t *testing.T) {
	var gotID int64
	handler := WorkspaceID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotID = GetWorkspaceID(r.Context())
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Workspace-ID", "")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	if gotID != 1 {
		t.Errorf("expected default workspace ID 1 for empty header, got %d", gotID)
	}
}

func TestGetWorkspaceID_WithoutMiddleware(t *testing.T) {
	// Context without middleware should return default 1
	id := GetWorkspaceID(context.Background())
	if id != 1 {
		t.Errorf("expected default workspace ID 1 from bare context, got %d", id)
	}
}
