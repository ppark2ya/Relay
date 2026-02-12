package service

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/PaesslerAG/jsonpath"
	"github.com/dop251/goja"
)

// JSScriptContext provides context for JavaScript script execution
type JSScriptContext struct {
	RuntimeVars      map[string]string
	EnvVars          map[string]string
	StatusCode       int
	ResponseBody     string
	Headers          map[string]string
	DurationMs       int64
	StepName         string
	StepOrder        int
	FlowName         string
	Iteration        int64
	LoopCount        int64
	WorkspaceID      int64
	ActiveEnvID      int64
	PendingEnvWrites map[string]string // Variables to persist to DB

	// Global (workspace) variables
	GlobalVars          map[string]string
	PendingGlobalWrites map[string]string

	// Collection variables
	CollectionID              int64
	CollectionVars            map[string]string
	PendingCollectionWrites   map[string]string

	// Request context (for pm.request)
	RequestURL     string
	RequestMethod  string
	RequestHeaders map[string]string
	RequestBody    string

	// HTTP client for pm.sendRequest
	HTTPClientFunc func(method, url string, headers map[string]string, body string) (int, string, map[string]string, error)
	SendRequestCount int // Track number of sendRequest calls
}

// JSScriptResult holds the result of JavaScript script execution
type JSScriptResult struct {
	Success          bool              `json:"success"`
	Errors           []string          `json:"errors,omitempty"`
	ErrorDetails     []ErrorDetail     `json:"errorDetails,omitempty"`
	AssertionsPassed int               `json:"assertionsPassed"`
	AssertionsFailed int               `json:"assertionsFailed"`
	UpdatedEnvVars   map[string]string `json:"updatedEnvVars,omitempty"` // For DB persistence
	UpdatedVars      map[string]string `json:"updatedVars,omitempty"`    // Runtime variables
	FlowAction       FlowAction        `json:"flowAction"`
	GotoStepName     string            `json:"gotoStepName,omitempty"`
	GotoStepOrder    int               `json:"gotoStepOrder,omitempty"`

	// Global (workspace) variable updates
	UpdatedGlobalVars map[string]string `json:"updatedGlobalVars,omitempty"`

	// Collection variable updates
	UpdatedCollectionVars map[string]string `json:"updatedCollectionVars,omitempty"`
}

// TestResult represents a single test result from pm.test()
type TestResult struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Error  string `json:"error,omitempty"`
}

// JSScriptExecutor executes JavaScript scripts using goja
type JSScriptExecutor struct {
	variableResolver *VariableResolver
	timeout          time.Duration
}

// NewJSScriptExecutor creates a new JSScriptExecutor
func NewJSScriptExecutor(vr *VariableResolver) *JSScriptExecutor {
	return &JSScriptExecutor{
		variableResolver: vr,
		timeout:          5 * time.Second,
	}
}

// Execute runs a JavaScript script and returns the result
// MaxSendRequests is the maximum number of pm.sendRequest calls allowed per script
const MaxSendRequests = 10

