package handler

import (
	"database/sql"
	"net/http"

	"reley/internal/repository"
)

type CollectionHandler struct {
	queries *repository.Queries
}

func NewCollectionHandler(queries *repository.Queries) *CollectionHandler {
	return &CollectionHandler{queries: queries}
}

type CollectionRequest struct {
	Name     string `json:"name"`
	ParentID *int64 `json:"parentId"`
}

type CollectionResponse struct {
	ID        int64                `json:"id"`
	Name      string               `json:"name"`
	ParentID  *int64               `json:"parentId"`
	Children  []CollectionResponse `json:"children,omitempty"`
	Requests  []RequestResponse    `json:"requests,omitempty"`
	CreatedAt string               `json:"createdAt"`
	UpdatedAt string               `json:"updatedAt"`
}

func (h *CollectionHandler) List(w http.ResponseWriter, r *http.Request) {
	collections, err := h.queries.ListCollections(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Build tree structure
	collectionMap := make(map[int64]*CollectionResponse)
	var roots []CollectionResponse

	// First pass: create all collection responses
	for _, c := range collections {
		resp := CollectionResponse{
			ID:        c.ID,
			Name:      c.Name,
			Children:  []CollectionResponse{},
			Requests:  []RequestResponse{},
			CreatedAt: formatTime(c.CreatedAt),
			UpdatedAt: formatTime(c.UpdatedAt),
		}
		if c.ParentID.Valid {
			parentID := c.ParentID.Int64
			resp.ParentID = &parentID
		}
		collectionMap[c.ID] = &resp
	}

	// Second pass: build tree
	for _, resp := range collectionMap {
		if resp.ParentID != nil {
			if parent, ok := collectionMap[*resp.ParentID]; ok {
				parent.Children = append(parent.Children, *resp)
			}
		} else {
			roots = append(roots, *resp)
		}
	}

	// Get requests for each collection
	requests, _ := h.queries.ListRequests(r.Context())
	for _, req := range requests {
		if req.CollectionID.Valid {
			if coll, ok := collectionMap[req.CollectionID.Int64]; ok {
				coll.Requests = append(coll.Requests, RequestResponse{
					ID:     req.ID,
					Name:   req.Name,
					Method: req.Method,
					URL:    req.Url,
				})
			}
		}
	}

	if roots == nil {
		roots = []CollectionResponse{}
	}

	respondJSON(w, http.StatusOK, roots)
}

func (h *CollectionHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	collection, err := h.queries.GetCollection(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Collection not found")
		return
	}

	resp := CollectionResponse{
		ID:        collection.ID,
		Name:      collection.Name,
		CreatedAt: formatTime(collection.CreatedAt),
		UpdatedAt: formatTime(collection.UpdatedAt),
	}
	if collection.ParentID.Valid {
		parentID := collection.ParentID.Int64
		resp.ParentID = &parentID
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *CollectionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CollectionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var parentID sql.NullInt64
	if req.ParentID != nil {
		parentID = sql.NullInt64{Int64: *req.ParentID, Valid: true}
	}

	collection, err := h.queries.CreateCollection(r.Context(), repository.CreateCollectionParams{
		Name:     req.Name,
		ParentID: parentID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := CollectionResponse{
		ID:        collection.ID,
		Name:      collection.Name,
		CreatedAt: formatTime(collection.CreatedAt),
		UpdatedAt: formatTime(collection.UpdatedAt),
	}
	if collection.ParentID.Valid {
		parentID := collection.ParentID.Int64
		resp.ParentID = &parentID
	}

	respondJSON(w, http.StatusCreated, resp)
}

func (h *CollectionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req CollectionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var parentID sql.NullInt64
	if req.ParentID != nil {
		parentID = sql.NullInt64{Int64: *req.ParentID, Valid: true}
	}

	collection, err := h.queries.UpdateCollection(r.Context(), repository.UpdateCollectionParams{
		ID:       id,
		Name:     req.Name,
		ParentID: parentID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := CollectionResponse{
		ID:        collection.ID,
		Name:      collection.Name,
		CreatedAt: formatTime(collection.CreatedAt),
		UpdatedAt: formatTime(collection.UpdatedAt),
	}
	if collection.ParentID.Valid {
		parentID := collection.ParentID.Int64
		resp.ParentID = &parentID
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *CollectionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	if err := h.queries.DeleteCollection(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
