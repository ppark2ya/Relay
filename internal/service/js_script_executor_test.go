package service

import (
	"testing"
)

func TestJSExecutor_EmptyScript(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars: make(map[string]string),
		EnvVars:     make(map[string]string),
	}

	result := executor.Execute("", ctx)
	if !result.Success {
		t.Error("Expected success for empty script")
	}
	if result.FlowAction != FlowActionNext {
		t.Errorf("Expected FlowActionNext, got %v", result.FlowAction)
	}
}

func TestJSExecutor_EnvironmentGet(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars: make(map[string]string),
		EnvVars: map[string]string{
			"baseUrl": "https://api.example.com",
			"apiKey":  "secret123",
		},
		PendingEnvWrites: make(map[string]string),
	}

	// Test getting environment variable
	script := `
		var baseUrl = pm.environment.get("baseUrl");
		if (baseUrl !== "https://api.example.com") {
			throw new Error("Expected baseUrl to be https://api.example.com, got " + baseUrl);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_EnvironmentSet(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		pm.environment.set("userId", "12345");
		pm.environment.set("token", "abc123");
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}

	// Check pending writes
	if ctx.PendingEnvWrites["userId"] != "12345" {
		t.Errorf("Expected userId=12345, got %v", ctx.PendingEnvWrites["userId"])
	}
	if ctx.PendingEnvWrites["token"] != "abc123" {
		t.Errorf("Expected token=abc123, got %v", ctx.PendingEnvWrites["token"])
	}

	// Check result includes updated vars
	if result.UpdatedEnvVars["userId"] != "12345" {
		t.Errorf("Expected UpdatedEnvVars userId=12345, got %v", result.UpdatedEnvVars["userId"])
	}
}

func TestJSExecutor_EnvironmentHas(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars: make(map[string]string),
		EnvVars: map[string]string{
			"existingVar": "value",
		},
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		if (!pm.environment.has("existingVar")) {
			throw new Error("Expected existingVar to exist");
		}
		if (pm.environment.has("nonExistentVar")) {
			throw new Error("Expected nonExistentVar to not exist");
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_ResponseJson(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		ResponseBody:     `{"id": 123, "name": "Test User", "nested": {"value": "deep"}}`,
		StatusCode:       200,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var data = pm.response.json();
		if (data.id !== 123) {
			throw new Error("Expected id to be 123, got " + data.id);
		}
		if (data.name !== "Test User") {
			throw new Error("Expected name to be 'Test User', got " + data.name);
		}
		if (data.nested.value !== "deep") {
			throw new Error("Expected nested.value to be 'deep', got " + data.nested.value);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_ResponseStatus(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		StatusCode:       201,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		if (pm.response.code !== 201) {
			throw new Error("Expected status 201, got " + pm.response.code);
		}
		if (pm.response.status !== 201) {
			throw new Error("Expected status 201, got " + pm.response.status);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_PmTest(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		StatusCode:       200,
		ResponseBody:     `{"success": true}`,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		pm.test("Status is 200", function() {
			pm.response.to.have.status(200);
		});

		pm.test("Response has success field", function() {
			var data = pm.response.json();
			if (!data.success) {
				throw new Error("Expected success to be true");
			}
		});
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if result.AssertionsPassed != 2 {
		t.Errorf("Expected 2 assertions passed, got %d", result.AssertionsPassed)
	}
}

func TestJSExecutor_PmTestFailure(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		StatusCode:       404,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		pm.test("Status is 200", function() {
			pm.response.to.have.status(200);
		});
	`

	result := executor.Execute(script, ctx)
	if result.Success {
		t.Error("Expected failure due to status mismatch")
	}
	if result.AssertionsFailed != 1 {
		t.Errorf("Expected 1 assertion failed, got %d", result.AssertionsFailed)
	}
}

