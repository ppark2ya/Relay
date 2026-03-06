package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"relay/internal/repository"
	"relay/internal/testutil"
)

// Bug 1: setNextRequest with non-existent step name silently falls through
// to the next sequential step instead of reporting an error.
// This is the root cause of the Flow 2 "승인 대기(외화 환전)" vs "승인 대기(외화환전)" issue.
func TestFlowRunner_SetNextRequest_NonExistentTarget_SilentFallthrough(t *testing.T) {
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
		Name:        "Fallthrough Bug Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Step 1: tries to jump to "Step Three" (misspelled, actual is "Step 3")
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "Step 1",
		Method:    "GET",
		Url:       ts.URL + "/step-1",
		PostScript: sql.NullString{
			String: `pm.execution.setNextRequest("Step Three");`, // typo! should be "Step 3"
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 2: should be SKIPPED if goto worked, but will execute due to fallthrough
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 2,
		Name:      "Step 2",
		Method:    "GET",
		Url:       ts.URL + "/step-2",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 3: the intended target
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 3,
		Name:      "Step 3",
		Method:    "GET",
		Url:       ts.URL + "/step-3",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatal(err)
	}

	// BUG: The flow succeeds even though setNextRequest targeted a non-existent step.
	// Expected behavior: should fail or warn when goto target not found
	// Actual behavior: silently falls through to Step 2 (next sequential step)

	t.Logf("Flow success: %v", result.Success)
	t.Logf("Called endpoints: %v", calledEndpoints)
	t.Logf("Steps executed: %d", len(result.Steps))
	for i, s := range result.Steps {
		t.Logf("  Step %d: %s", i+1, s.RequestName)
	}

	// Fallthrough still happens (backward compat), but warnings are now included
	if len(calledEndpoints) == 3 {
		t.Log("setNextRequest with non-existent target 'Step Three' fell through to next step (expected - backward compat)")
	}

	// Verify warnings are present
	if len(result.Warnings) == 0 {
		t.Error("Expected flow-level warnings for failed goto to 'Step Three', got none")
	} else {
		t.Logf("Flow warnings: %v", result.Warnings)
	}

	if len(result.Steps) > 0 && len(result.Steps[0].Warnings) == 0 {
		t.Error("Expected step-level warnings on Step 1 for failed goto")
	}
}

// Bug 2: Duplicate step names in a flow - only the last one is indexed.
// When setNextRequest targets a name that appears multiple times,
// it always jumps to the LAST step with that name, not the first.
func TestFlowRunner_SetNextRequest_DuplicateStepNames(t *testing.T) {
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
		Name:        "Duplicate Name Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Step 1: jumps to "Process" (which step?)
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "Start",
		Method:    "GET",
		Url:       ts.URL + "/start",
		PostScript: sql.NullString{
			String: `pm.execution.setNextRequest("Process");`,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 2: first "Process" - should this be the target?
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 2,
		Name:      "Process",
		Method:    "GET",
		Url:       ts.URL + "/process-first",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 3: second "Process" - duplicate name
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 3,
		Name:      "Process",
		Method:    "GET",
		Url:       ts.URL + "/process-second",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 4: end
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 4,
		Name:      "End",
		Method:    "GET",
		Url:       ts.URL + "/end",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatal(err)
	}

	t.Logf("Called endpoints: %v", calledEndpoints)
	for i, s := range result.Steps {
		t.Logf("  Step %d: %s", i+1, s.RequestName)
	}

	// After fix: setNextRequest("Process") jumps to FIRST "Process" (step 2, /process-first)
	// Then sequential execution continues: process-first → process-second → end
	if len(calledEndpoints) >= 2 && calledEndpoints[1] == "/process-first" {
		t.Log("FIXED: Duplicate step name 'Process' - goto now targets the FIRST step with that name")
	} else if len(calledEndpoints) >= 2 {
		t.Errorf("Expected second call to be /process-first, got %s", calledEndpoints[1])
	}

	// Should include a warning about duplicate step names
	if len(result.Warnings) == 0 {
		t.Error("Expected warning about duplicate step name 'Process'")
	} else {
		t.Logf("Warnings: %v", result.Warnings)
	}
}

