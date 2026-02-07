# Stage 1: Build frontend
FROM oven/bun:1-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

# Stage 2: Build and run
FROM golang:1.23-alpine
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /app/web/dist ./cmd/server/dist
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o relay ./cmd/server

# Create data directory
RUN mkdir -p /data

ENV DB_PATH=/data/relay.db
ENV PORT=8080

EXPOSE 8080

VOLUME ["/data"]

CMD ["./relay"]
