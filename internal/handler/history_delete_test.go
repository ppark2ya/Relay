package handler_test

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/repository"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

func setupHistoryDeleteTestServer(t *testing.T) (*httptest.Server, *repository.Queries) {
	t.Helper()

	_, q := testutil.SetupTestDBWithConn(t)
	histH := handler.NewHistoryHandler(q)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	r.Get("/api/history", histH.List)
	r.Get("/api/history/{id}", histH.Get)
	r.Delete("/api/history/{id}", histH.Delete)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts, q
}

// ---------------------------------------------------------------------------
// History Delete
// ---------------------------------------------------------------------------

func TestHistory_Delete(t *testing.T) {
	ts, q := setupHistoryDeleteTestServer(t)

	// Insert a history record directly via repository
	hist, err := q.CreateHistory(context.Background(), repository.CreateHistoryParams{
		Method:          "GET",
		Url:             "https://api.example.com/test",
		RequestHeaders:  sql.NullString{String: "{}", Valid: true},
		RequestBody:     sql.NullString{String: "", Valid: true},
		StatusCode:      sql.NullInt64{Int64: 200, Valid: true},
		ResponseHeaders: sql.NullString{String: "{}", Valid: true},
		ResponseBody:    sql.NullString{String: `{"ok":true}`, Valid: true},
		DurationMs:      sql.NullInt64{Int64: 42, Valid: true},
		WorkspaceID:     1,
	})
	if err != nil {
		t.Fatalf("create test history: %v", err)
	}

	// Verify it exists via API
	resp, err := http.Get(ts.URL + fmt.Sprintf("/api/history/%d", hist.ID))
	if err != nil {
		t.Fatalf("get history: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	var fetched handler.HistoryResponse
	readJSON(t, resp, &fetched)

	if fetched.Method != "GET" {
		t.Errorf("expected method GET, got %q", fetched.Method)
	}

	// Delete
	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/history/%d", hist.ID), nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete history: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", resp.StatusCode)
	}

	// Verify deleted
	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/history/%d", hist.ID))
	if err != nil {
		t.Fatalf("get deleted history: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404 after delete, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// History Delete Invalid ID
// ---------------------------------------------------------------------------

func TestHistory_Delete_InvalidID(t *testing.T) {
	ts, _ := setupHistoryDeleteTestServer(t)

	req, _ := http.NewRequest("DELETE", ts.URL+"/api/history/abc", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete history with invalid ID: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}
}
