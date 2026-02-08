package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"relay/internal/middleware"
	"relay/internal/repository"
	"relay/internal/testutil"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/go-chi/chi/v5"
)

// startTargetWS creates a WebSocket echo server that accepts connections
// with the given subprotocols and echoes back any received messages.
func startTargetWS(t *testing.T, subprotocols ...string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		opts := &websocket.AcceptOptions{Subprotocols: subprotocols}
		conn, err := websocket.Accept(w, r, opts)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		for {
			msgType, data, err := conn.Read(r.Context())
			if err != nil {
				return
			}
			if err := conn.Write(r.Context(), msgType, data); err != nil {
				return
			}
		}
	}))
}

// startRelayServer creates the relay HTTP server backed by an in-memory DB.
func startRelayServer(t *testing.T) *httptest.Server {
	t.Helper()
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	wr := NewWebSocketRelay(q, vr)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)
	r.Get("/ws/relay", wr.HandleRelay)

	ts := httptest.NewServer(r)
	t.Cleanup(ts.Close)
	return ts
}

// relayURL converts an httptest server URL to ws:// relay endpoint.
func relayURL(ts *httptest.Server) string {
	return "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/relay"
}

// targetWSURL converts an httptest server URL to ws://.
func targetWSURL(ts *httptest.Server) string {
	return "ws" + strings.TrimPrefix(ts.URL, "http")
}

// readEnvelope reads a single JSON envelope from the WebSocket connection with a timeout.
func readEnvelope(t *testing.T, ctx context.Context, conn *websocket.Conn) wsEnvelope {
	t.Helper()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var env wsEnvelope
	if err := wsjson.Read(ctx, conn, &env); err != nil {
		t.Fatalf("read envelope: %v", err)
	}
	return env
}

func TestWSRelay_ConnectAndEcho(t *testing.T) {
	target := startTargetWS(t)
	defer target.Close()
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	// Send connect
	wsjson.Write(ctx, conn, wsEnvelope{
		Type: "connect",
		URL:  targetWSURL(target),
	})

	// Expect connected
	env := readEnvelope(t, ctx, conn)
	if env.Type != "connected" {
		t.Fatalf("expected 'connected', got %q", env.Type)
	}
	if env.URL != targetWSURL(target) {
		t.Errorf("connected URL: got %q, want %q", env.URL, targetWSURL(target))
	}

	// Send a message through relay
	wsjson.Write(ctx, conn, wsEnvelope{
		Type:    "send",
		Payload: "hello",
	})

	// Expect echo back
	env = readEnvelope(t, ctx, conn)
	if env.Type != "received" {
		t.Fatalf("expected 'received', got %q", env.Type)
	}
	if env.Payload != "hello" {
		t.Errorf("payload: got %q, want %q", env.Payload, "hello")
	}
	if env.Format != "text" {
		t.Errorf("format: got %q, want %q", env.Format, "text")
	}

	// Close
	wsjson.Write(ctx, conn, wsEnvelope{Type: "close"})

	env = readEnvelope(t, ctx, conn)
	if env.Type != "closed" {
		t.Fatalf("expected 'closed', got %q", env.Type)
	}
	if env.Code != 1000 {
		t.Errorf("close code: got %d, want 1000", env.Code)
	}
}

