# Relay

사내 업무망용 Postman-like API 테스트 도구. Go 단일 바이너리 배포.

## 기술 스택

- **Backend**: Go 1.25, Chi router, SQLite (modernc.org/sqlite), coder/websocket, goja (JS 런타임)
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS v4, TanStack Query, Bun
- **Build**: 단일 바이너리 (Go embed로 프론트엔드 포함, `-ldflags="-s -w"`)

## 프로젝트 구조

```
relay/
├── cmd/server/main.go           # 진입점, embed 설정, 라우트 등록
├── internal/
│   ├── handler/                 # HTTP 핸들러
│   │   ├── workspace.go         # 워크스페이스 CRUD
│   │   ├── collection.go        # 컬렉션 CRUD + 복제 + 정렬
│   │   ├── request.go           # 요청 CRUD + 실행 + 복제 + 정렬
│   │   ├── environment.go       # 환경 CRUD + 활성화
│   │   ├── proxy.go             # 프록시 CRUD + 활성화 + 테스트
│   │   ├── flow.go              # Flow CRUD + 실행 + Steps + 정렬
│   │   ├── file.go              # 파일 업로드/다운로드/정리
│   │   ├── history.go           # 히스토리 조회/삭제
│   │   ├── websocket.go         # WebSocket 릴레이 핸들러
│   │   └── util.go              # 공통 헬퍼
│   ├── service/                 # 비즈니스 로직
│   │   ├── request_executor.go  # HTTP 요청 실행 + CreateHTTPClient 공용 함수
│   │   ├── variable_resolver.go # {{변수}} 치환 (계층적 변수 해석)
│   │   ├── flow_runner.go       # Flow 순차 실행 (DSL + JS 스크립트)
│   │   ├── websocket_relay.go   # WS 릴레이 (브라우저 ↔ Go ↔ 대상 서버)
│   │   ├── js_script_executor.go # JavaScript/Postman API 스크립트 실행 (goja)
│   │   ├── script_executor.go   # 스크립트 실행 인터페이스
│   │   ├── file_storage.go      # 파일 저장소 (업로드 파일 관리)
│   │   └── file_cleanup.go      # 고아 파일 정리
│   ├── repository/              # SQLC 생성 코드
│   ├── middleware/
│   │   ├── cors.go              # CORS 설정
│   │   └── workspace.go         # X-Workspace-ID 헤더 → context 미들웨어
│   ├── migration/
│   │   └── migration.go         # DB 마이그레이션 실행기
│   └── testutil/
│       └── testutil.go          # 테스트 유틸리티
├── db/
│   ├── migrations/              # SQL 마이그레이션 (001~008)
│   │   ├── 001_init.sql         # 초기 스키마
│   │   ├── 002_workspaces.sql   # 워크스페이스 격리
│   │   ├── 003_flow_loop.sql    # Flow 루프 (loop_count)
│   │   ├── 004_flow_scripts.sql # Flow Step 스크립트
│   │   ├── 005_uploaded_files.sql # 파일 업로드 테이블
│   │   ├── 006_workspace_collection_variables.sql # 워크스페이스/컬렉션 변수
│   │   ├── 007_request_scripts.sql # Request Pre/Post 스크립트
│   │   └── 008_sort_order.sql   # 정렬 순서 (DnD)
│   ├── queries/                 # SQLC 쿼리
│   │   ├── collections.sql
│   │   ├── environments.sql
│   │   ├── files.sql
│   │   ├── flows.sql
│   │   ├── history.sql
│   │   ├── proxies.sql
│   │   ├── requests.sql
│   │   └── workspaces.sql
│   └── sqlc.yaml
├── docs/
│   └── FLOW_SCRIPT_DSL.md      # Flow 스크립트 DSL 가이드
├── web/                         # React 프론트엔드
│   └── src/
│       ├── components/          # UI 컴포넌트
│       │   ├── Header.tsx       # 워크스페이스 선택, 테마 토글
│       │   ├── Sidebar.tsx      # 리사이즈, 필터, DnD 지원
│       │   ├── RequestEditor.tsx # 요청 편집/실행 + Pre/Post 스크립트
│       │   ├── FlowEditor.tsx   # Flow 편집/실행 + Steps 관리
│       │   ├── ResponseViewer.tsx # 응답 표시
│       │   ├── WebSocketPanel.tsx # WS 메시지 송수신 패널
│       │   ├── WorkspaceEditor.tsx # 워크스페이스 CRUD 모달
│       │   ├── EnvironmentEditor.tsx # 환경 변수 편집
│       │   ├── ProxyEditor.tsx  # 프록시 설정
│       │   ├── GlobalSearch.tsx # 글로벌 검색 (Cmd/Ctrl+K)
│       │   ├── DSLGuide.tsx     # 스크립트 가이드 모달 (DSL + JS/Postman)
│       │   └── ui/              # 재사용 UI 컴포넌트
│       │       ├── CodeEditor.tsx    # CodeMirror 래퍼
│       │       ├── KeyValueEditor.tsx # key-value 편집기
│       │       ├── FormDataEditor.tsx # multipart form-data 편집기
│       │       ├── Modal.tsx         # 모달 래퍼
│       │       ├── MethodBadge.tsx   # HTTP 메서드 뱃지
│       │       ├── StatusDot.tsx     # 상태 표시 점
│       │       ├── TabNav.tsx        # 탭 네비게이션
│       │       ├── EmptyState.tsx    # 빈 상태 UI
│       │       ├── InlineCreateForm.tsx # 인라인 생성 폼
│       │       ├── FormField.tsx     # 폼 필드 래퍼
│       │       ├── method-colors.ts  # 메서드 색상 상수
│       │       └── index.ts         # barrel export
│       ├── api/                 # 도메인별 API 모듈 (ky 기반)
│       │   ├── client.ts        # 공유 ky 인스턴스 (X-Workspace-ID 자동 주입)
│       │   ├── shared/          # queryKeys, ExecuteResult
│       │   ├── workspaces/      # client, types, hooks, index
│       │   ├── collections/     # client, types, hooks, index
│       │   ├── requests/        # client, types, hooks, index
│       │   ├── environments/    # client, types, hooks, index
│       │   ├── proxies/         # client, types, hooks, index
│       │   ├── flows/           # client, types, hooks, index
│       │   ├── history/         # client, types, hooks, index
│       │   └── files/           # client, types, index (hooks 없음)
│       ├── hooks/               # 커스텀 훅
│       │   ├── useWorkspace.ts  # 워크스페이스 Context + localStorage 관리
│       │   ├── useWebSocket.ts  # WS 릴레이 연결 관리
│       │   ├── useTheme.ts      # 다크 모드 (시스템 설정 연동)
│       │   ├── useClickOutside.ts
│       │   └── useNavigation.ts
│       ├── utils/               # 유틸리티
│       │   └── searchUtils.ts   # 검색 필터링
│       └── types/               # barrel re-export + WS 타입
├── e2e/                         # Playwright E2E 테스트
│   ├── playwright.config.ts
│   └── tests/
│       ├── requests/            # 요청 CRUD, 실행, form-data, 스크립트
│       ├── flows/               # Flow CRUD, 루프, DSL/JS 스크립트, 변수
│       ├── history/             # 히스토리 조작
│       └── helpers/             # 테스트 유틸리티
├── .claude/skills/              # Claude 개발 가이드
│   └── react-best-practices/    # React 성능 최적화 규칙
├── Dockerfile                   # 개발용 (golang 베이스)
├── Dockerfile_alpine            # 프로덕션용 (alpine 베이스)
├── Dockerfile.airgap            # 폐쇄망용 (Nexus 프록시 지원)
├── docker-compose.yml
├── docker-stack.yml             # Docker Swarm 스택
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
make test           # 백엔드 + 프론트엔드 lint
make test-e2e       # Playwright E2E 테스트

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
              PUT /api/collections/reorder
              POST /api/collections/:id/duplicate

Requests:     GET/POST /api/requests, GET/PUT/DELETE /api/requests/:id
              PUT /api/requests/reorder
              POST /api/requests/:id/execute, POST /api/execute (ad-hoc)
              POST /api/requests/:id/duplicate

Environments: GET/POST /api/environments, GET/PUT/DELETE /api/environments/:id
              POST /api/environments/:id/activate

Proxies:      GET/POST /api/proxies, GET/PUT/DELETE /api/proxies/:id
              POST /api/proxies/:id/activate, POST /api/proxies/:id/test
              POST /api/proxies/deactivate

Flows:        GET/POST /api/flows, GET/PUT/DELETE /api/flows/:id
              PUT /api/flows/reorder
              POST /api/flows/:id/run, POST /api/flows/:id/duplicate
              GET/POST /api/flows/:id/steps
              PUT/DELETE /api/flows/:id/steps/:stepId

Files:        POST /api/files/upload, POST /api/files/cleanup
              GET/DELETE /api/files/:id

WebSocket:    GET /api/ws/relay (WebSocket 업그레이드)

History:      GET /api/history, GET/DELETE /api/history/:id
```

