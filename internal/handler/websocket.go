package handler

import (
	"net/http"

	"relay/internal/service"
)

type WebSocketHandler struct {
	relay *service.WebSocketRelay
}

func NewWebSocketHandler(relay *service.WebSocketRelay) *WebSocketHandler {
	return &WebSocketHandler{relay: relay}
}

func (h *WebSocketHandler) Relay(w http.ResponseWriter, r *http.Request) {
	h.relay.HandleRelay(w, r)
}
