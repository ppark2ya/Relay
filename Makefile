.PHONY: build dev clean test frontend backend all

# Variables
BINARY=reley
FRONTEND_DIR=web
BACKEND_DIR=cmd/server

all: build

# Build frontend and backend
build: frontend backend

# Build frontend only
frontend:
	cd $(FRONTEND_DIR) && npm install && npm run build
	rm -rf $(BACKEND_DIR)/dist
	cp -r $(FRONTEND_DIR)/dist $(BACKEND_DIR)/

# Build backend only
backend:
	CGO_ENABLED=0 go build -o $(BINARY) ./$(BACKEND_DIR)

# Development mode - run frontend and backend separately
dev-frontend:
	cd $(FRONTEND_DIR) && npm run dev

dev-backend:
	go run ./$(BACKEND_DIR)

# Run tests
test: test-backend test-frontend

test-backend:
	go test ./...

test-frontend:
	cd $(FRONTEND_DIR) && npm run lint

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
	docker build -t api-tester .

# Docker compose up
compose-up:
	docker-compose up -d

# Docker compose down
compose-down:
	docker-compose down
