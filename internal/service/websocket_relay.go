package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"relay/internal/repository"

	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

type WebSocketRelay struct {
	queries          *repository.Queries
	variableResolver *VariableResolver
}

func NewWebSocketRelay(queries *repository.Queries, vr *VariableResolver) *WebSocketRelay {
	return &WebSocketRelay{
		queries:          queries,
		variableResolver: vr,
	}
}

// Envelope types for browser <-> Go communication
type wsEnvelope struct {
	Type           string  `json:"type"`
	URL            string  `json:"url,omitempty"`
	Headers        string  `json:"headers,omitempty"`
	ProxyID        *int64  `json:"proxyId,omitempty"`
	WSConnectionID *int64  `json:"wsConnectionId,omitempty"`
	Payload        string  `json:"payload,omitempty"`
	Format         string  `json:"format,omitempty"`
	Message        string  `json:"message,omitempty"`
	Code           int     `json:"code,omitempty"`
	Reason         string  `json:"reason,omitempty"`
	Timestamp      string  `json:"timestamp,omitempty"`
}

func (wr *WebSocketRelay) HandleRelay(w http.ResponseWriter, r *http.Request) {
	// Accept WebSocket from browser
	browserConn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("WS relay: failed to accept browser connection: %v", err)
		return
	}
	defer browserConn.Close(websocket.StatusNormalClosure, "")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Wait for "connect" message from browser
	var connectMsg wsEnvelope
	if err := wsjson.Read(ctx, browserConn, &connectMsg); err != nil {
		log.Printf("WS relay: failed to read connect message: %v", err)
		return
	}

	if connectMsg.Type != "connect" {
		sendError(ctx, browserConn, "Expected 'connect' message as first message")
		return
	}

	// Resolve variables in URL
	resolvedURL, err := wr.variableResolver.Resolve(ctx, connectMsg.URL, nil)
	if err != nil {
		sendError(ctx, browserConn, "Failed to resolve URL variables: "+err.Error())
		return
	}

	// Resolve headers
	headersJSON := connectMsg.Headers
	if headersJSON == "" {
		headersJSON = "{}"
	}
	resolvedHeaders, err := wr.variableResolver.ResolveHeaders(ctx, headersJSON, nil)
	if err != nil {
		sendError(ctx, browserConn, "Failed to resolve header variables: "+err.Error())
		return
	}

	// Build HTTP headers for target connection
	httpHeaders := http.Header{}
	for k, v := range resolvedHeaders {
		httpHeaders.Set(k, v)
	}

	// Configure dial options with proxy
	var proxyID sql.NullInt64
	if connectMsg.ProxyID != nil {
		v := *connectMsg.ProxyID
		if v == -1 {
			proxyID = sql.NullInt64{}
		} else {
			proxyID = sql.NullInt64{Int64: v, Valid: true}
		}
	}

	httpClient, err := CreateHTTPClient(ctx, wr.queries, proxyID)
	if err != nil {
		sendError(ctx, browserConn, "Failed to create HTTP client: "+err.Error())
		return
	}

	dialOpts := &websocket.DialOptions{
		HTTPHeader: httpHeaders,
		HTTPClient: httpClient,
	}

	// Connect to target WebSocket server
	targetConn, _, err := websocket.Dial(ctx, resolvedURL, dialOpts)
	if err != nil {
		sendError(ctx, browserConn, "Failed to connect to target: "+err.Error())
		return
	}
	defer targetConn.Close(websocket.StatusNormalClosure, "")

	// Send "connected" to browser
	wsjson.Write(ctx, browserConn, wsEnvelope{
		Type:      "connected",
		URL:       resolvedURL,
		Timestamp: time.Now().Format(time.RFC3339Nano),
	})

	startTime := time.Now()
	var messageLog []wsEnvelope

	// Goroutine: target -> browser
	go func() {
		defer cancel()
		for {
			msgType, data, err := targetConn.Read(ctx)
			if err != nil {
				// Connection closed or error
				code := websocket.CloseStatus(err)
				closedMsg := wsEnvelope{
					Type:      "closed",
					Code:      int(code),
					Reason:    err.Error(),
					Timestamp: time.Now().Format(time.RFC3339Nano),
				}
				wsjson.Write(ctx, browserConn, closedMsg)
				return
			}

			format := "text"
			if msgType == websocket.MessageBinary {
				format = "binary"
			}

			msg := wsEnvelope{
				Type:      "received",
				Payload:   string(data),
				Format:    format,
				Timestamp: time.Now().Format(time.RFC3339Nano),
			}
			messageLog = append(messageLog, msg)
			wsjson.Write(ctx, browserConn, msg)
		}
	}()

	// Main loop: browser -> target
	for {
		var msg wsEnvelope
		if err := wsjson.Read(ctx, browserConn, &msg); err != nil {
			break
		}

		switch msg.Type {
		case "send":
			msgType := websocket.MessageText
			if msg.Format == "binary" {
				msgType = websocket.MessageBinary
			}
			if err := targetConn.Write(ctx, msgType, []byte(msg.Payload)); err != nil {
				sendError(ctx, browserConn, "Failed to send to target: "+err.Error())
			} else {
				messageLog = append(messageLog, wsEnvelope{
					Type:      "sent",
					Payload:   msg.Payload,
					Format:    msg.Format,
					Timestamp: time.Now().Format(time.RFC3339Nano),
				})
			}
		case "close":
			targetConn.Close(websocket.StatusNormalClosure, "client requested close")
			wsjson.Write(ctx, browserConn, wsEnvelope{
				Type:      "closed",
				Code:      1000,
				Reason:    "client requested close",
				Timestamp: time.Now().Format(time.RFC3339Nano),
			})
			cancel()
		}
	}

	// Save history
	duration := time.Since(startTime).Milliseconds()
	wr.saveWSHistory(context.Background(), connectMsg, resolvedURL, resolvedHeaders, messageLog, duration)
}

func sendError(ctx context.Context, conn *websocket.Conn, message string) {
	wsjson.Write(ctx, conn, wsEnvelope{
		Type:      "error",
		Message:   message,
		Timestamp: time.Now().Format(time.RFC3339Nano),
	})
}

func (wr *WebSocketRelay) saveWSHistory(ctx context.Context, connectMsg wsEnvelope, resolvedURL string, resolvedHeaders map[string]string, messages []wsEnvelope, durationMs int64) {
	reqHeaders, _ := json.Marshal(resolvedHeaders)
	respBody, _ := json.Marshal(messages)

	var wsConnID sql.NullInt64
	if connectMsg.WSConnectionID != nil {
		wsConnID = sql.NullInt64{Int64: *connectMsg.WSConnectionID, Valid: true}
	}

	wr.queries.CreateHistory(ctx, repository.CreateHistoryParams{
		RequestID:       wsConnID,
		Method:          "WS",
		Url:             resolvedURL,
		RequestHeaders:  sql.NullString{String: string(reqHeaders), Valid: true},
		RequestBody:     sql.NullString{},
		StatusCode:      sql.NullInt64{},
		ResponseHeaders: sql.NullString{},
		ResponseBody:    sql.NullString{String: string(respBody), Valid: true},
		DurationMs:      sql.NullInt64{Int64: durationMs, Valid: true},
		Error:           sql.NullString{},
	})
}