func (jse *JSScriptExecutor) Execute(script string, jsCtx *JSScriptContext) *JSScriptResult {
	result := &JSScriptResult{
		Success:               true,
		UpdatedEnvVars:        make(map[string]string),
		UpdatedVars:           make(map[string]string),
		UpdatedGlobalVars:     make(map[string]string),
		UpdatedCollectionVars: make(map[string]string),
		FlowAction:            FlowActionNext,
	}

	if script == "" {
		return result
	}

	// Pre-process: resolve {{var}} patterns
	resolvedScript := jse.resolveVariables(script, jsCtx)

	// Create goja runtime
	vm := goja.New()

	// Set up timeout using interrupt
	timer := time.AfterFunc(jse.timeout, func() {
		vm.Interrupt("script execution timed out")
	})
	defer timer.Stop()

	// Disable dangerous functions
	jse.setupSandbox(vm)

	// Set up pm.* API
	jse.setupPmAPI(vm, jsCtx, result)

	// Set up console.log
	jse.setupConsole(vm)

	// Compile the script first to catch syntax errors with location info
	prog, compileErr := goja.Compile("script", resolvedScript, true)
	if compileErr != nil {
		result.Success = false
		errMsg := compileErr.Error()
		cleanMsg, line, col := parseGojaErrorLocation(errMsg)
		result.Errors = append(result.Errors, cleanMsg)
		result.ErrorDetails = append(result.ErrorDetails, ErrorDetail{
			Message: cleanMsg,
			Line:    line,
			Column:  col,
		})
		return result
	}

	// Execute the compiled program
	_, err := vm.RunProgram(prog)
	if err != nil {
		// Check if it's an interrupt (timeout)
		if interrupted, ok := err.(*goja.InterruptedError); ok {
			result.Success = false
			result.Errors = append(result.Errors, fmt.Sprintf("Script timeout: %v", interrupted.Value()))
			return result
		}
		result.Success = false
		errMsg := fmt.Sprintf("Script error: %v", err)
		cleanMsg, line, col := parseGojaErrorLocation(errMsg)
		result.Errors = append(result.Errors, cleanMsg)
		result.ErrorDetails = append(result.ErrorDetails, ErrorDetail{
			Message: cleanMsg,
			Line:    line,
			Column:  col,
		})
		return result
	}

	// Copy pending writes to updated vars for runtime use
	// Order: global (lowest priority) → collection → env (highest priority)
	// Higher priority overwrites lower priority in UpdatedVars/RuntimeVars

	// Copy pending global writes
	for k, v := range jsCtx.PendingGlobalWrites {
		result.UpdatedGlobalVars[k] = v
		result.UpdatedVars[k] = v
		jsCtx.RuntimeVars[k] = v
	}

	// Copy pending collection writes (overwrites global if same key)
	for k, v := range jsCtx.PendingCollectionWrites {
		result.UpdatedCollectionVars[k] = v
		result.UpdatedVars[k] = v
		jsCtx.RuntimeVars[k] = v
	}

	// Copy pending env writes (overwrites collection/global if same key)
	for k, v := range jsCtx.PendingEnvWrites {
		result.UpdatedEnvVars[k] = v
		result.UpdatedVars[k] = v
		jsCtx.RuntimeVars[k] = v
	}

	return result
}

// resolveVariables replaces {{var}} patterns with values from context
// Priority (highest first): RuntimeVars → PendingEnvWrites → EnvVars → PendingCollectionWrites → CollectionVars → PendingGlobalWrites → GlobalVars
func (jse *JSScriptExecutor) resolveVariables(script string, jsCtx *JSScriptContext) string {
	re := regexp.MustCompile(`\{\{([^}]+)\}\}`)
	return re.ReplaceAllStringFunc(script, func(match string) string {
		varName := strings.TrimSpace(match[2 : len(match)-2])

		// Check runtime vars first (highest priority)
		if val, ok := jsCtx.RuntimeVars[varName]; ok {
			return val
		}

		// Check pending env writes
		if val, ok := jsCtx.PendingEnvWrites[varName]; ok {
			return val
		}

		// Check environment vars
		if val, ok := jsCtx.EnvVars[varName]; ok {
			return val
		}

		// Check pending collection writes
		if val, ok := jsCtx.PendingCollectionWrites[varName]; ok {
			return val
		}

		// Check collection vars
		if val, ok := jsCtx.CollectionVars[varName]; ok {
			return val
		}

		// Check pending global writes
		if val, ok := jsCtx.PendingGlobalWrites[varName]; ok {
			return val
		}

		// Check global vars (lowest priority)
		if val, ok := jsCtx.GlobalVars[varName]; ok {
			return val
		}

		return match // Keep original if not found
	})
}

// setupSandbox disables dangerous functions
func (jse *JSScriptExecutor) setupSandbox(vm *goja.Runtime) {
	// Remove dangerous globals
	vm.Set("eval", goja.Undefined())
	vm.Set("Function", goja.Undefined())
}

