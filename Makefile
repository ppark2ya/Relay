.PHONY: build dev clean test frontend backend all test-e2e

# Variables
BINARY=relay
FRONTEND_DIR=web
BACKEND_DIR=cmd/server
LDFLAGS=-s -w

all: build

# Build frontend and backend
build: frontend backend

# Build frontend only
frontend:
	cd $(FRONTEND_DIR) && bun install && bun run build
	rm -rf $(BACKEND_DIR)/dist
	cp -r $(FRONTEND_DIR)/dist $(BACKEND_DIR)/

# Build backend only
backend:
	CGO_ENABLED=0 go build -ldflags="$(LDFLAGS)" -o $(BINARY) ./$(BACKEND_DIR)

# Development mode - run frontend and backend separately
dev-frontend:
	cd $(FRONTEND_DIR) && bun run dev

dev-backend:
	air

dev-backend-simple:
	go run ./$(BACKEND_DIR)

# Run tests
test: test-backend test-frontend

test-backend:
ifeq ($(shell uname -s),Darwin)
	go test -ldflags="-linkmode=external" ./...
else
	go test ./...
endif

test-frontend:
	cd $(FRONTEND_DIR) && bun run lint

# E2E tests
test-e2e:
	-lsof -ti:8080 | xargs kill -9 2>/dev/null; lsof -ti:5173 | xargs kill -9 2>/dev/null; sleep 1
	CGO_ENABLED=0 go build -o relay-e2e ./cmd/server
	cd e2e && bun install && bunx playwright install chromium && bunx playwright test

# Clean build artifacts
clean:
	rm -f $(BINARY)
	rm -rf $(BACKEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(FRONTEND_DIR)/node_modules

# Generate SQLC code
sqlc:
	cd db && sqlc generate

# Run the application
run: build
	./$(BINARY)

# Docker build
docker:
	docker build -t relay .

# Docker compose up
compose-up:
	docker-compose up -d

# Docker compose down
compose-down:
	docker-compose down
