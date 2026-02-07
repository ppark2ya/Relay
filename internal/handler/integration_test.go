package handler_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/service"
	"relay/internal/testutil"

	"github.com/go-chi/chi/v5"
)

// setupTestServer creates a full Chi router with all execution-related routes
// backed by an in-memory SQLite database and a mock target server.
func setupTestServer(t *testing.T, mockTarget *httptest.Server) *httptest.Server {
	t.Helper()

	db, q := testutil.SetupTestDBWithConn(t)

	vr := service.NewVariableResolver(q)
	re := service.NewRequestExecutor(q, vr)
	fr := service.NewFlowRunner(q, re, vr)

	reqH := handler.NewRequestHandler(q, re)
	envH := handler.NewEnvironmentHandler(q)
	flowH := handler.NewFlowHandler(q, fr, db)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	// Requests
	r.Get("/api/requests", reqH.List)
	r.Post("/api/requests", reqH.Create)
	r.Get("/api/requests/{id}", reqH.Get)
	r.Put("/api/requests/{id}", reqH.Update)
	r.Post("/api/requests/{id}/execute", reqH.Execute)
	r.Post("/api/execute", reqH.ExecuteAdhoc)

	// Environments
	r.Post("/api/environments", envH.Create)
	r.Post("/api/environments/{id}/activate", envH.Activate)

	// Flows
	r.Post("/api/flows", flowH.Create)
	r.Post("/api/flows/{id}/steps", flowH.CreateStep)
	r.Post("/api/flows/{id}/run", flowH.Run)

	// History
	histH := handler.NewHistoryHandler(q)
	r.Get("/api/history", histH.List)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

func postJSON(url string, body string) (*http.Response, error) {
	return http.Post(url, "application/json", strings.NewReader(body))
}

func putJSON(url string, body string) (*http.Response, error) {
	req, err := http.NewRequest("PUT", url, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func postJSONWithWorkspace(url string, body string, workspaceID int64) (*http.Response, error) {
	req, err := http.NewRequest("POST", url, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Workspace-ID", fmt.Sprintf("%d", workspaceID))
	return http.DefaultClient.Do(req)
}

func getWithWorkspace(url string, workspaceID int64) (*http.Response, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Workspace-ID", fmt.Sprintf("%d", workspaceID))
	return http.DefaultClient.Do(req)
}

func readJSON(t *testing.T, resp *http.Response, v interface{}) {
	t.Helper()
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatalf("failed to parse JSON %q: %v", string(data), err)
	}
}

// ---------------------------------------------------------------------------
// Test 1: Request execution with environment variable substitution + history
// ---------------------------------------------------------------------------
func TestIntegration_RequestExecuteWithEnvVars(t *testing.T) {
	// 1. Mock target server that echoes the request path
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"path":   r.URL.Path,
			"method": r.Method,
		})
	}))
	defer mock.Close()

	ts := setupTestServer(t, mock)

	// 2. Create environment with variables
	resp, err := postJSON(ts.URL+"/api/environments", fmt.Sprintf(
		`{"name":"test-env","variables":"{\"baseUrl\":\"%s\",\"userId\":\"42\"}"}`, mock.URL))
	if err != nil {
		t.Fatalf("create env: %v", err)
	}
	var env struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &env)

	// 3. Activate environment
	resp, err = postJSON(ts.URL+fmt.Sprintf("/api/environments/%d/activate", env.ID), "")
	if err != nil {
		t.Fatalf("activate env: %v", err)
	}
	resp.Body.Close()

	// 4. Create request using {{variables}}
	resp, err = postJSON(ts.URL+"/api/requests", `{
		"name":"Get User",
		"method":"GET",
		"url":"{{baseUrl}}/users/{{userId}}",
		"headers":"{}",
		"body":"",
		"bodyType":"none"
	}`)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	var req struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &req)

	// 5. Execute the request
	resp, err = postJSON(ts.URL+fmt.Sprintf("/api/requests/%d/execute", req.ID), "{}")
	if err != nil {
		t.Fatalf("execute request: %v", err)
	}
	var execResult service.ExecuteResult
	readJSON(t, resp, &execResult)

	// 6. Verify variable substitution
	if execResult.Error != "" {
		t.Fatalf("unexpected error: %s", execResult.Error)
	}
	if execResult.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", execResult.StatusCode)
	}
	expectedURL := mock.URL + "/users/42"
	if execResult.ResolvedURL != expectedURL {
		t.Errorf("expected resolved URL %q, got %q", expectedURL, execResult.ResolvedURL)
	}

	// 7. Verify response body (mock echoes path)
	var echoBody map[string]string
	if err := json.Unmarshal([]byte(execResult.Body), &echoBody); err != nil {
		t.Fatalf("failed to parse echo body: %v", err)
	}
	if echoBody["path"] != "/users/42" {
		t.Errorf("expected path /users/42, got %q", echoBody["path"])
	}

	// 8. Verify history was saved
	resp, err = http.Get(ts.URL + "/api/history")
	if err != nil {
		t.Fatalf("get history: %v", err)
	}
	var history []map[string]interface{}
	readJSON(t, resp, &history)
	if len(history) == 0 {
		t.Fatal("expected at least one history entry")
	}
	if history[0]["url"] != expectedURL {
		t.Errorf("history URL: expected %q, got %v", expectedURL, history[0]["url"])
	}
}

