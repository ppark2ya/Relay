package handler

import (
	"net/http"

	"relay/internal/middleware"
	"relay/internal/repository"
)

type HistoryHandler struct {
	queries *repository.Queries
}

func NewHistoryHandler(queries *repository.Queries) *HistoryHandler {
	return &HistoryHandler{queries: queries}
}

type HistoryResponse struct {
	ID              int64  `json:"id"`
	RequestID       *int64 `json:"requestId,omitempty"`
	FlowID          *int64 `json:"flowId,omitempty"`
	Method          string `json:"method"`
	URL             string `json:"url"`
	RequestHeaders  string `json:"requestHeaders"`
	RequestBody     string `json:"requestBody"`
	StatusCode      *int64 `json:"statusCode,omitempty"`
	ResponseHeaders string `json:"responseHeaders"`
	ResponseBody    string `json:"responseBody"`
	DurationMs      *int64 `json:"durationMs,omitempty"`
	Error           string `json:"error,omitempty"`
	CreatedAt       string `json:"createdAt"`
}

func (h *HistoryHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	history, err := h.queries.ListHistory(r.Context(), repository.ListHistoryParams{
		WorkspaceID: wsID,
		Limit:       100,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]HistoryResponse, 0, len(history))
	for _, hist := range history {
		item := HistoryResponse{
			ID:              hist.ID,
			Method:          hist.Method,
			URL:             hist.Url,
			RequestHeaders:  hist.RequestHeaders.String,
			RequestBody:     hist.RequestBody.String,
			ResponseHeaders: hist.ResponseHeaders.String,
			ResponseBody:    hist.ResponseBody.String,
			Error:           hist.Error.String,
			CreatedAt:       formatTime(hist.CreatedAt),
		}
		if hist.RequestID.Valid {
			reqID := hist.RequestID.Int64
			item.RequestID = &reqID
		}
		if hist.FlowID.Valid {
			flowID := hist.FlowID.Int64
			item.FlowID = &flowID
		}
		if hist.StatusCode.Valid {
			code := hist.StatusCode.Int64
			item.StatusCode = &code
		}
		if hist.DurationMs.Valid {
			duration := hist.DurationMs.Int64
			item.DurationMs = &duration
		}
		resp = append(resp, item)
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *HistoryHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	hist, err := h.queries.GetHistory(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "History not found")
		return
	}

	item := HistoryResponse{
		ID:              hist.ID,
		Method:          hist.Method,
		URL:             hist.Url,
		RequestHeaders:  hist.RequestHeaders.String,
		RequestBody:     hist.RequestBody.String,
		ResponseHeaders: hist.ResponseHeaders.String,
		ResponseBody:    hist.ResponseBody.String,
		Error:           hist.Error.String,
		CreatedAt:       formatTime(hist.CreatedAt),
	}
	if hist.RequestID.Valid {
		reqID := hist.RequestID.Int64
		item.RequestID = &reqID
	}
	if hist.FlowID.Valid {
		flowID := hist.FlowID.Int64
		item.FlowID = &flowID
	}
	if hist.StatusCode.Valid {
		code := hist.StatusCode.Int64
		item.StatusCode = &code
	}
	if hist.DurationMs.Valid {
		duration := hist.DurationMs.Int64
		item.DurationMs = &duration
	}

	respondJSON(w, http.StatusOK, item)
}

func (h *HistoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	if err := h.queries.DeleteHistory(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