// Bug 3: Flow 2 pattern - setNextRequest with space mismatch in step name
// Simulates the exact bug from the remote site where "승인 대기(외화 환전)" (with space)
// doesn't match "승인 대기(외화환전)" (without space)
func TestFlowRunner_SetNextRequest_SpaceMismatch(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	callCount := make(map[string]int)
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount[r.URL.Path]++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	flow, err := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Space Mismatch Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Step 1: "구매 금액 확정" - wants to skip steps 2,3,4 and jump to "승인 대기(외화환전)"
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "구매 금액 확정",
		Method:    "POST",
		Url:       ts.URL + "/confirm",
		PostScript: sql.NullString{
			// This correctly uses no space
			String: `pm.execution.setNextRequest("승인 대기(외화환전)");`,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 2: "5만원권 투입" - should be skipped
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 2,
		Name:      "5만원권 투입",
		Method:    "POST",
		Url:       ts.URL + "/50k",
		PostScript: sql.NullString{
			// BUG: "승인 대기(외화 환전)" has extra space - won't match!
			String: `pm.execution.setNextRequest("승인 대기(외화 환전)");`,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 3: "1만원권 투입" - should also be skipped
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 3,
		Name:      "1만원권 투입",
		Method:    "POST",
		Url:       ts.URL + "/10k",
		PostScript: sql.NullString{
			// BUG: same space mismatch
			String: `pm.execution.setNextRequest("승인 대기(외화 환전)");`,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 4: "1천원권 투입" - should also be skipped
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 4,
		Name:      "1천원권 투입",
		Method:    "POST",
		Url:       ts.URL + "/1k",
		PostScript: sql.NullString{
			// BUG: same space mismatch
			String: `pm.execution.setNextRequest("승인 대기(외화 환전)");`,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 5: actual target - "승인 대기(외화환전)" (NO space)
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 5,
		Name:      "승인 대기(외화환전)",
		Method:    "PATCH",
		Url:       ts.URL + "/approve-wait",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 6: final step
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 6,
		Name:      "승인(외화환전)",
		Method:    "PATCH",
		Url:       ts.URL + "/approve",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatal(err)
	}

	t.Logf("Flow success: %v, error: %s", result.Success, result.Error)
	t.Logf("Call counts: %v", callCount)
	for i, s := range result.Steps {
		t.Logf("  Step %d: %s", i+1, s.RequestName)
	}

	// The correct flow: confirm → approve-wait → approve (3 calls)
	// Step 1 correctly jumps to step 5 (no space matches)
	if callCount["/confirm"] != 1 {
		t.Error("Expected /confirm to be called once")
	}

	// But if step 2 were to execute (incorrect scenario where step 1 jumps to step 2),
	// step 2's setNextRequest("승인 대기(외화 환전)") would FAIL to find the target
	// because of the extra space, causing it to fall through to step 3.
	// This cascades: step 3 also fails, falls to step 4, etc.

	// In the actual remote site scenario, "구매 금액 확정" correctly jumps to "5만원권 투입"
	// when count50k > 0. Then "5만원권 투입" tries to jump to "승인 대기(외화 환전)"
	// but fails due to space mismatch.
	// Let's simulate that specific case:
	t.Run("actual_remote_scenario", func(t *testing.T) {
		callCount2 := make(map[string]int)
		ts2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			callCount2[r.URL.Path]++
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(200)
			w.Write([]byte(`{"ok":true}`))
		}))
		defer ts2.Close()

		flow2, _ := q.CreateFlow(ctx, repository.CreateFlowParams{
			Name:        "Remote Scenario",
			WorkspaceID: 1,
			SortOrder:   2,
		})

		// Step 1: jumps to "5만원권" (simulating count50k > 0)
		q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
			FlowID:    flow2.ID,
			StepOrder: 1,
			Name:      "구매 금액 확정",
			Method:    "POST",
			Url:       ts2.URL + "/confirm",
			PostScript: sql.NullString{
				String: `pm.execution.setNextRequest("5만원권 투입");`,
				Valid:  true,
			},
			LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
			ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
		})

		// Step 2: "5만원권 투입" - tries to jump to "승인 대기(외화 환전)" (WITH SPACE - BUG!)
		q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
			FlowID:    flow2.ID,
			StepOrder: 2,
			Name:      "5만원권 투입",
			Method:    "POST",
			Url:       ts2.URL + "/50k",
			PostScript: sql.NullString{
				String: `pm.execution.setNextRequest("승인 대기(외화 환전)");`, // BUG: space!
				Valid:  true,
			},
			LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
			ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
		})

		// Step 3: "1만원권 투입" - should be SKIPPED but executed due to fallthrough
		q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
			FlowID:    flow2.ID,
			StepOrder: 3,
			Name:      "1만원권 투입",
			Method:    "POST",
			Url:       ts2.URL + "/10k",
			PostScript: sql.NullString{
				String: `pm.execution.setNextRequest("승인 대기(외화 환전)");`, // same bug
				Valid:  true,
			},
			LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
			ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
		})

		// Step 4: "1천원권 투입" - should be SKIPPED but executed due to fallthrough
		q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
			FlowID:    flow2.ID,
			StepOrder: 4,
			Name:      "1천원권 투입",
			Method:    "POST",
			Url:       ts2.URL + "/1k",
			PostScript: sql.NullString{
				String: `pm.execution.setNextRequest("승인 대기(외화 환전)");`, // same bug
				Valid:  true,
			},
			LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
			ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
		})

		// Step 5: "승인 대기(외화환전)" - note: NO space
		q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
			FlowID:    flow2.ID,
			StepOrder: 5,
			Name:      "승인 대기(외화환전)",
			Method:    "PATCH",
			Url:       ts2.URL + "/approve-wait",
			LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
			ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
		})

		result2, err := fr.Run(ctx, flow2.ID, nil)
		if err != nil {
			t.Fatal(err)
		}

		t.Logf("Call counts: %v", callCount2)
		for i, s := range result2.Steps {
			t.Logf("  Step %d: %s", i+1, s.RequestName)
		}

		// Fallthrough still happens but warnings should be present
		if callCount2["/10k"] > 0 || callCount2["/1k"] > 0 {
			t.Logf("Space mismatch caused fallthrough: confirm(%d) → 50k(%d) → 10k(%d) → 1k(%d) → approve-wait(%d)",
				callCount2["/confirm"], callCount2["/50k"],
				callCount2["/10k"], callCount2["/1k"], callCount2["/approve-wait"])
		}

		// Verify warnings about the space mismatch
		if len(result2.Warnings) == 0 {
			t.Error("Expected warnings about failed goto targets due to space mismatch")
		} else {
			for _, w := range result2.Warnings {
				t.Logf("  Warning: %s", w)
			}
		}
	})
}