func TestWSRelay_Headers(t *testing.T) {
	var receivedHeaders http.Header
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeaders = r.Header.Clone()
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		conn.Close(websocket.StatusNormalClosure, "done")
	}))
	defer target.Close()
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	wsjson.Write(ctx, conn, wsEnvelope{
		Type:    "connect",
		URL:     targetWSURL(target),
		Headers: `{"X-Custom":"test-value","Authorization":"Bearer tok123"}`,
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "connected" {
		t.Fatalf("expected 'connected', got %q", env.Type)
	}

	if receivedHeaders.Get("X-Custom") != "test-value" {
		t.Errorf("X-Custom: got %q, want %q", receivedHeaders.Get("X-Custom"), "test-value")
	}
	if receivedHeaders.Get("Authorization") != "Bearer tok123" {
		t.Errorf("Authorization: got %q, want %q", receivedHeaders.Get("Authorization"), "Bearer tok123")
	}
}

func TestWSRelay_Subprotocol(t *testing.T) {
	// Target server accepts graphql-ws subprotocol
	target := startTargetWS(t, "graphql-ws")
	defer target.Close()
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	wsjson.Write(ctx, conn, wsEnvelope{
		Type:         "connect",
		URL:          targetWSURL(target),
		Subprotocols: []string{"graphql-ws"},
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "connected" {
		t.Fatalf("expected 'connected', got %q", env.Type)
	}
	if env.Subprotocol != "graphql-ws" {
		t.Errorf("subprotocol: got %q, want %q", env.Subprotocol, "graphql-ws")
	}
}

func TestWSRelay_SubprotocolNegotiation(t *testing.T) {
	// Target server supports only graphql-transport-ws
	target := startTargetWS(t, "graphql-transport-ws")
	defer target.Close()
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	// Client requests multiple, server picks the one it supports
	wsjson.Write(ctx, conn, wsEnvelope{
		Type:         "connect",
		URL:          targetWSURL(target),
		Subprotocols: []string{"graphql-ws", "graphql-transport-ws"},
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "connected" {
		t.Fatalf("expected 'connected', got %q", env.Type)
	}
	if env.Subprotocol != "graphql-transport-ws" {
		t.Errorf("subprotocol: got %q, want %q", env.Subprotocol, "graphql-transport-ws")
	}
}

func TestWSRelay_NoSubprotocol(t *testing.T) {
	// Target server with no subprotocol requirement
	target := startTargetWS(t)
	defer target.Close()
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	wsjson.Write(ctx, conn, wsEnvelope{
		Type: "connect",
		URL:  targetWSURL(target),
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "connected" {
		t.Fatalf("expected 'connected', got %q", env.Type)
	}
	if env.Subprotocol != "" {
		t.Errorf("subprotocol: got %q, want empty", env.Subprotocol)
	}
}

func TestWSRelay_InvalidFirstMessage(t *testing.T) {
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	// Send non-connect message
	wsjson.Write(ctx, conn, wsEnvelope{
		Type:    "send",
		Payload: "bad",
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "error" {
		t.Fatalf("expected 'error', got %q", env.Type)
	}
	if !strings.Contains(env.Message, "connect") {
		t.Errorf("error message should mention 'connect': got %q", env.Message)
	}
}

func TestWSRelay_InvalidTargetURL(t *testing.T) {
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	wsjson.Write(ctx, conn, wsEnvelope{
		Type: "connect",
		URL:  "ws://127.0.0.1:1", // unreachable port
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "error" {
		t.Fatalf("expected 'error', got %q", env.Type)
	}
	if !strings.Contains(env.Message, "Failed to connect") {
		t.Errorf("error message: got %q", env.Message)
	}
}

func TestWSRelay_HistorySaved(t *testing.T) {
	target := startTargetWS(t)
	defer target.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	wr := NewWebSocketRelay(q, vr)

	r := chi.NewRouter()
	r.Use(middleware.WorkspaceID)
	r.Get("/ws/relay", wr.HandleRelay)
	relay := httptest.NewServer(r)
	defer relay.Close()

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	wsjson.Write(ctx, conn, wsEnvelope{
		Type: "connect",
		URL:  targetWSURL(target),
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "connected" {
		t.Fatalf("expected 'connected', got %q", env.Type)
	}

	// Send and receive one message
	wsjson.Write(ctx, conn, wsEnvelope{Type: "send", Payload: "ping"})
	readEnvelope(t, ctx, conn) // received echo

	// Close to trigger history save
	wsjson.Write(ctx, conn, wsEnvelope{Type: "close"})
	readEnvelope(t, ctx, conn) // closed

	// Close browser connection to let HandleRelay finish
	conn.Close(websocket.StatusNormalClosure, "")

	// Wait briefly for async history save
	time.Sleep(100 * time.Millisecond)

	histories, err := q.ListHistory(ctx, repository.ListHistoryParams{
		WorkspaceID: 1,
		Limit:       10,
	})
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(histories) != 1 {
		t.Fatalf("history count: got %d, want 1", len(histories))
	}
	if histories[0].Method != "WS" {
		t.Errorf("history method: got %q, want WS", histories[0].Method)
	}
	if histories[0].Url != targetWSURL(target) {
		t.Errorf("history url: got %q, want %q", histories[0].Url, targetWSURL(target))
	}

	// Check that message log was saved in response_body
	var msgLog []wsEnvelope
	if err := json.Unmarshal([]byte(histories[0].ResponseBody.String), &msgLog); err != nil {
		t.Fatalf("unmarshal message log: %v", err)
	}
	// Should have sent + received
	if len(msgLog) < 2 {
		t.Errorf("message log count: got %d, want >= 2", len(msgLog))
	}
}

func TestWSRelay_MultipleMessages(t *testing.T) {
	target := startTargetWS(t)
	defer target.Close()
	relay := startRelayServer(t)

	ctx := context.Background()
	conn, _, err := websocket.Dial(ctx, relayURL(relay), nil)
	if err != nil {
		t.Fatalf("dial relay: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "")

	wsjson.Write(ctx, conn, wsEnvelope{
		Type: "connect",
		URL:  targetWSURL(target),
	})

	env := readEnvelope(t, ctx, conn)
	if env.Type != "connected" {
		t.Fatalf("expected 'connected', got %q", env.Type)
	}

	// Send multiple messages and verify echo
	messages := []string{"first", "second", "third"}
	for _, msg := range messages {
		wsjson.Write(ctx, conn, wsEnvelope{Type: "send", Payload: msg})
		env = readEnvelope(t, ctx, conn)
		if env.Type != "received" {
			t.Fatalf("expected 'received', got %q", env.Type)
		}
		if env.Payload != msg {
			t.Errorf("payload: got %q, want %q", env.Payload, msg)
		}
	}
}