func TestJSExecutor_ForEachLoop(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		ResponseBody:     `{"items": [1, 2, 3, 4, 5]}`,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var data = pm.response.json();
		var sum = 0;
		data.items.forEach(function(item) {
			sum += item;
		});
		if (sum !== 15) {
			throw new Error("Expected sum to be 15, got " + sum);
		}
		pm.environment.set("sum", sum.toString());
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if ctx.PendingEnvWrites["sum"] != "15" {
		t.Errorf("Expected sum=15, got %v", ctx.PendingEnvWrites["sum"])
	}
}

func TestJSExecutor_ConditionalLogic(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          map[string]string{"currency": "USD"},
		ResponseBody:     `{"amount": 100, "currency": "USD"}`,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var data = pm.response.json();
		var targetCurrency = pm.environment.get("currency");

		if (data.currency === targetCurrency) {
			pm.environment.set("result", "matched");
		} else {
			pm.environment.set("result", "not_matched");
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if ctx.PendingEnvWrites["result"] != "matched" {
		t.Errorf("Expected result=matched, got %v", ctx.PendingEnvWrites["result"])
	}
}

func TestJSExecutor_ParseInt(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          map[string]string{"amount": "12345"},
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var amountStr = pm.environment.get("amount");
		var amount = parseInt(amountStr, 10);
		if (amount !== 12345) {
			throw new Error("Expected amount to be 12345, got " + amount);
		}
		pm.environment.set("doubled", (amount * 2).toString());
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if ctx.PendingEnvWrites["doubled"] != "24690" {
		t.Errorf("Expected doubled=24690, got %v", ctx.PendingEnvWrites["doubled"])
	}
}

func TestJSExecutor_VariableResolution(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      map[string]string{"runtimeVar": "runtime_value"},
		EnvVars:          map[string]string{"envVar": "env_value"},
		PendingEnvWrites: make(map[string]string),
	}

	// Test that {{var}} patterns are resolved
	script := `
		// This tests that the script pre-processor resolves {{var}} patterns
		var resolved = "{{runtimeVar}}";
		if (resolved !== "runtime_value") {
			throw new Error("Expected runtime_value, got " + resolved);
		}

		var envResolved = "{{envVar}}";
		if (envResolved !== "env_value") {
			throw new Error("Expected env_value, got " + envResolved);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_Timeout(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	// Set a very short timeout for testing
	executor.timeout = 50 * 1e6 // 50ms

	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		PendingEnvWrites: make(map[string]string),
	}

	// Infinite loop
	script := `
		while(true) {
			// busy loop
		}
	`

	result := executor.Execute(script, ctx)
	if result.Success {
		t.Error("Expected timeout failure")
	}
	if len(result.Errors) == 0 || result.Errors[0] == "" {
		t.Error("Expected timeout error message")
	}
}

func TestJSExecutor_SyntaxError(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var x = {
			// missing closing brace
	`

	result := executor.Execute(script, ctx)
	if result.Success {
		t.Error("Expected syntax error")
	}
}

func TestJSExecutor_FlowControl(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		PendingEnvWrites: make(map[string]string),
	}

	// Test setNextRequest
	script := `
		pm.execution.setNextRequest("Step2");
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if result.FlowAction != FlowActionGoto {
		t.Errorf("Expected FlowActionGoto, got %v", result.FlowAction)
	}
	if result.GotoStepName != "Step2" {
		t.Errorf("Expected GotoStepName=Step2, got %v", result.GotoStepName)
	}
}

func TestJSExecutor_FlowControlStop(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		PendingEnvWrites: make(map[string]string),
	}

	// Test setNextRequest with null to stop
	script := `
		pm.execution.setNextRequest(null);
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if result.FlowAction != FlowActionStop {
		t.Errorf("Expected FlowActionStop, got %v", result.FlowAction)
	}
}

