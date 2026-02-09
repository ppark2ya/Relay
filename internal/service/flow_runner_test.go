package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/repository"
	"relay/internal/testutil"
)

func createFlowWithSteps(t *testing.T, q *repository.Queries, steps []repository.CreateFlowStepParams) int64 {
	t.Helper()
	ctx := context.Background()

	flow, err := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "test-flow",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create flow: %v", err)
	}

	for i, s := range steps {
		s.FlowID = flow.ID
		s.StepOrder = int64(i + 1)
		if _, err := q.CreateFlowStep(ctx, s); err != nil {
			t.Fatalf("create step %d: %v", i, err)
		}
	}
	return flow.ID
}

func TestFlowRunner_SingleStep(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)
	fr := NewFlowRunner(q, re, vr)

	flowID := createFlowWithSteps(t, q, []repository.CreateFlowStepParams{
		{Name: "step1", Method: "GET", Url: ts.URL},
	})

	result, err := fr.Run(context.Background(), flowID, nil)
	if err != nil {
		t.Fatalf("run flow: %v", err)
	}
	if !result.Success {
		t.Errorf("expected success, got error: %s", result.Error)
	}
	if len(result.Steps) != 1 {
		t.Fatalf("steps: got %d, want 1", len(result.Steps))
	}
	if result.Steps[0].ExecuteResult.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.Steps[0].ExecuteResult.StatusCode)
	}
}

func TestFlowRunner_MultipleStepsSequential(t *testing.T) {
	var callOrder []string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callOrder = append(callOrder, r.URL.Path)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)
	fr := NewFlowRunner(q, re, vr)

	flowID := createFlowWithSteps(t, q, []repository.CreateFlowStepParams{
		{Name: "step1", Method: "GET", Url: ts.URL + "/first"},
		{Name: "step2", Method: "GET", Url: ts.URL + "/second"},
	})

	result, err := fr.Run(context.Background(), flowID, nil)
	if err != nil {
		t.Fatalf("run flow: %v", err)
	}
	if !result.Success {
		t.Errorf("expected success, got error: %s", result.Error)
	}
	if len(result.Steps) != 2 {
		t.Fatalf("steps: got %d, want 2", len(result.Steps))
	}
	if len(callOrder) != 2 || callOrder[0] != "/first" || callOrder[1] != "/second" {
		t.Errorf("call order: got %v, want [/first /second]", callOrder)
	}
}

func TestExtractVariables_String(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)
	fr := NewFlowRunner(q, re, vr)

	body := `{"title":"hello","id":42}`
	extractJSON := `{"myTitle":"$.title"}`

	extracted, err := fr.extractVariables(body, extractJSON)
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	if extracted["myTitle"] != "hello" {
		t.Errorf("myTitle: got %q, want %q", extracted["myTitle"], "hello")
	}
}

func TestExtractVariables_Number(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)
	fr := NewFlowRunner(q, re, vr)

	body := `{"id":42,"name":"test"}`
	extractJSON := `{"myId":"$.id"}`

	extracted, err := fr.extractVariables(body, extractJSON)
	if err != nil {
		t.Fatalf("extract: %v", err)
	}
	// Numbers are marshalled as JSON strings
	if extracted["myId"] != "42" {
		t.Errorf("myId: got %q, want %q", extracted["myId"], "42")
	}
}

func TestExtractVariables_NonJSON(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)
	fr := NewFlowRunner(q, re, vr)

	body := "plain text response"
	extractJSON := `{"val":"$.something"}`

	extracted, err := fr.extractVariables(body, extractJSON)
	if err != nil {
		t.Fatalf("extract should not error on non-JSON: %v", err)
	}
	if len(extracted) != 0 {
		t.Errorf("expected empty map, got %v", extracted)
	}
}

func TestEvaluateCondition_VarExists(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)
	fr := NewFlowRunner(q, re, vr)

	met, err := fr.evaluateCondition("{{token}}", map[string]string{"token": "abc"})
	if err != nil {
		t.Fatalf("evaluate: %v", err)
	}
	if !met {
		t.Error("expected condition met when variable exists")
	}
}

func TestFlowRunner_StepWithNoURL(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)
	fr := NewFlowRunner(q, re, vr)

	ctx := context.Background()
	flow, err := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "flow-no-url",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create flow: %v", err)
	}

	_, err = q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "empty-step",
		Method:    "GET",
		Url:       "", // no URL
	})
	if err != nil {
		t.Fatalf("create step: %v", err)
	}

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatalf("run should not return error: %v", err)
	}
	if result.Success {
		t.Error("expected success=false for step with no URL")
	}
	if result.Error == "" {
		t.Error("expected error message")
	}
	_ = fmt.Sprintf("%v", result) // ensure result is usable
}
