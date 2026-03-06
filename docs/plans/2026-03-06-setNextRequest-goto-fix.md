# setNextRequest Goto 버그 수정 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `pm.execution.setNextRequest("스텝이름")`이 올바른 타겟 스텝으로 점프하도록 flow_runner.go의 goto 로직 수정 (GitHub 이슈 #3)

**Architecture:** 외부 루프에 Go label(`outer:`)을 추가하고, `FlowActionGoto` 처리에서 `continue`를 `continue outer`로 변경하여 `step := steps[stepIndex]`가 타겟 스텝을 올바르게 읽도록 수정. 동일 패턴의 `FlowActionRepeat`도 함께 수정 필요 (현재는 우연히 동작하지만 같은 구조적 문제 존재).

**Tech Stack:** Go

---

### Task 1: 버그 재현 테스트 작성

**Files:**
- Create: `internal/service/flow_runner_goto_test.go`

**Step 1: 버그를 재현하는 테스트 작성**

이 테스트는 3개 스텝(A → B → C)에서 A의 post-script가 `setNextRequest("C")`로 B를 건너뛰고 C로 점프하는 시나리오를 검증합니다. 현재 버그에서는 A가 재실행되고 C가 아닌 B+1(=C)로 이동하는 잘못된 동작을 합니다.

테스트는 httptest 서버를 사용하여 각 스텝의 URL을 구분하고, 실제로 어떤 URL이 호출되었는지 추적합니다.

```go
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
	db := testutil.SetupTestDB(t)
	queries := repository.New(db)
	vr := NewVariableResolver(queries)
	re := NewRequestExecutor(queries, vr)
	fr := NewFlowRunner(queries, re, vr)

	// Track which endpoints were called
	var calledEndpoints []string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calledEndpoints = append(calledEndpoints, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	// Create flow
	flow, err := queries.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Goto Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Step A: post-script jumps to "Step C"
	queries.CreateFlowStep(ctx, repository.CreateFlowStepParams{
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

	// Step B: should be SKIPPED by goto
	queries.CreateFlowStep(ctx, repository.CreateFlowStepParams{
		FlowID:    flow.ID,
		StepOrder: 2,
		Name:      "Step B",
		Method:    "GET",
		Url:       ts.URL + "/step-b",
		LoopCount:       sql.NullInt64{Int64: 1, Valid: true},
		ContinueOnError: sql.NullInt64{Int64: 0, Valid: true},
	})

	// Step C: target of goto
	queries.CreateFlowStep(ctx, repository.CreateFlowStepParams{
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

	// Verify: should call /step-a then /step-c (skipping /step-b)
	if len(calledEndpoints) != 2 {
		t.Fatalf("Expected 2 HTTP calls, got %d: %v", len(calledEndpoints), calledEndpoints)
	}
	if calledEndpoints[0] != "/step-a" {
		t.Errorf("First call should be /step-a, got %s", calledEndpoints[0])
	}
	if calledEndpoints[1] != "/step-c" {
		t.Errorf("Second call should be /step-c, got %s", calledEndpoints[1])
	}

	// Verify step results
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
	db := testutil.SetupTestDB(t)
	queries := repository.New(db)
	vr := NewVariableResolver(queries)
	re := NewRequestExecutor(queries, vr)
	fr := NewFlowRunner(queries, re, vr)

	var callCount int
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	ctx := context.WithValue(context.Background(), "workspaceID", int64(1))

	flow, err := queries.CreateFlow(ctx, repository.CreateFlowParams{
		Name:        "Self Repeat Test",
		WorkspaceID: 1,
		SortOrder:   1,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Step that repeats itself 3 times using setNextRequest, then stops
	postScript := strings.TrimSpace(`
var count = parseInt(pm.variables.get("counter") || "0") + 1;
pm.variables.set("counter", count.toString());
if (count < 3) {
    pm.execution.setNextRequest("Repeater");
} else {
    pm.execution.setNextRequest(null);
}
`)

	queries.CreateFlowStep(ctx, repository.CreateFlowStepParams{
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

	// Should have called the endpoint exactly 3 times
	if callCount != 3 {
		t.Errorf("Expected 3 HTTP calls, got %d", callCount)
	}

	// Should have 3 step results (all named "Repeater")
	if len(result.Steps) != 3 {
		t.Errorf("Expected 3 step results, got %d", len(result.Steps))
	}
}
```

**Step 2: 테스트 실행하여 실패 확인**

Run: `cd /Users/jtpark/workspace/relay && CGO_ENABLED=0 go test ./internal/service/ -run TestFlowRunner_SetNextRequest -v -timeout 30s`
Expected: `TestFlowRunner_SetNextRequest_Goto` FAIL (step-a가 두 번 호출되거나 step-c 대신 다른 스텝 호출)

---

