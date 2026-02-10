package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/service"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

// setupIsolationTestServer creates a server with workspace, collection, request,
// environment, flow, and history routes for testing workspace isolation.
func setupIsolationTestServer(t *testing.T, mockTarget *httptest.Server) *httptest.Server {
	t.Helper()

	db, q := testutil.SetupTestDBWithConn(t)

	vr := service.NewVariableResolver(q)
	re := service.NewRequestExecutor(q, vr, nil)
	fr := service.NewFlowRunner(q, re, vr)

	wsH := handler.NewWorkspaceHandler(q)
	collH := handler.NewCollectionHandler(q, db)
	reqH := handler.NewRequestHandler(q, re, fr)
	envH := handler.NewEnvironmentHandler(q)
	flowH := handler.NewFlowHandler(q, fr, db)
	histH := handler.NewHistoryHandler(q)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	// Workspaces
	r.Post("/api/workspaces", wsH.Create)

	// Collections
	r.Get("/api/collections", collH.List)
	r.Post("/api/collections", collH.Create)

	// Requests
	r.Get("/api/requests", reqH.List)
	r.Post("/api/requests", reqH.Create)
	r.Post("/api/requests/{id}/execute", reqH.Execute)

	// Environments
	r.Get("/api/environments", envH.List)
	r.Post("/api/environments", envH.Create)
	r.Post("/api/environments/{id}/activate", envH.Activate)

	// Flows
	r.Get("/api/flows", flowH.List)
	r.Post("/api/flows", flowH.Create)

	// History
	r.Get("/api/history", histH.List)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

// ---------------------------------------------------------------------------
// Test: Collections are isolated by workspace
// ---------------------------------------------------------------------------
func TestIsolation_Collections(t *testing.T) {
	ts := setupIsolationTestServer(t, nil)

	// Create workspace 2
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Team B"}`)
	var ws2 handler.WorkspaceResponse
	readJSON(t, resp, &ws2)

	// Create collection in workspace 1 (default)
	postJSONWithWorkspace(ts.URL+"/api/collections", `{"name":"WS1 Collection"}`, 1)

	// Create collection in workspace 2
	postJSONWithWorkspace(ts.URL+"/api/collections", `{"name":"WS2 Collection"}`, ws2.ID)

	// List collections in workspace 1 — should only see WS1 collection
	resp, _ = getWithWorkspace(ts.URL+"/api/collections", 1)
	var colls1 []json.RawMessage
	readJSON(t, resp, &colls1)
	if len(colls1) != 1 {
		t.Fatalf("workspace 1: expected 1 collection, got %d", len(colls1))
	}

	// List collections in workspace 2 — should only see WS2 collection
	resp, _ = getWithWorkspace(ts.URL+"/api/collections", ws2.ID)
	var colls2 []json.RawMessage
	readJSON(t, resp, &colls2)
	if len(colls2) != 1 {
		t.Fatalf("workspace 2: expected 1 collection, got %d", len(colls2))
	}
}

// ---------------------------------------------------------------------------
// Test: Requests are isolated by workspace
// ---------------------------------------------------------------------------
func TestIsolation_Requests(t *testing.T) {
	ts := setupIsolationTestServer(t, nil)

	// Create workspace 2
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Team B"}`)
	var ws2 handler.WorkspaceResponse
	readJSON(t, resp, &ws2)

	// Create requests in different workspaces
	postJSONWithWorkspace(ts.URL+"/api/requests", `{"name":"WS1 Req","method":"GET","url":"http://a.com"}`, 1)
	postJSONWithWorkspace(ts.URL+"/api/requests", `{"name":"WS2 Req A","method":"GET","url":"http://b.com"}`, ws2.ID)
	postJSONWithWorkspace(ts.URL+"/api/requests", `{"name":"WS2 Req B","method":"POST","url":"http://c.com"}`, ws2.ID)

	// List requests in workspace 1
	resp, _ = getWithWorkspace(ts.URL+"/api/requests", 1)
	var reqs1 []json.RawMessage
	readJSON(t, resp, &reqs1)
	if len(reqs1) != 1 {
		t.Fatalf("workspace 1: expected 1 request, got %d", len(reqs1))
	}

	// List requests in workspace 2
	resp, _ = getWithWorkspace(ts.URL+"/api/requests", ws2.ID)
	var reqs2 []json.RawMessage
	readJSON(t, resp, &reqs2)
	if len(reqs2) != 2 {
		t.Fatalf("workspace 2: expected 2 requests, got %d", len(reqs2))
	}
}

// ---------------------------------------------------------------------------
// Test: Environments are isolated by workspace
// ---------------------------------------------------------------------------
func TestIsolation_Environments(t *testing.T) {
	ts := setupIsolationTestServer(t, nil)

	// Create workspace 2
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Team B"}`)
	var ws2 handler.WorkspaceResponse
	readJSON(t, resp, &ws2)

	// Create environments in different workspaces
	postJSONWithWorkspace(ts.URL+"/api/environments", `{"name":"WS1 Env","variables":"{}"}`, 1)
	postJSONWithWorkspace(ts.URL+"/api/environments", `{"name":"WS2 Env","variables":"{}"}`, ws2.ID)

	// List in workspace 1
	resp, _ = getWithWorkspace(ts.URL+"/api/environments", 1)
	var envs1 []json.RawMessage
	readJSON(t, resp, &envs1)
	if len(envs1) != 1 {
		t.Fatalf("workspace 1: expected 1 environment, got %d", len(envs1))
	}

	// List in workspace 2
	resp, _ = getWithWorkspace(ts.URL+"/api/environments", ws2.ID)
	var envs2 []json.RawMessage
	readJSON(t, resp, &envs2)
	if len(envs2) != 1 {
		t.Fatalf("workspace 2: expected 1 environment, got %d", len(envs2))
	}
}

// ---------------------------------------------------------------------------
// Test: Environment activation is workspace-scoped
// ---------------------------------------------------------------------------
func TestIsolation_EnvironmentActivation(t *testing.T) {
	ts := setupIsolationTestServer(t, nil)

	// Create workspace 2
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Team B"}`)
	var ws2 handler.WorkspaceResponse
	readJSON(t, resp, &ws2)

	// Create and activate env in workspace 1
	resp, _ = postJSONWithWorkspace(ts.URL+"/api/environments", `{"name":"WS1 Prod","variables":"{}"}`, 1)
	var env1 struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &env1)

	req, _ := http.NewRequest("POST", ts.URL+fmt.Sprintf("/api/environments/%d/activate", env1.ID), nil)
	req.Header.Set("X-Workspace-ID", "1")
	http.DefaultClient.Do(req)

	// Create and activate env in workspace 2
	resp, _ = postJSONWithWorkspace(ts.URL+"/api/environments", `{"name":"WS2 Staging","variables":"{}"}`, ws2.ID)
	var env2 struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &env2)

	req, _ = http.NewRequest("POST", ts.URL+fmt.Sprintf("/api/environments/%d/activate", env2.ID), nil)
	req.Header.Set("X-Workspace-ID", fmt.Sprintf("%d", ws2.ID))
	http.DefaultClient.Do(req)

	// Verify workspace 1 still has its env active
	resp, _ = getWithWorkspace(ts.URL+"/api/environments", 1)
	var envs1 []handler.EnvironmentResponse
	readJSON(t, resp, &envs1)

	if len(envs1) != 1 {
		t.Fatalf("expected 1 env in ws1, got %d", len(envs1))
	}
	if !envs1[0].IsActive {
		t.Error("workspace 1 env should still be active after activating in workspace 2")
	}

	// Verify workspace 2 has its env active
	resp, _ = getWithWorkspace(ts.URL+"/api/environments", ws2.ID)
	var envs2 []handler.EnvironmentResponse
	readJSON(t, resp, &envs2)

	if len(envs2) != 1 {
		t.Fatalf("expected 1 env in ws2, got %d", len(envs2))
	}
	if !envs2[0].IsActive {
		t.Error("workspace 2 env should be active")
	}
}

