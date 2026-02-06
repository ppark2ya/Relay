package service

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"

	"relay/internal/repository"
)

type VariableResolver struct {
	queries *repository.Queries
}

func NewVariableResolver(queries *repository.Queries) *VariableResolver {
	return &VariableResolver{queries: queries}
}

var variablePattern = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// Resolve replaces {{variable}} patterns with values from the active environment and runtime vars
func (vr *VariableResolver) Resolve(ctx context.Context, input string, runtimeVars map[string]string) (string, error) {
	envVars, err := vr.getActiveEnvironmentVars(ctx)
	if err != nil {
		return input, err
	}

	// Merge environment vars with runtime vars (runtime takes precedence)
	allVars := make(map[string]string)
	for k, v := range envVars {
		allVars[k] = v
	}
	for k, v := range runtimeVars {
		allVars[k] = v
	}

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
func (vr *VariableResolver) ResolveHeaders(ctx context.Context, headersJSON string, runtimeVars map[string]string) (map[string]string, error) {
	resolved := make(map[string]string)

	envVars, err := vr.getActiveEnvironmentVars(ctx)
	if err != nil {
		return resolved, err
	}

	allVars := make(map[string]string)
	for k, v := range envVars {
		allVars[k] = v
	}
	for k, v := range runtimeVars {
		allVars[k] = v
	}

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

func (vr *VariableResolver) getActiveEnvironmentVars(ctx context.Context) (map[string]string, error) {
	vars := make(map[string]string)

	env, err := vr.queries.GetActiveEnvironment(ctx)
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
