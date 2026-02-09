package service

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PaesslerAG/jsonpath"
	"github.com/google/uuid"
)

// FlowAction represents the action to take after script execution
type FlowAction string

const (
	FlowActionNext   FlowAction = "next"
	FlowActionGoto   FlowAction = "goto"
	FlowActionStop   FlowAction = "stop"
	FlowActionRepeat FlowAction = "repeat"
)

// ScriptResult holds the result of script execution
type ScriptResult struct {
	Success          bool              `json:"success"`
	Errors           []string          `json:"errors,omitempty"`
	AssertionsPassed int               `json:"assertionsPassed"`
	AssertionsFailed int               `json:"assertionsFailed"`
	UpdatedVars      map[string]string `json:"updatedVars,omitempty"`
	FlowAction       FlowAction        `json:"flowAction"`
	GotoStepName     string            `json:"gotoStepName,omitempty"`
	GotoStepOrder    int               `json:"gotoStepOrder,omitempty"`
}

// ScriptContext provides context for script execution
type ScriptContext struct {
	RuntimeVars  map[string]string
	StatusCode   int
	ResponseBody string
	Headers      map[string]string
	DurationMs   int64
	StepName     string
	StepOrder    int
	FlowName     string
	Iteration    int64
	LoopCount    int64
}

// Script represents the DSL script structure
type Script struct {
	Assertions   []Assertion         `json:"assertions,omitempty"`
	SetVariables []VariableOperation `json:"setVariables,omitempty"`
	Flow         *FlowControl        `json:"flow,omitempty"`
}

// Assertion represents a single assertion
type Assertion struct {
	Type     string      `json:"type"`               // status, jsonpath, header, responseTime, bodyContains
	Path     string      `json:"path,omitempty"`     // for jsonpath
	Name     string      `json:"name,omitempty"`     // for header
	Operator string      `json:"operator,omitempty"` // eq, ne, gt, gte, lt, lte, contains, in, exists, regex
	Value    interface{} `json:"value,omitempty"`
}

// VariableOperation represents a variable manipulation
type VariableOperation struct {
	Name       string      `json:"name"`
	Value      interface{} `json:"value,omitempty"`      // for set (literal)
	From       string      `json:"from,omitempty"`       // JSONPath to extract from response
	Operation  string      `json:"operation,omitempty"`  // set, increment, decrement, math, concat, conditional
	By         float64     `json:"by,omitempty"`         // for increment/decrement
	Expression string      `json:"expression,omitempty"` // for math
	Values     []string    `json:"values,omitempty"`     // for concat
	Condition  string      `json:"condition,omitempty"`  // for conditional
	IfTrue     interface{} `json:"ifTrue,omitempty"`
	IfFalse    interface{} `json:"ifFalse,omitempty"`
}

// FlowControl represents flow control logic
type FlowControl struct {
	Type      string          `json:"type,omitempty"` // always, conditional, switch
	Action    FlowAction      `json:"action,omitempty"`
	Step      string          `json:"step,omitempty"`
	StepOrder int             `json:"stepOrder,omitempty"`
	Condition string          `json:"condition,omitempty"`
	OnTrue    *FlowControlAct `json:"onTrue,omitempty"`
	OnFalse   *FlowControlAct `json:"onFalse,omitempty"`
	Cases     []SwitchCase    `json:"cases,omitempty"`
	Default   *FlowControlAct `json:"default,omitempty"`
}

// FlowControlAct represents an action in flow control
type FlowControlAct struct {
	Action    FlowAction `json:"action"`
	Step      string     `json:"step,omitempty"`
	StepOrder int        `json:"stepOrder,omitempty"`
}

// SwitchCase represents a case in switch flow control
type SwitchCase struct {
	Condition string     `json:"condition"`
	Action    FlowAction `json:"action"`
	Step      string     `json:"step,omitempty"`
	StepOrder int        `json:"stepOrder,omitempty"`
}

// ExecutionLimits defines limits for script execution
type ExecutionLimits struct {
	MaxIterations    int
	MaxGotoJumps     int
	MaxAssertions    int
	MaxVariableOps   int
}

// DefaultLimits provides default execution limits
var DefaultLimits = ExecutionLimits{
	MaxIterations:  1000,
	MaxGotoJumps:   100,
	MaxAssertions:  50,
	MaxVariableOps: 100,
}

// ScriptExecutor executes DSL scripts
type ScriptExecutor struct {
	variableResolver *VariableResolver
	limits           ExecutionLimits
}

// NewScriptExecutor creates a new ScriptExecutor
func NewScriptExecutor(vr *VariableResolver) *ScriptExecutor {
	return &ScriptExecutor{
		variableResolver: vr,
		limits:           DefaultLimits,
	}
}