// ---------------------------------------------------------------------------
// Test: Flows are isolated by workspace
// ---------------------------------------------------------------------------
func TestIsolation_Flows(t *testing.T) {
	ts := setupIsolationTestServer(t, nil)

	// Create workspace 2
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Team B"}`)
	var ws2 handler.WorkspaceResponse
	readJSON(t, resp, &ws2)

	// Create flows in different workspaces
	postJSONWithWorkspace(ts.URL+"/api/flows", `{"name":"WS1 Flow"}`, 1)
	postJSONWithWorkspace(ts.URL+"/api/flows", `{"name":"WS2 Flow"}`, ws2.ID)

	// List in workspace 1
	resp, _ = getWithWorkspace(ts.URL+"/api/flows", 1)
	var flows1 []json.RawMessage
	readJSON(t, resp, &flows1)
	if len(flows1) != 1 {
		t.Fatalf("workspace 1: expected 1 flow, got %d", len(flows1))
	}

	// List in workspace 2
	resp, _ = getWithWorkspace(ts.URL+"/api/flows", ws2.ID)
	var flows2 []json.RawMessage
	readJSON(t, resp, &flows2)
	if len(flows2) != 1 {
		t.Fatalf("workspace 2: expected 1 flow, got %d", len(flows2))
	}
}

