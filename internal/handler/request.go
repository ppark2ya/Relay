package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"relay/internal/middleware"
	"relay/internal/repository"
	"relay/internal/service"
)

type RequestHandler struct {
	queries  *repository.Queries
	executor *service.RequestExecutor
}

func NewRequestHandler(queries *repository.Queries, executor *service.RequestExecutor) *RequestHandler {
	return &RequestHandler{queries: queries, executor: executor}
}

type RequestRequest struct {
	CollectionID *int64 `json:"collectionId"`
	Name         string `json:"name"`
	Method       string `json:"method"`
	URL          string `json:"url"`
	Headers      string `json:"headers"`
	Body         string `json:"body"`
	BodyType     string `json:"bodyType"`
	Cookies      string `json:"cookies"`
	ProxyID      *int64 `json:"proxyId"`
}

type RequestResponse struct {
	ID           int64  `json:"id"`
	CollectionID *int64 `json:"collectionId,omitempty"`
	Name         string `json:"name"`
	Method       string `json:"method"`
	URL          string `json:"url"`
	Headers      string `json:"headers,omitempty"`
	Body         string `json:"body,omitempty"`
	BodyType     string `json:"bodyType,omitempty"`
	Cookies      string `json:"cookies,omitempty"`
	ProxyID      *int64 `json:"proxyId"`
	CreatedAt    string `json:"createdAt,omitempty"`
	UpdatedAt    string `json:"updatedAt,omitempty"`
}

type ExecuteRequest struct {
	Variables map[string]string `json:"variables"`
	// Inline overrides (optional) - use current form values without saving
	Method   string `json:"method,omitempty"`
	URL      string `json:"url,omitempty"`
	Headers  string `json:"headers,omitempty"`
	Body     string `json:"body,omitempty"`
	BodyType string `json:"bodyType,omitempty"`
	ProxyID  *int64 `json:"proxyId"`
}

type AdhocExecuteRequest struct {
	Method    string            `json:"method"`
	URL       string            `json:"url"`
	Headers   string            `json:"headers"`
	Body      string            `json:"body"`
	Variables map[string]string `json:"variables"`
	ProxyID   *int64            `json:"proxyId"`
}

func toRequestResponse(req repository.Request) RequestResponse {
	resp := RequestResponse{
		ID:        req.ID,
		Name:      req.Name,
		Method:    req.Method,
		URL:       req.Url,
		Headers:   req.Headers.String,
		Body:      req.Body.String,
		BodyType:  req.BodyType.String,
		Cookies:   req.Cookies.String,
		CreatedAt: formatTime(req.CreatedAt),
		UpdatedAt: formatTime(req.UpdatedAt),
	}
	if req.CollectionID.Valid {
		collID := req.CollectionID.Int64
		resp.CollectionID = &collID
	}
	if req.ProxyID.Valid {
		pid := req.ProxyID.Int64
		resp.ProxyID = &pid
	}
	return resp
}

func (h *RequestHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	requests, err := h.queries.ListRequests(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]RequestResponse, 0, len(requests))
	for _, req := range requests {
		resp = append(resp, toRequestResponse(req))
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *RequestHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	req, err := h.queries.GetRequest(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Request not found")
		return
	}

	respondJSON(w, http.StatusOK, toRequestResponse(req))
}