// Bug 4: Flow 2 step "승인(외화환전)" has a copy-pasted postScript from "1천원권 투입"
// that performs cash counting and setNextRequest logic inappropriate for a final approval step.
// This test verifies the behavior when the wrong script runs on the last step.
func TestFlowRunner_WrongPostScript_OnFinalStep(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		// The response doesn't have releaseAmount, so the script will try to parse undefined
		w.Write([]byte(`{"status":"approved"}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	// Create environment with stale values
	env, _ := q.CreateEnvironment(ctx, repository.CreateEnvironmentParams{
		Name:        "Test Env",
		WorkspaceID: 1,
		Variables: sql.NullString{
			String: `{"target_1k":"0","current_1k":"0"}`,
			Valid:  true,
		},
	})
	q.ActivateEnvironment(ctx, env.ID)

	flow, _ := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Wrong PostScript Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})

	// Final step "승인(외화환전)" with WRONG postScript (copy-pasted from 1천원권)
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "승인(외화환전)",
		Method:    "PATCH",
		Url:       ts.URL + "/approve",
		PostScript: sql.NullString{
			// This is the buggy copy-pasted script from remote site
			String: `pm.test("SUCCESS!!", function() {
    pm.response.to.have.status(200);
    const body = pm.response.json();
    let target = parseInt(pm.environment.get("target_1k"));
    let current = parseInt(pm.environment.get("current_1k")) + 1;
    pm.environment.set("current_1k", current);
    if (current < target) {
        pm.execution.setNextRequest("1천원권 투입");
    } else {
        pm.environment.set("returnCnt", body.releaseAmount/1000*(-1));
        pm.environment.set("returnAmount", body.releaseAmount * (-1));
        pm.execution.setNextRequest("승인 대기");
    }
});`,
			Valid: true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatal(err)
	}

	t.Logf("Flow success: %v, error: %s", result.Success, result.Error)
	if len(result.Steps) > 0 && result.Steps[0].PostScriptResult != nil {
		ps := result.Steps[0].PostScriptResult
		t.Logf("PostScript success: %v, errors: %v", ps.Success, ps.Errors)
		t.Logf("PostScript flowAction: %v, gotoStepName: %s", ps.FlowAction, ps.GotoStepName)
	}

	// The script tries body.releaseAmount on {"status":"approved"} → undefined
	// undefined/1000 = NaN, NaN * (-1) = NaN
	// Then setNextRequest("승인 대기") targets a non-existent step → falls through
	// This documents the copy-paste bug: the approval step has 1천원권 logic
	t.Log("BUG: '승인(외화환전)' step has copy-pasted postScript from '1천원권 투입'. " +
		"It tries to access body.releaseAmount (undefined in approval response), " +
		"sets NaN to environment vars, and calls setNextRequest('승인 대기') which doesn't exist.")
}

// Bug 5: pm.environment.get vs pm.variables.get behavior inconsistency in flows.
// Flow scripts should use pm.variables for runtime flow state, but some steps
// incorrectly use pm.environment which reads from the DB-persisted environment.
func TestFlowRunner_EnvironmentVsVariables_Inconsistency(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	// Create environment with STALE values
	env, _ := q.CreateEnvironment(ctx, repository.CreateEnvironmentParams{
		Name:        "Test Env",
		WorkspaceID: 1,
		Variables: sql.NullString{
			String: `{"targetAmount":"999","buyingCount":"99"}`,
			Valid:  true,
		},
	})
	q.ActivateEnvironment(ctx, env.ID)

	flow, _ := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Env vs Vars Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})

	// Step 1: Sets runtime variables (pm.variables) with CORRECT values
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 1,
		Name:      "Setup",
		Method:    "GET",
		Url:       ts.URL + "/setup",
		PostScript: sql.NullString{
			String: `pm.variables.set("targetAmount", "100");
pm.variables.set("buyingCount", "2");`,
			Valid: true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 2: Uses pm.environment.get (reads stale DB values, NOT runtime values)
	// This is the bug pattern from "승인 대기(외화환전)" preScript
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 2,
		Name:      "Compute",
		Method:    "GET",
		Url:       ts.URL + "/compute",
		PreScript: sql.NullString{
			String: `// BUG: should use pm.variables.get, not pm.environment.get
let amount = pm.environment.get("targetAmount") * pm.environment.get("buyingCount");
pm.variables.set("computedAmount", amount.toString());`,
			Valid: true,
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

	// Check what value was computed
	// If pm.variables.get was used: 100 * 2 = 200 (correct)
	// If pm.environment.get was used: 999 * 99 = 98901 (wrong - stale env values)
	computedStep := result.Steps[1]
	if computedStep.PreScriptResult != nil {
		computed := computedStep.PreScriptResult.UpdatedVars["computedAmount"]
		t.Logf("Computed amount: %s", computed)

		if computed == "98901" {
			t.Error("BUG CONFIRMED: pm.environment.get reads stale DB values (999*99=98901) " +
				"instead of runtime flow values (100*2=200). " +
				"In the '승인 대기(외화환전)' preScript, this means releaseAmount is calculated " +
				"from stale environment values, not from the flow's runtime state.")
		} else if computed == "200" {
			t.Log("Using pm.variables.get would give correct result: 200")
		}
	}
}

// Bug 6: Duplicate stepOrder values cause stepOrderToIndex map collision.
// When two steps share the same stepOrder, only the last one is accessible via order-based lookup.
func TestFlowRunner_DuplicateStepOrder(t *testing.T) {
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

	flow, _ := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Duplicate Order Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})

	// Steps with duplicate stepOrder = 2
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 1, Name: "Step A",
		Method: "GET", Url: ts.URL + "/a",
		LoopCount: sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 2, Name: "Step B1",
		Method: "GET", Url: ts.URL + "/b1",
		LoopCount: sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 2, Name: "Step B2",
		Method: "GET", Url: ts.URL + "/b2",
		LoopCount: sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 3, Name: "Step C",
		Method: "GET", Url: ts.URL + "/c",
		LoopCount: sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, _ := fr.Run(ctx, flow.ID, nil)

	t.Logf("Endpoints called: %v", calledEndpoints)
	t.Logf("Steps: %d", len(result.Steps))

	// Both B1 and B2 execute sequentially (they're in the steps array),
	// but stepOrderToIndex only maps order 2 → last step with that order (B2)
	// This means DSL goto by order would skip B1
	if len(calledEndpoints) == 4 {
		t.Log("Both duplicate-order steps executed sequentially (expected)")
		t.Log("WARNING: stepOrderToIndex maps order 2 to only the LAST step (B2). " +
			"A goto by stepOrder=2 would always land on B2, never B1.")
	}
}

// Bug 7: Verify the step results include flow control info for debugging
// When setNextRequest fails to find target, result should indicate the failed goto
func TestFlowRunner_GotoResult_ShouldIncludeTargetInfo(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	flow, _ := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Goto Info Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})

	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 1, Name: "Jumper",
		Method: "GET", Url: ts.URL + "/jump",
		PostScript: sql.NullString{
			String: `pm.execution.setNextRequest("NonExistent Step");`,
			Valid:  true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 2, Name: "Should Not Run",
		Method: "GET", Url: ts.URL + "/no-run",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, _ := fr.Run(ctx, flow.ID, nil)

	// Check that postScript result has goto info
	if len(result.Steps) > 0 && result.Steps[0].PostScriptResult != nil {
		ps := result.Steps[0].PostScriptResult
		t.Logf("FlowAction: %v, GotoStepName: %q", ps.FlowAction, ps.GotoStepName)

		if ps.FlowAction == FlowActionGoto && ps.GotoStepName == "NonExistent Step" {
			t.Log("PostScript correctly recorded goto target 'NonExistent Step'")
		}
	}

	// Flow falls through (backward compat) but now includes warnings
	if len(result.Steps) > 0 && result.Steps[0].PostScriptResult != nil {
		ps := result.Steps[0].PostScriptResult
		t.Logf("FlowAction: %v, GotoStepName: %q", ps.FlowAction, ps.GotoStepName)
	}

	// Verify warnings are included
	if len(result.Warnings) == 0 {
		t.Error("Expected flow-level warnings for failed goto, got none")
	} else {
		t.Logf("Flow warnings: %v", result.Warnings)
	}

	if len(result.Steps) > 0 && len(result.Steps[0].Warnings) == 0 {
		t.Error("Expected step-level warnings for failed goto, got none")
	} else if len(result.Steps) > 0 {
		t.Logf("Step warnings: %v", result.Steps[0].Warnings)
	}
}

// Helper: print step results as JSON for debugging
func printStepResults(t *testing.T, result *FlowResult) {
	t.Helper()
	data, _ := json.MarshalIndent(result, "", "  ")
	// Truncate to prevent huge output
	s := string(data)
	if len(s) > 2000 {
		s = s[:2000] + "...(truncated)"
	}
	t.Log(s)
}

// Bug 8: When pm.variables.get returns a numeric string, arithmetic operations
// may produce unexpected results if not parsed correctly.
func TestFlowRunner_VariableTypeCoercion(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	flow, _ := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Type Coercion Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})

	// Step 1: set variables as strings (like pm.variables always does)
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 1, Name: "Setup Vars",
		Method: "GET", Url: ts.URL + "/setup",
		PostScript: sql.NullString{
			String: `pm.variables.set("count", "5");
pm.variables.set("price", "1000");`,
			Valid: true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step 2: multiply without parseInt (common mistake)
	q.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID: flow.ID, StepOrder: 2, Name: "Multiply",
		Method: "GET", Url: ts.URL + "/compute",
		PreScript: sql.NullString{
			// BUG pattern from "승인 대기(외화환전)" preScript:
			// pm.environment.get returns string, * operator coerces to number in JS
			// but + operator would concatenate strings
			String: strings.TrimSpace(`
let total = pm.variables.get("count") * pm.variables.get("price");
pm.variables.set("total_multiply", total.toString());
let total2 = pm.variables.get("count") + pm.variables.get("price");
pm.variables.set("total_add", total2.toString());
`),
			Valid: true,
		},
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	result, err := fr.Run(ctx, flow.ID, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Steps) >= 2 {
		ps := result.Steps[1].PreScriptResult
		if ps != nil {
			multiply := ps.UpdatedVars["total_multiply"]
			add := ps.UpdatedVars["total_add"]
			t.Logf("Multiply result: %s (expected: 5000)", multiply)
			t.Logf("Add result: %s (expected: 5000 but JS string concat gives '51000')", add)

			if add == "51000" {
				t.Log("CONFIRMED: pm.variables.get returns strings. " +
					"The * operator coerces to numbers correctly (5*1000=5000), " +
					"but + operator does string concatenation ('5'+'1000'='51000'). " +
					"Scripts should use parseInt() or Number() for arithmetic.")
			}
		}
	}
}

func TestFlowRunner_RequestCount_Bug(t *testing.T) {
	// Simulate remote Flow 2 step counts
	// Expected: 12 steps (방출함정보~승인)
	// But "5만원권", "1만원권", "1천원권" steps use setNextRequest for looping
	// If the space-mismatch bug causes fallthrough, all 12 steps execute sequentially
	// instead of jumping over unneeded denomination steps

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr, nil)
	fr := NewFlowRunner(q, re, vr)

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	flow, _ := q.CreateFlow(ctx, repository.CreateFlowParams{
		Name: "Full Flow 2 Simulation", WorkspaceID: 1, SortOrder: 1,
	})

	steps := []struct {
		name, method, url, postScript string
	}{
		{"구매 금액 확정", "POST", "/confirm",
			// Simulates: only need 5만원권 (skip 1만원, 1천원)
			fmt.Sprintf(`pm.variables.set("target_50k", "1");
pm.variables.set("target_10k", "0");
pm.variables.set("target_1k", "0");
pm.variables.set("current_50k", "0");
pm.execution.setNextRequest("5만원권 투입");`)},
		{"5만원권 투입", "POST", "/50k",
			`let target = parseInt(pm.variables.get("target_50k"));
let current = parseInt(pm.variables.get("current_50k")) + 1;
pm.variables.set("current_50k", current.toString());
if (current < target) {
    pm.execution.setNextRequest("5만원권 투입");
} else {
    let next10k = parseInt(pm.variables.get("target_10k"));
    if (next10k > 0) {
        pm.execution.setNextRequest("1만원권 투입");
    } else {
        let next1k = parseInt(pm.variables.get("target_1k"));
        if (next1k > 0) {
            pm.execution.setNextRequest("1천원권 투입");
        } else {
            // BUG: space mismatch!
            pm.execution.setNextRequest("승인 대기(외화 환전)");
        }
    }
}`},
		{"1만원권 투입", "POST", "/10k", ""},
		{"1천원권 투입", "POST", "/1k", ""},
		{"승인 대기(외화환전)", "PATCH", "/approve-wait", ""},
		{"승인(외화환전)", "PATCH", "/approve", ""},
	}

	for i, s := range steps {
		params := repository.CreateFlowStepParams{
			FlowID: flow.ID, StepOrder: int64(i + 1), Name: s.name,
			Method: s.method, Url: ts.URL + s.url,
			LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
			ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
		}
		if s.postScript != "" {
			params.PostScript = sql.NullString{String: s.postScript, Valid: true}
		}
		q.CreateFlowStep(ctx, params)
	}

	result, _ := fr.Run(ctx, flow.ID, nil)

	executedSteps := make([]string, 0)
	for _, s := range result.Steps {
		executedSteps = append(executedSteps, s.RequestName)
	}
	t.Logf("Executed steps: %v", executedSteps)

	// Expected: "구매 금액 확정" → "5만원권 투입" → "승인 대기(외화환전)" → "승인(외화환전)" = 4 steps
	// Actual (due to bug): "구매 금액 확정" → "5만원권 투입" → "1만원권 투입" → "1천원권 투입" → "승인 대기(외화환전)" → "승인(외화환전)" = 6 steps
	if len(executedSteps) != 4 {
		t.Logf("Expected 4 steps (skipping 1만원권/1천원권), got %d: %v", len(executedSteps), executedSteps)
		t.Log("Fallthrough due to space mismatch in setNextRequest (backward compat preserved)")
	}

	// Verify warnings about space mismatch
	if len(result.Warnings) == 0 {
		t.Error("Expected warnings about failed setNextRequest targets")
	} else {
		for _, w := range result.Warnings {
			t.Logf("  Warning: %s", w)
		}
	}
}
