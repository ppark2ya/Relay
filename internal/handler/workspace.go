package handler

import (
	"net/http"

	"relay/internal/repository"
)

type WorkspaceHandler struct {
	queries *repository.Queries
}

func NewWorkspaceHandler(queries *repository.Queries) *WorkspaceHandler {
	return &WorkspaceHandler{queries: queries}
}

type WorkspaceRequest struct {
	Name string `json:"name"`
}

type WorkspaceResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func (h *WorkspaceHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaces, err := h.queries.ListWorkspaces(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]WorkspaceResponse, 0, len(workspaces))
	for _, ws := range workspaces {
		resp = append(resp, WorkspaceResponse{
			ID:        ws.ID,
			Name:      ws.Name,
			CreatedAt: formatTime(ws.CreatedAt),
			UpdatedAt: formatTime(ws.UpdatedAt),
		})
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *WorkspaceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	ws, err := h.queries.GetWorkspace(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Workspace not found")
		return
	}

	respondJSON(w, http.StatusOK, WorkspaceResponse{
		ID:        ws.ID,
		Name:      ws.Name,
		CreatedAt: formatTime(ws.CreatedAt),
		UpdatedAt: formatTime(ws.UpdatedAt),
	})
}

func (h *WorkspaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req WorkspaceRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ws, err := h.queries.CreateWorkspace(r.Context(), req.Name)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, WorkspaceResponse{
		ID:        ws.ID,
		Name:      ws.Name,
		CreatedAt: formatTime(ws.CreatedAt),
		UpdatedAt: formatTime(ws.UpdatedAt),
	})
}

func (h *WorkspaceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req WorkspaceRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	ws, err := h.queries.UpdateWorkspace(r.Context(), repository.UpdateWorkspaceParams{
		ID:   id,
		Name: req.Name,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, WorkspaceResponse{
		ID:        ws.ID,
		Name:      ws.Name,
		CreatedAt: formatTime(ws.CreatedAt),
		UpdatedAt: formatTime(ws.UpdatedAt),
	})
}

func (h *WorkspaceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	// Prevent deleting the default workspace
	if id == 1 {
		respondError(w, http.StatusBadRequest, "Cannot delete the default workspace")
		return
	}

	if err := h.queries.DeleteWorkspace(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
