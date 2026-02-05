package handler

import (
	"database/sql"
	"net/http"

	"reley/internal/repository"
	"reley/internal/service"
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
	CreatedAt    string `json:"createdAt,omitempty"`
	UpdatedAt    string `json:"updatedAt,omitempty"`
}

type ExecuteRequest struct {
	Variables map[string]string `json:"variables"`
}

func (h *RequestHandler) List(w http.ResponseWriter, r *http.Request) {
	requests, err := h.queries.ListRequests(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]RequestResponse, 0, len(requests))
	for _, req := range requests {
		item := RequestResponse{
			ID:        req.ID,
			Name:      req.Name,
			Method:    req.Method,
			URL:       req.Url,
			Headers:   req.Headers.String,
			Body:      req.Body.String,
			BodyType:  req.BodyType.String,
			CreatedAt: formatTime(req.CreatedAt),
			UpdatedAt: formatTime(req.UpdatedAt),
		}
		if req.CollectionID.Valid {
			collID := req.CollectionID.Int64
			item.CollectionID = &collID
		}
		resp = append(resp, item)
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

	resp := RequestResponse{
		ID:        req.ID,
		Name:      req.Name,
		Method:    req.Method,
		URL:       req.Url,
		Headers:   req.Headers.String,
		Body:      req.Body.String,
		BodyType:  req.BodyType.String,
		CreatedAt: formatTime(req.CreatedAt),
		UpdatedAt: formatTime(req.UpdatedAt),
	}
	if req.CollectionID.Valid {
		collID := req.CollectionID.Int64
		resp.CollectionID = &collID
	}

	respondJSON(w, http.StatusOK, resp)
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

	req, err := h.queries.CreateRequest(r.Context(), repository.CreateRequestParams{
		CollectionID: collectionID,
		Name:         reqBody.Name,
		Method:       reqBody.Method,
		Url:          reqBody.URL,
		Headers:      sql.NullString{String: reqBody.Headers, Valid: true},
		Body:         sql.NullString{String: reqBody.Body, Valid: reqBody.Body != ""},
		BodyType:     sql.NullString{String: reqBody.BodyType, Valid: true},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := RequestResponse{
		ID:        req.ID,
		Name:      req.Name,
		Method:    req.Method,
		URL:       req.Url,
		Headers:   req.Headers.String,
		Body:      req.Body.String,
		BodyType:  req.BodyType.String,
		CreatedAt: formatTime(req.CreatedAt),
		UpdatedAt: formatTime(req.UpdatedAt),
	}
	if req.CollectionID.Valid {
		collID := req.CollectionID.Int64
		resp.CollectionID = &collID
	}

	respondJSON(w, http.StatusCreated, resp)
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

	req, err := h.queries.UpdateRequest(r.Context(), repository.UpdateRequestParams{
		ID:           id,
		CollectionID: collectionID,
		Name:         reqBody.Name,
		Method:       reqBody.Method,
		Url:          reqBody.URL,
		Headers:      sql.NullString{String: reqBody.Headers, Valid: true},
		Body:         sql.NullString{String: reqBody.Body, Valid: reqBody.Body != ""},
		BodyType:     sql.NullString{String: reqBody.BodyType, Valid: true},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := RequestResponse{
		ID:        req.ID,
		Name:      req.Name,
		Method:    req.Method,
		URL:       req.Url,
		Headers:   req.Headers.String,
		Body:      req.Body.String,
		BodyType:  req.BodyType.String,
		CreatedAt: formatTime(req.CreatedAt),
		UpdatedAt: formatTime(req.UpdatedAt),
	}
	if req.CollectionID.Valid {
		collID := req.CollectionID.Int64
		resp.CollectionID = &collID
	}

	respondJSON(w, http.StatusOK, resp)
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

	var execReq ExecuteRequest
	decodeJSON(r, &execReq) // OK if empty

	result, err := h.executor.Execute(r.Context(), id, execReq.Variables)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
}
