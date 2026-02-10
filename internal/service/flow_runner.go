package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"relay/internal/middleware"
	"relay/internal/repository"

	"github.com/PaesslerAG/jsonpath"
)

type FlowRunner struct {
	queries            *repository.Queries
	requestExecutor    *RequestExecutor
	variableResolver   *VariableResolver
	scriptExecutor     *ScriptExecutor
	jsScriptExecutor   *JSScriptExecutor
}

func NewFlowRunner(queries *repository.Queries, re *RequestExecutor, vr *VariableResolver) *FlowRunner {
	return &FlowRunner{
		queries:            queries,
		requestExecutor:    re,
		variableResolver:   vr,
		scriptExecutor:     NewScriptExecutor(vr),
		jsScriptExecutor:   NewJSScriptExecutor(vr),
	}
}

type StepResult struct {
	StepID           int64             `json:"stepId"`
	RequestID        *int64            `json:"requestId"`
	RequestName      string            `json:"requestName"`
	ExecuteResult    *ExecuteResult    `json:"executeResult"`
	ExtractedVars    map[string]string `json:"extractedVars"`
	Skipped          bool              `json:"skipped"`
	SkipReason       string            `json:"skipReason,omitempty"`
	Iteration        int64             `json:"iteration,omitempty"`
	LoopCount        int64             `json:"loopCount,omitempty"`
	PreScriptResult  *ScriptResult     `json:"preScriptResult,omitempty"`
	PostScriptResult *ScriptResult     `json:"postScriptResult,omitempty"`
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

	// Build step name -> index map for goto resolution
	stepNameToIndex := make(map[string]int)
	stepOrderToIndex := make(map[int]int)
	for i, step := range steps {
		if step.Name != "" {
			stepNameToIndex[step.Name] = i
		}
		stepOrderToIndex[int(step.StepOrder)] = i
	}

	// Runtime variables accumulated during flow execution
	runtimeVars := make(map[string]string)
	startTime := time.Now()

	// Track execution limits
	gotoJumps := 0
	totalIterations := 0
	maxGotoJumps := 100
	maxIterations := 1000

	// Use index-based iteration for goto support
	stepIndex := 0
	for stepIndex < len(steps) {
		step := steps[stepIndex]

		// Skip step if not in selected list (when selection is provided)
		if len(selectedStepIDs) > 0 && !selectedSet[step.ID] {
			stepIndex++
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
		iteration := int64(1)
		for iteration <= loopCount {
			totalIterations++
			if totalIterations > maxIterations {
				result.Success = false
				result.Error = "Maximum iteration limit reached"
				result.TotalTimeMs = time.Since(startTime).Milliseconds()
				return result, nil
			}

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

			// Build script context
			scriptCtx := &ScriptContext{
				RuntimeVars: runtimeVars,
				StepName:    step.Name,
				StepOrder:   int(step.StepOrder),
				FlowName:    flow.Name,
				Iteration:   iteration,
				LoopCount:   loopCount,
			}

			// Execute pre-script
			if step.PreScript.Valid && step.PreScript.String != "" {
				preResult := fr.executeScript(ctx, step.PreScript.String, scriptCtx, runtimeVars)
				stepResult.PreScriptResult = preResult

				// Apply updated variables
				for k, v := range preResult.UpdatedVars {
					runtimeVars[k] = v
				}

				// Handle pre-script flow control
				if preResult.FlowAction == FlowActionStop {
					result.Steps = append(result.Steps, stepResult)
					result.TotalTimeMs = time.Since(startTime).Milliseconds()
					return result, nil
				}
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
					iteration++
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
				if !step.ContinueOnError.Valid || step.ContinueOnError.Int64 == 0 {
					result.Success = false
					result.Error = err.Error()
					result.TotalTimeMs = time.Since(startTime).Milliseconds()
					return result, nil
				}
				iteration++
				continue
			}
			stepResult.ExecuteResult = execResult

			// Update script context with response
			scriptCtx.StatusCode = execResult.StatusCode
			scriptCtx.ResponseBody = execResult.Body
			scriptCtx.Headers = execResult.Headers
			scriptCtx.DurationMs = execResult.DurationMs

			// Extract variables from response (legacy extractVars)
			if step.ExtractVars.Valid && step.ExtractVars.String != "" && step.ExtractVars.String != "{}" {
				extracted, err := fr.extractVariables(execResult.Body, step.ExtractVars.String)
				if err == nil {
					stepResult.ExtractedVars = extracted
					for k, v := range extracted {
						runtimeVars[k] = v
					}
				}
			}

			// Execute post-script
			flowAction := FlowActionNext
			gotoStepName := ""
			gotoStepOrder := 0

			if step.PostScript.Valid && step.PostScript.String != "" {
				postResult := fr.executeScript(ctx, step.PostScript.String, scriptCtx, runtimeVars)
				stepResult.PostScriptResult = postResult

				// Apply updated variables
				for k, v := range postResult.UpdatedVars {
					runtimeVars[k] = v
					scriptCtx.RuntimeVars[k] = v
				}

				// Merge script extracted vars into result
				for k, v := range postResult.UpdatedVars {
					stepResult.ExtractedVars[k] = v
				}

				flowAction = postResult.FlowAction
				gotoStepName = postResult.GotoStepName
				gotoStepOrder = postResult.GotoStepOrder

				// Check assertions
				if !postResult.Success && (!step.ContinueOnError.Valid || step.ContinueOnError.Int64 == 0) {
					result.Steps = append(result.Steps, stepResult)
					result.Success = false
					if len(postResult.Errors) > 0 {
						result.Error = postResult.Errors[0]
					}
					result.TotalTimeMs = time.Since(startTime).Milliseconds()
					return result, nil
				}
			}

			result.Steps = append(result.Steps, stepResult)

			// Check if request failed
			if execResult.Error != "" && (!step.ContinueOnError.Valid || step.ContinueOnError.Int64 == 0) {
				result.Success = false
				result.Error = execResult.Error
				result.TotalTimeMs = time.Since(startTime).Milliseconds()
				return result, nil
			}

			// Handle flow control from post-script
			switch flowAction {
			case FlowActionStop:
				result.TotalTimeMs = time.Since(startTime).Milliseconds()
				return result, nil

			case FlowActionRepeat:
				// Don't increment iteration, repeat current step
				continue

			case FlowActionGoto:
				gotoJumps++
				if gotoJumps > maxGotoJumps {
					result.Success = false
					result.Error = "Maximum goto jump limit reached"
					result.TotalTimeMs = time.Since(startTime).Milliseconds()
					return result, nil
				}

				// Find target step
				targetIndex := -1
				if gotoStepName != "" {
					if idx, ok := stepNameToIndex[gotoStepName]; ok {
						targetIndex = idx
					}
				} else if gotoStepOrder > 0 {
					if idx, ok := stepOrderToIndex[gotoStepOrder]; ok {
						targetIndex = idx
					}
				}

				if targetIndex >= 0 {
					stepIndex = targetIndex
					iteration = 1 // Reset iteration for the new step
					continue
				}
				// If target not found, fall through to next step
			}

			iteration++
		}

		stepIndex++
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

// isJavaScript detects if script content is JavaScript (not JSON DSL)
func (fr *FlowRunner) isJavaScript(script string) bool {
	script = strings.TrimSpace(script)
	if script == "" {
		return false
	}
	// JSON DSL starts with {
	return !strings.HasPrefix(script, "{")
}

// executeScript runs either DSL or JavaScript script based on content
func (fr *FlowRunner) executeScript(ctx context.Context, scriptContent string, dslCtx *ScriptContext, runtimeVars map[string]string) *ScriptResult {
	scriptContent = strings.TrimSpace(scriptContent)
	if scriptContent == "" {
		return &ScriptResult{
			Success:     true,
			UpdatedVars: make(map[string]string),
			FlowAction:  FlowActionNext,
		}
	}

	if fr.isJavaScript(scriptContent) {
		// JavaScript mode
		return fr.executeJavaScript(ctx, scriptContent, dslCtx, runtimeVars)
	}

	// JSON DSL mode - use existing executor
	return fr.scriptExecutor.Execute(scriptContent, dslCtx)
}

// executeJavaScript runs JavaScript using goja
func (fr *FlowRunner) executeJavaScript(ctx context.Context, script string, dslCtx *ScriptContext, runtimeVars map[string]string) *ScriptResult {
	wsID := middleware.GetWorkspaceID(ctx)

	// Get environment vars
	envVars := make(map[string]string)
	var activeEnvID int64
	env, err := fr.queries.GetActiveEnvironment(ctx, wsID)
	if err == nil {
		activeEnvID = env.ID
		if env.Variables.Valid {
			json.Unmarshal([]byte(env.Variables.String), &envVars)
		}
	}

	// Build JS context
	jsCtx := &JSScriptContext{
		RuntimeVars:      runtimeVars,
		EnvVars:          envVars,
		StatusCode:       dslCtx.StatusCode,
		ResponseBody:     dslCtx.ResponseBody,
		Headers:          dslCtx.Headers,
		DurationMs:       dslCtx.DurationMs,
		StepName:         dslCtx.StepName,
		StepOrder:        dslCtx.StepOrder,
		FlowName:         dslCtx.FlowName,
		Iteration:        dslCtx.Iteration,
		LoopCount:        dslCtx.LoopCount,
		WorkspaceID:      wsID,
		ActiveEnvID:      activeEnvID,
		PendingEnvWrites: make(map[string]string),
	}

	// Execute JavaScript
	jsResult := fr.jsScriptExecutor.Execute(script, jsCtx)

	// Persist environment variable changes to DB
	if len(jsResult.UpdatedEnvVars) > 0 && activeEnvID > 0 {
		fr.persistEnvironmentVariables(ctx, activeEnvID, envVars, jsResult.UpdatedEnvVars)
	}

	// Convert to ScriptResult for compatibility
	return &ScriptResult{
		Success:          jsResult.Success,
		Errors:           jsResult.Errors,
		AssertionsPassed: jsResult.AssertionsPassed,
		AssertionsFailed: jsResult.AssertionsFailed,
		UpdatedVars:      jsResult.UpdatedVars,
		FlowAction:       jsResult.FlowAction,
		GotoStepName:     jsResult.GotoStepName,
		GotoStepOrder:    jsResult.GotoStepOrder,
	}
}

// persistEnvironmentVariables saves updated variables to the database
func (fr *FlowRunner) persistEnvironmentVariables(ctx context.Context, envID int64, existingVars, newVars map[string]string) error {
	// Merge existing and new vars
	merged := make(map[string]string)
	for k, v := range existingVars {
		merged[k] = v
	}
	for k, v := range newVars {
		merged[k] = v
	}

	// Serialize to JSON
	varsJSON, err := json.Marshal(merged)
	if err != nil {
		return err
	}

	// Update in database
	_, err = fr.queries.UpdateEnvironmentVariables(ctx, repository.UpdateEnvironmentVariablesParams{
		ID:        envID,
		Variables: sql.NullString{String: string(varsJSON), Valid: true},
	})
	return err
}
