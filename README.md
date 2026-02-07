# Relay

사내 업무망(폐쇄망 포함)을 위한 경량 API 테스트 도구. Go 단일 바이너리로 배포하며, 별도 설치 없이 실행 즉시 사용 가능.

## 주요 기능

| 기능 | 설명 |
|------|------|
| **HTTP 요청** | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS 지원. JSON/Form/Raw/GraphQL 본문 |
| **WebSocket** | Method 드롭다운에서 WS 선택 후 ws:// wss:// 서버에 연결, 메시지 송수신 |
| **Collections** | 폴더 구조로 요청 관리 (중첩 지원, 복제) |
| **Environments** | 변수 집합 관리, URL/헤더/본문에 `{{변수}}` 치환 |
| **Proxies** | 글로벌 프록시, 요청별/Flow 단계별 프록시 오버라이드 |
| **Flows** | 요청 체이닝 — 순차 실행, JSONPath 변수 추출, 조건부 실행 |
| **History** | 모든 실행 기록 자동 저장, 히스토리에서 바로 재실행 |
| **Dark Mode** | 시스템 설정 연동 다크 모드 |

## 기술 스택

- **Backend**: Go 1.23 + Chi router + SQLite ([modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite))
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4 + TanStack Query + ky
- **WebSocket**: [nhooyr.io/websocket](https://pkg.go.dev/nhooyr.io/websocket) (pure Go, CGO 불필요)
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
# 사전 요구: Go 1.23+, Node.js 22+, Bun
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

## 사용법

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
4. **Run Flow** 클릭 → 순차 실행 결과 확인

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
│   ├── service/                # 비즈니스 로직 (요청 실행, WS 릴레이, Flow 실행)
│   ├── repository/             # SQLC 자동 생성 코드
│   └── middleware/             # CORS 미들웨어
├── db/
│   ├── migrations/             # SQL 스키마
│   └── queries/                # SQLC 쿼리 정의
├── web/src/                    # React 프론트엔드
│   ├── components/             # UI 컴포넌트
│   ├── api/                    # 도메인별 API 모듈 (ky + TanStack Query)
│   ├── hooks/                  # WebSocket, 클릭 외부 감지 등 커스텀 훅
│   └── types/                  # TypeScript 타입 (barrel re-export)
├── Dockerfile                  # 개발용
├── Dockerfile_alpine           # 프로덕션용
├── Dockerfile.airgap           # 폐쇄망용 (Nexus 프록시)
└── Makefile
```

## API

```
Collections   GET/POST /api/collections
              GET/PUT/DELETE /api/collections/:id
              POST /api/collections/:id/duplicate

Requests      GET/POST /api/requests
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
              GET/PUT/DELETE /api/flows/:id
              POST /api/flows/:id/run
              POST /api/flows/:id/duplicate
              GET/POST /api/flows/:id/steps
              PUT/DELETE /api/flows/:id/steps/:stepId

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