// Execute runs a script and returns the result
func (se *ScriptExecutor) Execute(scriptJSON string, ctx *ScriptContext) *ScriptResult {
	result := &ScriptResult{
		Success:     true,
		UpdatedVars: make(map[string]string),
		FlowAction:  FlowActionNext,
	}

	if scriptJSON == "" {
		return result
	}

	var script Script
	if err := json.Unmarshal([]byte(scriptJSON), &script); err != nil {
		result.Success = false
		result.Errors = append(result.Errors, fmt.Sprintf("Invalid script JSON: %v", err))
		return result
	}

	// Execute assertions
	if len(script.Assertions) > 0 {
		se.executeAssertions(&script, ctx, result)
	}

	// Execute variable operations
	if len(script.SetVariables) > 0 {
		se.executeVariableOps(&script, ctx, result)
	}

	// Execute flow control
	if script.Flow != nil {
		se.executeFlowControl(&script, ctx, result)
	}

	return result
}

func (se *ScriptExecutor) executeAssertions(script *Script, ctx *ScriptContext, result *ScriptResult) {
	for _, assertion := range script.Assertions {
		passed, err := se.evaluateAssertion(assertion, ctx)
		if err != nil {
			result.Errors = append(result.Errors, err.Error())
			result.AssertionsFailed++
			result.Success = false
		} else if passed {
			result.AssertionsPassed++
		} else {
			result.AssertionsFailed++
			result.Success = false
			result.Errors = append(result.Errors, fmt.Sprintf("Assertion failed: %s %s %v", assertion.Type, assertion.Operator, assertion.Value))
		}
	}
}

func (se *ScriptExecutor) evaluateAssertion(assertion Assertion, ctx *ScriptContext) (bool, error) {
	switch assertion.Type {
	case "status":
		return se.compareValues(float64(ctx.StatusCode), assertion.Operator, assertion.Value)

	case "jsonpath":
		if ctx.ResponseBody == "" {
			return false, fmt.Errorf("empty response body for jsonpath assertion")
		}
		var data interface{}
		if err := json.Unmarshal([]byte(ctx.ResponseBody), &data); err != nil {
			return false, fmt.Errorf("failed to parse response JSON: %v", err)
		}
		value, err := jsonpath.Get(assertion.Path, data)
		if err != nil {
			if assertion.Operator == "exists" {
				return false, nil
			}
			return false, fmt.Errorf("JSONPath error: %v", err)
		}
		if assertion.Operator == "exists" {
			return value != nil, nil
		}
		return se.compareValues(value, assertion.Operator, assertion.Value)

	case "header":
		headerValue, exists := ctx.Headers[assertion.Name]
		if !exists {
			// Try case-insensitive
			for k, v := range ctx.Headers {
				if strings.EqualFold(k, assertion.Name) {
					headerValue = v
					exists = true
					break
				}
			}
		}
		if assertion.Operator == "exists" {
			return exists, nil
		}
		if !exists {
			return false, nil
		}
		return se.compareValues(headerValue, assertion.Operator, assertion.Value)

	case "responseTime":
		return se.compareValues(float64(ctx.DurationMs), assertion.Operator, assertion.Value)

	case "bodyContains":
		valueStr, ok := assertion.Value.(string)
		if !ok {
			return false, fmt.Errorf("bodyContains value must be a string")
		}
		return strings.Contains(ctx.ResponseBody, valueStr), nil

	default:
		return false, fmt.Errorf("unknown assertion type: %s", assertion.Type)
	}
}

func (se *ScriptExecutor) compareValues(actual interface{}, operator string, expected interface{}) (bool, error) {
	switch operator {
	case "eq", "":
		return se.equals(actual, expected), nil
	case "ne":
		return !se.equals(actual, expected), nil
	case "gt":
		return se.compare(actual, expected) > 0, nil
	case "gte":
		return se.compare(actual, expected) >= 0, nil
	case "lt":
		return se.compare(actual, expected) < 0, nil
	case "lte":
		return se.compare(actual, expected) <= 0, nil
	case "contains":
		actualStr := fmt.Sprintf("%v", actual)
		expectedStr := fmt.Sprintf("%v", expected)
		return strings.Contains(actualStr, expectedStr), nil
	case "in":
		expectedList, ok := expected.([]interface{})
		if !ok {
			return false, fmt.Errorf("'in' operator requires array value")
		}
		for _, v := range expectedList {
			if se.equals(actual, v) {
				return true, nil
			}
		}
		return false, nil
	case "regex":
		actualStr := fmt.Sprintf("%v", actual)
		expectedStr := fmt.Sprintf("%v", expected)
		re, err := regexp.Compile(expectedStr)
		if err != nil {
			return false, fmt.Errorf("invalid regex: %v", err)
		}
		return re.MatchString(actualStr), nil
	default:
		return false, fmt.Errorf("unknown operator: %s", operator)
	}
}