// setupPmAPI sets up the Postman-compatible pm.* API
func (jse *JSScriptExecutor) setupPmAPI(vm *goja.Runtime, jsCtx *JSScriptContext, result *JSScriptResult) {
	// Initialize pending write maps if nil
	if jsCtx.PendingEnvWrites == nil {
		jsCtx.PendingEnvWrites = make(map[string]string)
	}
	if jsCtx.PendingGlobalWrites == nil {
		jsCtx.PendingGlobalWrites = make(map[string]string)
	}
	if jsCtx.PendingCollectionWrites == nil {
		jsCtx.PendingCollectionWrites = make(map[string]string)
	}
	if jsCtx.GlobalVars == nil {
		jsCtx.GlobalVars = make(map[string]string)
	}
	if jsCtx.CollectionVars == nil {
		jsCtx.CollectionVars = make(map[string]string)
	}
	if jsCtx.RuntimeVars == nil {
		jsCtx.RuntimeVars = make(map[string]string)
	}

	// pm object
	pm := vm.NewObject()

	// pm.environment
	environment := vm.NewObject()

	// pm.environment.get(name) - read from env vars + runtime vars
	environment.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()

		// Check pending writes first (for within-script consistency)
		if val, ok := jsCtx.PendingEnvWrites[name]; ok {
			return vm.ToValue(val)
		}

		// Check runtime vars
		if val, ok := jsCtx.RuntimeVars[name]; ok {
			return vm.ToValue(val)
		}

		// Check environment vars
		if val, ok := jsCtx.EnvVars[name]; ok {
			return vm.ToValue(val)
		}

		return goja.Undefined()
	})

	// pm.environment.set(name, value) - queue for DB persistence
	environment.Set("set", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		value := call.Arguments[1].String()

		// Store in pending writes for later DB persistence
		jsCtx.PendingEnvWrites[name] = value

		// Also update runtime vars for immediate access
		jsCtx.RuntimeVars[name] = value

		return goja.Undefined()
	})

	// pm.environment.has(name)
	environment.Set("has", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return vm.ToValue(false)
		}
		name := call.Arguments[0].String()

		if _, ok := jsCtx.PendingEnvWrites[name]; ok {
			return vm.ToValue(true)
		}
		if _, ok := jsCtx.RuntimeVars[name]; ok {
			return vm.ToValue(true)
		}
		if _, ok := jsCtx.EnvVars[name]; ok {
			return vm.ToValue(true)
		}
		return vm.ToValue(false)
	})

	pm.Set("environment", environment)

	// pm.variables - similar to environment but for runtime-only vars
	variables := vm.NewObject()
	variables.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		if val, ok := jsCtx.RuntimeVars[name]; ok {
			return vm.ToValue(val)
		}
		if val, ok := jsCtx.EnvVars[name]; ok {
			return vm.ToValue(val)
		}
		return goja.Undefined()
	})
	variables.Set("set", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		value := call.Arguments[1].String()
		jsCtx.RuntimeVars[name] = value
		result.UpdatedVars[name] = value
		return goja.Undefined()
	})
	pm.Set("variables", variables)

	// pm.globals - workspace-wide variables (persisted to DB)
	globals := vm.NewObject()
	globals.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()

		// Check pending writes first (for within-script consistency)
		if val, ok := jsCtx.PendingGlobalWrites[name]; ok {
			return vm.ToValue(val)
		}

		// Check global vars
		if val, ok := jsCtx.GlobalVars[name]; ok {
			return vm.ToValue(val)
		}

		return goja.Undefined()
	})
	globals.Set("set", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		value := call.Arguments[1].String()

		// Store in pending writes for later DB persistence
		jsCtx.PendingGlobalWrites[name] = value

		// Also update global vars for immediate access
		jsCtx.GlobalVars[name] = value

		return goja.Undefined()
	})
	globals.Set("has", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return vm.ToValue(false)
		}
		name := call.Arguments[0].String()

		// Check pending writes first - empty string means deleted
		if val, ok := jsCtx.PendingGlobalWrites[name]; ok {
			return vm.ToValue(val != "") // false if marked for deletion
		}
		if _, ok := jsCtx.GlobalVars[name]; ok {
			return vm.ToValue(true)
		}
		return vm.ToValue(false)
	})
	globals.Set("unset", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		delete(jsCtx.PendingGlobalWrites, name)
		delete(jsCtx.GlobalVars, name)
		// Mark for deletion by setting empty string
		jsCtx.PendingGlobalWrites[name] = ""
		return goja.Undefined()
	})
	globals.Set("clear", func(call goja.FunctionCall) goja.Value {
		for k := range jsCtx.GlobalVars {
			jsCtx.PendingGlobalWrites[k] = ""
		}
		jsCtx.GlobalVars = make(map[string]string)
		return goja.Undefined()
	})
	pm.Set("globals", globals)

	// pm.collectionVariables - collection-scoped variables (persisted to DB)
	collectionVariables := vm.NewObject()
	collectionVariables.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()

		// Check pending writes first (for within-script consistency)
		if val, ok := jsCtx.PendingCollectionWrites[name]; ok {
			return vm.ToValue(val)
		}

		// Check collection vars
		if val, ok := jsCtx.CollectionVars[name]; ok {
			return vm.ToValue(val)
		}

		return goja.Undefined()
	})
	collectionVariables.Set("set", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		value := call.Arguments[1].String()

		// Store in pending writes for later DB persistence
		jsCtx.PendingCollectionWrites[name] = value

		// Also update collection vars for immediate access
		jsCtx.CollectionVars[name] = value

		return goja.Undefined()
	})
	collectionVariables.Set("has", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return vm.ToValue(false)
		}
		name := call.Arguments[0].String()

		// Check pending writes first - empty string means deleted
		if val, ok := jsCtx.PendingCollectionWrites[name]; ok {
			return vm.ToValue(val != "") // false if marked for deletion
		}
		if _, ok := jsCtx.CollectionVars[name]; ok {
			return vm.ToValue(true)
		}
		return vm.ToValue(false)
	})
	collectionVariables.Set("unset", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		delete(jsCtx.PendingCollectionWrites, name)
		delete(jsCtx.CollectionVars, name)
		// Mark for deletion by setting empty string
		jsCtx.PendingCollectionWrites[name] = ""
		return goja.Undefined()
	})
	collectionVariables.Set("clear", func(call goja.FunctionCall) goja.Value {
		for k := range jsCtx.CollectionVars {
			jsCtx.PendingCollectionWrites[k] = ""
		}
		jsCtx.CollectionVars = make(map[string]string)
		return goja.Undefined()
	})
	pm.Set("collectionVariables", collectionVariables)

	// pm.response
	response := vm.NewObject()

	// Lazy parsed JSON cache
	var parsedJSON interface{}
	var parseOnce sync.Once
	var parseError error

	// pm.response.json()
	response.Set("json", func(call goja.FunctionCall) goja.Value {
		parseOnce.Do(func() {
			if jsCtx.ResponseBody != "" {
				parseError = json.Unmarshal([]byte(jsCtx.ResponseBody), &parsedJSON)
			}
		})
		if parseError != nil {
			return goja.Undefined()
		}
		return vm.ToValue(parsedJSON)
	})

	// pm.response.text()
	response.Set("text", func(call goja.FunctionCall) goja.Value {
		return vm.ToValue(jsCtx.ResponseBody)
	})

	// pm.response.code
	response.Set("code", vm.ToValue(jsCtx.StatusCode))
	response.Set("status", vm.ToValue(jsCtx.StatusCode))

	// pm.response.responseTime
	response.Set("responseTime", vm.ToValue(jsCtx.DurationMs))

	// pm.response.headers
	headersObj := vm.NewObject()
	for k, v := range jsCtx.Headers {
		headersObj.Set(strings.ToLower(k), vm.ToValue(v))
	}
	// pm.response.headers.get(name)
	headersObj.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := strings.ToLower(call.Arguments[0].String())
		if val, ok := jsCtx.Headers[name]; ok {
			return vm.ToValue(val)
		}
		// Case-insensitive lookup
		for k, v := range jsCtx.Headers {
			if strings.EqualFold(k, name) {
				return vm.ToValue(v)
			}
		}
		return goja.Undefined()
	})
	response.Set("headers", headersObj)

	// pm.response.to for chai-style assertions
	to := vm.NewObject()
	have := vm.NewObject()
	have.Set("status", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		expected := int(call.Arguments[0].ToInteger())
		if jsCtx.StatusCode != expected {
			panic(vm.ToValue(fmt.Sprintf("Expected status %d but got %d", expected, jsCtx.StatusCode)))
		}
		return goja.Undefined()
	})
	have.Set("header", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		headerName := call.Arguments[0].String()
		for k := range jsCtx.Headers {
			if strings.EqualFold(k, headerName) {
				return goja.Undefined() // Header exists
			}
		}
		panic(vm.ToValue(fmt.Sprintf("Expected header '%s' to exist", headerName)))
	})
	have.Set("jsonBody", func(call goja.FunctionCall) goja.Value {
		parseOnce.Do(func() {
			if jsCtx.ResponseBody != "" {
				parseError = json.Unmarshal([]byte(jsCtx.ResponseBody), &parsedJSON)
			}
		})
		if parseError != nil {
			panic(vm.ToValue("Expected JSON body but parsing failed"))
		}
		return goja.Undefined()
	})
	to.Set("have", have)
	response.Set("to", to)

	pm.Set("response", response)

	// pm.test(name, callback) - execute test and track results
	var testMutex sync.Mutex
	pm.Set("test", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}

		name := call.Arguments[0].String()
		callback, ok := goja.AssertFunction(call.Arguments[1])
		if !ok {
			return goja.Undefined()
		}

		// Capture pm.test() call site line before executing callback
		var callSiteLine int
		if frames := vm.CaptureCallStack(5, nil); len(frames) > 0 {
			for _, f := range frames {
				pos := f.Position()
				if pos.Line > 0 {
					callSiteLine = pos.Line
					break
				}
			}
		}

		// Execute the test callback
		testResult := TestResult{Name: name, Passed: true}

		func() {
			defer func() {
				if r := recover(); r != nil {
					testResult.Passed = false
					testResult.Error = fmt.Sprintf("%v", r)
				}
			}()
			_, err := callback(goja.Undefined())
			if err != nil {
				testResult.Passed = false
				testResult.Error = err.Error()
			}
		}()

		testMutex.Lock()
		if testResult.Passed {
			result.AssertionsPassed++
		} else {
			result.AssertionsFailed++
			errMsg := fmt.Sprintf("Test '%s' failed: %s", name, testResult.Error)
			cleanMsg, line, col := parseGojaErrorLocation(errMsg)
			// If no line from error string, use the pm.test() call site line
			if line == 0 && callSiteLine > 0 {
				line = callSiteLine
			}
			result.Errors = append(result.Errors, cleanMsg)
			result.ErrorDetails = append(result.ErrorDetails, ErrorDetail{
				Message: cleanMsg,
				Line:    line,
				Column:  col,
			})
			result.Success = false
		}
		testMutex.Unlock()

		return goja.Undefined()
	})

	// pm.expect(value) - chai-like expect
	pm.Set("expect", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		actual := call.Arguments[0]
		return jse.createExpectObject(vm, actual)
	})

	// pm.info
	info := vm.NewObject()
	info.Set("iteration", vm.ToValue(jsCtx.Iteration))
	info.Set("loopCount", vm.ToValue(jsCtx.LoopCount))
	info.Set("requestName", vm.ToValue(jsCtx.StepName))
	pm.Set("info", info)

	// pm.execution - flow control
	execution := vm.NewObject()
	execution.Set("skipRequest", func(call goja.FunctionCall) goja.Value {
		result.FlowAction = FlowActionNext
		return goja.Undefined()
	})
	execution.Set("setNextRequest", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			result.FlowAction = FlowActionStop
			return goja.Undefined()
		}
		stepName := call.Arguments[0].String()
		if stepName == "null" || stepName == "" {
			result.FlowAction = FlowActionStop
		} else {
			result.FlowAction = FlowActionGoto
			result.GotoStepName = stepName
		}
		return goja.Undefined()
	})
	pm.Set("execution", execution)

	// pm.request - access to the current request (read-only)
	request := vm.NewObject()
	request.Set("url", jsCtx.RequestURL)
	request.Set("method", jsCtx.RequestMethod)

	// Request headers as object with get() method
	reqHeaders := vm.NewObject()
	for k, v := range jsCtx.RequestHeaders {
		reqHeaders.Set(k, vm.ToValue(v))
	}
	reqHeaders.Set("get", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		name := call.Arguments[0].String()
		if val, ok := jsCtx.RequestHeaders[name]; ok {
			return vm.ToValue(val)
		}
		// Case-insensitive lookup
		for k, v := range jsCtx.RequestHeaders {
			if strings.EqualFold(k, name) {
				return vm.ToValue(v)
			}
		}
		return goja.Undefined()
	})
	request.Set("headers", reqHeaders)

	// Request body
	bodyObj := vm.NewObject()
	bodyObj.Set("toString", func(call goja.FunctionCall) goja.Value {
		return vm.ToValue(jsCtx.RequestBody)
	})
	request.Set("body", bodyObj)
	pm.Set("request", request)

	// pm.sendRequest - execute HTTP request from within script
	pm.Set("sendRequest", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}

		// Check rate limit
		jsCtx.SendRequestCount++
		if jsCtx.SendRequestCount > MaxSendRequests {
			panic(vm.ToValue(fmt.Sprintf("Maximum sendRequest limit (%d) exceeded", MaxSendRequests)))
		}

		// Check if HTTPClientFunc is available
		if jsCtx.HTTPClientFunc == nil {
			panic(vm.ToValue("pm.sendRequest is not available in this context"))
		}

		// Parse first argument (URL string or request object)
		arg := call.Arguments[0]
		var url, method, body string
		headers := make(map[string]string)

		if arg.ExportType().Kind() == reflect.String {
			// Simple URL string - defaults to GET
			url = arg.String()
			method = "GET"
		} else {
			// Request object
			obj := arg.ToObject(vm)

			urlVal := obj.Get("url")
			if urlVal != nil && !goja.IsUndefined(urlVal) {
				url = urlVal.String()
			}

			methodVal := obj.Get("method")
			if methodVal != nil && !goja.IsUndefined(methodVal) {
				method = strings.ToUpper(methodVal.String())
			} else {
				method = "GET"
			}

			headersVal := obj.Get("headers")
			if headersVal != nil && !goja.IsUndefined(headersVal) {
				headersObj := headersVal.ToObject(vm)
				for _, key := range headersObj.Keys() {
					val := headersObj.Get(key)
					if val != nil && !goja.IsUndefined(val) {
						headers[key] = val.String()
					}
				}
			}

			bodyVal := obj.Get("body")
			if bodyVal != nil && !goja.IsUndefined(bodyVal) {
				// Body can be string or object
				if bodyVal.ExportType().Kind() == reflect.String {
					body = bodyVal.String()
				} else {
					// Try to convert object to JSON string
					bodyBytes, err := json.Marshal(bodyVal.Export())
					if err == nil {
						body = string(bodyBytes)
					}
				}
			}
		}

		// Execute the request
		statusCode, respBody, respHeaders, err := jsCtx.HTTPClientFunc(method, url, headers, body)

		// Get callback if provided (second argument)
		if len(call.Arguments) >= 2 {
			callback, ok := goja.AssertFunction(call.Arguments[1])
			if ok {
				// Create response object for callback
				respObj := vm.NewObject()
				respObj.Set("code", vm.ToValue(statusCode))
				respObj.Set("status", vm.ToValue(statusCode))

				// Response body with json() method
				respObj.Set("text", func(c goja.FunctionCall) goja.Value {
					return vm.ToValue(respBody)
				})
				respObj.Set("json", func(c goja.FunctionCall) goja.Value {
					var parsed interface{}
					if err := json.Unmarshal([]byte(respBody), &parsed); err != nil {
						return goja.Undefined()
					}
					return vm.ToValue(parsed)
				})

				// Response headers
				respHeadersObj := vm.NewObject()
				for k, v := range respHeaders {
					respHeadersObj.Set(k, vm.ToValue(v))
				}
				respHeadersObj.Set("get", func(c goja.FunctionCall) goja.Value {
					if len(c.Arguments) < 1 {
						return goja.Undefined()
					}
					name := c.Arguments[0].String()
					if val, ok := respHeaders[name]; ok {
						return vm.ToValue(val)
					}
					for k, v := range respHeaders {
						if strings.EqualFold(k, name) {
							return vm.ToValue(v)
						}
					}
					return goja.Undefined()
				})
				respObj.Set("headers", respHeadersObj)

				// Create error object if error occurred
				var errVal goja.Value
				if err != nil {
					errVal = vm.ToValue(err.Error())
				} else {
					errVal = goja.Null()
				}

				// Call the callback with (error, response)
				_, _ = callback(goja.Undefined(), errVal, respObj)
			}
		}

		return goja.Undefined()
	})

	vm.Set("pm", pm)

	// Helper functions

	// parseInt
	vm.Set("parseInt", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return vm.ToValue(0)
		}
		s := call.Arguments[0].String()
		var radix int64 = 10
		if len(call.Arguments) > 1 {
			radix = call.Arguments[1].ToInteger()
		}

		var result int64
		fmt.Sscanf(s, fmt.Sprintf("%%%dd", radix), &result)

		// Simple parseInt implementation
		s = strings.TrimSpace(s)
		negative := false
		if len(s) > 0 && s[0] == '-' {
			negative = true
			s = s[1:]
		} else if len(s) > 0 && s[0] == '+' {
			s = s[1:]
		}

		result = 0
		for _, c := range s {
			var digit int64
			if c >= '0' && c <= '9' {
				digit = int64(c - '0')
			} else if c >= 'a' && c <= 'z' {
				digit = int64(c-'a') + 10
			} else if c >= 'A' && c <= 'Z' {
				digit = int64(c-'A') + 10
			} else {
				break
			}
			if digit >= radix {
				break
			}
			result = result*radix + digit
		}

		if negative {
			result = -result
		}

		return vm.ToValue(result)
	})

	// parseFloat
	vm.Set("parseFloat", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return vm.ToValue(0.0)
		}
		s := call.Arguments[0].String()
		var f float64
		fmt.Sscanf(strings.TrimSpace(s), "%f", &f)
		return vm.ToValue(f)
	})

	// JSON is built-in, but let's ensure it's available
	vm.RunString(`
		if (typeof JSON === 'undefined') {
			var JSON = {
				parse: function(s) { return eval('(' + s + ')'); },
				stringify: function(o) { return '' + o; }
			};
		}
	`)
}

