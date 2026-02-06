package handler

import (
	"database/sql"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFormatTime_Valid(t *testing.T) {
	ts := time.Date(2024, 6, 15, 10, 30, 0, 0, time.UTC)
	nt := sql.NullTime{Time: ts, Valid: true}

	got := formatTime(nt)
	want := "2024-06-15T10:30:00Z"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestFormatTime_Invalid(t *testing.T) {
	nt := sql.NullTime{Valid: false}
	got := formatTime(nt)
	if got != "" {
		t.Errorf("got %q, want empty string", got)
	}
}

func TestNullString_Empty(t *testing.T) {
	ns := nullString("")
	if ns.Valid {
		t.Error("expected Valid=false for empty string")
	}
}

func TestNullString_WithValue(t *testing.T) {
	ns := nullString("hello")
	if !ns.Valid {
		t.Error("expected Valid=true for non-empty string")
	}
	if ns.String != "hello" {
		t.Errorf("got %q, want %q", ns.String, "hello")
	}
}

func TestRespondJSON(t *testing.T) {
	w := httptest.NewRecorder()
	data := map[string]string{"key": "value"}

	respondJSON(w, 200, data)

	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type: got %q, want application/json", ct)
	}
	if w.Code != 200 {
		t.Errorf("status code: got %d, want 200", w.Code)
	}

	var got map[string]string
	if err := json.NewDecoder(w.Body).Decode(&got); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if got["key"] != "value" {
		t.Errorf("body key: got %q, want %q", got["key"], "value")
	}
}
