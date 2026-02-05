package service

import (
	"context"
	"encoding/json"
	"time"

	"reley/internal/repository"

	"github.com/PaesslerAG/jsonpath"
)

type FlowRunner struct {
	queries          *repository.Queries
	requestExecutor  *RequestExecutor
	variableResolver *VariableResolver
}

func NewFlowRunner(queries *repository.Queries, re *RequestExecutor, vr *VariableResolver) *FlowRunner {
	return &FlowRunner{
		queries:          queries,
		requestExecutor:  re,
		variableResolver: vr,
	}
}

type StepResult struct {
	StepID        int64             `json:"stepId"`
	RequestID     int64             `json:"requestId"`
	RequestName   string            `json:"requestName"`
	ExecuteResult *ExecuteResult    `json:"executeResult"`
	ExtractedVars map[string]string `json:"extractedVars"`
	Skipped       bool              `json:"skipped"`
	SkipReason    string            `json:"skipReason,omitempty"`
}

type FlowResult struct {
	FlowID      int64        `json:"flowId"`
	FlowName    string       `json:"flowName"`
	Steps       []StepResult `json:"steps"`
	TotalTimeMs int64        `json:"totalTimeMs"`
	Success     bool         `json:"success"`
	Error       string       `json:"error,omitempty"`
}

func (fr *FlowRunner) Run(ctx context.Context, flowID int64) (*FlowResult, error) {
	flow, err := fr.queries.GetFlow(ctx, flowID)
	if err != nil {
		return nil, err
	}

	steps, err := fr.queries.ListFlowSteps(ctx, flowID)
	if err != nil {
		return nil, err
	}

	result := &FlowResult{
		FlowID:   flowID,
		FlowName: flow.Name,
		Steps:    make([]StepResult, 0, len(steps)),
		Success:  true,
	}

	// Runtime variables accumulated during flow execution
	runtimeVars := make(map[string]string)
	startTime := time.Now()

	for _, step := range steps {
		stepResult := StepResult{
			StepID:        step.ID,
			RequestID:     step.RequestID,
			ExtractedVars: make(map[string]string),
		}

		// Get request info
		req, err := fr.queries.GetRequest(ctx, step.RequestID)
		if err != nil {
			stepResult.ExecuteResult = &ExecuteResult{Error: err.Error()}
			result.Steps = append(result.Steps, stepResult)
			result.Success = false
			result.Error = err.Error()
			break
		}
		stepResult.RequestName = req.Name

		// Check condition
		if step.Condition.Valid && step.Condition.String != "" {
			conditionMet, err := fr.evaluateCondition(step.Condition.String, runtimeVars)
			if err != nil || !conditionMet {
				stepResult.Skipped = true
				stepResult.SkipReason = "Condition not met"
				result.Steps = append(result.Steps, stepResult)
				continue
			}
		}

		// Apply delay
		if step.DelayMs.Valid && step.DelayMs.Int64 > 0 {
			time.Sleep(time.Duration(step.DelayMs.Int64) * time.Millisecond)
		}

		// Execute request
		execResult, err := fr.requestExecutor.ExecuteRequest(ctx, req, runtimeVars)
		if err != nil {
			stepResult.ExecuteResult = &ExecuteResult{Error: err.Error()}
			result.Steps = append(result.Steps, stepResult)
			result.Success = false
			result.Error = err.Error()
			break
		}
		stepResult.ExecuteResult = execResult

		// Extract variables from response
		if step.ExtractVars.Valid && step.ExtractVars.String != "" {
			extracted, err := fr.extractVariables(execResult.Body, step.ExtractVars.String)
			if err == nil {
				stepResult.ExtractedVars = extracted
				for k, v := range extracted {
					runtimeVars[k] = v
				}
			}
		}

		result.Steps = append(result.Steps, stepResult)

		// Check if request failed
		if execResult.Error != "" {
			result.Success = false
			result.Error = execResult.Error
			break
		}
	}

	result.TotalTimeMs = time.Since(startTime).Milliseconds()
	return result, nil
}

func (fr *FlowRunner) extractVariables(responseBody string, extractVarsJSON string) (map[string]string, error) {
	extracted := make(map[string]string)

	var extractConfig map[string]string
	if err := json.Unmarshal([]byte(extractVarsJSON), &extractConfig); err != nil {
		return extracted, err
	}

	var jsonData interface{}
	if err := json.Unmarshal([]byte(responseBody), &jsonData); err != nil {
		return extracted, nil // Non-JSON response, skip extraction
	}

	for varName, jsonPath := range extractConfig {
		value, err := jsonpath.Get(jsonPath, jsonData)
		if err == nil {
			switch v := value.(type) {
			case string:
				extracted[varName] = v
			default:
				jsonBytes, _ := json.Marshal(v)
				extracted[varName] = string(jsonBytes)
			}
		}
	}

	return extracted, nil
}

func (fr *FlowRunner) evaluateCondition(condition string, vars map[string]string) (bool, error) {
	// Simple condition evaluation: check if variable exists and is not empty
	// Format: "{{varName}}" or "{{varName}} == value"
	resolved := fr.variableResolver.ResolveWithVars(condition, vars)

	// If condition still contains unresolved variables, return false
	if resolved == condition && condition != "" {
		return false, nil
	}

	// If resolved to non-empty string, condition is met
	return resolved != "", nil
}