// ---------------------------------------------------------------------------
// Test 2: Adhoc execution (no saved request)
// ---------------------------------------------------------------------------
func TestIntegration_AdhocExecution(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"received":     string(body),
			"contentType":  r.Header.Get("Content-Type"),
		})
	}))
	defer mock.Close()

	ts := setupTestServer(t, mock)

	resp, err := postJSON(ts.URL+"/api/execute", fmt.Sprintf(`{
		"method":"POST",
		"url":"%s/data",
		"headers":"{\"Content-Type\":\"application/json\"}",
		"body":"{\"key\":\"value\"}"
	}`, mock.URL))
	if err != nil {
		t.Fatalf("adhoc execute: %v", err)
	}
	var result service.ExecuteResult
	readJSON(t, resp, &result)

	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}
	if result.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", result.StatusCode)
	}

	var echoBody map[string]string
	json.Unmarshal([]byte(result.Body), &echoBody)
	if echoBody["contentType"] != "application/json" {
		t.Errorf("expected Content-Type header forwarded, got %q", echoBody["contentType"])
	}
	if echoBody["received"] != `{"key":"value"}` {
		t.Errorf("expected body forwarded, got %q", echoBody["received"])
	}
}

// ---------------------------------------------------------------------------
// Test 3: Flow execution with variable extraction across steps
// ---------------------------------------------------------------------------
func TestIntegration_FlowRunWithVarExtraction(t *testing.T) {
	// Mock: step 1 returns a token, step 2 checks Authorization header
	callCount := 0
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/login":
			json.NewEncoder(w).Encode(map[string]string{"token": "abc-secret-123"})
		case "/protected":
			auth := r.Header.Get("Authorization")
			json.NewEncoder(w).Encode(map[string]string{"auth": auth, "status": "ok"})
		default:
			w.WriteHeader(404)
		}
	}))
	defer mock.Close()

	ts := setupTestServer(t, mock)

	// 1. Create flow
	resp, err := postJSON(ts.URL+"/api/flows", `{"name":"Auth Flow","description":"Login then access protected"}`)
	if err != nil {
		t.Fatalf("create flow: %v", err)
	}
	var flow struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &flow)

	// 2. Step 1: Login — extract token via JSONPath
	resp, err = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), fmt.Sprintf(`{
		"stepOrder":1,
		"name":"Login",
		"method":"POST",
		"url":"%s/login",
		"headers":"{}",
		"body":"",
		"bodyType":"none",
		"delayMs":0,
		"extractVars":"{\"token\":\"$.token\"}",
		"condition":""
	}`, mock.URL))
	if err != nil {
		t.Fatalf("create step 1: %v", err)
	}
	resp.Body.Close()

	// 3. Step 2: Access protected endpoint using extracted token
	resp, err = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), fmt.Sprintf(`{
		"stepOrder":2,
		"name":"Protected",
		"method":"GET",
		"url":"%s/protected",
		"headers":"{\"Authorization\":\"Bearer {{token}}\"}",
		"body":"",
		"bodyType":"none",
		"delayMs":0,
		"extractVars":"{}",
		"condition":""
	}`, mock.URL))
	if err != nil {
		t.Fatalf("create step 2: %v", err)
	}
	resp.Body.Close()

	// 4. Run the flow
	resp, err = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/run", flow.ID), "")
	if err != nil {
		t.Fatalf("run flow: %v", err)
	}
	var flowResult service.FlowResult
	readJSON(t, resp, &flowResult)

	// 5. Verify overall success
	if !flowResult.Success {
		t.Fatalf("flow failed: %s", flowResult.Error)
	}
	if len(flowResult.Steps) != 2 {
		t.Fatalf("expected 2 step results, got %d", len(flowResult.Steps))
	}

	// 6. Verify step 1 extracted token
	step1 := flowResult.Steps[0]
	if step1.ExecuteResult.StatusCode != 200 {
		t.Fatalf("step1 status: expected 200, got %d", step1.ExecuteResult.StatusCode)
	}
	if step1.ExtractedVars["token"] != "abc-secret-123" {
		t.Errorf("step1 extracted token: expected %q, got %q", "abc-secret-123", step1.ExtractedVars["token"])
	}

	// 7. Verify step 2 received the token via resolved header
	step2 := flowResult.Steps[1]
	if step2.ExecuteResult.StatusCode != 200 {
		t.Fatalf("step2 status: expected 200, got %d", step2.ExecuteResult.StatusCode)
	}
	var step2Body map[string]string
	json.Unmarshal([]byte(step2.ExecuteResult.Body), &step2Body)
	if step2Body["auth"] != "Bearer abc-secret-123" {
		t.Errorf("step2 auth header: expected %q, got %q", "Bearer abc-secret-123", step2Body["auth"])
	}

	// 8. Verify both steps actually hit the mock
	if callCount != 2 {
		t.Errorf("expected 2 mock calls, got %d", callCount)
	}
}