// ---------------------------------------------------------------------------
// Test: History is isolated by workspace
// ---------------------------------------------------------------------------
func TestIsolation_History(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"ok": "true"})
	}))
	defer mock.Close()

	ts := setupIsolationTestServer(t, mock)

	// Create workspace 2
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Team B"}`)
	var ws2 handler.WorkspaceResponse
	readJSON(t, resp, &ws2)

	// Create and execute request in workspace 1
	resp, _ = postJSONWithWorkspace(ts.URL+"/api/requests",
		fmt.Sprintf(`{"name":"WS1 Req","method":"GET","url":"%s/ws1"}`, mock.URL), 1)
	var req1 struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &req1)

	execReq, _ := http.NewRequest("POST", ts.URL+fmt.Sprintf("/api/requests/%d/execute", req1.ID), nil)
	execReq.Header.Set("Content-Type", "application/json")
	execReq.Header.Set("X-Workspace-ID", "1")
	execResp, _ := http.DefaultClient.Do(execReq)
	execResp.Body.Close()

	// Create and execute request in workspace 2
	resp, _ = postJSONWithWorkspace(ts.URL+"/api/requests",
		fmt.Sprintf(`{"name":"WS2 Req","method":"GET","url":"%s/ws2"}`, mock.URL), ws2.ID)
	var req2 struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &req2)

	execReq, _ = http.NewRequest("POST", ts.URL+fmt.Sprintf("/api/requests/%d/execute", req2.ID), nil)
	execReq.Header.Set("Content-Type", "application/json")
	execReq.Header.Set("X-Workspace-ID", fmt.Sprintf("%d", ws2.ID))
	execResp, _ = http.DefaultClient.Do(execReq)
	execResp.Body.Close()

	// History in workspace 1 — only WS1 entry
	resp, _ = getWithWorkspace(ts.URL+"/api/history", 1)
	var hist1 []map[string]interface{}
	readJSON(t, resp, &hist1)
	if len(hist1) != 1 {
		t.Fatalf("workspace 1: expected 1 history entry, got %d", len(hist1))
	}
	if hist1[0]["url"] != mock.URL+"/ws1" {
		t.Errorf("workspace 1 history URL: expected %q, got %v", mock.URL+"/ws1", hist1[0]["url"])
	}

	// History in workspace 2 — only WS2 entry
	resp, _ = getWithWorkspace(ts.URL+"/api/history", ws2.ID)
	var hist2 []map[string]interface{}
	readJSON(t, resp, &hist2)
	if len(hist2) != 1 {
		t.Fatalf("workspace 2: expected 1 history entry, got %d", len(hist2))
	}
	if hist2[0]["url"] != mock.URL+"/ws2" {
		t.Errorf("workspace 2 history URL: expected %q, got %v", mock.URL+"/ws2", hist2[0]["url"])
	}
}

// ---------------------------------------------------------------------------
// Test: Empty workspace has no data
// ---------------------------------------------------------------------------
func TestIsolation_EmptyWorkspace(t *testing.T) {
	ts := setupIsolationTestServer(t, nil)

	// Create workspace 2
	resp, _ := postJSON(ts.URL+"/api/workspaces", `{"name":"Empty WS"}`)
	var ws2 handler.WorkspaceResponse
	readJSON(t, resp, &ws2)

	// Create data in workspace 1
	postJSONWithWorkspace(ts.URL+"/api/collections", `{"name":"WS1 Col"}`, 1)
	postJSONWithWorkspace(ts.URL+"/api/requests", `{"name":"WS1 Req","method":"GET","url":"http://test.com"}`, 1)
	postJSONWithWorkspace(ts.URL+"/api/environments", `{"name":"WS1 Env","variables":"{}"}`, 1)
	postJSONWithWorkspace(ts.URL+"/api/flows", `{"name":"WS1 Flow"}`, 1)

	// Workspace 2 should have zero everything
	resp, _ = getWithWorkspace(ts.URL+"/api/collections", ws2.ID)
	var colls []json.RawMessage
	readJSON(t, resp, &colls)
	if len(colls) != 0 {
		t.Errorf("empty workspace: expected 0 collections, got %d", len(colls))
	}

	resp, _ = getWithWorkspace(ts.URL+"/api/requests", ws2.ID)
	var reqs []json.RawMessage
	readJSON(t, resp, &reqs)
	if len(reqs) != 0 {
		t.Errorf("empty workspace: expected 0 requests, got %d", len(reqs))
	}

	resp, _ = getWithWorkspace(ts.URL+"/api/environments", ws2.ID)
	var envs []json.RawMessage
	readJSON(t, resp, &envs)
	if len(envs) != 0 {
		t.Errorf("empty workspace: expected 0 environments, got %d", len(envs))
	}

	resp, _ = getWithWorkspace(ts.URL+"/api/flows", ws2.ID)
	var flows []json.RawMessage
	readJSON(t, resp, &flows)
	if len(flows) != 0 {
		t.Errorf("empty workspace: expected 0 flows, got %d", len(flows))
	}

	resp, _ = getWithWorkspace(ts.URL+"/api/history", ws2.ID)
	var hist []json.RawMessage
	readJSON(t, resp, &hist)
	if len(hist) != 0 {
		t.Errorf("empty workspace: expected 0 history entries, got %d", len(hist))
	}
}
