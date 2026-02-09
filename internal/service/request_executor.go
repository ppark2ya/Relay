package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/base64"
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
	fileStorage      *FileStorage
}

func NewRequestExecutor(queries *repository.Queries, vr *VariableResolver, fs *FileStorage) *RequestExecutor {
	return &RequestExecutor{
		queries:          queries,
		variableResolver: vr,
		fileStorage:      fs,
	}
}

type ExecuteResult struct {
	StatusCode        int                 `json:"statusCode"`
	Headers           map[string]string   `json:"headers"`
	MultiValueHeaders map[string][]string `json:"multiValueHeaders,omitempty"`
	Body              string              `json:"body"`
	BodyBase64        string              `json:"bodyBase64,omitempty"`
	BodySize          int64               `json:"bodySize"`
	IsBinary          bool                `json:"isBinary,omitempty"`
	DurationMs        int64               `json:"durationMs"`
	Error             string              `json:"error,omitempty"`
	ResolvedURL       string              `json:"resolvedUrl"`
	ResolvedHeaders   map[string]string   `json:"resolvedHeaders"`
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
	Key      string `json:"key"`
	Value    string `json:"value"`
	Type     string `json:"type"`
	Enabled  bool   `json:"enabled"`
	FileID   *int64 `json:"fileId,omitempty"`
	FileSize *int64 `json:"fileSize,omitempty"`
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
			if !ok && item.FileID != nil && re.fileStorage != nil {
				// Load from disk via fileId
				uploaded, err := re.queries.GetUploadedFile(ctx, *item.FileID)
				if err == nil {
					data, err := re.fileStorage.Load(uploaded.StoredName)
					if err == nil {
						fd = FormDataFile{Filename: uploaded.OriginalName, Data: data}
						ok = true
					}
				}
			}
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

// buildCookieHeader parses the cookies JSON (same format as headers: {"name": {"value": "val", "enabled": true}})
// and builds a Cookie header string like "name1=val1; name2=val2".
func (re *RequestExecutor) buildCookieHeader(ctx context.Context, cookiesJSON string, runtimeVars map[string]string) string {
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal([]byte(cookiesJSON), &parsed); err != nil {
		return ""
	}

	var pairs []string
	for name, raw := range parsed {
		var obj struct {
			Value   string `json:"value"`
			Enabled bool   `json:"enabled"`
		}
		if err := json.Unmarshal(raw, &obj); err != nil {
			// Try plain string value
			var strVal string
			if err2 := json.Unmarshal(raw, &strVal); err2 != nil {
				continue
			}
			resolved, _ := re.variableResolver.Resolve(ctx, strVal, runtimeVars)
			pairs = append(pairs, name+"="+resolved)
			continue
		}
		if !obj.Enabled {
			continue
		}
		resolved, _ := re.variableResolver.Resolve(ctx, obj.Value, runtimeVars)
		pairs = append(pairs, name+"="+resolved)
	}
	return strings.Join(pairs, "; ")
}

// isTextContentType returns true if the Content-Type indicates a text-based response.
func isTextContentType(ct string) bool {
	ct = strings.ToLower(ct)
	if strings.HasPrefix(ct, "text/") {
		return true
	}
	textTypes := []string{
		"application/json", "application/xml", "application/javascript",
		"application/ecmascript", "application/x-javascript",
		"application/xhtml+xml", "application/soap+xml",
		"application/graphql",
	}
	for _, t := range textTypes {
		if strings.Contains(ct, t) {
			return true
		}
	}
	textSubstrings := []string{
		"+json", "+xml", "yaml", "csv", "html", "css", "svg",
		"text", "urlencoded",
	}
	for _, s := range textSubstrings {
		if strings.Contains(ct, s) {
			return true
		}
	}
	if strings.HasPrefix(ct, "multipart/") {
		return true
	}
	return false
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

		// Auto-set Content-Type based on body type if not already set
		if _, hasContentType := resolvedHeaders["Content-Type"]; !hasContentType && bodyType != "" && bodyType != "none" {
			switch bodyType {
			case "json", "graphql":
				resolvedHeaders["Content-Type"] = "application/json"
			case "xml":
				resolvedHeaders["Content-Type"] = "application/xml"
			case "text":
				resolvedHeaders["Content-Type"] = "text/plain"
			case "form-urlencoded":
				resolvedHeaders["Content-Type"] = "application/x-www-form-urlencoded"
			}
		}
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

	// Merge cookies from cookies field into Cookie header
	if req.Cookies.Valid && req.Cookies.String != "" && req.Cookies.String != "{}" {
		cookiePairs := re.buildCookieHeader(ctx, req.Cookies.String, runtimeVars)
		if cookiePairs != "" {
			existing := httpReq.Header.Get("Cookie")
			if existing != "" {
				httpReq.Header.Set("Cookie", existing+"; "+cookiePairs)
			} else {
				httpReq.Header.Set("Cookie", cookiePairs)
			}
		}
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

	// Read response (limit to 50MB)
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
	if err != nil {
		result.Error = err.Error()
		return result, nil
	}

	result.StatusCode = resp.StatusCode
	result.BodySize = int64(len(respBody))
	result.Headers = make(map[string]string)
	result.MultiValueHeaders = make(map[string][]string)
	for k, v := range resp.Header {
		if len(v) > 0 {
			result.Headers[k] = v[0]
		}
		if len(v) > 1 || strings.EqualFold(k, "Set-Cookie") {
			result.MultiValueHeaders[k] = v
		}
	}

	// Detect binary vs text based on Content-Type
	ct := resp.Header.Get("Content-Type")
	if ct == "" || isTextContentType(ct) {
		result.Body = string(respBody)
	} else {
		result.IsBinary = true
		result.BodyBase64 = base64.StdEncoding.EncodeToString(respBody)
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

	// For binary responses, store base64 in history; for text, store body as-is
	responseBody := result.Body
	if result.IsBinary {
		responseBody = result.BodyBase64
	}

	var isBinaryInt int64
	if result.IsBinary {
		isBinaryInt = 1
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
		ResponseBody:    sql.NullString{String: responseBody, Valid: true},
		DurationMs:      sql.NullInt64{Int64: result.DurationMs, Valid: true},
		Error:           sql.NullString{String: result.Error, Valid: result.Error != ""},
		BodySize:        sql.NullInt64{Int64: result.BodySize, Valid: true},
		IsBinary:        sql.NullInt64{Int64: isBinaryInt, Valid: true},
		WorkspaceID:     wsID,
	})
}
