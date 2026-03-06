# Flow 타임아웃 값 조정 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Flow 실행 시 장시간 소요 요청(5초+)에서 발생하는 타임아웃 오류 해결 (GitHub 이슈 #2)

**Architecture:** 3개 파일의 타임아웃 상수값을 조정. JS 스크립트 5초→30초, 프론트엔드 ky 타임아웃 비활성화, 백엔드 HTTP 클라이언트 30초→60초. 프론트엔드 타임아웃을 비활성화해도 백엔드에서 이중 보호(HTTP 60초, JS 30초)되므로 무한 대기 없음.

**Tech Stack:** Go, TypeScript, ky

---

### Task 1: JS 스크립트 실행기 타임아웃 증가 (5초 → 30초)

**Files:**
- Modify: `internal/service/js_script_executor.go:91`
- Test: `internal/service/js_script_executor_test.go`

**Step 1: 타임아웃 값 변경**

`internal/service/js_script_executor.go:91`에서:

```go
// Before
timeout: 5 * time.Second,

// After
timeout: 30 * time.Second,
```

**Step 2: 기존 테스트 실행하여 통과 확인**

Run: `cd /Users/jtpark/workspace/relay && CGO_ENABLED=0 go test ./internal/service/ -run TestJSExecutor_Timeout -v`
Expected: PASS (테스트는 자체적으로 50ms 타임아웃을 설정하므로 기본값 변경에 영향 없음)

**Step 3: Commit**

```bash
git add internal/service/js_script_executor.go
git commit -m "fix: increase JS script executor timeout from 5s to 30s (#2)"
```

---

### Task 2: 프론트엔드 ky 타임아웃 비활성화

**Files:**
- Modify: `web/src/api/client.ts:3`

**Step 1: ky 인스턴스에 timeout: false 추가**

`web/src/api/client.ts`에서:

```typescript
// Before
const api = ky.create({
  prefixUrl: '/api',
  hooks: {

// After
const api = ky.create({
  prefixUrl: '/api',
  timeout: false,
  hooks: {
```

**Step 2: 프론트엔드 빌드 확인**

Run: `cd /Users/jtpark/workspace/relay/web && bun run build`
Expected: 빌드 성공 (에러 없음)

**Step 3: Commit**

```bash
git add web/src/api/client.ts
git commit -m "fix: disable ky default timeout for long-running API calls (#2)"
```

---

### Task 3: 백엔드 HTTP 클라이언트 타임아웃 증가 (30초 → 60초)

**Files:**
- Modify: `internal/service/request_executor.go:479`
- Test: `internal/handler/integration_test.go`

**Step 1: 타임아웃 값 변경**

`internal/service/request_executor.go:479`에서:

```go
// Before
Timeout: 30 * time.Second,

// After
Timeout: 60 * time.Second,
```

**Step 2: 기존 통합 테스트 실행하여 통과 확인**

Run: `cd /Users/jtpark/workspace/relay && CGO_ENABLED=0 go test ./internal/handler/ -run TestExecuteRequest -v -timeout 120s`
Expected: PASS

**Step 3: Commit**

```bash
git add internal/service/request_executor.go
git commit -m "fix: increase HTTP client timeout from 30s to 60s (#2)"
```
