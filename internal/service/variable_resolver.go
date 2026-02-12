package service

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"relay/internal/middleware"
	"relay/internal/repository"
)

type VariableResolver struct {
	queries *repository.Queries
}

func NewVariableResolver(queries *repository.Queries) *VariableResolver {
	return &VariableResolver{queries: queries}
}

var variablePattern = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// Resolve replaces {{variable}} patterns with values from all variable layers.
// Priority (highest first): runtimeVars → environment → collection → workspace
func (vr *VariableResolver) Resolve(ctx context.Context, input string, runtimeVars map[string]string, collectionID ...int64) (string, error) {
	allVars := vr.buildAllVars(ctx, runtimeVars, collectionID...)
	return vr.ResolveWithVars(input, allVars), nil
}

// ResolveWithVars replaces {{variable}} patterns with provided values
func (vr *VariableResolver) ResolveWithVars(input string, vars map[string]string) string {
	return variablePattern.ReplaceAllStringFunc(input, func(match string) string {
		// Extract variable name from {{name}}
		varName := strings.TrimSpace(match[2 : len(match)-2])
		if val, ok := vars[varName]; ok {
			return val
		}
		return match // Keep original if not found
	})
}

// HeaderValue represents a header with enabled flag (new format)
type HeaderValue struct {
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// ResolveHeaders resolves variables in header map
// Supports both legacy format { "key": "value" } and new format { "key": { "value": "...", "enabled": true } }
func (vr *VariableResolver) ResolveHeaders(ctx context.Context, headersJSON string, runtimeVars map[string]string, collectionID ...int64) (map[string]string, error) {
	resolved := make(map[string]string)
	allVars := vr.buildAllVars(ctx, runtimeVars, collectionID...)

	// Try new format first: { "key": { "value": "...", "enabled": true } }
	var headersNew map[string]HeaderValue
	if err := json.Unmarshal([]byte(headersJSON), &headersNew); err == nil {
		for key, hv := range headersNew {
			if hv.Enabled {
				resolved[vr.ResolveWithVars(key, allVars)] = vr.ResolveWithVars(hv.Value, allVars)
			}
		}
		return resolved, nil
	}

	// Fall back to legacy format: { "key": "value" }
	var headersLegacy map[string]string
	if err := json.Unmarshal([]byte(headersJSON), &headersLegacy); err != nil {
		return resolved, nil
	}

	for key, value := range headersLegacy {
		resolved[vr.ResolveWithVars(key, allVars)] = vr.ResolveWithVars(value, allVars)
	}

	return resolved, nil
}

// buildAllVars merges all variable layers with proper priority.
// Priority (highest first): runtimeVars → environment → collection → workspace
func (vr *VariableResolver) buildAllVars(ctx context.Context, runtimeVars map[string]string, collectionID ...int64) map[string]string {
	allVars := make(map[string]string)

	// Lowest priority: workspace (global) variables
	wsVars := vr.getWorkspaceVars(ctx)
	for k, v := range wsVars {
		allVars[k] = v
	}

	// Collection variables
	if len(collectionID) > 0 && collectionID[0] > 0 {
		colVars := vr.getCollectionVars(ctx, collectionID[0])
		for k, v := range colVars {
			allVars[k] = v
		}
	}

	// Environment variables
	envVars, _ := vr.getActiveEnvironmentVars(ctx)
	for k, v := range envVars {
		allVars[k] = v
	}

	// Highest priority: runtime variables
	for k, v := range runtimeVars {
		allVars[k] = v
	}

	return allVars
}

func (vr *VariableResolver) getWorkspaceVars(ctx context.Context) map[string]string {
	vars := make(map[string]string)
	wsID := middleware.GetWorkspaceID(ctx)
	wsVars, err := vr.queries.GetWorkspaceVariables(ctx, wsID)
	if err == nil && wsVars.Valid && wsVars.String != "" {
		json.Unmarshal([]byte(wsVars.String), &vars)
	}
	return vars
}

func (vr *VariableResolver) getCollectionVars(ctx context.Context, collectionID int64) map[string]string {
	vars := make(map[string]string)
	colVars, err := vr.queries.GetCollectionVariables(ctx, collectionID)
	if err == nil && colVars.Valid && colVars.String != "" {
		json.Unmarshal([]byte(colVars.String), &vars)
	}
	return vars
}

func (vr *VariableResolver) getActiveEnvironmentVars(ctx context.Context) (map[string]string, error) {
	vars := make(map[string]string)

	wsID := middleware.GetWorkspaceID(ctx)
	env, err := vr.queries.GetActiveEnvironment(ctx, wsID)
	if err != nil {
		return vars, nil // No active environment is OK
	}

	if env.Variables.Valid {
		if err := json.Unmarshal([]byte(env.Variables.String), &vars); err != nil {
			return vars, nil
		}
	}

	return vars, nil
}
