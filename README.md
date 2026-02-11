# Relay

사내 업무망(폐쇄망 포함)을 위한 경량 API 테스트 도구. Go 단일 바이너리로 배포하며, 별도 설치 없이 실행 즉시 사용 가능.

## 주요 기능

| 기능 | 설명 |
|------|------|
| **Workspaces** | 팀/부서별 데이터 완전 격리, 헤더 드롭다운으로 즉시 전환 |
| **HTTP 요청** | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS 지원. JSON/Form/XML/GraphQL 본문 |
| **WebSocket** | Method 드롭다운에서 WS 선택 후 ws:// wss:// 서버에 연결, 메시지 송수신 |
| **Collections** | 폴더 구조로 요청 관리 (중첩 지원, 복제, 드래그 앤 드롭 정렬) |
| **Environments** | 변수 집합 관리, URL/헤더/본문에 `{{변수}}` 치환 |
| **Proxies** | 글로벌 프록시, 요청별/Flow 단계별 프록시 오버라이드 |
| **Flows** | 요청 체이닝 — 순차 실행, JSONPath 변수 추출, 조건부 실행, 루프 |
| **Scripts** | Pre/Post 스크립트 — DSL(JSON) 또는 JavaScript(Postman 호환 API) |
| **File Upload** | multipart form-data 파일 업로드 (서버에 영구 저장) |
| **History** | 모든 실행 기록 자동 저장, 히스토리에서 바로 재실행 |
| **Global Search** | Cmd/Ctrl+K로 요청, Flow, 히스토리 통합 검색 |
| **Dark Mode** | 시스템 설정 연동 다크 모드 |

## 기술 스택