func (se *ScriptExecutor) equals(a, b interface{}) bool {
	// Handle nil
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}

	// Convert to comparable types
	aStr := fmt.Sprintf("%v", a)
	bStr := fmt.Sprintf("%v", b)
	return aStr == bStr
}

func (se *ScriptExecutor) compare(a, b interface{}) int {
	aFloat := se.toFloat64(a)
	bFloat := se.toFloat64(b)
	if aFloat < bFloat {
		return -1
	}
	if aFloat > bFloat {
		return 1
	}
	return 0
}

func (se *ScriptExecutor) toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case int32:
		return float64(val)
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	default:
		return 0
	}
}

func (se *ScriptExecutor) executeVariableOps(script *Script, ctx *ScriptContext, result *ScriptResult) {
	for _, op := range script.SetVariables {
		value, err := se.executeVariableOp(op, ctx)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("Variable operation error (%s): %v", op.Name, err))
			continue
		}
		result.UpdatedVars[op.Name] = value
		ctx.RuntimeVars[op.Name] = value
	}
}

func (se *ScriptExecutor) executeVariableOp(op VariableOperation, ctx *ScriptContext) (string, error) {
	switch op.Operation {
	case "", "set":
		if op.From != "" {
			// Extract from JSONPath
			if ctx.ResponseBody == "" {
				return "", fmt.Errorf("empty response body for JSONPath extraction")
			}
			var data interface{}
			if err := json.Unmarshal([]byte(ctx.ResponseBody), &data); err != nil {
				return "", fmt.Errorf("failed to parse response JSON: %v", err)
			}
			value, err := jsonpath.Get(op.From, data)
			if err != nil {
				return "", fmt.Errorf("JSONPath error: %v", err)
			}
			return fmt.Sprintf("%v", value), nil
		}
		// Literal value or variable reference
		valueStr := fmt.Sprintf("%v", op.Value)
		return se.resolveVariables(valueStr, ctx), nil

	case "increment":
		current := se.toFloat64(ctx.RuntimeVars[op.Name])
		by := op.By
		if by == 0 {
			by = 1
		}
		return fmt.Sprintf("%.0f", current+by), nil

	case "decrement":
		current := se.toFloat64(ctx.RuntimeVars[op.Name])
		by := op.By
		if by == 0 {
			by = 1
		}
		return fmt.Sprintf("%.0f", current-by), nil

	case "math":
		expr := se.resolveVariables(op.Expression, ctx)
		result, err := se.evaluateMathExpression(expr)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%v", result), nil

	case "concat":
		var parts []string
		for _, v := range op.Values {
			parts = append(parts, se.resolveVariables(v, ctx))
		}
		return strings.Join(parts, ""), nil

	case "conditional":
		condition := se.resolveVariables(op.Condition, ctx)
		if se.evaluateConditionExpr(condition, ctx) {
			return fmt.Sprintf("%v", op.IfTrue), nil
		}
		return fmt.Sprintf("%v", op.IfFalse), nil

	default:
		return "", fmt.Errorf("unknown operation: %s", op.Operation)
	}
}

func (se *ScriptExecutor) resolveVariables(s string, ctx *ScriptContext) string {
	// Replace {{var}} with values from RuntimeVars
	re := regexp.MustCompile(`\{\{([^}]+)\}\}`)
	return re.ReplaceAllStringFunc(s, func(match string) string {
		varName := strings.TrimPrefix(strings.TrimSuffix(match, "}}"), "{{")
		varName = strings.TrimSpace(varName)

		// Check built-in variables first
		switch varName {
		case "__statusCode__":
			return fmt.Sprintf("%d", ctx.StatusCode)
		case "__responseTime__":
			return fmt.Sprintf("%d", ctx.DurationMs)
		case "__responseBody__":
			return ctx.ResponseBody
		case "__iteration__":
			return fmt.Sprintf("%d", ctx.Iteration)
		case "__loopCount__":
			return fmt.Sprintf("%d", ctx.LoopCount)
		case "__stepName__":
			return ctx.StepName
		case "__stepOrder__":
			return fmt.Sprintf("%d", ctx.StepOrder)
		case "__flowName__":
			return ctx.FlowName
		case "__timestamp__":
			return strconv.FormatInt(time.Now().UnixMilli(), 10)
		case "__uuid__":
			return uuid.New().String()
		}

		if val, ok := ctx.RuntimeVars[varName]; ok {
			return val
		}
		return match
	})
}

