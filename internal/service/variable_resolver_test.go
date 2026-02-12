package service

import (
	"context"
	"database/sql"
	"testing"

	"relay/internal/repository"
	"relay/internal/testutil"
)

func TestResolveWithVars_Basic(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)

	got := vr.ResolveWithVars("http://{{host}}/api", map[string]string{"host": "localhost"})
	want := "http://localhost/api"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestResolveWithVars_MultipleVars(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)

	got := vr.ResolveWithVars("{{a}}/{{b}}", map[string]string{"a": "x", "b": "y"})
	want := "x/y"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestResolveWithVars_UndefinedVarKept(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)

	got := vr.ResolveWithVars("{{unknown}}", map[string]string{})
	want := "{{unknown}}"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestResolveWithVars_TrimSpaces(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)

	got := vr.ResolveWithVars("{{ host }}", map[string]string{"host": "localhost"})
	want := "localhost"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestResolveWithVars_EmptyInput(t *testing.T) {
	q := testutil.SetupTestDB(t)
	vr := NewVariableResolver(q)

	got := vr.ResolveWithVars("", map[string]string{"host": "localhost"})
	if got != "" {
		t.Errorf("got %q, want empty string", got)
	}
}

func TestResolve_RuntimeVarsPriority(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Create and activate an environment with host=env-host
	env, err := q.CreateEnvironment(ctx, repository.CreateEnvironmentParams{
		Name:        "test",
		Variables:   sql.NullString{String: `{"host":"env-host"}`, Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create env: %v", err)
	}
	if err := q.DeactivateAllEnvironments(ctx, int64(1)); err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	if _, err := q.ActivateEnvironment(ctx, env.ID); err != nil {
		t.Fatalf("activate: %v", err)
	}

	vr := NewVariableResolver(q)
	got, err := vr.Resolve(ctx, "{{host}}", map[string]string{"host": "runtime-host"})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	want := "runtime-host"
	if got != want {
		t.Errorf("got %q, want %q (runtime should override env)", got, want)
	}
}

func TestResolve_NoActiveEnvironment(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()
	vr := NewVariableResolver(q)

	got, err := vr.Resolve(ctx, "{{host}}", nil)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	want := "{{host}}"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestResolveHeaders_NewFormat(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()
	vr := NewVariableResolver(q)

	headersJSON := `{"Content-Type":{"value":"application/json","enabled":true},"X-Debug":{"value":"1","enabled":false}}`
	got, err := vr.ResolveHeaders(ctx, headersJSON, nil)
	if err != nil {
		t.Fatalf("resolve headers: %v", err)
	}
	if got["Content-Type"] != "application/json" {
		t.Errorf("Content-Type: got %q, want %q", got["Content-Type"], "application/json")
	}
	if _, ok := got["X-Debug"]; ok {
		t.Errorf("X-Debug should be excluded (enabled=false)")
	}
}

func TestResolveHeaders_LegacyFormat(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()
	vr := NewVariableResolver(q)

	headersJSON := `{"Content-Type":"application/json"}`
	got, err := vr.ResolveHeaders(ctx, headersJSON, nil)
	if err != nil {
		t.Fatalf("resolve headers: %v", err)
	}
	if got["Content-Type"] != "application/json" {
		t.Errorf("Content-Type: got %q, want %q", got["Content-Type"], "application/json")
	}
}

func TestResolve_WithCollectionVars(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Create a collection and set variables on it
	col, err := q.CreateCollection(ctx, repository.CreateCollectionParams{
		Name:        "test-col",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create collection: %v", err)
	}
	if _, err := q.UpdateCollectionVariables(ctx, repository.UpdateCollectionVariablesParams{
		Variables: sql.NullString{String: `{"baseUrl":"http://col-host"}`, Valid: true},
		ID:        col.ID,
	}); err != nil {
		t.Fatalf("update collection vars: %v", err)
	}

	vr := NewVariableResolver(q)
	got, err := vr.Resolve(ctx, "{{baseUrl}}/api", nil, col.ID)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	want := "http://col-host/api"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestResolve_WithWorkspaceVars(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Set variables on the default workspace (id=1)
	if _, err := q.UpdateWorkspaceVariables(ctx, repository.UpdateWorkspaceVariablesParams{
		Variables: sql.NullString{String: `{"apiKey":"ws-key-123"}`, Valid: true},
		ID:        1,
	}); err != nil {
		t.Fatalf("update workspace vars: %v", err)
	}

	vr := NewVariableResolver(q)
	got, err := vr.Resolve(ctx, "key={{apiKey}}", nil)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	want := "key=ws-key-123"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestResolve_VariablePriority(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Set workspace variable (lowest priority)
	if _, err := q.UpdateWorkspaceVariables(ctx, repository.UpdateWorkspaceVariablesParams{
		Variables: sql.NullString{String: `{"host":"ws-host","token":"ws-token","extra":"ws-extra","wsOnly":"ws-only"}`, Valid: true},
		ID:        1,
	}); err != nil {
		t.Fatalf("update workspace vars: %v", err)
	}

	// Create collection and set variables
	col, err := q.CreateCollection(ctx, repository.CreateCollectionParams{
		Name:        "priority-col",
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create collection: %v", err)
	}
	if _, err := q.UpdateCollectionVariables(ctx, repository.UpdateCollectionVariablesParams{
		Variables: sql.NullString{String: `{"host":"col-host","token":"col-token","extra":"col-extra"}`, Valid: true},
		ID:        col.ID,
	}); err != nil {
		t.Fatalf("update collection vars: %v", err)
	}

	// Create and activate environment
	env, err := q.CreateEnvironment(ctx, repository.CreateEnvironmentParams{
		Name:        "priority-env",
		Variables:   sql.NullString{String: `{"host":"env-host","token":"env-token"}`, Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create env: %v", err)
	}
	if err := q.DeactivateAllEnvironments(ctx, int64(1)); err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	if _, err := q.ActivateEnvironment(ctx, env.ID); err != nil {
		t.Fatalf("activate: %v", err)
	}

	vr := NewVariableResolver(q)
	runtimeVars := map[string]string{"host": "runtime-host"}

	// runtime overrides all
	got, err := vr.Resolve(ctx, "{{host}}", runtimeVars, col.ID)
	if err != nil {
		t.Fatalf("resolve host: %v", err)
	}
	if got != "runtime-host" {
		t.Errorf("host: got %q, want %q (runtime should win)", got, "runtime-host")
	}

	// env overrides collection and workspace
	got, err = vr.Resolve(ctx, "{{token}}", runtimeVars, col.ID)
	if err != nil {
		t.Fatalf("resolve token: %v", err)
	}
	if got != "env-token" {
		t.Errorf("token: got %q, want %q (env should win over collection)", got, "env-token")
	}

	// collection overrides workspace
	got, err = vr.Resolve(ctx, "{{extra}}", runtimeVars, col.ID)
	if err != nil {
		t.Fatalf("resolve extra: %v", err)
	}
	if got != "col-extra" {
		t.Errorf("extra: got %q, want %q (collection should win over workspace)", got, "col-extra")
	}

	// workspace-only variable still resolves
	got, err = vr.Resolve(ctx, "{{wsOnly}}", runtimeVars, col.ID)
	if err != nil {
		t.Fatalf("resolve wsOnly: %v", err)
	}
	if got != "ws-only" {
		t.Errorf("wsOnly: got %q, want %q (workspace var should resolve)", got, "ws-only")
	}
}

func TestResolve_BackwardCompatibility(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Create and activate an environment
	env, err := q.CreateEnvironment(ctx, repository.CreateEnvironmentParams{
		Name:        "compat-env",
		Variables:   sql.NullString{String: `{"host":"env-host"}`, Valid: true},
		WorkspaceID: 1,
	})
	if err != nil {
		t.Fatalf("create env: %v", err)
	}
	if err := q.DeactivateAllEnvironments(ctx, int64(1)); err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	if _, err := q.ActivateEnvironment(ctx, env.ID); err != nil {
		t.Fatalf("activate: %v", err)
	}

	vr := NewVariableResolver(q)

	// Call without collectionID (old signature)
	got, err := vr.Resolve(ctx, "{{host}}", nil)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != "env-host" {
		t.Errorf("got %q, want %q (env var should still work without collectionID)", got, "env-host")
	}

	// Call with runtime vars, no collectionID
	got, err = vr.Resolve(ctx, "{{host}}", map[string]string{"host": "runtime"})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != "runtime" {
		t.Errorf("got %q, want %q (runtime should override env without collectionID)", got, "runtime")
	}

	// ResolveHeaders without collectionID
	headersJSON := `{"Authorization":{"value":"Bearer {{host}}","enabled":true}}`
	headers, err := vr.ResolveHeaders(ctx, headersJSON, nil)
	if err != nil {
		t.Fatalf("resolve headers: %v", err)
	}
	if headers["Authorization"] != "Bearer env-host" {
		t.Errorf("Authorization: got %q, want %q", headers["Authorization"], "Bearer env-host")
	}
}

func TestResolveHeaders_VarSubstitution(t *testing.T) {
	q := testutil.SetupTestDB(t)
	ctx := context.Background()
	vr := NewVariableResolver(q)

	headersJSON := `{"Authorization":{"value":"Bearer {{token}}","enabled":true}}`
	got, err := vr.ResolveHeaders(ctx, headersJSON, map[string]string{"token": "abc123"})
	if err != nil {
		t.Fatalf("resolve headers: %v", err)
	}
	want := "Bearer abc123"
	if got["Authorization"] != want {
		t.Errorf("Authorization: got %q, want %q", got["Authorization"], want)
	}
}