// createExpectObject creates a chai-like expect object
func (jse *JSScriptExecutor) createExpectObject(vm *goja.Runtime, actual goja.Value) goja.Value {
	expect := vm.NewObject()

	// to.be chain
	to := vm.NewObject()
	be := vm.NewObject()

	// to.equal / to.eql
	to.Set("equal", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		expected := call.Arguments[0]
		if !jse.deepEqual(actual.Export(), expected.Export()) {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to equal %v", actual.Export(), expected.Export())))
		}
		return goja.Undefined()
	})
	to.Set("eql", to.Get("equal"))

	// to.be.true
	be.Set("true", func(call goja.FunctionCall) goja.Value {
		if actual.ToBoolean() != true {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to be true", actual.Export())))
		}
		return goja.Undefined()
	})

	// to.be.false
	be.Set("false", func(call goja.FunctionCall) goja.Value {
		if actual.ToBoolean() != false {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to be false", actual.Export())))
		}
		return goja.Undefined()
	})

	// to.be.undefined
	be.Set("undefined", func(call goja.FunctionCall) goja.Value {
		if !goja.IsUndefined(actual) && !goja.IsNull(actual) {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to be undefined", actual.Export())))
		}
		return goja.Undefined()
	})

	// to.be.null
	be.Set("null", func(call goja.FunctionCall) goja.Value {
		if !goja.IsNull(actual) {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to be null", actual.Export())))
		}
		return goja.Undefined()
	})

	// to.be.a(type)
	be.Set("a", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		expectedType := strings.ToLower(call.Arguments[0].String())
		actualType := jse.getType(actual.Export())
		if actualType != expectedType {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to be a %s", actual.Export(), expectedType)))
		}
		return goja.Undefined()
	})
	be.Set("an", be.Get("a"))

	// to.be.above(n)
	be.Set("above", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		n := call.Arguments[0].ToFloat()
		if actual.ToFloat() <= n {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to be above %v", actual.Export(), n)))
		}
		return goja.Undefined()
	})
	be.Set("greaterThan", be.Get("above"))

	// to.be.below(n)
	be.Set("below", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		n := call.Arguments[0].ToFloat()
		if actual.ToFloat() >= n {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to be below %v", actual.Export(), n)))
		}
		return goja.Undefined()
	})
	be.Set("lessThan", be.Get("below"))

	to.Set("be", be)

	// to.include / to.contain
	to.Set("include", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		needle := call.Arguments[0].String()
		haystack := actual.String()
		if !strings.Contains(haystack, needle) {
			panic(vm.ToValue(fmt.Sprintf("Expected %v to include %v", haystack, needle)))
		}
		return goja.Undefined()
	})
	to.Set("contain", to.Get("include"))

	// to.have.property
	have := vm.NewObject()
	have.Set("property", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		prop := call.Arguments[0].String()
		obj := actual.ToObject(vm)
		if obj.Get(prop) == nil || goja.IsUndefined(obj.Get(prop)) {
			panic(vm.ToValue(fmt.Sprintf("Expected object to have property '%s'", prop)))
		}
		return goja.Undefined()
	})
	have.Set("length", func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 1 {
			return goja.Undefined()
		}
		expectedLen := int(call.Arguments[0].ToInteger())
		actualExport := actual.Export()
		var actualLen int
		switch v := actualExport.(type) {
		case string:
			actualLen = len(v)
		case []interface{}:
			actualLen = len(v)
		default:
			panic(vm.ToValue(fmt.Sprintf("Cannot check length of %T", actualExport)))
		}
		if actualLen != expectedLen {
			panic(vm.ToValue(fmt.Sprintf("Expected length %d but got %d", expectedLen, actualLen)))
		}
		return goja.Undefined()
	})
	to.Set("have", have)

	expect.Set("to", to)

	return expect
}