func (se *ScriptExecutor) evaluateMathExpression(expr string) (float64, error) {
	// Simple math expression evaluator supporting +, -, *, /, (), numbers
	// This is a basic implementation - can be enhanced with a proper expression parser
	expr = strings.ReplaceAll(expr, " ", "")

	// For now, handle simple binary operations
	// Pattern: number op number
	re := regexp.MustCompile(`^(-?\d+\.?\d*)([\+\-\*/])(-?\d+\.?\d*)$`)
	matches := re.FindStringSubmatch(expr)
	if matches == nil {
		// Try parsing as a single number
		return strconv.ParseFloat(expr, 64)
	}

	left, _ := strconv.ParseFloat(matches[1], 64)
	op := matches[2]
	right, _ := strconv.ParseFloat(matches[3], 64)

	switch op {
	case "+":
		return left + right, nil
	case "-":
		return left - right, nil
	case "*":
		return left * right, nil
	case "/":
		if right == 0 {
			return 0, fmt.Errorf("division by zero")
		}
		return left / right, nil
	default:
		return 0, fmt.Errorf("unsupported operator: %s", op)
	}
}

func (se *ScriptExecutor) executeFlowControl(script *Script, ctx *ScriptContext, result *ScriptResult) {
	flow := script.Flow

	switch flow.Type {
	case "", "always":
		// Simple action
		result.FlowAction = flow.Action
		result.GotoStepName = flow.Step
		result.GotoStepOrder = flow.StepOrder

	case "conditional":
		condition := se.resolveVariables(flow.Condition, ctx)
		if se.evaluateConditionExpr(condition, ctx) {
			if flow.OnTrue != nil {
				result.FlowAction = flow.OnTrue.Action
				result.GotoStepName = flow.OnTrue.Step
				result.GotoStepOrder = flow.OnTrue.StepOrder
			}
		} else {
			if flow.OnFalse != nil {
				result.FlowAction = flow.OnFalse.Action
				result.GotoStepName = flow.OnFalse.Step
				result.GotoStepOrder = flow.OnFalse.StepOrder
			}
		}

	case "switch":
		matched := false
		for _, c := range flow.Cases {
			condition := se.resolveVariables(c.Condition, ctx)
			if se.evaluateConditionExpr(condition, ctx) {
				result.FlowAction = c.Action
				result.GotoStepName = c.Step
				result.GotoStepOrder = c.StepOrder
				matched = true
				break
			}
		}
		if !matched && flow.Default != nil {
			result.FlowAction = flow.Default.Action
			result.GotoStepName = flow.Default.Step
			result.GotoStepOrder = flow.Default.StepOrder
		}
	}
}

// evaluateConditionExpr evaluates a condition expression
// Supports: ==, !=, >, >=, <, <=, &&, ||, !, contains
func (se *ScriptExecutor) evaluateConditionExpr(expr string, ctx *ScriptContext) bool {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return true
	}

	// Handle logical OR (lowest precedence)
	if strings.Contains(expr, "||") {
		parts := strings.SplitN(expr, "||", 2)
		return se.evaluateConditionExpr(parts[0], ctx) || se.evaluateConditionExpr(parts[1], ctx)
	}

	// Handle logical AND
	if strings.Contains(expr, "&&") {
		parts := strings.SplitN(expr, "&&", 2)
		return se.evaluateConditionExpr(parts[0], ctx) && se.evaluateConditionExpr(parts[1], ctx)
	}

	// Handle NOT
	if strings.HasPrefix(expr, "!") {
		return !se.evaluateConditionExpr(strings.TrimPrefix(expr, "!"), ctx)
	}

	// Handle comparisons
	operators := []string{"==", "!=", ">=", "<=", ">", "<", " contains "}
	for _, op := range operators {
		if strings.Contains(expr, op) {
			parts := strings.SplitN(expr, op, 2)
			left := strings.TrimSpace(parts[0])
			right := strings.TrimSpace(parts[1])

			// Remove quotes from string literals
			left = strings.Trim(left, "\"'")
			right = strings.Trim(right, "\"'")

			switch op {
			case "==":
				return left == right
			case "!=":
				return left != right
			case ">":
				lf, _ := strconv.ParseFloat(left, 64)
				rf, _ := strconv.ParseFloat(right, 64)
				return lf > rf
			case ">=":
				lf, _ := strconv.ParseFloat(left, 64)
				rf, _ := strconv.ParseFloat(right, 64)
				return lf >= rf
			case "<":
				lf, _ := strconv.ParseFloat(left, 64)
				rf, _ := strconv.ParseFloat(right, 64)
				return lf < rf
			case "<=":
				lf, _ := strconv.ParseFloat(left, 64)
				rf, _ := strconv.ParseFloat(right, 64)
				return lf <= rf
			case " contains ":
				return strings.Contains(left, right)
			}
		}
	}

	// Truthy check - non-empty and not "0" or "false"
	expr = strings.TrimSpace(expr)
	return expr != "" && expr != "0" && expr != "false" && expr != "null"
}
