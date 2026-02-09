package handler

import (
	"database/sql"
	"net/http"

	"relay/internal/middleware"
	"relay/internal/repository"
	"relay/internal/service"
)

type FlowHandler struct {
	queries *repository.Queries
	runner  *service.FlowRunner
	db      *sql.DB
}

func NewFlowHandler(queries *repository.Queries, runner *service.FlowRunner, db *sql.DB) *FlowHandler {
	return &FlowHandler{queries: queries, runner: runner, db: db}
}

type FlowRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type FlowResponse struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type FlowStepRequest struct {
	RequestID   *int64 `json:"requestId"`
	StepOrder   int64  `json:"stepOrder"`
	DelayMs     int64  `json:"delayMs"`
	ExtractVars string `json:"extractVars"`
	Condition   string `json:"condition"`
	Name        string `json:"name"`
	Method      string `json:"method"`
	URL         string `json:"url"`
	Headers     string `json:"headers"`
	Body        string `json:"body"`
	BodyType    string `json:"bodyType"`
	Cookies     string `json:"cookies"`
	ProxyID     *int64 `json:"proxyId"`
	LoopCount   int64  `json:"loopCount"`
}

type RunFlowRequest struct {
	StepIDs []int64 `json:"stepIds"`
}

type FlowStepResponse struct {
	ID          int64  `json:"id"`
	FlowID      int64  `json:"flowId"`
	RequestID   *int64 `json:"requestId"`
	StepOrder   int64  `json:"stepOrder"`
	DelayMs     int64  `json:"delayMs"`
	ExtractVars string `json:"extractVars"`
	Condition   string `json:"condition"`
	Name        string `json:"name"`
	Method      string `json:"method"`
	URL         string `json:"url"`
	Headers     string `json:"headers"`
	Body        string `json:"body"`
	BodyType    string `json:"bodyType"`
	Cookies     string `json:"cookies"`
	ProxyID     *int64 `json:"proxyId"`
	LoopCount   int64  `json:"loopCount"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

func toFlowStepResponse(s repository.FlowStep) FlowStepResponse {
	var reqID *int64
	if s.RequestID.Valid {
		reqID = &s.RequestID.Int64
	}
	var proxyID *int64
	if s.ProxyID.Valid {
		pid := s.ProxyID.Int64
		proxyID = &pid
	}
	loopCount := s.LoopCount.Int64
	if loopCount < 1 {
		loopCount = 1
	}
	return FlowStepResponse{
		ID:          s.ID,
		FlowID:      s.FlowID,
		RequestID:   reqID,
		StepOrder:   s.StepOrder,
		DelayMs:     s.DelayMs.Int64,
		ExtractVars: s.ExtractVars.String,
		Condition:   s.Condition.String,
		Name:        s.Name,
		Method:      s.Method,
		URL:         s.Url,
		Headers:     s.Headers.String,
		Body:        s.Body.String,
		BodyType:    s.BodyType.String,
		Cookies:     s.Cookies.String,
		ProxyID:     proxyID,
		LoopCount:   loopCount,
		CreatedAt:   formatTime(s.CreatedAt),
		UpdatedAt:   formatTime(s.UpdatedAt),
	}
}

func (h *FlowHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	flows, err := h.queries.ListFlows(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]FlowResponse, 0, len(flows))
	for _, f := range flows {
		resp = append(resp, FlowResponse{
			ID:          f.ID,
			Name:        f.Name,
			Description: f.Description.String,
			CreatedAt:   formatTime(f.CreatedAt),
			UpdatedAt:   formatTime(f.UpdatedAt),
		})
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *FlowHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	flow, err := h.queries.GetFlow(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Flow not found")
		return
	}

	respondJSON(w, http.StatusOK, FlowResponse{
		ID:          flow.ID,
		Name:        flow.Name,
		Description: flow.Description.String,
		CreatedAt:   formatTime(flow.CreatedAt),
		UpdatedAt:   formatTime(flow.UpdatedAt),
	})
}

func (h *FlowHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req FlowRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	wsID := middleware.GetWorkspaceID(r.Context())
	flow, err := h.queries.CreateFlow(r.Context(), repository.CreateFlowParams{
		Name:        req.Name,
		Description: sql.NullString{String: req.Description, Valid: req.Description != ""},
		WorkspaceID: wsID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, FlowResponse{
		ID:          flow.ID,
		Name:        flow.Name,
		Description: flow.Description.String,
		CreatedAt:   formatTime(flow.CreatedAt),
		UpdatedAt:   formatTime(flow.UpdatedAt),
	})
}

func (h *FlowHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req FlowRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	flow, err := h.queries.UpdateFlow(r.Context(), repository.UpdateFlowParams{
		ID:          id,
		Name:        req.Name,
		Description: sql.NullString{String: req.Description, Valid: req.Description != ""},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, FlowResponse{
		ID:          flow.ID,
		Name:        flow.Name,
		Description: flow.Description.String,
		CreatedAt:   formatTime(flow.CreatedAt),
		UpdatedAt:   formatTime(flow.UpdatedAt),
	})
}

func (h *FlowHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	if err := h.queries.DeleteFlow(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *FlowHandler) Run(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req RunFlowRequest
	if err := decodeJSON(r, &req); err != nil {
		// Ignore decode error for backwards compatibility (empty body)
		req.StepIDs = nil
	}

	result, err := h.runner.Run(r.Context(), id, req.StepIDs)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
}

func (h *FlowHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	source, err := h.queries.GetFlow(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Flow not found")
		return
	}

	steps, err := h.queries.ListFlowSteps(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	txQueries := h.queries.WithTx(tx)

	newFlow, err := txQueries.CreateFlow(r.Context(), repository.CreateFlowParams{
		Name:        source.Name + " (Copy)",
		Description: source.Description,
		WorkspaceID: source.WorkspaceID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for _, s := range steps {
		_, err := txQueries.CreateFlowStep(r.Context(), repository.CreateFlowStepParams{
			FlowID:      newFlow.ID,
			RequestID:   s.RequestID,
			StepOrder:   s.StepOrder,
			DelayMs:     s.DelayMs,
			ExtractVars: s.ExtractVars,
			Condition:   s.Condition,
			Name:        s.Name,
			Method:      s.Method,
			Url:         s.Url,
			Headers:     s.Headers,
			Body:        s.Body,
			BodyType:    s.BodyType,
			Cookies:     s.Cookies,
			ProxyID:     s.ProxyID,
			LoopCount:   s.LoopCount,
		})
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, FlowResponse{
		ID:          newFlow.ID,
		Name:        newFlow.Name,
		Description: newFlow.Description.String,
		CreatedAt:   formatTime(newFlow.CreatedAt),
		UpdatedAt:   formatTime(newFlow.UpdatedAt),
	})
}

func (h *FlowHandler) ListSteps(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	steps, err := h.queries.ListFlowSteps(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]FlowStepResponse, 0, len(steps))
	for _, s := range steps {
		resp = append(resp, toFlowStepResponse(s))
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *FlowHandler) CreateStep(w http.ResponseWriter, r *http.Request) {
	flowID, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid flow ID")
		return
	}

	var req FlowStepRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.ExtractVars == "" {
		req.ExtractVars = "{}"
	}
	if req.Method == "" {
		req.Method = "GET"
	}
	if req.Headers == "" {
		req.Headers = "{}"
	}
	if req.BodyType == "" {
		req.BodyType = "none"
	}

	var reqID sql.NullInt64
	if req.RequestID != nil {
		reqID = sql.NullInt64{Int64: *req.RequestID, Valid: true}
	}

	var proxyID sql.NullInt64
	if req.ProxyID != nil {
		v := *req.ProxyID
		if v == -1 {
			proxyID = sql.NullInt64{}
		} else {
			proxyID = sql.NullInt64{Int64: v, Valid: true}
		}
	}

	if req.Cookies == "" {
		req.Cookies = "{}"
	}

	loopCount := req.LoopCount
	if loopCount < 1 {
		loopCount = 1
	}

	step, err := h.queries.CreateFlowStep(r.Context(), repository.CreateFlowStepParams{
		FlowID:      flowID,
		RequestID:   reqID,
		StepOrder:   req.StepOrder,
		DelayMs:     sql.NullInt64{Int64: req.DelayMs, Valid: true},
		ExtractVars: sql.NullString{String: req.ExtractVars, Valid: true},
		Condition:   sql.NullString{String: req.Condition, Valid: req.Condition != ""},
		Name:        req.Name,
		Method:      req.Method,
		Url:         req.URL,
		Headers:     sql.NullString{String: req.Headers, Valid: true},
		Body:        sql.NullString{String: req.Body, Valid: true},
		BodyType:    sql.NullString{String: req.BodyType, Valid: true},
		Cookies:     sql.NullString{String: req.Cookies, Valid: true},
		ProxyID:     proxyID,
		LoopCount:   sql.NullInt64{Int64: loopCount, Valid: true},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, toFlowStepResponse(step))
}

func (h *FlowHandler) UpdateStep(w http.ResponseWriter, r *http.Request) {
	stepID, err := parseID(r, "stepId")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid step ID")
		return
	}

	var req FlowStepRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var reqID sql.NullInt64
	if req.RequestID != nil {
		reqID = sql.NullInt64{Int64: *req.RequestID, Valid: true}
	}

	var proxyID sql.NullInt64
	if req.ProxyID != nil {
		v := *req.ProxyID
		if v == -1 {
			proxyID = sql.NullInt64{}
		} else {
			proxyID = sql.NullInt64{Int64: v, Valid: true}
		}
	}

	loopCount := req.LoopCount
	if loopCount < 1 {
		loopCount = 1
	}

	step, err := h.queries.UpdateFlowStep(r.Context(), repository.UpdateFlowStepParams{
		ID:          stepID,
		RequestID:   reqID,
		StepOrder:   req.StepOrder,
		DelayMs:     sql.NullInt64{Int64: req.DelayMs, Valid: true},
		ExtractVars: sql.NullString{String: req.ExtractVars, Valid: true},
		Condition:   sql.NullString{String: req.Condition, Valid: req.Condition != ""},
		Name:        req.Name,
		Method:      req.Method,
		Url:         req.URL,
		Headers:     sql.NullString{String: req.Headers, Valid: true},
		Body:        sql.NullString{String: req.Body, Valid: true},
		BodyType:    sql.NullString{String: req.BodyType, Valid: true},
		Cookies:     sql.NullString{String: req.Cookies, Valid: true},
		ProxyID:     proxyID,
		LoopCount:   sql.NullInt64{Int64: loopCount, Valid: true},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, toFlowStepResponse(step))
}

func (h *FlowHandler) DeleteStep(w http.ResponseWriter, r *http.Request) {
	stepID, err := parseID(r, "stepId")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid step ID")
		return
	}

	if err := h.queries.DeleteFlowStep(r.Context(), stepID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