// getType returns the JavaScript type name of a value
func (jse *JSScriptExecutor) getType(v interface{}) string {
	switch v.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case float64, float32, int, int64, int32:
		return "number"
	case string:
		return "string"
	case []interface{}:
		return "array"
	case map[string]interface{}:
		return "object"
	default:
		return "object"
	}
}

// deepEqual compares two values for deep equality
func (jse *JSScriptExecutor) deepEqual(a, b interface{}) bool {
	aJSON, aErr := json.Marshal(a)
	bJSON, bErr := json.Marshal(b)
	if aErr != nil || bErr != nil {
		return fmt.Sprintf("%v", a) == fmt.Sprintf("%v", b)
	}
	return string(aJSON) == string(bJSON)
}

// setupConsole sets up console.log
func (jse *JSScriptExecutor) setupConsole(vm *goja.Runtime) {
	console := vm.NewObject()
	console.Set("log", func(call goja.FunctionCall) goja.Value {
		// In production, we might want to capture these logs
		// For now, just acknowledge the call
		return goja.Undefined()
	})
	console.Set("error", console.Get("log"))
	console.Set("warn", console.Get("log"))
	console.Set("info", console.Get("log"))
	vm.Set("console", console)
}

// ExtractJSONPath extracts a value from JSON using JSONPath
func (jse *JSScriptExecutor) ExtractJSONPath(ctx context.Context, responseBody, path string) (interface{}, error) {
	var data interface{}
	if err := json.Unmarshal([]byte(responseBody), &data); err != nil {
		return nil, err
	}
	return jsonpath.Get(path, data)
}
