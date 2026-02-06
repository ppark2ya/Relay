# Relay

사내 업무망용 Postman-like API 테스트 도구. Go 단일 바이너리 배포.

## 기술 스택

- **Backend**: Go 1.18+, Chi router, SQLite (modernc.org/sqlite)
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS v4, TanStack Query, pnpm
- **Build**: 단일 바이너리 (Go embed로 프론트엔드 포함)

## 프로젝트 구조

```
relay/
├── cmd/server/main.go           # 진입점, embed 설정
├── internal/
│   ├── handler/                 # HTTP 핸들러
│   ├── service/                 # 비즈니스 로직
│   │   ├── request_executor.go  # HTTP 요청 실행
│   │   ├── variable_resolver.go # {{변수}} 치환
│   │   └── flow_runner.go       # Flow 순차 실행
│   ├── repository/              # SQLC 생성 코드
│   └── middleware/cors.go
├── db/
│   ├── migrations/              # SQL 마이그레이션
│   ├── queries/                 # SQLC 쿼리
│   └── sqlc.yaml
├── web/                         # React 프론트엔드
│   └── src/
│       ├── components/          # UI 컴포넌트
│       ├── hooks/               # React Query 훅, 커스텀 훅
│       ├── types/               # TypeScript 타입 정의
│       └── api/client.ts        # API 클라이언트
├── .claude/skills/              # Claude 개발 가이드
│   └── react-best-practices/    # React 성능 최적화 규칙
├── Dockerfile                   # 개발용 (golang 베이스)
├── Dockerfile_alpine            # 프로덕션용 (alpine 베이스)
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
Collections: GET/POST /api/collections, GET/PUT/DELETE /api/collections/:id
Requests:    CRUD + POST /api/requests/:id/execute
Environments: CRUD + POST /api/environments/:id/activate
Proxies:     CRUD + POST /api/proxies/:id/activate, POST /api/proxies/:id/test
Flows:       CRUD + POST /api/flows/:id/run
             GET/POST /api/flows/:id/steps, PUT/DELETE /api/flows/:id/steps/:stepId
History:     GET /api/history, GET/DELETE /api/history/:id
```

## 주요 기능

- **Collections**: 폴더 구조로 요청 관리 (중첩 지원)
- **Requests**: HTTP 요청 정의 및 실행
- **Environments**: 변수 집합 관리, `{{변수}}` 치환
- **Proxies**: 프록시 설정
- **Flows**: 요청 체이닝 (순차 실행, JSONPath 변수 추출)
- **History**: 실행 기록

## 환경 변수

- `DB_PATH`: SQLite DB 경로 (기본값: `./relay.db`)
- `PORT`: 서버 포트 (기본값: `8080`)

## Frontend 개발 가이드

### 컴포넌트 구조

- `components/`: UI 컴포넌트 (Header, Sidebar, RequestEditor, FlowEditor 등)
- `hooks/useApi.ts`: TanStack Query 기반 API 훅 (useCollections, useRequests, useFlows 등)
- `hooks/useClickOutside.ts`: 드롭다운 외부 클릭 감지 훅
- `types/index.ts`: 공유 TypeScript 타입 정의

### 주요 패턴

- **상태 관리**: TanStack Query로 서버 상태 관리, React useState로 UI 상태 관리
- **API 호출**: `api/client.ts`의 함수들을 `hooks/useApi.ts`에서 래핑하여 사용
- **드롭다운**: `useClickOutside` 훅으로 외부 클릭 시 닫기 처리
- **스타일링**: TailwindCSS 유틸리티 클래스 사용

### React Best Practices

Frontend 개발 시 `.claude/skills/react-best-practices/` 문서 참고:

- **성능 최적화**: `rerender-*` 규칙 (memo, derived state, functional setState)
- **비동기 처리**: `async-*` 규칙 (Promise.all, Suspense boundaries)
- **번들 최적화**: `bundle-*` 규칙 (dynamic imports, barrel imports 주의)

자세한 규칙은 `.claude/skills/react-best-practices/SKILL.md` 참조
