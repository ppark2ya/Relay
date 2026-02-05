# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm run build

# Stage 2: Build and run
FROM golang:1.18-alpine
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend-builder /app/web/dist ./cmd/server/dist
RUN CGO_ENABLED=0 go build -o reley ./cmd/server

# Create data directory
RUN mkdir -p /data

ENV DB_PATH=/data/reley.db
ENV PORT=8080

EXPOSE 8080

VOLUME ["/data"]

CMD ["./reley"]
