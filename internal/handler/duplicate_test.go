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

// setupDuplicateTestServer creates a Chi router with collection, request, and flow
// routes (including duplicate endpoints) backed by an in-memory SQLite database.
func setupDuplicateTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	db, q := testutil.SetupTestDBWithConn(t)

	vr := service.NewVariableResolver(q)
	re := service.NewRequestExecutor(q, vr)
	fr := service.NewFlowRunner(q, re, vr)

	collH := handler.NewCollectionHandler(q, db)
	reqH := handler.NewRequestHandler(q, re)
	flowH := handler.NewFlowHandler(q, fr, db)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	// Collections
	r.Get("/api/collections", collH.List)
	r.Post("/api/collections", collH.Create)
	r.Get("/api/collections/{id}", collH.Get)
	r.Post("/api/collections/{id}/duplicate", collH.Duplicate)

	// Requests
	r.Post("/api/requests", reqH.Create)
	r.Get("/api/requests/{id}", reqH.Get)
	r.Post("/api/requests/{id}/duplicate", reqH.Duplicate)

	// Flows
	r.Post("/api/flows", flowH.Create)
	r.Get("/api/flows/{id}", flowH.Get)
	r.Post("/api/flows/{id}/steps", flowH.CreateStep)
	r.Get("/api/flows/{id}/steps", flowH.ListSteps)
	r.Post("/api/flows/{id}/duplicate", flowH.Duplicate)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

// ---------------------------------------------------------------------------
// Request Duplicate
// ---------------------------------------------------------------------------

func TestDuplicate_Request(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	// Create a collection
	resp, _ := postJSON(ts.URL+"/api/collections", `{"name":"Col1"}`)
	var col struct {
		ID int64 `json:"id"`
	}
	readJSON(t, resp, &col)

	// Create a request in the collection
	resp, _ = postJSON(ts.URL+"/api/requests", fmt.Sprintf(`{
		"collectionId":%d,
		"name":"Get Users",
		"method":"POST",
		"url":"https://api.example.com/users",
		"headers":"{\"Authorization\":\"Bearer tok\"}",
		"body":"{\"key\":\"val\"}",
		"bodyType":"json"
	}`, col.ID))
	var orig struct {
		ID           int64  `json:"id"`
		CollectionID *int64 `json:"collectionId"`
		Name         string `json:"name"`
		Method       string `json:"method"`
		URL          string `json:"url"`
		Headers      string `json:"headers"`
		Body         string `json:"body"`
		BodyType     string `json:"bodyType"`
	}
	readJSON(t, resp, &orig)

	// Duplicate
	resp, err := http.Post(ts.URL+fmt.Sprintf("/api/requests/%d/duplicate", orig.ID), "", nil)
	if err != nil {
		t.Fatalf("duplicate request: %v", err)
	}
	var dup struct {
		ID           int64  `json:"id"`
		CollectionID *int64 `json:"collectionId"`
		Name         string `json:"name"`
		Method       string `json:"method"`
		URL          string `json:"url"`
		Headers      string `json:"headers"`
		Body         string `json:"body"`
		BodyType     string `json:"bodyType"`
	}
	readJSON(t, resp, &dup)

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	if dup.ID == orig.ID {
		t.Error("duplicate should have a different ID")
	}
	if dup.Name != "Get Users (Copy)" {
		t.Errorf("name: got %q, want %q", dup.Name, "Get Users (Copy)")
	}
	if dup.Method != orig.Method {
		t.Errorf("method: got %q, want %q", dup.Method, orig.Method)
	}
	if dup.URL != orig.URL {
		t.Errorf("url: got %q, want %q", dup.URL, orig.URL)
	}
	if dup.Headers != orig.Headers {
		t.Errorf("headers: got %q, want %q", dup.Headers, orig.Headers)
	}
	if dup.Body != orig.Body {
		t.Errorf("body: got %q, want %q", dup.Body, orig.Body)
	}
	if dup.BodyType != orig.BodyType {
		t.Errorf("bodyType: got %q, want %q", dup.BodyType, orig.BodyType)
	}
	if dup.CollectionID == nil || *dup.CollectionID != col.ID {
		t.Errorf("collectionId: got %v, want %d", dup.CollectionID, col.ID)
	}
}

