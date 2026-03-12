# 폐쇄망 배포용 - 사전 빌드된 바이너리를 이미지로 패키징
# Usage: docker build -t relay:1.0.0 .
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata wget

WORKDIR /app
COPY relay .
RUN chmod +x relay

RUN mkdir -p /data

ENV DB_PATH=/data/relay.db
ENV PORT=8080

EXPOSE 8080

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1

CMD ["./relay"]