// ---------------------------------------------------------------------------
// Test 4: Flow with conditional step skipping
// ---------------------------------------------------------------------------
func TestIntegration_FlowConditionalSkip(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Step 1 returns empty token
		if r.URL.Path == "/check" {
			json.NewEncoder(w).Encode(map[string]string{"token": ""})
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}))
	defer mock.Close()

	ts := setupTestServer(t, mock)

	// Create flow
	resp, _ := postJSON(ts.URL+"/api/flows", `{"name":"Conditional Flow"}`)
	var flow struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &flow)

	// Step 1: returns empty token
	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), fmt.Sprintf(`{
		"stepOrder":1,
		"name":"Check",
		"method":"GET",
		"url":"%s/check",
		"headers":"{}",
		"body":"",
		"bodyType":"none",
		"delayMs":0,
		"extractVars":"{\"token\":\"$.token\"}",
		"condition":""
	}`, mock.URL))
	resp.Body.Close()

	// Step 2: condition on {{token}} — should be skipped because token is empty
	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), fmt.Sprintf(`{
		"stepOrder":2,
		"name":"Guarded",
		"method":"GET",
		"url":"%s/guarded",
		"headers":"{}",
		"body":"",
		"bodyType":"none",
		"delayMs":0,
		"extractVars":"{}",
		"condition":"{{token}}"
	}`, mock.URL))
	resp.Body.Close()

	// Run flow
	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/run", flow.ID), "")
	var result service.FlowResult
	readJSON(t, resp, &result)

	if !result.Success {
		t.Fatalf("flow failed: %s", result.Error)
	}
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(result.Steps))
	}

	// Step 2 should be skipped
	if !result.Steps[1].Skipped {
		t.Error("expected step 2 to be skipped due to empty token condition")
	}
}

// ---------------------------------------------------------------------------
// Test 5: Request execution with inline overrides
// ---------------------------------------------------------------------------
func TestIntegration_ExecuteWithOverrides(t *testing.T) {
	mock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"method": r.Method,
			"path":   r.URL.Path,
		})
	}))
	defer mock.Close()

	ts := setupTestServer(t, mock)

	// Create a request with original values
	resp, _ := postJSON(ts.URL+"/api/requests", fmt.Sprintf(`{
		"name":"Original",
		"method":"GET",
		"url":"%s/original",
		"headers":"{}",
		"body":"",
		"bodyType":"none"
	}`, mock.URL))
	var req struct{ ID int64 `json:"id"` }
	readJSON(t, resp, &req)

	// Execute with inline overrides (different method and URL)
	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/requests/%d/execute", req.ID), fmt.Sprintf(`{
		"method":"POST",
		"url":"%s/overridden"
	}`, mock.URL))
	var result service.ExecuteResult
	readJSON(t, resp, &result)

	if result.Error != "" {
		t.Fatalf("unexpected error: %s", result.Error)
	}

	var echoBody map[string]string
	json.Unmarshal([]byte(result.Body), &echoBody)
	if echoBody["method"] != "POST" {
		t.Errorf("expected overridden method POST, got %q", echoBody["method"])
	}
	if echoBody["path"] != "/overridden" {
		t.Errorf("expected overridden path /overridden, got %q", echoBody["path"])
	}
}