func (h *RequestHandler) Create(w http.ResponseWriter, r *http.Request) {
	var reqBody RequestRequest
	if err := decodeJSON(r, &reqBody); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var collectionID sql.NullInt64
	if reqBody.CollectionID != nil {
		collectionID = sql.NullInt64{Int64: *reqBody.CollectionID, Valid: true}
	}

	if reqBody.Headers == "" {
		reqBody.Headers = "{}"
	}
	if reqBody.BodyType == "" {
		reqBody.BodyType = "none"
	}
	if reqBody.Cookies == "" {
		reqBody.Cookies = "{}"
	}

	var proxyID sql.NullInt64
	if reqBody.ProxyID != nil {
		v := *reqBody.ProxyID
		if v == -1 {
			proxyID = sql.NullInt64{} // NULL = global inherit
		} else {
			proxyID = sql.NullInt64{Int64: v, Valid: true}
		}
	}

	wsID := middleware.GetWorkspaceID(r.Context())
	req, err := h.queries.CreateRequest(r.Context(), repository.CreateRequestParams{
		CollectionID: collectionID,
		Name:         reqBody.Name,
		Method:       reqBody.Method,
		Url:          reqBody.URL,
		Headers:      sql.NullString{String: reqBody.Headers, Valid: true},
		Body:         sql.NullString{String: reqBody.Body, Valid: reqBody.Body != ""},
		BodyType:     sql.NullString{String: reqBody.BodyType, Valid: true},
		Cookies:      sql.NullString{String: reqBody.Cookies, Valid: true},
		ProxyID:      proxyID,
		WorkspaceID:  wsID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, toRequestResponse(req))
}

func (h *RequestHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var reqBody RequestRequest
	if err := decodeJSON(r, &reqBody); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var collectionID sql.NullInt64
	if reqBody.CollectionID != nil {
		collectionID = sql.NullInt64{Int64: *reqBody.CollectionID, Valid: true}
	}

	var proxyID sql.NullInt64
	if reqBody.ProxyID != nil {
		v := *reqBody.ProxyID
		if v == -1 {
			proxyID = sql.NullInt64{} // NULL = global inherit
		} else {
			proxyID = sql.NullInt64{Int64: v, Valid: true}
		}
	}

	req, err := h.queries.UpdateRequest(r.Context(), repository.UpdateRequestParams{
		ID:           id,
		CollectionID: collectionID,
		Name:         reqBody.Name,
		Method:       reqBody.Method,
		Url:          reqBody.URL,
		Headers:      sql.NullString{String: reqBody.Headers, Valid: true},
		Body:         sql.NullString{String: reqBody.Body, Valid: reqBody.Body != ""},
		BodyType:     sql.NullString{String: reqBody.BodyType, Valid: true},
		Cookies:      sql.NullString{String: reqBody.Cookies, Valid: true},
		ProxyID:      proxyID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, toRequestResponse(req))
}

func (h *RequestHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	if err := h.queries.DeleteRequest(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *RequestHandler) Execute(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		h.executeMultipart(w, r, id)
		return
	}

	var execReq ExecuteRequest
	decodeJSON(r, &execReq) // OK if empty

	// Build inline overrides if provided
	var overrides *service.RequestOverrides
	if execReq.URL != "" || execReq.ProxyID != nil {
		overrides = &service.RequestOverrides{
			Method:   execReq.Method,
			URL:      execReq.URL,
			Headers:  execReq.Headers,
			Body:     execReq.Body,
			BodyType: execReq.BodyType,
			ProxyID:  execReq.ProxyID,
		}
	}

	result, err := h.executor.Execute(r.Context(), id, execReq.Variables, overrides)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
}

type formDataItemDTO struct {
	Key     string `json:"key"`
	Value   string `json:"value"`
	Type    string `json:"type"`
	Enabled bool   `json:"enabled"`
}

func (h *RequestHandler) executeMultipart(w http.ResponseWriter, r *http.Request, id int64) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Failed to parse multipart form: "+err.Error())
		return
	}

	// Parse _metadata
	var execReq ExecuteRequest
	if metaStr := r.FormValue("_metadata"); metaStr != "" {
		if err := json.Unmarshal([]byte(metaStr), &execReq); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid _metadata: "+err.Error())
			return
		}
	}

	// Parse _items
	var items []formDataItemDTO
	if itemsStr := r.FormValue("_items"); itemsStr != "" {
		if err := json.Unmarshal([]byte(itemsStr), &items); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid _items: "+err.Error())
			return
		}
	}

	// Read file parts
	formDataFiles := make(map[int]service.FormDataFile)
	for i, item := range items {
		if item.Type != "file" || !item.Enabled {
			continue
		}
		key := fmt.Sprintf("file_%d", i)
		file, header, err := r.FormFile(key)
		if err != nil {
			continue // File not provided for this item
		}
		data, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			continue
		}
		formDataFiles[i] = service.FormDataFile{
			Filename: header.Filename,
			Data:     data,
		}
	}

	// Build overrides
	overrides := &service.RequestOverrides{
		Method:        execReq.Method,
		URL:           execReq.URL,
		Headers:       execReq.Headers,
		Body:          r.FormValue("_items"), // Store items JSON as body
		BodyType:      "formdata",
		ProxyID:       execReq.ProxyID,
		FormDataFiles: formDataFiles,
	}

	result, err := h.executor.Execute(r.Context(), id, execReq.Variables, overrides)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
}

