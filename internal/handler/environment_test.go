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

func setupEnvironmentTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	_, q := testutil.SetupTestDBWithConn(t)
	envH := handler.NewEnvironmentHandler(q)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	r.Get("/api/environments", envH.List)
	r.Post("/api/environments", envH.Create)
	r.Get("/api/environments/{id}", envH.Get)
	r.Put("/api/environments/{id}", envH.Update)
	r.Delete("/api/environments/{id}", envH.Delete)
	r.Post("/api/environments/{id}/activate", envH.Activate)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

// ---------------------------------------------------------------------------
// Environment CRUD
// ---------------------------------------------------------------------------

func TestEnvironment_CRUD(t *testing.T) {
	ts := setupEnvironmentTestServer(t)

	// Create
	resp, err := postJSON(ts.URL+"/api/environments", `{"name":"Staging","variables":"{\"BASE_URL\":\"https://staging.example.com\"}"}`)
	if err != nil {
		t.Fatalf("create environment: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var created handler.EnvironmentResponse
	readJSON(t, resp, &created)

	if created.Name != "Staging" {
		t.Errorf("expected name 'Staging', got %q", created.Name)
	}
	if created.Variables != `{"BASE_URL":"https://staging.example.com"}` {
		t.Errorf("unexpected variables: %q", created.Variables)
	}
	if created.IsActive {
		t.Errorf("expected isActive false on creation")
	}

	// List
	resp, err = http.Get(ts.URL + "/api/environments")
	if err != nil {
		t.Fatalf("list environments: %v", err)
	}
	var envs []handler.EnvironmentResponse
	readJSON(t, resp, &envs)

	if len(envs) != 1 {
		t.Fatalf("expected 1 environment, got %d", len(envs))
	}

	// Get
	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/environments/%d", created.ID))
	if err != nil {
		t.Fatalf("get environment: %v", err)
	}
	var got handler.EnvironmentResponse
	readJSON(t, resp, &got)

	if got.Name != "Staging" {
		t.Errorf("expected name 'Staging', got %q", got.Name)
	}

	// Update
	resp, err = putJSON(ts.URL+fmt.Sprintf("/api/environments/%d", created.ID), `{"name":"Production","variables":"{\"BASE_URL\":\"https://prod.example.com\"}"}`)
	if err != nil {
		t.Fatalf("update environment: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	var updated handler.EnvironmentResponse
	readJSON(t, resp, &updated)

	if updated.Name != "Production" {
		t.Errorf("expected name 'Production', got %q", updated.Name)
	}

	// Delete
	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/environments/%d", created.ID), nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete environment: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", resp.StatusCode)
	}

	// Verify deleted
	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/environments/%d", created.ID))
	if err != nil {
		t.Fatalf("get deleted environment: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected status 404 after delete, got %d", resp.StatusCode)
	}
}

// ---------------------------------------------------------------------------
// Environment Activate singleton pattern
// ---------------------------------------------------------------------------

func TestEnvironment_Activate(t *testing.T) {
	ts := setupEnvironmentTestServer(t)

	// Create two environments
	resp, _ := postJSON(ts.URL+"/api/environments", `{"name":"Dev","variables":"{}"}`)
	var envA handler.EnvironmentResponse
	readJSON(t, resp, &envA)

	resp, _ = postJSON(ts.URL+"/api/environments", `{"name":"Prod","variables":"{}"}`)
	var envB handler.EnvironmentResponse
	readJSON(t, resp, &envB)

	// Activate env A
	resp, err := postJSON(ts.URL+fmt.Sprintf("/api/environments/%d/activate", envA.ID), `{}`)
	if err != nil {
		t.Fatalf("activate env A: %v", err)
	}
	var activatedA handler.EnvironmentResponse
	readJSON(t, resp, &activatedA)

	if !activatedA.IsActive {
		t.Errorf("expected env A to be active")
	}

	// Activate env B — should deactivate A
	resp, err = postJSON(ts.URL+fmt.Sprintf("/api/environments/%d/activate", envB.ID), `{}`)
	if err != nil {
		t.Fatalf("activate env B: %v", err)
	}
	var activatedB handler.EnvironmentResponse
	readJSON(t, resp, &activatedB)

	if !activatedB.IsActive {
		t.Errorf("expected env B to be active")
	}

	// Verify A is now inactive
	resp, _ = http.Get(ts.URL + fmt.Sprintf("/api/environments/%d", envA.ID))
	var fetchedA handler.EnvironmentResponse
	readJSON(t, resp, &fetchedA)

	if fetchedA.IsActive {
		t.Errorf("expected env A to be deactivated after activating B")
	}
}

// ---------------------------------------------------------------------------
// Environment default variables
// ---------------------------------------------------------------------------

func TestEnvironment_DefaultVariables(t *testing.T) {
	ts := setupEnvironmentTestServer(t)

	// Create without variables field
	resp, err := postJSON(ts.URL+"/api/environments", `{"name":"Empty"}`)
	if err != nil {
		t.Fatalf("create environment: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var env handler.EnvironmentResponse
	readJSON(t, resp, &env)

	if env.Variables != "{}" {
		t.Errorf("expected default variables '{}', got %q", env.Variables)
	}
}

// ---------------------------------------------------------------------------
// Environment Invalid ID
// ---------------------------------------------------------------------------

func TestEnvironment_InvalidID(t *testing.T) {
	ts := setupEnvironmentTestServer(t)

	resp, err := http.Get(ts.URL + "/api/environments/abc")
	if err != nil {
		t.Fatalf("get environment with invalid ID: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", resp.StatusCode)
	}
}
