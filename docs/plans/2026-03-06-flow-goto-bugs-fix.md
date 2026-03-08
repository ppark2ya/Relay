# Flow setNextRequest Goto 버그 수정 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** setNextRequest가 존재하지 않는 스텝을 대상으로 할 때 silent fallthrough 대신 경고를 추가하고, 중복 스텝 이름 시 첫 번째 매칭을 사용하도록 수정

**Architecture:** flow_runner.go의 goto 해석 로직을 수정하여 (1) 대상 스텝 미발견 시 StepResult에 경고를 포함시키고 (2) stepNameToIndex가 첫 번째 발생을 저장하도록 변경. FlowResult/StepResult에 warnings 필드를 추가. 프론트엔드에서 goto 실패 경고를 표시.

**Tech Stack:** Go, goja, React/TypeScript

---

### Task 1: StepResult에 Warnings 필드 추가 (Backend)

**Files:**
- Modify: `internal/service/flow_runner.go:36-48` (StepResult 구조체)
- Modify: `internal/service/flow_runner.go:50-57` (FlowResult 구조체)

**Step 1: Write the failing test**

`internal/service/flow_runner_bugs_test.go`의 `TestFlowRunner_GotoResult_ShouldIncludeTargetInfo` 테스트가 이미 실패 중이므로 이 테스트를 기준 삼아 수정.

현재 실패 내용:
```
BUG: Step 'Should Not Run' was executed after failed goto to 'NonExistent Step'.
BUG: Flow reported success with no error despite setNextRequest targeting 'NonExistent Step'.
```

**Step 2: StepResult/FlowResult에 Warnings 필드 추가**

`internal/service/flow_runner.go`:
```go
type StepResult struct {
	StepID           int64             `json:"stepId"`
	RequestID        *int64            `json:"requestId"`
	RequestName      string            `json:"requestName"`
	ExecuteResult    *ExecuteResult    `json:"executeResult"`
	ExtractedVars    map[string]string `json:"extractedVars"`
	Skipped          bool              `json:"skipped"`
	SkipReason       string            `json:"skipReason,omitempty"`
	Iteration        int64             `json:"iteration,omitempty"`
	LoopCount        int64             `json:"loopCount,omitempty"`
	PreScriptResult  *ScriptResult     `json:"preScriptResult,omitempty"`
	PostScriptResult *ScriptResult     `json:"postScriptResult,omitempty"`
	Warnings         []string          `json:"warnings,omitempty"`           // NEW
}

type FlowResult struct {
	FlowID      int64        `json:"flowId"`
	FlowName    string       `json:"flowName"`
	Steps       []StepResult `json:"steps"`
	TotalTimeMs int64        `json:"totalTimeMs"`
	Success     bool         `json:"success"`
	Error       string       `json:"error,omitempty"`
	Warnings    []string     `json:"warnings,omitempty"`               // NEW
}
```

**Step 3: Run test to verify it still fails (warnings field added but logic not changed)**

Run: `CGO_ENABLED=0 go test ./internal/service/ -run TestFlowRunner_GotoResult_ShouldIncludeTargetInfo -v`
Expected: FAIL (same as before - logic not yet changed)

**Step 4: Commit**

```bash
git add internal/service/flow_runner.go
git commit -m "feat: add Warnings field to StepResult and FlowResult"
```

---

### Task 2: goto 대상 미발견 시 경고 추가 + fallthrough 유지 (Backend)

**Files:**
- Modify: `internal/service/flow_runner.go:388-405` (goto 해석 로직)

**Step 1: goto 해석 블록을 수정하여 경고 추가**

`internal/service/flow_runner.go` 약 388~405라인을 아래로 변경:

```go
			case FlowActionGoto:
				gotoJumps++
				if gotoJumps > maxGotoJumps {
					result.Success = false
					result.Error = "Maximum goto jump limit reached"
					finalizeFlow()
					return result, nil
				}

				// Find target step
				targetIndex := -1
				if gotoStepName != "" {
					if idx, ok := stepNameToIndex[gotoStepName]; ok {
						targetIndex = idx
					}
				} else if gotoStepOrder > 0 {
					if idx, ok := stepOrderToIndex[gotoStepOrder]; ok {
						targetIndex = idx
					}
				}

				if targetIndex >= 0 {
					stepIndex = targetIndex
					continue outer
				}

				// Target not found - add warning to step result and flow result
				var warnMsg string
				if gotoStepName != "" {
					warnMsg = fmt.Sprintf("setNextRequest target step not found: %q", gotoStepName)
				} else if gotoStepOrder > 0 {
					warnMsg = fmt.Sprintf("setNextRequest target step order not found: %d", gotoStepOrder)
				}
				if warnMsg != "" {
					// Update the last appended step result's warnings
					if len(result.Steps) > 0 {
						result.Steps[len(result.Steps)-1].Warnings = append(result.Steps[len(result.Steps)-1].Warnings, warnMsg)
					}
					result.Warnings = append(result.Warnings, fmt.Sprintf("[%s] %s", step.Name, warnMsg))
				}
				// Fall through to next step (existing behavior preserved)
```

**Step 2: 테스트 업데이트 - 경고 포함 검증으로 변경**

`internal/service/flow_runner_bugs_test.go`의 `TestFlowRunner_GotoResult_ShouldIncludeTargetInfo` 수정:

기존 "BUG:" assertion들을 **경고 필드 확인**으로 변경:
```go
	// The flow falls through to next step (preserved behavior) but includes warnings
	if len(result.Steps) > 1 {
		t.Log("Flow fell through to next step after failed goto (expected - backward compatible)")
	}

	// Check that warnings are now included
	if len(result.Warnings) == 0 {
		t.Error("Expected flow-level warnings for failed goto, got none")
	} else {
		t.Logf("Flow warnings: %v", result.Warnings)
	}

	if len(result.Steps) > 0 && len(result.Steps[0].Warnings) == 0 {
		t.Error("Expected step-level warnings for failed goto, got none")
	}
```

**Step 3: Run test**

Run: `CGO_ENABLED=0 go test ./internal/service/ -run TestFlowRunner_GotoResult_ShouldIncludeTargetInfo -v`
Expected: PASS

**Step 4: Run all existing tests to verify no regression**

Run: `CGO_ENABLED=0 go test ./internal/service/ -v`
Expected: All existing tests PASS

**Step 5: Commit**

```bash
git add internal/service/flow_runner.go internal/service/flow_runner_bugs_test.go
git commit -m "feat: add warning when setNextRequest target step not found"
```

---

### Task 3: stepNameToIndex가 첫 번째 발생을 저장하도록 변경 (Backend)

**Files:**
- Modify: `internal/service/flow_runner.go:114-122` (stepNameToIndex 빌드)

**Step 1: 중복 스텝 이름 테스트 업데이트**

`internal/service/flow_runner_bugs_test.go`의 `TestFlowRunner_SetNextRequest_DuplicateStepNames` 수정:

현재 기대: goto "Process" → 마지막 "Process" (step 3)로 점프
수정 후 기대: goto "Process" → 첫 번째 "Process" (step 2)로 점프 + 중복 경고

```go
	// After fix: setNextRequest("Process") should jump to FIRST "Process" (step 2)
	// and flow-level warning about duplicate step names
	if len(calledEndpoints) >= 2 && calledEndpoints[1] == "/process-first" {
		t.Log("FIXED: Duplicate step name 'Process' - goto now targets the FIRST step with that name")
	}
	if len(calledEndpoints) >= 2 && calledEndpoints[1] == "/process-second" {
		t.Error("Still targeting LAST duplicate step instead of first")
	}

	// Should include a warning about duplicate step names
	if len(result.Warnings) == 0 {
		t.Error("Expected warning about duplicate step name 'Process'")
	}
```

**Step 2: stepNameToIndex 빌드 로직 수정**

`internal/service/flow_runner.go` 약 114~122라인:

```go
	// Build step name -> index map for goto resolution (first occurrence wins)
	stepNameToIndex := make(map[string]int)
	stepOrderToIndex := make(map[int]int)
	duplicateNames := make(map[string]bool)
	for i, step := range steps {
		if step.Name != "" {
			if _, exists := stepNameToIndex[step.Name]; exists {
				duplicateNames[step.Name] = true
			} else {
				stepNameToIndex[step.Name] = i
			}
		}
		if _, exists := stepOrderToIndex[int(step.StepOrder)]; !exists {
			stepOrderToIndex[int(step.StepOrder)] = i
		}
	}

	// Add warnings for duplicate step names/orders
	for name := range duplicateNames {
		result.Warnings = append(result.Warnings, fmt.Sprintf("Duplicate step name %q found - goto will target first occurrence", name))
	}
```

**Step 3: Run tests**

Run: `CGO_ENABLED=0 go test ./internal/service/ -run "TestFlowRunner_SetNextRequest_DuplicateStepNames|TestFlowRunner_SetNextRequest_Goto" -v`
Expected:
- `TestFlowRunner_SetNextRequest_DuplicateStepNames` PASS
- `TestFlowRunner_SetNextRequest_Goto` PASS (기존 goto 동작 유지)

**Step 4: Commit**

```bash
git add internal/service/flow_runner.go internal/service/flow_runner_bugs_test.go
git commit -m "fix: stepNameToIndex uses first occurrence for duplicate step names"
```

---

### Task 4: 나머지 버그 테스트 업데이트 (Backend)

**Files:**
- Modify: `internal/service/flow_runner_bugs_test.go`

**Step 1: SpaceMismatch 테스트 - 경고 검증 추가**

`TestFlowRunner_SetNextRequest_SpaceMismatch`의 `actual_remote_scenario` 서브테스트:

fallthrough는 유지되지만 이제 warnings가 있으므로 확인:
```go
		// Flow still falls through (backward compat), but now includes warnings
		if len(result2.Warnings) == 0 {
			t.Error("Expected warnings about failed goto targets")
		} else {
			for _, w := range result2.Warnings {
				t.Logf("  Warning: %s", w)
			}
		}
```

`TestFlowRunner_SetNextRequest_NonExistentTarget_SilentFallthrough` 역시 동일 패턴으로 수정:
- fallthrough는 여전히 발생 (backward compat)
- 하지만 `result.Warnings`에 경고 메시지가 포함되어야 함

`TestFlowRunner_RequestCount_Bug`도 warnings 검증 추가.

**Step 2: Run all bug tests**

Run: `CGO_ENABLED=0 go test ./internal/service/ -run "TestFlowRunner_(SetNextRequest|WrongPostScript|EnvironmentVsVariables|DuplicateStepOrder|GotoResult|VariableTypeCoercion|RequestCount)" -v`
Expected: 문서화 목적 테스트(PASS) + 수정 검증 테스트(PASS)

**Step 3: Commit**

```bash
git add internal/service/flow_runner_bugs_test.go
git commit -m "test: update bug tests to verify warnings on failed goto"
```

---

### Task 5: Frontend - Warnings 표시 (Frontend)

**Files:**
- Modify: `web/src/api/flows/types.ts:35-42,55-67` (StepResult, FlowResult 타입)
- Modify: `web/src/components/FlowEditor.tsx:1484-1509` (결과 표시)

**Step 1: 타입 업데이트**

`web/src/api/flows/types.ts`:
```typescript
export interface FlowResult {
  flowId: number;
  flowName: string;
  steps: StepResult[];
  totalTimeMs: number;
  success: boolean;
  error?: string;
  warnings?: string[];   // NEW
}

export interface StepResult {
  stepId: number;
  requestId?: number;
  requestName: string;
  executeResult: ExecuteResult;
  extractedVars: Record<string, string>;
  skipped: boolean;
  skipReason?: string;
  iteration?: number;
  loopCount?: number;
  preScriptResult?: ScriptResult;
  postScriptResult?: ScriptResult;
  warnings?: string[];   // NEW
}
```

**Step 2: FlowEditor에서 step-level 경고 표시**

