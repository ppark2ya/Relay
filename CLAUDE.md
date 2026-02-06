# Relay

사내 업무망용 Postman-like API 테스트 도구. Go 단일 바이너리 배포.

## 기술 스택

- **Backend**: Go 1.18, Chi router, SQLite (modernc.org/sqlite)
- **Frontend**: React, TypeScript, Vite, TailwindCSS, TanStack Query, pnpm
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
│       ├── hooks/               # TanStack Query 훅
│       └── api/client.ts        # API 클라이언트
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
