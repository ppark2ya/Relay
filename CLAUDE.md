# Relay

사내 업무망용 Postman-like API 테스트 도구. Go 단일 바이너리 배포.

## 기술 스택

- **Backend**: Go 1.23+, Chi router, SQLite (modernc.org/sqlite), nhooyr.io/websocket
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS v4, TanStack Query, Bun
- **Build**: 단일 바이너리 (Go embed로 프론트엔드 포함, `-ldflags="-s -w"`)

## 프로젝트 구조

```
relay/
├── cmd/server/main.go           # 진입점, embed 설정
├── internal/
│   ├── handler/                 # HTTP 핸들러
│   │   ├── workspace.go         # 워크스페이스 CRUD
│   │   └── websocket.go         # WebSocket 릴레이 핸들러
│   ├── service/                 # 비즈니스 로직
│   │   ├── request_executor.go  # HTTP 요청 실행 + CreateHTTPClient 공용 함수
│   │   ├── variable_resolver.go # {{변수}} 치환
│   │   ├── flow_runner.go       # Flow 순차 실행
│   │   └── websocket_relay.go   # WS 릴레이 (브라우저 ↔ Go ↔ 대상 서버)
│   ├── repository/              # SQLC 생성 코드
│   └── middleware/
│       ├── cors.go              # CORS 설정
│       └── workspace.go         # X-Workspace-ID 헤더 → context 미들웨어
├── db/
│   ├── migrations/              # SQL 마이그레이션 (001_init, 002_workspaces)
│   ├── queries/                 # SQLC 쿼리
│   └── sqlc.yaml
├── web/                         # React 프론트엔드
│   └── src/
│       ├── components/          # UI 컴포넌트
│       │   ├── WebSocketPanel.tsx  # WS 메시지 송수신 패널
│       │   └── WorkspaceEditor.tsx # 워크스페이스 CRUD 모달
│       ├── api/                 # 도메인별 API 모듈 (ky 기반)
│       │   ├── client.ts        # 공유 ky 인스턴스 (X-Workspace-ID 자동 주입)
│       │   ├── shared/          # queryKeys, ExecuteResult
│       │   ├── workspaces/      # client, types, hooks, index
│       │   ├── collections/     # client, types, hooks, index
│       │   ├── requests/        # client, types, hooks, index
│       │   ├── environments/    # client, types, hooks, index
│       │   ├── proxies/         # client, types, hooks, index
│       │   ├── flows/           # client, types, hooks, index
│       │   └── history/         # client, types, hooks, index
│       ├── hooks/               # 커스텀 훅
│       │   ├── useWorkspace.ts  # 워크스페이스 Context + localStorage 관리
│       │   ├── useWebSocket.ts  # WS 릴레이 연결 관리
│       │   ├── useClickOutside.ts
│       │   └── useNavigation.ts
│       └── types/               # barrel re-export + WS 타입
├── .claude/skills/              # Claude 개발 가이드
│   └── react-best-practices/    # React 성능 최적화 규칙
├── Dockerfile                   # 개발용 (golang 베이스)
├── Dockerfile_alpine            # 프로덕션용 (alpine 베이스)
├── Dockerfile.airgap            # 폐쇄망용 (Nexus 프록시 지원)
└── Makefile
```

## 개발 명령어

```bash
# 버전 설정 (mise 사용)
mise install

# 전체 빌드
make build

# 개발 서버
make dev-backend    # 백엔드 (localhost:8080)
make dev-frontend   # 프론트엔드 (localhost:5173)

# 테스트
make test

# SQLC 코드 생성
make sqlc

# Docker 빌드
docker build -t relay .                              # 개발용
docker build -f Dockerfile_alpine -t relay:alpine .  # 프로덕션용
```

## API 엔드포인트

```
Workspaces:   GET/POST /api/workspaces, GET/PUT/DELETE /api/workspaces/:id
Collections:  GET/POST /api/collections, GET/PUT/DELETE /api/collections/:id
              POST /api/collections/:id/duplicate
Requests:     CRUD + POST /api/requests/:id/execute, POST /api/execute
              POST /api/requests/:id/duplicate
Environments: CRUD + POST /api/environments/:id/activate
Proxies:      CRUD + POST /api/proxies/:id/activate, POST /api/proxies/:id/test
              POST /api/proxies/deactivate
Flows:        CRUD + POST /api/flows/:id/run, POST /api/flows/:id/duplicate
              GET/POST /api/flows/:id/steps, PUT/DELETE /api/flows/:id/steps/:stepId
WebSocket:    GET /api/ws/relay (WebSocket 업그레이드)
History:      GET /api/history, GET/DELETE /api/history/:id
```