`web/src/components/FlowEditor.tsx` 약 1503라인 (extractedVars 표시 전):

```tsx
                  {/* Show goto warnings */}
                  {stepResult.warnings && stepResult.warnings.length > 0 && (
                    <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      {stepResult.warnings.map((w, i) => (
                        <div key={i}>⚠ {w}</div>
                      ))}
                    </div>
                  )}
```

**Step 3: FlowEditor에서 flow-level 경고 표시**

FlowResult 표시하는 곳 (flow 실행 완료 후 summary 영역)에서 `result.warnings`가 있으면 표시. 이 영역을 찾아 flow 결과 summary에 추가:

```tsx
{flowResult.warnings && flowResult.warnings.length > 0 && (
  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
    <div className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Warnings</div>
    {flowResult.warnings.map((w, i) => (
      <div key={i} className="text-xs text-amber-600 dark:text-amber-400">⚠ {w}</div>
    ))}
  </div>
)}
```

**Step 4: 프론트엔드 빌드 확인**

Run: `cd web && bun run build`
Expected: 빌드 성공, 에러 없음

**Step 5: Commit**

```bash
git add web/src/api/flows/types.ts web/src/components/FlowEditor.tsx
git commit -m "feat(frontend): display goto warnings in flow results"
```

---

### Task 6: E2E 테스트 작성 - setNextRequest 경고 표시 검증

**Files:**
- Create: `e2e/tests/flows/flow-goto-warnings.spec.ts`

**Step 1: E2E 테스트 작성**

Mock 서버를 이용한 flow 실행 후 UI에 경고가 표시되는지 검증:

```typescript
import { test, expect } from '@playwright/test';
import { createCollection, createRequest, createFlow, createFlowStep, createEnvironment, activateEnvironment } from '../helpers/api';

test.describe('Flow Goto Warnings', () => {

  test('should show warning when setNextRequest targets non-existent step', async ({ page }) => {
    // Setup: create flow with mismatched goto target
    const env = await createEnvironment('TestEnv', { MOCK_URL: `http://localhost:${process.env.MOCK_PORT || '9999'}` });
    await activateEnvironment(env.id);

    const flow = await createFlow('Goto Warning Test');

    // Use a simple echo server URL or the local server itself
    // Step 1: post-script tries to goto "Wrong Name"
    await createFlowStep(flow.id, {
      name: 'Step A',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces', // self-call for testing
      bodyType: 'none',
      postScript: 'pm.execution.setNextRequest("Wrong Name");',
    });

    // Step 2: should still execute (fallthrough) but with warning
    await createFlowStep(flow.id, {
      name: 'Step B',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces',
      bodyType: 'none',
    });

    // Navigate to flow
    await page.goto(`/`);
    await page.getByRole('button', { name: 'Flows' }).click();
    await page.getByRole('button', { name: 'Goto Warning Test' }).click();

    // Run flow
    await page.getByRole('button', { name: 'Run Flow' }).click();

    // Wait for completion
    await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 10000 });

    // Verify warning is shown
    await expect(page.getByText(/setNextRequest target step not found/)).toBeVisible();
    await expect(page.getByText(/"Wrong Name"/)).toBeVisible();
  });

  test('should show warning for duplicate step names', async ({ page }) => {
    const flow = await createFlow('Duplicate Name Test');

    await createFlowStep(flow.id, {
      name: 'Starter',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces',
      bodyType: 'none',
      postScript: 'pm.execution.setNextRequest("Worker");',
    });

    await createFlowStep(flow.id, {
      name: 'Worker',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces',
      bodyType: 'none',
    });

    // Duplicate name
    await createFlowStep(flow.id, {
      name: 'Worker',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces',
      bodyType: 'none',
    });

    await page.goto(`/`);
    await page.getByRole('button', { name: 'Flows' }).click();
    await page.getByRole('button', { name: 'Duplicate Name Test' }).click();

    await page.getByRole('button', { name: 'Run Flow' }).click();
    await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 10000 });

    // Verify duplicate name warning
    await expect(page.getByText(/Duplicate step name/)).toBeVisible();
  });

  test('space mismatch in setNextRequest - shows warning', async ({ page }) => {
    const flow = await createFlow('Space Mismatch Test');

    await createFlowStep(flow.id, {
      name: '확정',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces',
      bodyType: 'none',
      postScript: 'pm.execution.setNextRequest("투입");',
    });

    await createFlowStep(flow.id, {
      name: '투입',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces',
      bodyType: 'none',
      // BUG: space mismatch "승인 대기" vs actual "승인대기"
      postScript: 'pm.execution.setNextRequest("승인 대기");',
    });

    await createFlowStep(flow.id, {
      name: '승인대기',
      method: 'GET',
      url: 'http://localhost:8080/api/workspaces',
      bodyType: 'none',
    });

    await page.goto(`/`);
    await page.getByRole('button', { name: 'Flows' }).click();
    await page.getByRole('button', { name: 'Space Mismatch Test' }).click();

    await page.getByRole('button', { name: 'Run Flow' }).click();
    await expect(page.getByText(/completed/i)).toBeVisible({ timeout: 10000 });

    // Warning should show the mismatched name
    await expect(page.getByText(/setNextRequest target step not found.*승인 대기/)).toBeVisible();
  });
});
```

**Step 2: E2E 헬퍼 함수 추가 (없는 경우)**

`e2e/tests/helpers/api.ts`에 `createFlow`, `createFlowStep`, `createEnvironment`, `activateEnvironment` 함수가 없으면 추가.

**Step 3: Run E2E tests**

Run: `make test-e2e -- --grep "Flow Goto Warnings"`
Expected: All 3 tests PASS

**Step 4: Commit**

```bash
git add e2e/tests/flows/flow-goto-warnings.spec.ts e2e/tests/helpers/api.ts
git commit -m "test(e2e): add flow goto warning tests"
```

---

### Task 7: 전체 회귀 테스트

**Step 1: 전체 Go 테스트**

Run: `CGO_ENABLED=0 go test ./... -v`
Expected: All PASS

**Step 2: 전체 E2E 테스트**

Run: `make test-e2e`
Expected: All PASS

**Step 3: 프론트엔드 빌드**

Run: `make build`
Expected: 성공

**Step 4: 원격 사이트 데이터 패턴으로 로컬 검증**

setup-remote-data.ts 실행 후 UI에서 Flow 2 실행 시 "승인 대기(외화 환전)" 관련 경고가 표시되는지 수동 확인.

---

## 수정 범위 요약

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | `internal/service/flow_runner.go` | StepResult/FlowResult에 Warnings 필드 추가 |
| 2 | `internal/service/flow_runner.go` | goto 미발견 시 경고 메시지 추가 (fallthrough 유지) |
| 3 | `internal/service/flow_runner.go` | stepNameToIndex 첫 번째 발생 우선, 중복 경고 |
| 4 | `internal/service/flow_runner_bugs_test.go` | 테스트를 수정 검증용으로 업데이트 |
| 5 | `web/src/api/flows/types.ts` | warnings 타입 추가 |
| 6 | `web/src/components/FlowEditor.tsx` | step/flow 경고 UI 표시 |
| 7 | `e2e/tests/flows/flow-goto-warnings.spec.ts` | E2E 테스트 |

## 수정하지 않는 것 (원격 사이트 데이터 문제)

다음은 **원격 사이트의 데이터 문제**로, Relay 코드 수정이 아닌 사용자에게 알려줄 내용:

1. Flow 2의 `"승인 대기(외화 환전)"` → `"승인 대기(외화환전)"` 공백 수정 필요
2. Flow 2 "승인(외화환전)" 스텝의 copy-paste된 postScript 삭제 필요
3. Flow 2 "승인 대기(외화환전)" preScript에서 `pm.environment.get` → `pm.variables.get` 변경 필요
4. Flow 1 중복 스텝 이름 "지폐 투입(USD100)" 구분 필요

→ 이 문제들은 수정 후 **warnings UI**를 통해 사용자가 직접 발견할 수 있게 됨.