func TestDuplicate_Request_NotFound(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	resp, err := http.Post(ts.URL+"/api/requests/9999/duplicate", "", nil)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Flow Duplicate
// ---------------------------------------------------------------------------

func TestDuplicate_Flow_WithSteps(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	// Create a flow
	resp, _ := postJSON(ts.URL+"/api/flows", `{"name":"Auth Flow","description":"Login then fetch"}`)
	var flow struct {
		ID int64 `json:"id"`
	}
	readJSON(t, resp, &flow)

	// Add 2 steps
	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), `{
		"stepOrder":1,"delayMs":0,
		"extractVars":"{\"token\":\"$.data.token\"}",
		"name":"Login","method":"POST",
		"url":"https://api.example.com/login",
		"headers":"{}","body":"{\"user\":\"admin\"}","bodyType":"json"
	}`)
	resp.Body.Close()

	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), `{
		"stepOrder":2,"delayMs":500,
		"extractVars":"{}",
		"name":"Get Data","method":"GET",
		"url":"https://api.example.com/data",
		"headers":"{}","body":"","bodyType":"none"
	}`)
	resp.Body.Close()

	// Duplicate
	resp, err := http.Post(ts.URL+fmt.Sprintf("/api/flows/%d/duplicate", flow.ID), "", nil)
	if err != nil {
		t.Fatalf("duplicate flow: %v", err)
	}
	var dupFlow struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	readJSON(t, resp, &dupFlow)

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	if dupFlow.ID == flow.ID {
		t.Error("duplicate flow should have a different ID")
	}
	if dupFlow.Name != "Auth Flow (Copy)" {
		t.Errorf("name: got %q, want %q", dupFlow.Name, "Auth Flow (Copy)")
	}
	if dupFlow.Description != "Login then fetch" {
		t.Errorf("description: got %q, want %q", dupFlow.Description, "Login then fetch")
	}

	// Verify steps were copied
	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/flows/%d/steps", dupFlow.ID))
	if err != nil {
		t.Fatalf("get steps: %v", err)
	}
	var steps []struct {
		ID          int64  `json:"id"`
		FlowID      int64  `json:"flowId"`
		StepOrder   int64  `json:"stepOrder"`
		DelayMs     int64  `json:"delayMs"`
		ExtractVars string `json:"extractVars"`
		Name        string `json:"name"`
		Method      string `json:"method"`
		URL         string `json:"url"`
		Body        string `json:"body"`
		BodyType    string `json:"bodyType"`
	}
	readJSON(t, resp, &steps)

	if len(steps) != 2 {
		t.Fatalf("step count: got %d, want 2", len(steps))
	}

	// Step 1
	s1 := steps[0]
	if s1.FlowID != dupFlow.ID {
		t.Errorf("step1 flowId: got %d, want %d", s1.FlowID, dupFlow.ID)
	}
	if s1.Name != "Login" {
		t.Errorf("step1 name: got %q, want %q", s1.Name, "Login")
	}
	if s1.Method != "POST" {
		t.Errorf("step1 method: got %q, want %q", s1.Method, "POST")
	}
	if s1.ExtractVars != `{"token":"$.data.token"}` {
		t.Errorf("step1 extractVars: got %q", s1.ExtractVars)
	}
	if s1.StepOrder != 1 {
		t.Errorf("step1 stepOrder: got %d, want 1", s1.StepOrder)
	}

	// Step 2
	s2 := steps[1]
	if s2.Name != "Get Data" {
		t.Errorf("step2 name: got %q, want %q", s2.Name, "Get Data")
	}
	if s2.DelayMs != 500 {
		t.Errorf("step2 delayMs: got %d, want 500", s2.DelayMs)
	}
	if s2.StepOrder != 2 {
		t.Errorf("step2 stepOrder: got %d, want 2", s2.StepOrder)
	}
}

func TestDuplicate_Flow_Empty(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	// Create a flow with no steps
	resp, _ := postJSON(ts.URL+"/api/flows", `{"name":"Empty","description":""}`)
	var flow struct {
		ID int64 `json:"id"`
	}
	readJSON(t, resp, &flow)

	// Duplicate
	resp, _ = http.Post(ts.URL+fmt.Sprintf("/api/flows/%d/duplicate", flow.ID), "", nil)
	var dup struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}
	readJSON(t, resp, &dup)

	if dup.Name != "Empty (Copy)" {
		t.Errorf("name: got %q, want %q", dup.Name, "Empty (Copy)")
	}

	// Verify 0 steps
	resp, _ = http.Get(ts.URL + fmt.Sprintf("/api/flows/%d/steps", dup.ID))
	var steps []json.RawMessage
	readJSON(t, resp, &steps)
	if len(steps) != 0 {
		t.Errorf("step count: got %d, want 0", len(steps))
	}
}

