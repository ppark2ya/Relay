package handler

import (
	"database/sql"
	"net/http"

	"reley/internal/repository"
)

type EnvironmentHandler struct {
	queries *repository.Queries
}

func NewEnvironmentHandler(queries *repository.Queries) *EnvironmentHandler {
	return &EnvironmentHandler{queries: queries}
}

type EnvironmentRequest struct {
	Name      string `json:"name"`
	Variables string `json:"variables"`
}

type EnvironmentResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Variables string `json:"variables"`
	IsActive  bool   `json:"isActive"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func (h *EnvironmentHandler) List(w http.ResponseWriter, r *http.Request) {
	envs, err := h.queries.ListEnvironments(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]EnvironmentResponse, 0, len(envs))
	for _, env := range envs {
		resp = append(resp, EnvironmentResponse{
			ID:        env.ID,
			Name:      env.Name,
			Variables: env.Variables.String,
			IsActive:  env.IsActive.Valid && env.IsActive.Bool,
			CreatedAt: formatTime(env.CreatedAt),
			UpdatedAt: formatTime(env.UpdatedAt),
		})
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *EnvironmentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	env, err := h.queries.GetEnvironment(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Environment not found")
		return
	}

	respondJSON(w, http.StatusOK, EnvironmentResponse{
		ID:        env.ID,
		Name:      env.Name,
		Variables: env.Variables.String,
		IsActive:  env.IsActive.Valid && env.IsActive.Bool,
		CreatedAt: formatTime(env.CreatedAt),
		UpdatedAt: formatTime(env.UpdatedAt),
	})
}

func (h *EnvironmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req EnvironmentRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Variables == "" {
		req.Variables = "{}"
	}

	env, err := h.queries.CreateEnvironment(r.Context(), repository.CreateEnvironmentParams{
		Name:      req.Name,
		Variables: sql.NullString{String: req.Variables, Valid: true},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, EnvironmentResponse{
		ID:        env.ID,
		Name:      env.Name,
		Variables: env.Variables.String,
		IsActive:  env.IsActive.Valid && env.IsActive.Bool,
		CreatedAt: formatTime(env.CreatedAt),
		UpdatedAt: formatTime(env.UpdatedAt),
	})
}

func (h *EnvironmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req EnvironmentRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	env, err := h.queries.UpdateEnvironment(r.Context(), repository.UpdateEnvironmentParams{
		ID:        id,
		Name:      req.Name,
		Variables: sql.NullString{String: req.Variables, Valid: true},
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, EnvironmentResponse{
		ID:        env.ID,
		Name:      env.Name,
		Variables: env.Variables.String,
		IsActive:  env.IsActive.Valid && env.IsActive.Bool,
		CreatedAt: formatTime(env.CreatedAt),
		UpdatedAt: formatTime(env.UpdatedAt),
	})
}

func (h *EnvironmentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	if err := h.queries.DeleteEnvironment(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *EnvironmentHandler) Activate(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	// Deactivate all first
	h.queries.DeactivateAllEnvironments(r.Context())

	env, err := h.queries.ActivateEnvironment(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, EnvironmentResponse{
		ID:        env.ID,
		Name:      env.Name,
		Variables: env.Variables.String,
		IsActive:  true,
		CreatedAt: formatTime(env.CreatedAt),
		UpdatedAt: formatTime(env.UpdatedAt),
	})
}
