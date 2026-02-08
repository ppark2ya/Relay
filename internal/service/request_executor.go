package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strings"
	"time"

	"relay/internal/middleware"
	"relay/internal/repository"
)

type RequestExecutor struct {
	queries          *repository.Queries
	variableResolver *VariableResolver
}

func NewRequestExecutor(queries *repository.Queries, vr *VariableResolver) *RequestExecutor {
	return &RequestExecutor{
		queries:          queries,
		variableResolver: vr,
	}
}

type ExecuteResult struct {
	StatusCode      int               `json:"statusCode"`
	Headers         map[string]string `json:"headers"`
	Body            string            `json:"body"`
	DurationMs      int64             `json:"durationMs"`
	Error           string            `json:"error,omitempty"`
	ResolvedURL     string            `json:"resolvedUrl"`
	ResolvedHeaders map[string]string `json:"resolvedHeaders"`
}

type FormDataFile struct {
	Filename string
	Data     []byte
}

type RequestOverrides struct {
	Method        string
	URL           string
	Headers       string
	Body          string
	BodyType      string
	ProxyID       *int64
	FormDataFiles map[int]FormDataFile
}

func (re *RequestExecutor) Execute(ctx context.Context, requestID int64, runtimeVars map[string]string, overrides *RequestOverrides) (*ExecuteResult, error) {
	req, err := re.queries.GetRequest(ctx, requestID)
	if err != nil {
		return nil, err
	}

	var formFiles map[int]FormDataFile

	// Apply overrides if provided
	if overrides != nil {
		if overrides.Method != "" {
			req.Method = overrides.Method
		}
		if overrides.URL != "" {
			req.Url = overrides.URL
		}
		if overrides.Headers != "" {
			req.Headers = sql.NullString{String: overrides.Headers, Valid: true}
		}
		if overrides.Body != "" {
			req.Body = sql.NullString{String: overrides.Body, Valid: true}
		}
		if overrides.BodyType != "" {
			req.BodyType = sql.NullString{String: overrides.BodyType, Valid: true}
		}
		if overrides.ProxyID != nil {
			v := *overrides.ProxyID
			if v == -1 {
				// -1 means reset to global (NULL)
				req.ProxyID = sql.NullInt64{}
			} else {
				req.ProxyID = sql.NullInt64{Int64: v, Valid: true}
			}
		}
		formFiles = overrides.FormDataFiles
	}

	return re.executeRequestInternal(ctx, req, runtimeVars, formFiles)
}

func (re *RequestExecutor) ExecuteAdhoc(ctx context.Context, method, urlStr, headers, body string, runtimeVars map[string]string, proxyID *int64) (*ExecuteResult, error) {
	req := repository.Request{
		Method:  method,
		Url:     urlStr,
		Headers: sql.NullString{String: headers, Valid: headers != ""},
		Body:    sql.NullString{String: body, Valid: body != ""},
	}
	if proxyID != nil {
		v := *proxyID
		if v == -1 {
			req.ProxyID = sql.NullInt64{}
		} else {
			req.ProxyID = sql.NullInt64{Int64: v, Valid: true}
		}
	}
	return re.ExecuteRequest(ctx, req, runtimeVars)
}

func (re *RequestExecutor) ExecuteAdhocFormData(ctx context.Context, method, urlStr, headers, itemsJSON string, runtimeVars map[string]string, proxyID *int64, formFiles map[int]FormDataFile) (*ExecuteResult, error) {
	req := repository.Request{
		Method:   method,
		Url:      urlStr,
		Headers:  sql.NullString{String: headers, Valid: headers != ""},
		Body:     sql.NullString{String: itemsJSON, Valid: itemsJSON != ""},
		BodyType: sql.NullString{String: "formdata", Valid: true},
	}
	if proxyID != nil {
		v := *proxyID
		if v == -1 {
			req.ProxyID = sql.NullInt64{}
		} else {
			req.ProxyID = sql.NullInt64{Int64: v, Valid: true}
		}
	}
	return re.executeRequestInternal(ctx, req, runtimeVars, formFiles)
}

func (re *RequestExecutor) ExecuteRequest(ctx context.Context, req repository.Request, runtimeVars map[string]string) (*ExecuteResult, error) {
	return re.executeRequestInternal(ctx, req, runtimeVars, nil)
}

type formDataItem struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

func (re *RequestExecutor) buildFormDataBody(ctx context.Context, bodyStr string, runtimeVars map[string]string, formFiles map[int]FormDataFile) (io.Reader, string, error) {
	var items []formDataItem
	if err := json.Unmarshal([]byte(bodyStr), &items); err != nil {
		return nil, "", err
	}

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	for i, item := range items {
		if !item.Enabled {
			continue
		}
		if item.Type == "file" {
			fd, ok := formFiles[i]
			if !ok {
				continue
			}
			h := make(textproto.MIMEHeader)
			h.Set("Content-Disposition", `form-data; name="`+escapeQuotes(item.Key)+`"; filename="`+escapeQuotes(fd.Filename)+`"`)
			h.Set("Content-Type", "application/octet-stream")
			part, err := writer.CreatePart(h)
			if err != nil {
				return nil, "", err
			}
			if _, err := part.Write(fd.Data); err != nil {
				return nil, "", err
			}
		} else {
			resolvedValue, _ := re.variableResolver.Resolve(ctx, item.Value, runtimeVars)
			if err := writer.WriteField(item.Key, resolvedValue); err != nil {
				return nil, "", err
			}
		}
	}

	if err := writer.Close(); err != nil {
		return nil, "", err
	}

	return &buf, writer.FormDataContentType(), nil
}