모든 API 요청은 `X-Workspace-ID` 헤더로 워크스페이스를 지정 (미지정 시 기본값 `1`).

## 주요 기능

- **Workspaces**: 팀/부서별 데이터 완전 격리 (헤더 드롭다운으로 전환, 인증 불필요)
- **Collections**: 폴더 구조로 요청 관리 (중첩 지원, 복제)
- **Requests**: HTTP 요청 정의 및 실행 (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
- **WebSocket**: WS/WSS 서버 테스트 (Method 드롭다운에서 WS 선택, Go 릴레이 방식)
- **Environments**: 변수 집합 관리, `{{변수}}` 치환
- **Proxies**: 프록시 설정 (글로벌/요청별/Flow 단계별 오버라이드)
- **Flows**: 요청 체이닝 (순차 실행, JSONPath 변수 추출)
- **History**: 실행 기록

## 환경 변수

- `DB_PATH`: SQLite DB 경로 (기본값: `./relay.db`)
- `PORT`: 서버 포트 (기본값: `8080`)

## Workspace 아키텍처

팀/부서별 데이터 완전 격리. 인증 없이 워크스페이스 선택만으로 전환.

- **미들웨어**: `X-Workspace-ID` 헤더 → `context.Value` (기본값 `1`)
- **DB 스키마**: 모든 데이터 테이블에 `workspace_id` 컬럼 (FK → workspaces)
- **SQLC 쿼리**: `List*`, `Create*` 등 모든 쿼리에 `workspace_id` 필터/파라미터
- **프론트엔드**: `localStorage('workspaceId')` → ky `beforeRequest` 훅으로 자동 주입
- **전환 시**: `queryClient.invalidateQueries()` 전체 캐시 클리어 → 모든 데이터 재조회
- **Default 워크스페이스**: id=1, 삭제 불가, 서버 시작 시 자동 생성 (`migrateWorkspaces`)

## WebSocket 아키텍처

프록시 릴레이 방식: `Browser ↔ Go Backend ↔ Target WS Server`

- 브라우저가 `/api/ws/relay`로 WS 업그레이드
- JSON 엔벨로프 프로토콜: `connect`, `send`, `close` (→ Go) / `connected`, `received`, `error`, `closed` (← Go)
- Go가 변수 치환(`{{var}}`), 프록시 적용 후 대상 서버에 연결
- `CreateHTTPClient` 함수를 `RequestExecutor`와 `WebSocketRelay`가 공유
- 연결 종료 시 히스토리에 `method='WS'`로 기록

## Frontend 개발 가이드

### API 레이어 구조

도메인별 분리된 모듈 구조 (`api/<domain>/`):
- `client.ts`: ky 기반 API 호출 함수
- `types.ts`: 도메인 타입 정의
- `hooks.ts`: TanStack Query 훅 (useQuery, useMutation)
- `index.ts`: hooks + types re-export

공유 모듈:
- `api/client.ts`: ky 인스턴스 (`prefixUrl: '/api'`, `beforeRequest` 훅에서 `X-Workspace-ID` 자동 주입)
- `api/shared/queryKeys.ts`: 중앙 query key 상수 (교차 도메인 캐시 무효화)
- `api/shared/types.ts`: `ExecuteResult` (requests, flows에서 공유)

### 컴포넌트 구조

- `components/`: UI 컴포넌트 (Header, Sidebar, RequestEditor, FlowEditor, WebSocketPanel, WorkspaceEditor 등)
- `hooks/useWorkspace.ts`: 워크스페이스 Context (localStorage 기반 전환, 캐시 무효화)
- `hooks/useWebSocket.ts`: WS 릴레이 연결/메시지 관리 훅
- `hooks/useClickOutside.ts`: 드롭다운 외부 클릭 감지 훅
- `types/index.ts`: barrel re-export (기존 `../types` import 경로 호환) + WS 타입

### 주요 패턴

- **상태 관리**: TanStack Query로 서버 상태 관리, React useState로 UI 상태 관리
- **API 호출**: `api/<domain>/client.ts` 함수를 `api/<domain>/hooks.ts`에서 TanStack Query로 래핑
- **드롭다운**: `useClickOutside` 훅으로 외부 클릭 시 닫기 처리
- **스타일링**: TailwindCSS 유틸리티 클래스 사용

### React Best Practices

Frontend 개발 시 `.claude/skills/react-best-practices/` 문서 참고:

- **성능 최적화**: `rerender-*` 규칙 (memo, derived state, functional setState)
- **비동기 처리**: `async-*` 규칙 (Promise.all, Suspense boundaries)
- **번들 최적화**: `bundle-*` 규칙 (dynamic imports, barrel imports 주의)

자세한 규칙은 `.claude/skills/react-best-practices/SKILL.md` 참조
