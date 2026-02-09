package service

import (
	"testing"
)

func TestScriptExecutor_Assertions(t *testing.T) {
	se := NewScriptExecutor(nil)

	tests := []struct {
		name       string
		script     string
		ctx        *ScriptContext
		wantPass   int
		wantFail   int
		wantAction FlowAction
	}{
		{
			name: "status code equals 200",
			script: `{
				"assertions": [
					{"type": "status", "operator": "eq", "value": 200}
				]
			}`,
			ctx: &ScriptContext{
				StatusCode:  200,
				RuntimeVars: make(map[string]string),
			},
			wantPass:   1,
			wantFail:   0,
			wantAction: FlowActionNext,
		},
		{
			name: "status code not equals",
			script: `{
				"assertions": [
					{"type": "status", "operator": "eq", "value": 200}
				]
			}`,
			ctx: &ScriptContext{
				StatusCode:  500,
				RuntimeVars: make(map[string]string),
			},
			wantPass:   0,
			wantFail:   1,
			wantAction: FlowActionNext,
		},
		{
			name: "jsonpath extraction",
			script: `{
				"assertions": [
					{"type": "jsonpath", "path": "$.success", "operator": "eq", "value": true}
				]
			}`,
			ctx: &ScriptContext{
				StatusCode:   200,
				ResponseBody: `{"success": true, "data": {"id": 123}}`,
				RuntimeVars:  make(map[string]string),
			},
			wantPass:   1,
			wantFail:   0,
			wantAction: FlowActionNext,
		},
		{
			name: "response time check",
			script: `{
				"assertions": [
					{"type": "responseTime", "operator": "lt", "value": 1000}
				]
			}`,
			ctx: &ScriptContext{
				DurationMs:  500,
				RuntimeVars: make(map[string]string),
			},
			wantPass:   1,
			wantFail:   0,
			wantAction: FlowActionNext,
		},
		{
			name: "body contains",
			script: `{
				"assertions": [
					{"type": "bodyContains", "value": "success"}
				]
			}`,
			ctx: &ScriptContext{
				ResponseBody: `{"status": "success"}`,
				RuntimeVars:  make(map[string]string),
			},
			wantPass:   1,
			wantFail:   0,
			wantAction: FlowActionNext,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := se.Execute(tt.script, tt.ctx)
			if result.AssertionsPassed != tt.wantPass {
				t.Errorf("AssertionsPassed = %d, want %d", result.AssertionsPassed, tt.wantPass)
			}
			if result.AssertionsFailed != tt.wantFail {
				t.Errorf("AssertionsFailed = %d, want %d", result.AssertionsFailed, tt.wantFail)
			}
			if result.FlowAction != tt.wantAction {
				t.Errorf("FlowAction = %s, want %s", result.FlowAction, tt.wantAction)
			}
		})
	}
}

func TestScriptExecutor_Variables(t *testing.T) {
	se := NewScriptExecutor(nil)

	tests := []struct {
		name     string
		script   string
		ctx      *ScriptContext
		wantVars map[string]string
	}{
		{
			name: "set literal value",
			script: `{
				"setVariables": [
					{"name": "status", "value": "completed"}
				]
			}`,
			ctx: &ScriptContext{
				RuntimeVars: make(map[string]string),
			},
			wantVars: map[string]string{"status": "completed"},
		},
		{
			name: "increment counter",
			script: `{
				"setVariables": [
					{"name": "counter", "operation": "increment"}
				]
			}`,
			ctx: &ScriptContext{
				RuntimeVars: map[string]string{"counter": "5"},
			},
			wantVars: map[string]string{"counter": "6"},
		},
		{
			name: "increment by value",
			script: `{
				"setVariables": [
					{"name": "counter", "operation": "increment", "by": 10}
				]
			}`,
			ctx: &ScriptContext{
				RuntimeVars: map[string]string{"counter": "5"},
			},
			wantVars: map[string]string{"counter": "15"},
		},
		{
			name: "decrement counter",
			script: `{
				"setVariables": [
					{"name": "counter", "operation": "decrement"}
				]
			}`,
			ctx: &ScriptContext{
				RuntimeVars: map[string]string{"counter": "10"},
			},
			wantVars: map[string]string{"counter": "9"},
		},
		{
			name: "extract from jsonpath",
			script: `{
				"setVariables": [
					{"name": "token", "from": "$.data.accessToken"}
				]
			}`,
			ctx: &ScriptContext{
				ResponseBody: `{"data": {"accessToken": "abc123"}}`,
				RuntimeVars:  make(map[string]string),
			},
			wantVars: map[string]string{"token": "abc123"},
		},
		{
			name: "concat strings",
			script: `{
				"setVariables": [
					{"name": "greeting", "operation": "concat", "values": ["Hello, ", "{{name}}", "!"]}
				]
			}`,
			ctx: &ScriptContext{
				RuntimeVars: map[string]string{"name": "World"},
			},
			wantVars: map[string]string{"greeting": "Hello, World!"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := se.Execute(tt.script, tt.ctx)
			for k, want := range tt.wantVars {
				if got := result.UpdatedVars[k]; got != want {
					t.Errorf("UpdatedVars[%s] = %s, want %s", k, got, want)
				}
			}
		})
	}
}