func (h *RequestHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	source, err := h.queries.GetRequest(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Request not found")
		return
	}

	req, err := h.queries.CreateRequest(r.Context(), repository.CreateRequestParams{
		CollectionID: source.CollectionID,
		Name:         source.Name + " (Copy)",
		Method:       source.Method,
		Url:          source.Url,
		Headers:      source.Headers,
		Body:         source.Body,
		BodyType:     source.BodyType,
		Cookies:      source.Cookies,
		ProxyID:      source.ProxyID,
		WorkspaceID:  source.WorkspaceID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, toRequestResponse(req))
}

func (h *RequestHandler) ExecuteAdhoc(w http.ResponseWriter, r *http.Request) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		h.executeAdhocMultipart(w, r)
		return
	}

	var reqBody AdhocExecuteRequest
	if err := decodeJSON(r, &reqBody); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if reqBody.URL == "" {
		respondError(w, http.StatusBadRequest, "URL is required")
		return
	}
	if reqBody.Method == "" {
		reqBody.Method = "GET"
	}

	result, err := h.executor.ExecuteAdhoc(r.Context(), reqBody.Method, reqBody.URL, reqBody.Headers, reqBody.Body, reqBody.Variables, reqBody.ProxyID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
}

func (h *RequestHandler) executeAdhocMultipart(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Failed to parse multipart form: "+err.Error())
		return
	}

	// Parse _metadata
	var meta struct {
		Method    string            `json:"method"`
		URL       string            `json:"url"`
		Headers   string            `json:"headers"`
		Variables map[string]string `json:"variables"`
		ProxyID   *int64            `json:"proxyId"`
	}
	if metaStr := r.FormValue("_metadata"); metaStr != "" {
		if err := json.Unmarshal([]byte(metaStr), &meta); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid _metadata: "+err.Error())
			return
		}
	}

	if meta.URL == "" {
		respondError(w, http.StatusBadRequest, "URL is required")
		return
	}
	if meta.Method == "" {
		meta.Method = "GET"
	}

	// Parse _items
	var items []formDataItemDTO
	if itemsStr := r.FormValue("_items"); itemsStr != "" {
		if err := json.Unmarshal([]byte(itemsStr), &items); err != nil {
			respondError(w, http.StatusBadRequest, "Invalid _items: "+err.Error())
			return
		}
	}

	// Read file parts
	formDataFiles := make(map[int]service.FormDataFile)
	for i, item := range items {
		if item.Type != "file" || !item.Enabled {
			continue
		}
		key := fmt.Sprintf("file_%d", i)
		file, header, err := r.FormFile(key)
		if err != nil {
			continue
		}
		data, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			continue
		}
		formDataFiles[i] = service.FormDataFile{
			Filename: header.Filename,
			Data:     data,
		}
	}

	itemsJSON := r.FormValue("_items")
	result, err := h.executor.ExecuteAdhocFormData(r.Context(), meta.Method, meta.URL, meta.Headers, itemsJSON, meta.Variables, meta.ProxyID, formDataFiles)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
}
