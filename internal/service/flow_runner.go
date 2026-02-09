package service

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"relay/internal/repository"

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
	RequestID     *int64            `json:"requestId"`
	RequestName   string            `json:"requestName"`
	ExecuteResult *ExecuteResult    `json:"executeResult"`
	ExtractedVars map[string]string `json:"extractedVars"`
	Skipped       bool              `json:"skipped"`
	SkipReason    string            `json:"skipReason,omitempty"`
	Iteration     int64             `json:"iteration,omitempty"`
	LoopCount     int64             `json:"loopCount,omitempty"`
}

type FlowResult struct {
	FlowID      int64        `json:"flowId"`
	FlowName    string       `json:"flowName"`
	Steps       []StepResult `json:"steps"`
	TotalTimeMs int64        `json:"totalTimeMs"`
	Success     bool         `json:"success"`
	Error       string       `json:"error,omitempty"`
}

func (fr *FlowRunner) Run(ctx context.Context, flowID int64, selectedStepIDs []int64) (*FlowResult, error) {
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

	// Build set of selected step IDs for quick lookup
	selectedSet := make(map[int64]bool)
	for _, id := range selectedStepIDs {
		selectedSet[id] = true
	}

	// Runtime variables accumulated during flow execution
	runtimeVars := make(map[string]string)
	startTime := time.Now()

	for _, step := range steps {
		// Skip step if not in selected list (when selection is provided)
		if len(selectedStepIDs) > 0 && !selectedSet[step.ID] {
			continue
		}

		var reqID *int64
		if step.RequestID.Valid {
			reqID = &step.RequestID.Int64
		}

		loopCount := step.LoopCount.Int64
		if loopCount < 1 {
			loopCount = 1
		}

		// Loop execution
		for iteration := int64(1); iteration <= loopCount; iteration++ {
			// Add iteration info to runtime vars
			runtimeVars["__iteration__"] = strconv.FormatInt(iteration, 10)
			runtimeVars["__loopCount__"] = strconv.FormatInt(loopCount, 10)

			stepResult := StepResult{
				StepID:        step.ID,
				RequestID:     reqID,
				RequestName:   step.Name,
				ExtractedVars: make(map[string]string),
				Iteration:     iteration,
				LoopCount:     loopCount,
			}

			// Build request from step's inline fields
			req := repository.Request{
				Name:     step.Name,
				Method:   step.Method,
				Url:      step.Url,
				Headers:  step.Headers,
				Body:     step.Body,
				BodyType: step.BodyType,
				Cookies:  step.Cookies,
				ProxyID:  step.ProxyID,
			}

			if step.Url == "" {
				stepResult.ExecuteResult = &ExecuteResult{Error: "step has no URL configured"}
				result.Steps = append(result.Steps, stepResult)
				result.Success = false
				result.Error = "step has no URL configured"
				result.TotalTimeMs = time.Since(startTime).Milliseconds()
				return result, nil
			}

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

			// Execute request using inline fields
			execResult, err := fr.requestExecutor.ExecuteRequest(ctx, req, runtimeVars)
			if err != nil {
				stepResult.ExecuteResult = &ExecuteResult{Error: err.Error()}
				result.Steps = append(result.Steps, stepResult)
				result.Success = false
				result.Error = err.Error()
				result.TotalTimeMs = time.Since(startTime).Milliseconds()
				return result, nil
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
				result.TotalTimeMs = time.Since(startTime).Milliseconds()
				return result, nil
			}
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