func TestScriptExecutor_FlowControl(t *testing.T) {
	se := NewScriptExecutor(nil)

	tests := []struct {
		name           string
		script         string
		ctx            *ScriptContext
		wantAction     FlowAction
		wantGotoName   string
		wantGotoOrder  int
	}{
		{
			name: "simple next action",
			script: `{
				"flow": {"action": "next"}
			}`,
			ctx: &ScriptContext{
				RuntimeVars: make(map[string]string),
			},
			wantAction: FlowActionNext,
		},
		{
			name: "simple stop action",
			script: `{
				"flow": {"action": "stop"}
			}`,
			ctx: &ScriptContext{
				RuntimeVars: make(map[string]string),
			},
			wantAction: FlowActionStop,
		},
		{
			name: "goto by name",
			script: `{
				"flow": {"action": "goto", "step": "Login Step"}
			}`,
			ctx: &ScriptContext{
				RuntimeVars: make(map[string]string),
			},
			wantAction:   FlowActionGoto,
			wantGotoName: "Login Step",
		},
		{
			name: "conditional - true branch",
			script: `{
				"flow": {
					"type": "conditional",
					"condition": "{{counter}} < {{target}}",
					"onTrue": {"action": "repeat"},
					"onFalse": {"action": "next"}
				}
			}`,
			ctx: &ScriptContext{
				RuntimeVars: map[string]string{"counter": "3", "target": "5"},
			},
			wantAction: FlowActionRepeat,
		},
		{
			name: "conditional - false branch",
			script: `{
				"flow": {
					"type": "conditional",
					"condition": "{{counter}} < {{target}}",
					"onTrue": {"action": "repeat"},
					"onFalse": {"action": "goto", "step": "Done"}
				}
			}`,
			ctx: &ScriptContext{
				RuntimeVars: map[string]string{"counter": "5", "target": "5"},
			},
			wantAction:   FlowActionGoto,
			wantGotoName: "Done",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := se.Execute(tt.script, tt.ctx)
			if result.FlowAction != tt.wantAction {
				t.Errorf("FlowAction = %s, want %s", result.FlowAction, tt.wantAction)
			}
			if tt.wantGotoName != "" && result.GotoStepName != tt.wantGotoName {
				t.Errorf("GotoStepName = %s, want %s", result.GotoStepName, tt.wantGotoName)
			}
			if tt.wantGotoOrder != 0 && result.GotoStepOrder != tt.wantGotoOrder {
				t.Errorf("GotoStepOrder = %d, want %d", result.GotoStepOrder, tt.wantGotoOrder)
			}
		})
	}
}

func TestScriptExecutor_ConditionExpressions(t *testing.T) {
	se := NewScriptExecutor(nil)

	tests := []struct {
		name   string
		expr   string
		vars   map[string]string
		want   bool
	}{
		{"equals string", "ok == ok", nil, true},
		{"not equals", "error != ok", nil, true},
		{"greater than", "10 > 5", nil, true},
		{"less than", "3 < 5", nil, true},
		{"greater or equal", "5 >= 5", nil, true},
		{"less or equal", "4 <= 5", nil, true},
		{"truthy non-empty", "hello", nil, true},
		{"truthy empty", "", nil, true}, // empty string is treated as true for empty condition
		{"falsy zero", "0", nil, false},
		{"falsy false", "false", nil, false},
		{"logical and true", "1 > 0 && 2 > 1", nil, true},
		{"logical and false", "1 > 0 && 2 < 1", nil, false},
		{"logical or", "1 < 0 || 2 > 1", nil, true},
		{"contains", "hello world contains world", nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &ScriptContext{RuntimeVars: tt.vars}
			if tt.vars == nil {
				ctx.RuntimeVars = make(map[string]string)
			}
			got := se.evaluateConditionExpr(tt.expr, ctx)
			if got != tt.want {
				t.Errorf("evaluateConditionExpr(%q) = %v, want %v", tt.expr, got, tt.want)
			}
		})
	}
}

func TestScriptExecutor_BuiltinVariables(t *testing.T) {
	se := NewScriptExecutor(nil)

	ctx := &ScriptContext{
		StatusCode:   200,
		DurationMs:   150,
		ResponseBody: `{"data": "test"}`,
		StepName:     "Test Step",
		StepOrder:    3,
		FlowName:     "My Flow",
		Iteration:    2,
		LoopCount:    5,
		RuntimeVars:  make(map[string]string),
	}

	tests := []struct {
		input string
		want  string
	}{
		{"{{__statusCode__}}", "200"},
		{"{{__responseTime__}}", "150"},
		{"{{__iteration__}}", "2"},
		{"{{__loopCount__}}", "5"},
		{"{{__stepName__}}", "Test Step"},
		{"{{__stepOrder__}}", "3"},
		{"{{__flowName__}}", "My Flow"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := se.resolveVariables(tt.input, ctx)
			if got != tt.want {
				t.Errorf("resolveVariables(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
