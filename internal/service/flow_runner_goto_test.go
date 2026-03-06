package service

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"relay/internal/repository"
	"relay/internal/testutil"
)

func TestFlowRunner_SetNextRequest_Goto(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	var calledEndpoints []string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calledEndpoints = append(calledEndpoints, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	flow, err := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Goto Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Step A: post-script jumps to "Step C"
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "Step A",
		Method:    "GET",
		Url:       ts.URL + "/step-a",
		PostScript: sql.NullString{
			String: `pm.execution.setNextRequest("Step C");`,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step B: should be SKIPPED
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 2,
		Name:      "Step B",
		Method:    "GET",
		Url:       ts.URL + "/step-b",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step C: target
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 3,
		Name:      "Step C",
		Method:    "GET",
		Url:       ts.URL + "/step-c",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatal(err)
	}

	if !result.Success {
		t.Fatalf("Flow failed: %s", result.Error)
	}

	if len(calledEndpoints) != 2 {
		t.Fatalf("Expected 2 HTTP calls, got %d: %v", len(calledEndpoints), calledEndpoints)
	}
	if calledEndpoints[0] != "/step-a" {
		t.Errorf("First call should be /step-a, got %s", calledEndpoints[0])
	}
	if calledEndpoints[1] != "/step-c" {
		t.Errorf("Second call should be /step-c, got %s", calledEndpoints[1])
	}

	if len(result.Steps) != 2 {
		t.Fatalf("Expected 2 step results, got %d", len(result.Steps))
	}
	if result.Steps[0].RequestName != "Step A" {
		t.Errorf("First result should be Step A, got %s", result.Steps[0].RequestName)
	}
	if result.Steps[1].RequestName != "Step C" {
		t.Errorf("Second result should be Step C, got %s", result.Steps[1].RequestName)
	}
}

func TestFlowRunner_SetNextRequest_SelfRepeat(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	var callCount int
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	flow, err := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Self Repeat Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})
	if err != nil {
		t.Fatal(err)
	}

	postScript := strings.TrimSpace(`
var count = parseInt(pm.variables.get("counter") || "0") + 1;
pm.variables.set("counter", count.toString());
if (count < 3) {
    pm.execution.setNextRequest("Repeater");
} else {
    pm.execution.setNextRequest(null);
}
`)

	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "Repeater",
		Method:    "GET",
		Url:       ts.URL + "/repeat",
		PostScript: sql.NullString{
			String: postScript,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatal(err)
	}

	if !result.Success {
		t.Fatalf("Flow failed: %s", result.Error)
	}

	if callCount != 3 {
		t.Errorf("Expected 3 HTTP calls, got %d", callCount)
	}

	if len(result.Steps) != 3 {
		t.Errorf("Expected 3 step results, got %d", len(result.Steps))
	}
}