- **Backend**: Go 1.25 + Chi router + SQLite ([modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite))
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4 + TanStack Query + ky
- **WebSocket**: [coder/websocket](https://pkg.go.dev/github.com/coder/websocket) (pure Go, CGO 불필요)
- **Scripts**: [goja](https://github.com/dop251/goja) (Go 내장 JavaScript 런타임)
- **Build**: 프론트엔드를 Go embed로 포함한 단일 바이너리 (13MB, gzip 6MB)

## 빠른 시작

### 바이너리 실행

```bash
# GitHub Releases에서 다운로드 후
./relay
# → http://localhost:8080
```

### 소스 빌드

```bash
# 사전 요구: Go 1.25+, Node.js 22+, Bun
make build
./relay
```

### Docker

```bash
# 프로덕션 (alpine, ~20MB)
docker build -f Dockerfile_alpine -t relay .
docker run -d -p 8080:8080 -v relay-data:/data relay

# 폐쇄망 (Nexus 프록시)
docker build -f Dockerfile.airgap \
  --build-arg REGISTRY=nexus.example.com:8082 \
  -t relay .
```

### 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DB_PATH` | `./relay.db` | SQLite 데이터베이스 경로 |
| `PORT` | `8080` | 서버 포트 |
| `UPLOAD_DIR` | `./uploads` | 파일 업로드 저장 디렉토리 |

## 사용법

### Workspaces (데이터 격리)

1. 헤더 우측 Workspace 드롭다운에서 현재 워크스페이스 확인
2. 다른 워크스페이스 선택 시 즉시 전환 (모든 데이터 재조회)
3. **Manage Workspaces** 클릭 → 워크스페이스 생성/이름 변경/삭제
4. "Default" 워크스페이스(id=1)는 삭제 불가

> 워크스페이스 전환 시 Collections, Requests, Environments, Proxies, Flows, History 모든 데이터가 격리됩니다.

### HTTP 요청

1. 사이드바에서 Collection 생성 또는 **+ New Request** 클릭
2. Method 선택 (GET/POST/PUT/DELETE/...) → URL 입력
3. 필요 시 Headers, Params, Body 탭에서 설정
4. **Send** 클릭 → 하단에 응답 표시 (상태코드, 헤더, 본문, 소요시간)

### WebSocket 테스트

1. Method 드롭다운에서 **WS** 선택 (fuchsia 색상)
2. `ws://` 또는 `wss://` URL 입력
3. 필요 시 Headers 탭에서 커스텀 헤더 추가
4. **Connect** 클릭 → 상태 표시 (Connected/Connecting/Disconnected)
5. 하단 패널에서 메시지 입력 후 **Send** (Enter) → 수신 메시지 실시간 표시

> WebSocket은 Go 백엔드가 릴레이 역할을 하므로 (Browser ↔ Go ↔ Target), 환경 변수 치환과 프록시가 동일하게 적용됩니다.

### Environments

1. 헤더 우측 Environment 드롭다운에서 환경 생성/관리
2. 변수 정의 (예: `base_url` = `https://api.example.com`)
3. URL이나 헤더에 `{{base_url}}/users` 형태로 사용
4. 환경 활성화 시 자동 치환

### Flows (요청 체이닝)

1. Flow 생성 후 Step 추가 (저장된 Request 선택 또는 빈 Step)
2. 각 Step에서 JSONPath로 응답 값 추출 (예: `$.token`)
3. 다음 Step에서 `{{extracted_var}}` 로 참조
4. Pre/Post 스크립트로 검증, 변수 조작, 흐름 제어 가능
5. **Run Flow** 클릭 → 순차 실행 결과 확인

### Scripts (Pre/Post 스크립트)

Request와 Flow Step에서 Pre-Script(실행 전)과 Post-Script(실행 후) 지원. 두 가지 모드:

**DSL (JSON 기반)** — 코딩 없이 검증/변수/흐름 제어:
```json
{
  "assertions": [{ "type": "status", "operator": "eq", "value": 200 }],
  "setVariables": [{ "name": "token", "from": "$.data.accessToken" }]
}
```

**JavaScript (Postman 호환)** — `pm` API로 자유로운 스크립팅:
```javascript
pm.test("Status is 200", () => {
  pm.expect(pm.response.code).to.equal(200);
});
pm.environment.set("token", pm.response.json().data.accessToken);
```

자세한 DSL 문법은 Flow 편집 화면의 **가이드** 버튼 또는 `docs/FLOW_SCRIPT_DSL.md` 참조.

### 변수 계층

변수는 다음 우선순위로 해석됩니다 (높은 순):

1. **Runtime** — 스크립트에서 설정한 변수 (`pm.variables.set`)
2. **Environment** — 활성 환경의 변수 (`pm.environment.set`)
3. **Collection** — 컬렉션별 변수 (`pm.collectionVariables.set`)
4. **Workspace** — 워크스페이스 전역 변수 (`pm.globals.set`)

## 개발

```bash
# 버전 관리 (mise)
mise install

# 프론트엔드 개발 서버 (Hot Reload)
make dev-frontend   # localhost:5173

# 백엔드 개발 서버 (Air 사용)
make dev-backend    # localhost:8080

# 테스트
make test           # 백엔드 + 프론트엔드 lint
make test-e2e       # Playwright E2E 테스트

# SQLC 코드 생성 (DB 스키마/쿼리 변경 시)
make sqlc
```

### 프로젝트 구조

```
relay/
├── cmd/server/main.go          # 진입점, Go embed, 라우트 설정
├── internal/
│   ├── handler/                # HTTP/WS 핸들러
│   ├── service/                # 비즈니스 로직 (요청 실행, WS 릴레이, Flow, 스크립트)
│   ├── repository/             # SQLC 자동 생성 코드
│   ├── middleware/             # CORS, Workspace ID 미들웨어
│   ├── migration/              # DB 마이그레이션 실행기
│   └── testutil/               # 테스트 유틸리티
├── db/
│   ├── migrations/             # SQL 스키마 (001~008)
│   └── queries/                # SQLC 쿼리 정의
├── docs/
│   └── FLOW_SCRIPT_DSL.md     # Flow 스크립트 DSL 가이드
├── web/src/                    # React 프론트엔드
│   ├── components/             # UI 컴포넌트
│   ├── api/                    # 도메인별 API 모듈 (ky + TanStack Query)
│   ├── hooks/                  # WebSocket, 테마, 클릭 외부 감지 등 커스텀 훅
│   ├── utils/                  # 검색 필터링 등 유틸리티
│   └── types/                  # TypeScript 타입 (barrel re-export)
├── e2e/                        # Playwright E2E 테스트
├── Dockerfile                  # 개발용
├── Dockerfile_alpine           # 프로덕션용
├── Dockerfile.airgap           # 폐쇄망용 (Nexus 프록시)
└── Makefile
```

## API

모든 API 요청은 `X-Workspace-ID` 헤더로 워크스페이스를 지정합니다 (미지정 시 기본값 `1`).

```
Workspaces    GET/POST /api/workspaces
              GET/PUT/DELETE /api/workspaces/:id

Collections   GET/POST /api/collections
              PUT /api/collections/reorder
              GET/PUT/DELETE /api/collections/:id
              POST /api/collections/:id/duplicate

Requests      GET/POST /api/requests
              PUT /api/requests/reorder
              GET/PUT/DELETE /api/requests/:id
              POST /api/requests/:id/execute
              POST /api/requests/:id/duplicate
              POST /api/execute (ad-hoc)

Environments  GET/POST /api/environments
              GET/PUT/DELETE /api/environments/:id
              POST /api/environments/:id/activate

Proxies       GET/POST /api/proxies
              GET/PUT/DELETE /api/proxies/:id
              POST /api/proxies/:id/activate
              POST /api/proxies/:id/test
              POST /api/proxies/deactivate

Flows         GET/POST /api/flows
              PUT /api/flows/reorder
              GET/PUT/DELETE /api/flows/:id
              POST /api/flows/:id/run
              POST /api/flows/:id/duplicate
              GET/POST /api/flows/:id/steps
              PUT/DELETE /api/flows/:id/steps/:stepId

Files         POST /api/files/upload
              POST /api/files/cleanup
              GET/DELETE /api/files/:id

WebSocket     GET /api/ws/relay (WS 업그레이드)

History       GET /api/history
              GET/DELETE /api/history/:id
```

## 배포

### 단일 바이너리

```bash
make build
# relay 바이너리 하나로 배포 완료 (13MB)
# 프론트엔드가 바이너리에 embed 되어 있음
```

### Docker Compose

```yaml
services:
  relay:
    image: relay
    ports:
      - "8080:8080"
    volumes:
      - relay-data:/data
    environment:
      - DB_PATH=/data/relay.db
      - UPLOAD_DIR=/data/uploads

volumes:
  relay-data:
```

### 폐쇄망 배포

`Dockerfile.airgap`을 사용하여 Nexus 프록시 경유 빌드:

```bash
docker build -f Dockerfile.airgap \
  --build-arg REGISTRY=nexus.internal.com:8082 \
  -t relay .
```
