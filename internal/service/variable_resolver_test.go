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