func escapeQuotes(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

func (re *RequestExecutor) executeRequestInternal(ctx context.Context, req repository.Request, runtimeVars map[string]string, formFiles map[int]FormDataFile) (*ExecuteResult, error) {
	result := &ExecuteResult{}

	// Resolve URL
	resolvedURL, err := re.variableResolver.Resolve(ctx, req.Url, runtimeVars)
	if err != nil {
		result.Error = err.Error()
		return result, nil
	}
	result.ResolvedURL = resolvedURL

	// Resolve headers
	headers := "{}"
	if req.Headers.Valid {
		headers = req.Headers.String
	}
	resolvedHeaders, err := re.variableResolver.ResolveHeaders(ctx, headers, runtimeVars)
	if err != nil {
		result.Error = err.Error()
		return result, nil
	}
	result.ResolvedHeaders = resolvedHeaders

	// Create HTTP client with proxy if active
	client, err := re.createHTTPClient(ctx, req.ProxyID)
	if err != nil {
		result.Error = err.Error()
		return result, nil
	}

	// Build request body
	var bodyReader io.Reader
	bodyType := ""
	if req.BodyType.Valid {
		bodyType = req.BodyType.String
	}

	if bodyType == "formdata" && req.Body.Valid {
		reader, contentType, err := re.buildFormDataBody(ctx, req.Body.String, runtimeVars, formFiles)
		if err != nil {
			result.Error = "Failed to build form data: " + err.Error()
			return result, nil
		}
		bodyReader = reader
		resolvedHeaders["Content-Type"] = contentType
	} else {
		body := ""
		if req.Body.Valid {
			body, _ = re.variableResolver.Resolve(ctx, req.Body.String, runtimeVars)
		}
		bodyReader = bytes.NewBufferString(body)
	}

	// Create request
	httpReq, err := http.NewRequestWithContext(ctx, req.Method, resolvedURL, bodyReader)
	if err != nil {
		result.Error = err.Error()
		return result, nil
	}

	// Set headers
	for k, v := range resolvedHeaders {
		httpReq.Header.Set(k, v)
	}

	// Execute request
	start := time.Now()
	resp, err := client.Do(httpReq)
	duration := time.Since(start)
	result.DurationMs = duration.Milliseconds()

	if err != nil {
		result.Error = err.Error()
		re.saveHistory(ctx, req, result, nil)
		return result, nil
	}
	defer resp.Body.Close()

	// Read response
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Error = err.Error()
		return result, nil
	}

	result.StatusCode = resp.StatusCode
	result.Body = string(respBody)
	result.Headers = make(map[string]string)
	for k, v := range resp.Header {
		if len(v) > 0 {
			result.Headers[k] = v[0]
		}
	}

	// Save to history
	re.saveHistory(ctx, req, result, nil)

	return result, nil
}

func (re *RequestExecutor) createHTTPClient(ctx context.Context, proxyID sql.NullInt64) (*http.Client, error) {
	return CreateHTTPClient(ctx, re.queries, proxyID)
}

// CreateHTTPClient creates an HTTP client with optional proxy configuration.
// Shared by RequestExecutor and WebSocketRelay.
func CreateHTTPClient(ctx context.Context, queries *repository.Queries, proxyID sql.NullInt64) (*http.Client, error) {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	if !proxyID.Valid {
		// NULL → inherit global active proxy
		wsID := middleware.GetWorkspaceID(ctx)
		proxy, err := queries.GetActiveProxy(ctx, wsID)
		if err == nil && proxy.Url != "" {
			proxyURL, err := url.Parse(proxy.Url)
			if err == nil {
				transport.Proxy = http.ProxyURL(proxyURL)
			}
		}
	} else if proxyID.Int64 > 0 {
		// > 0 → use specific proxy
		proxy, err := queries.GetProxy(ctx, proxyID.Int64)
		if err == nil && proxy.Url != "" {
			proxyURL, err := url.Parse(proxy.Url)
			if err == nil {
				transport.Proxy = http.ProxyURL(proxyURL)
			}
		}
	}
	// proxyID.Int64 == 0 → no proxy (direct connection), transport.Proxy stays nil

	return &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
	}, nil
}

func (re *RequestExecutor) saveHistory(ctx context.Context, req repository.Request, result *ExecuteResult, flowID *int64) {
	reqHeaders, _ := json.Marshal(result.ResolvedHeaders)
	respHeaders, _ := json.Marshal(result.Headers)

	var fid sql.NullInt64
	if flowID != nil {
		fid = sql.NullInt64{Int64: *flowID, Valid: true}
	}

	body := ""
	if req.Body.Valid {
		body = req.Body.String
	}

	wsID := middleware.GetWorkspaceID(ctx)
	re.queries.CreateHistory(ctx, repository.CreateHistoryParams{
		RequestID:       sql.NullInt64{Int64: req.ID, Valid: req.ID != 0},
		FlowID:          fid,
		Method:          req.Method,
		Url:             result.ResolvedURL,
		RequestHeaders:  sql.NullString{String: string(reqHeaders), Valid: true},
		RequestBody:     sql.NullString{String: body, Valid: true},
		StatusCode:      sql.NullInt64{Int64: int64(result.StatusCode), Valid: result.StatusCode > 0},
		ResponseHeaders: sql.NullString{String: string(respHeaders), Valid: true},
		ResponseBody:    sql.NullString{String: result.Body, Valid: true},
		DurationMs:      sql.NullInt64{Int64: result.DurationMs, Valid: true},
		Error:           sql.NullString{String: result.Error, Valid: result.Error != ""},
		WorkspaceID:     wsID,
	})
}