모든 API 요청은 `X-Workspace-ID` 헤더로 워크스페이스를 지정 (미지정 시 기본값 `1`).

## 주요 기능

- **Workspaces**: 팀/부서별 데이터 완전 격리 (헤더 드롭다운으로 전환, 인증 불필요)
- **Collections**: 폴더 구조로 요청 관리 (중첩 지원, 복제, DnD 정렬)
- **Requests**: HTTP 요청 정의 및 실행 (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
- **Scripts**: Pre/Post 스크립트 지원 (DSL JSON + JavaScript/Postman API)
- **WebSocket**: WS/WSS 서버 테스트 (Method 드롭다운에서 WS 선택, Go 릴레이 방식)
- **Environments**: 변수 집합 관리, `{{변수}}` 치환
- **Proxies**: 프록시 설정 (글로벌/요청별/Flow 단계별 오버라이드)
- **Flows**: 요청 체이닝 (순차 실행, JSONPath 변수 추출, 조건부 실행, 루프)
- **Files**: multipart form-data 파일 업로드 (서버 파일시스템에 영구 저장)
- **History**: 실행 기록
- **Global Search**: Cmd/Ctrl+K로 요청, Flow, 히스토리 통합 검색
- **Dark Mode**: 시스템 설정 연동 다크 모드
- **Drag & Drop**: 사이드바에서 요청/컬렉션/Flow 드래그 앤 드롭 정렬

## Body Type 체계

Requests와 Flows에서 통일된 body type 사용:

```
none | json | text | xml | form-urlencoded | formdata | graphql
```

| Body Type | 에디터 | Content-Type 자동 설정 |
|-----------|--------|----------------------|
| `none` | 없음 | — |
| `json` | CodeEditor (json) | `application/json` |
| `text` | CodeEditor (plain) | `text/plain` |
| `xml` | CodeEditor (xml) | `application/xml` |
| `form-urlencoded` | KeyValueEditor | `application/x-www-form-urlencoded` |
| `formdata` | FormDataEditor | `multipart/form-data` |
| `graphql` | CodeEditor (query) + CodeEditor (variables) | `application/json` |

- **라벨**: 소문자 (`formdata` → `multipart` 표시)
- **레거시 호환**: `normalizeBodyType()` 헬퍼가 `raw`→`text`, `form`→`form-urlencoded` 자동 변환
- **Backend**: bodyType을 문자열로 저장, `formdata`만 multipart 특수 처리

## 환경 변수

- `DB_PATH`: SQLite DB 경로 (기본값: `./relay.db`)
- `PORT`: 서버 포트 (기본값: `8080`)
- `UPLOAD_DIR`: 파일 업로드 디렉토리 (기본값: DB 경로 기준 `./uploads`)

## Workspace 아키텍처

팀/부서별 데이터 완전 격리. 인증 없이 워크스페이스 선택만으로 전환.

- **미들웨어**: `X-Workspace-ID` 헤더 → `context.Value` (기본값 `1`)
- **DB 스키마**: 모든 데이터 테이블에 `workspace_id` 컬럼 (FK → workspaces)
- **SQLC 쿼리**: `List*`, `Create*` 등 모든 쿼리에 `workspace_id` 필터/파라미터
- **프론트엔드**: `localStorage('workspaceId')` → ky `beforeRequest` 훅으로 자동 주입
- **전환 시**: `queryClient.invalidateQueries()` 전체 캐시 클리어 → 모든 데이터 재조회
- **Default 워크스페이스**: id=1, 삭제 불가, 서버 시작 시 자동 생성 (`migrateWorkspaces`)
- **워크스페이스 변수**: `variables` 컬럼 (JSON), `pm.globals`로 접근

## 변수 시스템

### 변수 계층 (우선순위 높은 순)

1. **Runtime 변수**: 스크립트에서 `pm.variables.set()` 또는 `setVariables`로 설정
2. **Environment 변수**: 활성 환경의 변수 (`pm.environment.get/set`)
3. **Collection 변수**: 컬렉션별 변수 (`pm.collectionVariables.get/set`)
4. **Workspace 변수**: 워크스페이스 전역 변수 (`pm.globals.get/set`)

### 치환 방식

URL, 헤더, 본문 등 모든 곳에서 `{{변수명}}` 형태로 사용. `variable_resolver.go`가 계층적으로 해석.

## 스크립트 시스템

Requests와 Flow Steps에서 Pre-Script / Post-Script 지원. 두 가지 실행 모드:

### DSL (JSON 기반)

`docs/FLOW_SCRIPT_DSL.md` 참조. assertions, setVariables, flow 제어.

### JavaScript (Postman 호환 API)

goja 엔진으로 실행. Postman 호환 `pm` 객체 제공:

- `pm.test(name, fn)` — 테스트 어설션
- `pm.expect(value)` — Chai-style assertion (`.to.equal()`, `.to.have.property()` 등)
- `pm.environment.get/set()` — 환경 변수
- `pm.variables.get/set()` — 런타임 변수
- `pm.globals.get/set()` — 워크스페이스 변수
- `pm.collectionVariables.get/set()` — 컬렉션 변수
- `pm.sendRequest(url, callback)` — 스크립트 내 HTTP 요청
- `pm.request` — 현재 요청 정보
- `pm.response` — 응답 데이터 (json(), code, headers 등)

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
- `components/GlobalSearch.tsx`: Cmd/Ctrl+K 글로벌 검색 (요청, Flow, 히스토리)
- `components/DSLGuide.tsx`: 스크립트 가이드 모달 (DSL 탭 + JavaScript/Postman API 탭)
- `components/ui/CodeEditor.tsx`: CodeMirror 래퍼 (json, graphql, xml, html, css language 지원)
- `components/ui/KeyValueEditor.tsx`: key-value 쌍 편집기 (params, headers, cookies, form-urlencoded)
- `components/ui/FormDataEditor.tsx`: multipart form-data 편집기 (text/file 타입 지원)
- `components/ui/Modal.tsx`: 공통 모달 래퍼
- `hooks/useWorkspace.ts`: 워크스페이스 Context (localStorage 기반 전환, 캐시 무효화)
- `hooks/useWebSocket.ts`: WS 릴레이 연결/메시지 관리 훅
- `hooks/useTheme.ts`: 다크 모드 관리 (시스템 설정 감지, localStorage 저장)
- `hooks/useClickOutside.ts`: 드롭다운 외부 클릭 감지 훅
- `utils/searchUtils.ts`: 검색 필터링 유틸리티
- `types/index.ts`: barrel re-export (기존 `../types` import 경로 호환) + WS 타입

### 주요 패턴

- **상태 관리**: TanStack Query로 서버 상태 관리, React useState로 UI 상태 관리
- **API 호출**: `api/<domain>/client.ts` 함수를 `api/<domain>/hooks.ts`에서 TanStack Query로 래핑
- **드롭다운**: `useClickOutside` 훅으로 외부 클릭 시 닫기 처리
- **스타일링**: TailwindCSS 유틸리티 클래스 사용
- **DnD**: `@dnd-kit/core` + `@dnd-kit/sortable`로 사이드바 항목 정렬
- **React Compiler**: `babel-plugin-react-compiler`로 자동 메모이제이션

### React Best Practices

Frontend 개발 시 `.claude/skills/react-best-practices/` 문서 참고:

- **성능 최적화**: `rerender-*` 규칙 (memo, derived state, functional setState)
- **비동기 처리**: `async-*` 규칙 (Promise.all, Suspense boundaries)
- **번들 최적화**: `bundle-*` 규칙 (dynamic imports, barrel imports 주의)

자세한 규칙은 `.claude/skills/react-best-practices/SKILL.md` 참조
