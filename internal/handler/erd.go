package handler

import (
	"database/sql"
	"net/http"

	"relay/internal/middleware"
	"relay/internal/repository"
	"relay/internal/service"
)

type ErdHandler struct {
	queries *repository.Queries
}

func NewErdHandler(queries *repository.Queries) *ErdHandler {
	return &ErdHandler{queries: queries}
}

type ErdRequest struct {
	Name string `json:"name"`
	DSL  string `json:"dsl"`
}

type ErdPreviewRequest struct {
	DSL string `json:"dsl"`
}

type ErdReorderRequest struct {
	Orders []struct {
		ID        int64 `json:"id"`
		SortOrder int64 `json:"sortOrder"`
	} `json:"orders"`
}

type ErdResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	DSL       string `json:"dsl"`
	SortOrder int64  `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type ErdPreviewResponse struct {
	Mermaid     string                  `json:"mermaid"`
	Diagram     *service.ErdDiagram     `json:"diagram,omitempty"`
	Diagnostics []service.ErdDiagnostic `json:"diagnostics"`
}

type ErdKotlinResponse struct {
	Files []service.GeneratedFile `json:"files"`
}

func (h *ErdHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	erds, err := h.queries.ListErdDocuments(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]ErdResponse, 0, len(erds))
	for _, erd := range erds {
		resp = append(resp, mapErdResponse(erd))
	}
	respondJSON(w, http.StatusOK, resp)
}

func (h *ErdHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	erd, err := h.queries.GetErdDocument(r.Context(), repository.GetErdDocumentParams{
		ID:          id,
		WorkspaceID: middleware.GetWorkspaceID(r.Context()),
	})
	if err != nil {
		respondError(w, http.StatusNotFound, "ERD not found")
		return
	}

	respondJSON(w, http.StatusOK, mapErdResponse(erd))
}

func (h *ErdHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req ErdRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "Name is required")
		return
	}
	if req.DSL == "" {
		req.DSL = `{"entities":[]}`
	}

	wsID := middleware.GetWorkspaceID(r.Context())
	maxOrder, err := h.queries.GetMaxErdDocumentSortOrder(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	erd, err := h.queries.CreateErdDocument(r.Context(), repository.CreateErdDocumentParams{
		WorkspaceID: wsID,
		Name:        req.Name,
		Dsl:         sql.NullString{String: req.DSL, Valid: true},
		SortOrder:   maxOrder + 1,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, mapErdResponse(erd))
}

func (h *ErdHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}
	var req ErdRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "Name is required")
		return
	}
	if req.DSL == "" {
		req.DSL = `{"entities":[]}`
	}

	erd, err := h.queries.UpdateErdDocument(r.Context(), repository.UpdateErdDocumentParams{
		ID:          id,
		WorkspaceID: middleware.GetWorkspaceID(r.Context()),
		Name:        req.Name,
		Dsl:         sql.NullString{String: req.DSL, Valid: true},
	})
	if err != nil {
		respondError(w, http.StatusNotFound, "ERD not found")
		return
	}

	respondJSON(w, http.StatusOK, mapErdResponse(erd))
}

func (h *ErdHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}
	if err := h.queries.DeleteErdDocument(r.Context(), repository.GetErdDocumentParams{
		ID:          id,
		WorkspaceID: middleware.GetWorkspaceID(r.Context()),
	}); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ErdHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}
	wsID := middleware.GetWorkspaceID(r.Context())
	source, err := h.queries.GetErdDocument(r.Context(), repository.GetErdDocumentParams{ID: id, WorkspaceID: wsID})
	if err != nil {
		respondError(w, http.StatusNotFound, "ERD not found")
		return
	}
	maxOrder, err := h.queries.GetMaxErdDocumentSortOrder(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	duplicated, err := h.queries.CreateErdDocument(r.Context(), repository.CreateErdDocumentParams{
		WorkspaceID: wsID,
		Name:        source.Name + " Copy",
		Dsl:         source.Dsl,
		SortOrder:   maxOrder + 1,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, mapErdResponse(duplicated))
}

func (h *ErdHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req ErdReorderRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	wsID := middleware.GetWorkspaceID(r.Context())
	for _, order := range req.Orders {
		if err := h.queries.UpdateErdDocumentSortOrder(r.Context(), repository.UpdateErdDocumentSortOrderParams{
			ID:          order.ID,
			WorkspaceID: wsID,
			SortOrder:   order.SortOrder,
		}); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ErdHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var req ErdPreviewRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	spec, diagnostics := service.ParseErdDSL(req.DSL)
	if diagnostics == nil {
		diagnostics = []service.ErdDiagnostic{}
	}
	resp := ErdPreviewResponse{Diagnostics: diagnostics}
	if len(diagnostics) == 0 {
		resp.Mermaid = service.GenerateMermaidERD(spec)
		diagram := service.GenerateErdDiagram(spec)
		resp.Diagram = &diagram
	}
	respondJSON(w, http.StatusOK, resp)
}

func (h *ErdHandler) GenerateKotlin(w http.ResponseWriter, r *http.Request) {
	var req ErdPreviewRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	spec, diagnostics := service.ParseErdDSL(req.DSL)
	if len(diagnostics) > 0 {
		respondJSON(w, http.StatusBadRequest, ErdPreviewResponse{Diagnostics: diagnostics})
		return
	}
	respondJSON(w, http.StatusOK, ErdKotlinResponse{Files: service.GenerateKotlinEntities(spec)})
}

func mapErdResponse(erd repository.ErdDocument) ErdResponse {
	return ErdResponse{
		ID:        erd.ID,
		Name:      erd.Name,
		DSL:       erd.Dsl.String,
		SortOrder: erd.SortOrder,
		CreatedAt: formatTime(erd.CreatedAt),
		UpdatedAt: formatTime(erd.UpdatedAt),
	}
}