func TestDuplicate_Flow_NotFound(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	resp, err := http.Post(ts.URL+"/api/flows/9999/duplicate", "", nil)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Collection Duplicate
// ---------------------------------------------------------------------------

func TestDuplicate_Collection_Simple(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	// Create a collection with a request
	resp, _ := postJSON(ts.URL+"/api/collections", `{"name":"MyCol"}`)
	var col struct {
		ID int64 `json:"id"`
	}
	readJSON(t, resp, &col)

	resp, _ = postJSON(ts.URL+"/api/requests", fmt.Sprintf(`{
		"collectionId":%d,"name":"Req1","method":"GET","url":"https://example.com"
	}`, col.ID))
	resp.Body.Close()

	// Duplicate
	resp, err := http.Post(ts.URL+fmt.Sprintf("/api/collections/%d/duplicate", col.ID), "", nil)
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}
	var dup struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		ParentID *int64 `json:"parentId"`
	}
	readJSON(t, resp, &dup)

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	if dup.ID == col.ID {
		t.Error("duplicate should have a different ID")
	}
	if dup.Name != "MyCol (Copy)" {
		t.Errorf("name: got %q, want %q", dup.Name, "MyCol (Copy)")
	}
	if dup.ParentID != nil {
		t.Errorf("parentId should be nil for root collection, got %v", *dup.ParentID)
	}

	// Verify the full tree via List
	resp, _ = http.Get(ts.URL + "/api/collections")
	var tree []struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Requests []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"requests"`
	}
	readJSON(t, resp, &tree)

	if len(tree) != 2 {
		t.Fatalf("collection count: got %d, want 2", len(tree))
	}

	// Find the copy
	var found bool
	for _, c := range tree {
		if c.Name == "MyCol (Copy)" {
			found = true
			if len(c.Requests) != 1 {
				t.Fatalf("copy request count: got %d, want 1", len(c.Requests))
			}
			if c.Requests[0].Name != "Req1" {
				t.Errorf("copy request name: got %q, want %q", c.Requests[0].Name, "Req1")
			}
		}
	}
	if !found {
		t.Error("copy collection not found in tree")
	}
}

func TestDuplicate_Collection_DeepNested(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	// Create: Parent > Child > Grandchild, each with a request
	resp, _ := postJSON(ts.URL+"/api/collections", `{"name":"Parent"}`)
	var parent struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &parent)

	resp, _ = postJSON(ts.URL+"/api/requests", fmt.Sprintf(`{
		"collectionId":%d,"name":"Parent Req","method":"GET","url":"https://parent.com"
	}`, parent.ID))
	resp.Body.Close()

	resp, _ = postJSON(ts.URL+"/api/collections", fmt.Sprintf(`{"name":"Child","parentId":%d}`, parent.ID))
	var child struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &child)

	resp, _ = postJSON(ts.URL+"/api/requests", fmt.Sprintf(`{
		"collectionId":%d,"name":"Child Req","method":"POST","url":"https://child.com"
	}`, child.ID))
	resp.Body.Close()

	resp, _ = postJSON(ts.URL+"/api/collections", fmt.Sprintf(`{"name":"Grandchild","parentId":%d}`, child.ID))
	var grandchild struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &grandchild)

	resp, _ = postJSON(ts.URL+"/api/requests", fmt.Sprintf(`{
		"collectionId":%d,"name":"GC Req","method":"PUT","url":"https://gc.com"
	}`, grandchild.ID))
	resp.Body.Close()

	// Duplicate the parent
	resp, err := http.Post(ts.URL+fmt.Sprintf("/api/collections/%d/duplicate", parent.ID), "", nil)
	if err != nil {
		t.Fatalf("duplicate: %v", err)
	}
	var dupParent struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	}
	readJSON(t, resp, &dupParent)

	if dupParent.Name != "Parent (Copy)" {
		t.Errorf("name: got %q, want %q", dupParent.Name, "Parent (Copy)")
	}

	// Verify full tree
	resp, _ = http.Get(ts.URL + "/api/collections")
	var tree []struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Requests []struct {
			Name   string `json:"name"`
			Method string `json:"method"`
		} `json:"requests"`
		Children []struct {
			Name     string `json:"name"`
			Requests []struct {
				Name   string `json:"name"`
				Method string `json:"method"`
			} `json:"requests"`
			Children []struct {
				Name     string `json:"name"`
				Requests []struct {
					Name   string `json:"name"`
					Method string `json:"method"`
				} `json:"requests"`
			} `json:"children"`
		} `json:"children"`
	}
	readJSON(t, resp, &tree)

	// Should have 2 root collections: "Parent" and "Parent (Copy)"
	if len(tree) != 2 {
		t.Fatalf("root count: got %d, want 2", len(tree))
	}

	// Find "Parent (Copy)" and verify deep structure
	var copy *struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Requests []struct {
			Name   string `json:"name"`
			Method string `json:"method"`
		} `json:"requests"`
		Children []struct {
			Name     string `json:"name"`
			Requests []struct {
				Name   string `json:"name"`
				Method string `json:"method"`
			} `json:"requests"`
			Children []struct {
				Name     string `json:"name"`
				Requests []struct {
					Name   string `json:"name"`
					Method string `json:"method"`
				} `json:"requests"`
			} `json:"children"`
		} `json:"children"`
	}
	for i := range tree {
		if tree[i].Name == "Parent (Copy)" {
			copy = &tree[i]
			break
		}
	}
	if copy == nil {
		t.Fatal("Parent (Copy) not found in tree")
	}

	// Verify Parent (Copy) requests
	if len(copy.Requests) != 1 || copy.Requests[0].Name != "Parent Req" {
		t.Errorf("parent copy requests: got %+v", copy.Requests)
	}

	// Verify Child
	if len(copy.Children) != 1 || copy.Children[0].Name != "Child" {
		t.Fatalf("child: got %+v", copy.Children)
	}
	copyChild := copy.Children[0]
	if len(copyChild.Requests) != 1 || copyChild.Requests[0].Name != "Child Req" {
		t.Errorf("child requests: got %+v", copyChild.Requests)
	}
	if copyChild.Requests[0].Method != "POST" {
		t.Errorf("child req method: got %q, want POST", copyChild.Requests[0].Method)
	}

	// Verify Grandchild
	if len(copyChild.Children) != 1 || copyChild.Children[0].Name != "Grandchild" {
		t.Fatalf("grandchild: got %+v", copyChild.Children)
	}
	copyGC := copyChild.Children[0]
	if len(copyGC.Requests) != 1 || copyGC.Requests[0].Name != "GC Req" {
		t.Errorf("gc requests: got %+v", copyGC.Requests)
	}
	if copyGC.Requests[0].Method != "PUT" {
		t.Errorf("gc req method: got %q, want PUT", copyGC.Requests[0].Method)
	}
}

func TestDuplicate_Collection_ChildKeepsParent(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	// Create Parent > Child
	resp, _ := postJSON(ts.URL+"/api/collections", `{"name":"Parent"}`)
	var parent struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &parent)

	resp, _ = postJSON(ts.URL+"/api/collections", fmt.Sprintf(`{"name":"Child","parentId":%d}`, parent.ID))
	var child struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &child)

	// Duplicate the child (not parent)
	resp, _ = http.Post(ts.URL+fmt.Sprintf("/api/collections/%d/duplicate", child.ID), "", nil)
	var dup struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		ParentID *int64 `json:"parentId"`
	}
	readJSON(t, resp, &dup)

	if dup.Name != "Child (Copy)" {
		t.Errorf("name: got %q, want %q", dup.Name, "Child (Copy)")
	}
	if dup.ParentID == nil || *dup.ParentID != parent.ID {
		t.Errorf("parentId: got %v, want %d", dup.ParentID, parent.ID)
	}
}

func TestDuplicate_Collection_NotFound(t *testing.T) {
	ts := setupDuplicateTestServer(t)

	resp, err := http.Post(ts.URL+"/api/collections/9999/duplicate", "", nil)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}
