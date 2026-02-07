package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

func setupWorkspaceTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	_, q := testutil.SetupTestDBWithConn(t)
	wsH := handler.NewWorkspaceHandler(q)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	r.Get("/api/workspaces", wsH.List)
	r.Post("/api/workspaces", wsH.Create)
	r.Get("/api/workspaces/{id}", wsH.Get)
	r.Put("/api/workspaces/{id}", wsH.Update)
	r.Delete("/api/workspaces/{id}", wsH.Delete)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

// ---------------------------------------------------------------------------
// Workspace CRUD Tests
// ---------------------------------------------------------------------------

func TestWorkspace_ListDefault(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	resp, err := http.Get(ts.URL + "/api/workspaces")
	if err != nil {
		t.Fatalf("list workspaces: %v", err)
	}

	var workspaces []handler.WorkspaceResponse
	readJSON(t, resp, &workspaces)

	if len(workspaces) != 1 {
		t.Fatalf("expected 1 default workspace, got %d", len(workspaces))
	}
	if workspaces[0].ID != 1 {
		t.Errorf("expected default workspace ID 1, got %d", workspaces[0].ID)
	}
	if workspaces[0].Name != "Default" {
		t.Errorf("expected default workspace name 'Default', got %q", workspaces[0].Name)
	}
}

func TestWorkspace_Create(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	resp, err := postJSON(ts.URL+"/api/workspaces", `{"name":"Team Alpha"}`)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var ws handler.WorkspaceResponse
	readJSON(t, resp, &ws)

	if ws.Name != "Team Alpha" {
		t.Errorf("expected name 'Team Alpha', got %q", ws.Name)
	}
	if ws.ID <= 1 {
		t.Errorf("expected ID > 1, got %d", ws.ID)
	}
	if ws.CreatedAt == "" {
		t.Error("expected createdAt to be set")
	}
}

func TestWorkspace_Get(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	// Get default workspace
	resp, err := http.Get(ts.URL + "/api/workspaces/1")
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var ws handler.WorkspaceResponse
	readJSON(t, resp, &ws)

	if ws.ID != 1 || ws.Name != "Default" {
		t.Errorf("expected Default workspace, got id=%d name=%q", ws.ID, ws.Name)
	}
}

func TestWorkspace_GetNotFound(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	resp, err := http.Get(ts.URL + "/api/workspaces/999")
	if err != nil {
		t.Fatalf("get workspace: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", resp.StatusCode)
	}
}

func TestWorkspace_Update(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	// Create a workspace first
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Old Name"}`)
	var created handler.WorkspaceResponse
	readJSON(t, resp, &created)

	// Update it
	putResp, err := putJSON(ts.URL+fmt.Sprintf("/api/workspaces/%d", created.ID), `{"name":"New Name"}`)
	if err != nil {
		t.Fatalf("update workspace: %v", err)
	}

	if putResp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", putResp.StatusCode)
	}

	var updated handler.WorkspaceResponse
	readJSON(t, putResp, &updated)

	if updated.Name != "New Name" {
		t.Errorf("expected name 'New Name', got %q", updated.Name)
	}
	if updated.ID != created.ID {
		t.Errorf("expected same ID %d, got %d", created.ID, updated.ID)
	}
}

func TestWorkspace_Delete(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	// Create a workspace
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"To Delete"}`)
	var created handler.WorkspaceResponse
	readJSON(t, resp, &created)

	// Delete it
	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/workspaces/%d", created.ID), nil)
	delResp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete workspace: %v", err)
	}
	defer delResp.Body.Close()

	if delResp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", delResp.StatusCode)
	}

	// Verify it's gone
	getResp, err := http.Get(ts.URL + fmt.Sprintf("/api/workspaces/%d", created.ID))
	if err != nil {
		t.Fatalf("get after delete: %v", err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 after deletion, got %d", getResp.StatusCode)
	}
}

func TestWorkspace_DeleteDefaultBlocked(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	req, _ := http.NewRequest("DELETE", ts.URL+"/api/workspaces/1", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete default workspace: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400 for deleting default workspace, got %d", resp.StatusCode)
	}

	var errResp map[string]string
	json.NewDecoder(resp.Body).Decode(&errResp)
	if errResp["error"] != "Cannot delete the default workspace" {
		t.Errorf("unexpected error message: %q", errResp["error"])
	}
}

func TestWorkspace_CreateInvalidBody(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	resp, err := postJSON(ts.URL+"/api/workspaces", `not valid json`)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}
}

func TestWorkspace_ListAfterMultipleCreates(t *testing.T) {
	ts := setupWorkspaceTestServer(t)

	// Create 2 additional workspaces
	postJSON(ts.URL+"/api/workspaces", `{"name":"Alpha"}`)
	postJSON(ts.URL+"/api/workspaces", `{"name":"Beta"}`)

	resp, _ := http.Get(ts.URL + "/api/workspaces")
	var workspaces []handler.WorkspaceResponse
	readJSON(t, resp, &workspaces)

	if len(workspaces) != 3 {
		t.Fatalf("expected 3 workspaces (Default + Alpha + Beta), got %d", len(workspaces))
	}

	// ListWorkspaces ORDER BY name, so: Alpha, Beta, Default
	names := make([]string, len(workspaces))
	for i, ws := range workspaces {
		names[i] = ws.Name
	}
	expected := []string{"Alpha", "Beta", "Default"}
	for i, name := range expected {
		if names[i] != name {
			t.Errorf("workspace[%d]: expected %q, got %q", i, name, names[i])
		}
	}
}