### Task 2: goto 버그 수정

**Files:**
- Modify: `internal/service/flow_runner.go:136,399-403`

**Step 1: 외부 루프에 label 추가 및 goto 처리 수정**

`flow_runner.go`의 `runInternal` 메서드에서 두 곳을 수정:

1. 라인 136 — 외부 루프에 `outer:` label 추가:

```go
// Before (line 136)
	for stepIndex < len(steps) {

// After
outer:
	for stepIndex < len(steps) {
```

2. 라인 399-403 — goto 성공 시 `continue outer`로 변경하고 `iteration = 1` 제거 (외부 루프 재시작 시 `iteration := int64(1)`로 재선언됨):

```go
// Before (lines 399-403)
			if targetIndex >= 0 {
				stepIndex = targetIndex
				iteration = 1 // Reset iteration for the new step
				continue
			}

// After
			if targetIndex >= 0 {
				stepIndex = targetIndex
				continue outer
			}
```

**Step 2: 테스트 실행하여 통과 확인**

Run: `cd /Users/jtpark/workspace/relay && CGO_ENABLED=0 go test ./internal/service/ -run TestFlowRunner_SetNextRequest -v -timeout 30s`
Expected: PASS (두 테스트 모두 통과)

**Step 3: 기존 테스트 전체 실행하여 회귀 없음 확인**

Run: `cd /Users/jtpark/workspace/relay && CGO_ENABLED=0 go test ./internal/... -timeout 120s`
Expected: 전체 PASS

**Step 4: Commit**

```bash
git add internal/service/flow_runner.go internal/service/flow_runner_goto_test.go
git commit -m "fix: setNextRequest goto jumping to wrong step (#3)

Add outer label to flow execution loop so that FlowActionGoto
restarts the outer loop, correctly reading the target step."
```

---

### Task 3: E2E 테스트 추가

**Files:**
- Create: `e2e/tests/flows/flow-setNextRequest.spec.ts`

**Step 1: E2E 테스트 작성**

```typescript
import { test, expect, request } from '@playwright/test';
import { cleanupAll } from '../helpers/api-cleanup';
import { API_BASE, JSON_PLACEHOLDER } from '../helpers/constants';

test.beforeEach(async () => {
  await cleanupAll();
});

test.describe('Flow setNextRequest', () => {
  test('should skip steps when setNextRequest jumps forward', async () => {
    const ctx = await request.newContext();

    // Create flow
    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Goto Forward Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    // Step A: jumps to Step C
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step A',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript: 'pm.execution.setNextRequest("Step C");',
      },
    });

    // Step B: should be skipped
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step B',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/2`,
        stepOrder: 2,
      },
    });

    // Step C: target
    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Step C',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/3`,
        stepOrder: 3,
      },
    });

    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);

    // Should have 2 results: Step A and Step C (Step B skipped)
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].requestName).toBe('Step A');
    expect(result.steps[1].requestName).toBe('Step C');

    await ctx.dispose();
  });

  test('should repeat self via setNextRequest until condition met', async () => {
    const ctx = await request.newContext();

    const flowRes = await ctx.post(`${API_BASE}/flows`, {
      data: { name: 'Self Repeat Test', description: '' },
    });
    expect(flowRes.ok()).toBeTruthy();
    const flow = await flowRes.json();

    const postScript = `
var count = parseInt(pm.variables.get("counter") || "0") + 1;
pm.variables.set("counter", count.toString());
if (count < 3) {
    pm.execution.setNextRequest("Repeater");
} else {
    pm.execution.setNextRequest(null);
}
    `.trim();

    await ctx.post(`${API_BASE}/flows/${flow.id}/steps`, {
      data: {
        name: 'Repeater',
        method: 'GET',
        url: `${JSON_PLACEHOLDER}/posts/1`,
        stepOrder: 1,
        postScript,
      },
    });

    const runRes = await ctx.post(`${API_BASE}/flows/${flow.id}/run`, {
      data: {},
      timeout: 30_000,
    });
    expect(runRes.ok()).toBeTruthy();

    const result = await runRes.json();
    expect(result.success).toBe(true);

    // Should repeat 3 times then stop
    expect(result.steps).toHaveLength(3);
    for (const step of result.steps) {
      expect(step.requestName).toBe('Repeater');
      expect(step.executeResult.statusCode).toBe(200);
    }

    await ctx.dispose();
  });
});
```

**Step 2: E2E 테스트 실행하여 통과 확인**

Run: `cd /Users/jtpark/workspace/relay/e2e && bunx playwright test tests/flows/flow-setNextRequest.spec.ts`
Expected: 2 passed

**Step 3: Commit**

```bash
git add e2e/tests/flows/flow-setNextRequest.spec.ts
git commit -m "test: add E2E tests for setNextRequest flow control (#3)"
```
