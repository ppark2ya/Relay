package handler_test

import (
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

func setupFlowStepTestServer(t *testing.T) *httptest.Server {
	t.Helper()

	db, q := testutil.SetupTestDBWithConn(t)

	vr := service.NewVariableResolver(q)
	re := service.NewRequestExecutor(q, vr, nil)
	fr := service.NewFlowRunner(q, re, vr)

	flowH := handler.NewFlowHandler(q, fr, db)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)

	r.Post("/api/flows", flowH.Create)
	r.Get("/api/flows/{id}/steps", flowH.ListSteps)
	r.Post("/api/flows/{id}/steps", flowH.CreateStep)
	r.Put("/api/flows/{id}/steps/{stepId}", flowH.UpdateStep)
	r.Delete("/api/flows/{id}/steps/{stepId}", flowH.DeleteStep)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

// ---------------------------------------------------------------------------
// Flow Step CRUD
// ---------------------------------------------------------------------------

func TestFlowStep_CRUD(t *testing.T) {
	ts := setupFlowStepTestServer(t)

	// Create a flow first
	resp, _ := postJSON(ts.URL+"/api/flows", `{"name":"Test Flow"}`)
	var flow handler.FlowResponse
	readJSON(t, resp, &flow)

	// CreateStep
	resp, err := postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), `{
		"name":"Step 1",
		"method":"POST",
		"url":"https://api.example.com/users",
		"stepOrder":1,
		"headers":"{\"Content-Type\":\"application/json\"}",
		"body":"{\"name\":\"test\"}",
		"bodyType":"json",
		"delayMs":100,
		"extractVars":"{\"userId\":\"$.id\"}",
		"loopCount":2,
		"continueOnError":true
	}`)
	if err != nil {
		t.Fatalf("create step: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var step handler.FlowStepResponse
	readJSON(t, resp, &step)

	if step.Name != "Step 1" {
		t.Errorf("expected name 'Step 1', got %q", step.Name)
	}
	if step.Method != "POST" {
		t.Errorf("expected method POST, got %q", step.Method)
	}
	if step.URL != "https://api.example.com/users" {
		t.Errorf("expected url, got %q", step.URL)
	}
	if step.StepOrder != 1 {
		t.Errorf("expected stepOrder 1, got %d", step.StepOrder)
	}
	if step.DelayMs != 100 {
		t.Errorf("expected delayMs 100, got %d", step.DelayMs)
	}
	if step.LoopCount != 2 {
		t.Errorf("expected loopCount 2, got %d", step.LoopCount)
	}
	if !step.ContinueOnError {
		t.Errorf("expected continueOnError true")
	}
	if step.FlowID != flow.ID {
		t.Errorf("expected flowId %d, got %d", flow.ID, step.FlowID)
	}

	// ListSteps
	resp, err = http.Get(ts.URL + fmt.Sprintf("/api/flows/%d/steps", flow.ID))
	if err != nil {
		t.Fatalf("list steps: %v", err)
	}
	var steps []handler.FlowStepResponse
	readJSON(t, resp, &steps)

	if len(steps) != 1 {
		t.Fatalf("expected 1 step, got %d", len(steps))
	}

	// UpdateStep
	resp, err = putJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps/%d", flow.ID, step.ID), `{
		"name":"Step 1 Updated",
		"method":"PUT",
		"url":"https://api.example.com/users/1",
		"stepOrder":1,
		"headers":"{}",
		"body":"{}",
		"bodyType":"json",
		"delayMs":200,
		"loopCount":3
	}`)
	if err != nil {
		t.Fatalf("update step: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var updatedStep handler.FlowStepResponse
	readJSON(t, resp, &updatedStep)

	if updatedStep.Name != "Step 1 Updated" {
		t.Errorf("expected name 'Step 1 Updated', got %q", updatedStep.Name)
	}
	if updatedStep.Method != "PUT" {
		t.Errorf("expected method PUT, got %q", updatedStep.Method)
	}
	if updatedStep.DelayMs != 200 {
		t.Errorf("expected delayMs 200, got %d", updatedStep.DelayMs)
	}
	if updatedStep.LoopCount != 3 {
		t.Errorf("expected loopCount 3, got %d", updatedStep.LoopCount)
	}

	// DeleteStep
	req, _ := http.NewRequest("DELETE", ts.URL+fmt.Sprintf("/api/flows/%d/steps/%d", flow.ID, step.ID), nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete step: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected status 204, got %d", resp.StatusCode)
	}

	// Verify deleted
	resp, _ = http.Get(ts.URL + fmt.Sprintf("/api/flows/%d/steps", flow.ID))
	var remaining []handler.FlowStepResponse
	readJSON(t, resp, &remaining)

	if len(remaining) != 0 {
		t.Errorf("expected 0 steps after delete, got %d", len(remaining))
	}
}

// ---------------------------------------------------------------------------
// Flow Step defaults (method=GET, bodyType=none, extractVars={}, headers={})
// ---------------------------------------------------------------------------

func TestFlowStep_Defaults(t *testing.T) {
	ts := setupFlowStepTestServer(t)

	// Create a flow
	resp, _ := postJSON(ts.URL+"/api/flows", `{"name":"Defaults Flow"}`)
	var flow handler.FlowResponse
	readJSON(t, resp, &flow)

	// Create step with minimal fields
	resp, err := postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), `{
		"name":"Minimal Step",
		"url":"https://api.example.com",
		"stepOrder":1
	}`)
	if err != nil {
		t.Fatalf("create step: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var step handler.FlowStepResponse
	readJSON(t, resp, &step)

	if step.Method != "GET" {
		t.Errorf("expected default method 'GET', got %q", step.Method)
	}
	if step.BodyType != "none" {
		t.Errorf("expected default bodyType 'none', got %q", step.BodyType)
	}
	if step.ExtractVars != "{}" {
		t.Errorf("expected default extractVars '{}', got %q", step.ExtractVars)
	}
	if step.Headers != "{}" {
		t.Errorf("expected default headers '{}', got %q", step.Headers)
	}
	if step.Cookies != "{}" {
		t.Errorf("expected default cookies '{}', got %q", step.Cookies)
	}
	if step.LoopCount != 1 {
		t.Errorf("expected default loopCount 1, got %d", step.LoopCount)
	}
}

// ---------------------------------------------------------------------------
// Flow Step nullable fields (ProxyID=-1 → NULL, LoopCount min 1)
// ---------------------------------------------------------------------------

func TestFlowStep_NullableFields(t *testing.T) {
	ts := setupFlowStepTestServer(t)

	// Create a flow
	resp, _ := postJSON(ts.URL+"/api/flows", `{"name":"Nullable Flow"}`)
	var flow handler.FlowResponse
	readJSON(t, resp, &flow)

	// Create step with proxyId=-1 (sentinel for NULL) and loopCount=0
	resp, err := postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), `{
		"name":"Null Fields Step",
		"url":"https://api.example.com",
		"stepOrder":1,
		"proxyId":-1,
		"loopCount":0
	}`)
	if err != nil {
		t.Fatalf("create step: %v", err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", resp.StatusCode)
	}

	var step handler.FlowStepResponse
	readJSON(t, resp, &step)

	if step.ProxyID != nil {
		t.Errorf("expected proxyId nil for sentinel -1, got %v", *step.ProxyID)
	}
	if step.LoopCount != 1 {
		t.Errorf("expected loopCount clamped to 1, got %d", step.LoopCount)
	}
}

// ---------------------------------------------------------------------------
// Flow Step ContinueOnError boolean → int64 conversion
// ---------------------------------------------------------------------------

func TestFlowStep_ContinueOnError(t *testing.T) {
	ts := setupFlowStepTestServer(t)

	// Create a flow
	resp, _ := postJSON(ts.URL+"/api/flows", `{"name":"Error Flow"}`)
	var flow handler.FlowResponse
	readJSON(t, resp, &flow)

	// Create with continueOnError=false (default)
	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), `{
		"name":"Step No Continue",
		"url":"https://api.example.com",
		"stepOrder":1,
		"continueOnError":false
	}`)
	var stepFalse handler.FlowStepResponse
	readJSON(t, resp, &stepFalse)

	if stepFalse.ContinueOnError {
		t.Errorf("expected continueOnError false")
	}

	// Create with continueOnError=true
	resp, _ = postJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps", flow.ID), `{
		"name":"Step Continue",
		"url":"https://api.example.com",
		"stepOrder":2,
		"continueOnError":true
	}`)
	var stepTrue handler.FlowStepResponse
	readJSON(t, resp, &stepTrue)

	if !stepTrue.ContinueOnError {
		t.Errorf("expected continueOnError true")
	}

	// Update to toggle continueOnError
	resp, _ = putJSON(ts.URL+fmt.Sprintf("/api/flows/%d/steps/%d", flow.ID, stepFalse.ID), `{
		"name":"Step No Continue",
		"url":"https://api.example.com",
		"stepOrder":1,
		"continueOnError":true
	}`)
	var toggled handler.FlowStepResponse
	readJSON(t, resp, &toggled)

	if !toggled.ContinueOnError {
		t.Errorf("expected continueOnError toggled to true")
	}
}
