package handler

import (
	"database/sql"
	"net/http"

	"relay/internal/repository"
	"relay/internal/service"
)

type FlowHandler struct {
	queries *repository.Queries
	runner  *service.FlowRunner
}

func NewFlowHandler(queries *repository.Queries, runner *service.FlowRunner) *FlowHandler {
	return &FlowHandler{queries: queries, runner: runner}
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
	RequestID   int64  `json:"requestId"`
	StepOrder   int64  `json:"stepOrder"`
	DelayMs     int64  `json:"delayMs"`
	ExtractVars string `json:"extractVars"`
	Condition   string `json:"condition"`
}

type FlowStepResponse struct {
	ID          int64  `json:"id"`
	FlowID      int64  `json:"flowId"`
	RequestID   int64  `json:"requestId"`
	StepOrder   int64  `json:"stepOrder"`
	DelayMs     int64  `json:"delayMs"`
	ExtractVars string `json:"extractVars"`
	Condition   string `json:"condition"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

func (h *FlowHandler) List(w http.ResponseWriter, r *http.Request) {
	flows, err := h.queries.ListFlows(r.Context())
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

	flow, err := h.queries.CreateFlow(r.Context(), repository.CreateFlowParams{
		Name:        req.Name,
		Description: sql.NullString{String: req.Description, Valid: req.Description != ""},
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

	result, err := h.runner.Run(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
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
		resp = append(resp, FlowStepResponse{
			ID:          s.ID,
			FlowID:      s.FlowID,
			RequestID:   s.RequestID,
			StepOrder:   s.StepOrder,
			DelayMs:     s.DelayMs.Int64,
			ExtractVars: s.ExtractVars.String,
			Condition:   s.Condition.String,
			CreatedAt:   formatTime(s.CreatedAt),
			UpdatedAt:   formatTime(s.UpdatedAt),
		})
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

	step, err := h.queries.CreateFlowStep(r.Context(), repository.CreateFlowStepParams{
		FlowID:      flowID,
		RequestID:   req.RequestID,
		StepOrder:   req.StepOrder,
		DelayMs:     sql.NullInt64{Int64: req.DelayMs, Valid: true},
		ExtractVars: sql.NullString{String: req.ExtractVars, Valid: true},
		Condition:   sql.NullString{String: req.Condition, Valid: req.Condition != ""},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, FlowStepResponse{
		ID:          step.ID,
		FlowID:      step.FlowID,
		RequestID:   step.RequestID,
		StepOrder:   step.StepOrder,
		DelayMs:     step.DelayMs.Int64,
		ExtractVars: step.ExtractVars.String,
		Condition:   step.Condition.String,
		CreatedAt:   formatTime(step.CreatedAt),
		UpdatedAt:   formatTime(step.UpdatedAt),
	})
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

	step, err := h.queries.UpdateFlowStep(r.Context(), repository.UpdateFlowStepParams{
		ID:          stepID,
		RequestID:   req.RequestID,
		StepOrder:   req.StepOrder,
		DelayMs:     sql.NullInt64{Int64: req.DelayMs, Valid: true},
		ExtractVars: sql.NullString{String: req.ExtractVars, Valid: true},
		Condition:   sql.NullString{String: req.Condition, Valid: req.Condition != ""},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, FlowStepResponse{
		ID:          step.ID,
		FlowID:      step.FlowID,
		RequestID:   step.RequestID,
		StepOrder:   step.StepOrder,
		DelayMs:     step.DelayMs.Int64,
		ExtractVars: step.ExtractVars.String,
		Condition:   step.Condition.String,
		CreatedAt:   formatTime(step.CreatedAt),
		UpdatedAt:   formatTime(step.UpdatedAt),
	})
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
