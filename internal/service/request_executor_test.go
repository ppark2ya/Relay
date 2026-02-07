package service

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"relay/internal/repository"
	"relay/internal/testutil"
)

func TestExecuteRequest_GET(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Custom", "test-value")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-get",
		Method:      "GET",
		Url:         ts.URL,
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if result.Body != `{"ok":true}` {
		t.Errorf("body: got %q", result.Body)
	}
	if result.Headers["X-Custom"] != "test-value" {
		t.Errorf("header X-Custom: got %q", result.Headers["X-Custom"])
	}
}

func TestExecuteRequest_POSTWithBody(t *testing.T) {
	var receivedBody string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		receivedBody = string(b)
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte("created"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-post",
		Method:      "POST",
		Url:         ts.URL,
		Body:        sql.NullString{String: `{"name":"relay"}`, Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 201 {
		t.Errorf("status: got %d, want 201", result.StatusCode)
	}
	if receivedBody != `{"name":"relay"}` {
		t.Errorf("server received body: %q", receivedBody)
	}
}

func TestExecuteAdhoc(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("adhoc-ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)

	result, err := re.ExecuteAdhoc(context.Background(), "GET", ts.URL, "", "", nil, nil)
	if err != nil {
		t.Fatalf("execute adhoc: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if result.Body != "adhoc-ok" {
		t.Errorf("body: got %q", result.Body)
	}
}

func TestExecute_WithOverrides(t *testing.T) {
	var receivedMethod string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-override",
		Method:      "GET",
		Url:         ts.URL,
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, &RequestOverrides{Method: "PUT"})
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	if receivedMethod != "PUT" {
		t.Errorf("method override: got %q, want PUT", receivedMethod)
	}
}

func TestExecuteRequest_VarSubstitution(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-var",
		Method:      "GET",
		Url:         "{{base_url}}/api",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, map[string]string{"base_url": ts.URL}, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}
	if result.StatusCode != 200 {
		t.Errorf("status: got %d, want 200", result.StatusCode)
	}
	want := ts.URL + "/api"
	if result.ResolvedURL != want {
		t.Errorf("resolved URL: got %q, want %q", result.ResolvedURL, want)
	}
}

func TestExecuteRequest_InvalidURL(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-bad-url",
		Method:      "GET",
		Url:         "://invalid",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	result, err := re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute should not return error, got: %v", err)
	}
	if result.Error == "" {
		t.Error("expected error message for invalid URL")
	}
}

func TestExecuteRequest_HistorySaved(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("history-test"))
	}))
	defer ts.Close()

	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)
	re := NewRequestExecutor(q, vr)

	ctx := context.Background()
	req, err := q.CreateRequest(ctx, repository.CreateRequestParams{
		Name:        "test-history",
		Method:      "GET",
		Url:         ts.URL,
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	_, err = re.Execute(ctx, req.ID, nil, nil)
	if err != nil {
		t.Fatalf("execute: %v", err)
	}

	histories, err := q.ListHistory(ctx, repository.ListHistoryParams{WorkspaceID: 1, Limit: 10})
	if err != nil {
		t.Fatalf("list history: %v", err)
	}
	if len(histories) != 1 {
		t.Fatalf("history count: got %d, want 1", len(histories))
	}
	if histories[0].Method != "GET" {
		t.Errorf("history method: got %q, want GET", histories[0].Method)
	}
	if histories[0].Url != ts.URL {
		t.Errorf("history url: got %q, want %q", histories[0].Url, ts.URL)
	}
}