func TestJSExecutor_PmVariables(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		pm.variables.set("runtimeOnly", "test_value");
		var val = pm.variables.get("runtimeOnly");
		if (val !== "test_value") {
			throw new Error("Expected test_value, got " + val);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if result.UpdatedVars["runtimeOnly"] != "test_value" {
		t.Errorf("Expected runtimeOnly=test_value, got %v", result.UpdatedVars["runtimeOnly"])
	}
}

func TestJSExecutor_ResponseHeaders(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars: make(map[string]string),
		EnvVars:     make(map[string]string),
		Headers: map[string]string{
			"Content-Type":  "application/json",
			"X-Custom-Header": "custom-value",
		},
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var contentType = pm.response.headers.get("content-type");
		if (contentType !== "application/json") {
			throw new Error("Expected application/json, got " + contentType);
		}

		// Case insensitive lookup
		var customHeader = pm.response.headers.get("X-Custom-Header");
		if (customHeader !== "custom-value") {
			throw new Error("Expected custom-value, got " + customHeader);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_PmExpect(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		ResponseBody:     `{"name": "test", "count": 5}`,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		pm.test("Using expect assertions", function() {
			var data = pm.response.json();
			pm.expect(data.name).to.equal("test");
			pm.expect(data.count).to.be.above(3);
			pm.expect(data.count).to.be.below(10);
		});
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
	if result.AssertionsPassed != 1 {
		t.Errorf("Expected 1 assertion passed, got %d", result.AssertionsPassed)
	}
}

func TestJSExecutor_ComplexPostmanScript(t *testing.T) {
	// This test simulates the user's actual use case
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars: make(map[string]string),
		EnvVars: map[string]string{
			"targetCurrency": "KRW",
			"targetAmount":   "1000",
		},
		ResponseBody: `{
			"result": "success",
			"cur_unit": "KRW",
			"deal_bas_r": "1,320.5"
		}`,
		StatusCode:       200,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var jsonData = pm.response.json();
		var targetCurrency = pm.environment.get("targetCurrency");
		var targetAmount = parseInt(pm.environment.get("targetAmount"), 10);

		if (jsonData.cur_unit === targetCurrency) {
			var rate = parseFloat(jsonData.deal_bas_r.replace(",", ""));
			var result = targetAmount / rate;
			pm.environment.set("convertedAmount", result.toFixed(2));
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}

	convertedAmount := ctx.PendingEnvWrites["convertedAmount"]
	if convertedAmount == "" {
		t.Error("Expected convertedAmount to be set")
	}
	// 1000 / 1320.5 ≈ 0.76
	if convertedAmount != "0.76" {
		t.Errorf("Expected ~0.76, got %v", convertedAmount)
	}
}

func TestJSExecutor_PmInfo(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		StepName:         "Test Step",
		Iteration:        3,
		LoopCount:        5,
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		if (pm.info.iteration !== 3) {
			throw new Error("Expected iteration 3, got " + pm.info.iteration);
		}
		if (pm.info.loopCount !== 5) {
			throw new Error("Expected loopCount 5, got " + pm.info.loopCount);
		}
		if (pm.info.requestName !== "Test Step") {
			throw new Error("Expected requestName 'Test Step', got " + pm.info.requestName);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_ResponseText(t *testing.T) {
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		ResponseBody:     "Plain text response",
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		var text = pm.response.text();
		if (text !== "Plain text response") {
			throw new Error("Expected 'Plain text response', got " + text);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}

func TestJSExecutor_EnvironmentSetReadBack(t *testing.T) {
	// Test that pm.environment.set values can be read back with pm.environment.get in the same script
	executor := NewJSScriptExecutor(nil)
	ctx := &JSScriptContext{
		RuntimeVars:      make(map[string]string),
		EnvVars:          make(map[string]string),
		PendingEnvWrites: make(map[string]string),
	}

	script := `
		pm.environment.set("newVar", "newValue");
		var readBack = pm.environment.get("newVar");
		if (readBack !== "newValue") {
			throw new Error("Expected to read back 'newValue', got " + readBack);
		}
	`

	result := executor.Execute(script, ctx)
	if !result.Success {
		t.Errorf("Expected success, got errors: %v", result.Errors)
	}
}
