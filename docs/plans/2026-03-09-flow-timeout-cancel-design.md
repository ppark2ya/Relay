# Flow Timeout & Cancel 개선

## 문제

1. Flow runner가 `ctx.Done()`을 체크하지 않아, SSE 연결이 끊겨도 서버가 계속 실행
2. 타임아웃이 발생해도 프론트엔드에서 "진행중" 상태로 표시됨
3. 사용자가 실행 중인 Flow를 취소할 방법이 없음

## 접근 방식

Context Cancellation 기반. 프론트엔드 AbortController → SSE 연결 끊김 → Go `r.Context()` cancel → flow runner 중단.

## 변경 사항

### Backend: `internal/service/flow_runner.go`

- `runInternal` 스텝 루프에서 각 스텝 실행 전 `ctx.Done()` 체크
- `time.Sleep(delay)` → `select { case <-ctx.Done(): case <-time.After(): }` 로 변경
- cancel 시 `result.Error = "cancelled"` 설정 후 `finalizeFlow()` 호출

### Frontend: `web/src/components/FlowEditor.tsx`

- `useRef<AbortController>` 추가
- `handleRun`에서 `new AbortController()` 생성, `signal`을 `runFlowStream`에 전달
- `handleCancel`에서 `controller.abort()` 호출
- Running 상태일 때 Cancel 버튼 표시 (빨간 Stop 아이콘)
- Cancel 시 완료된 스텝 결과 유지, "Cancelled" 상태 표시

### 변경 없음

- DB 스키마, API 엔드포인트, `runFlowStream` client 함수 (이미 `signal` 파라미터 있음)
