package handler

import (
	"context"
	"database/sql"
	"net/http"

	"relay/internal/repository"
)

type CollectionHandler struct {
	queries *repository.Queries
	db      *sql.DB
}

func NewCollectionHandler(queries *repository.Queries, db *sql.DB) *CollectionHandler {
	return &CollectionHandler{queries: queries, db: db}
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

	// Get all requests
	requests, _ := h.queries.ListRequests(r.Context())

	// Build request map by collection ID
	requestsByCollection := make(map[int64][]RequestResponse)
	for _, req := range requests {
		if req.CollectionID.Valid {
			collID := req.CollectionID.Int64
			requestsByCollection[collID] = append(
				requestsByCollection[collID],
				RequestResponse{
					ID:           req.ID,
					CollectionID: &collID,
					Name:         req.Name,
					Method:       req.Method,
					URL:          req.Url,
				},
			)
		}
	}

	// Build collection map
	collectionMap := make(map[int64]*CollectionResponse)
	childrenMap := make(map[int64][]int64) // parent_id -> child_ids

	for _, c := range collections {
		resp := &CollectionResponse{
			ID:        c.ID,
			Name:      c.Name,
			Children:  []CollectionResponse{},
			Requests:  requestsByCollection[c.ID],
			CreatedAt: formatTime(c.CreatedAt),
			UpdatedAt: formatTime(c.UpdatedAt),
		}
		if resp.Requests == nil {
			resp.Requests = []RequestResponse{}
		}
		if c.ParentID.Valid {
			parentID := c.ParentID.Int64
			resp.ParentID = &parentID
			childrenMap[parentID] = append(childrenMap[parentID], c.ID)
		}
		collectionMap[c.ID] = resp
	}

	// Recursive function to build tree
	var buildTree func(id int64) CollectionResponse
	buildTree = func(id int64) CollectionResponse {
		coll := collectionMap[id]
		result := CollectionResponse{
			ID:        coll.ID,
			Name:      coll.Name,
			ParentID:  coll.ParentID,
			Requests:  coll.Requests,
			Children:  []CollectionResponse{},
			CreatedAt: coll.CreatedAt,
			UpdatedAt: coll.UpdatedAt,
		}
		for _, childID := range childrenMap[id] {
			result.Children = append(result.Children, buildTree(childID))
		}
		return result
	}

	// Build roots
	var roots []CollectionResponse
	for _, c := range collections {
		if !c.ParentID.Valid {
			roots = append(roots, buildTree(c.ID))
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

func (h *CollectionHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	source, err := h.queries.GetCollection(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Collection not found")
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	txQueries := h.queries.WithTx(tx)

	// Create the top-level copy with " (Copy)" suffix, same parent
	newColl, err := txQueries.CreateCollection(r.Context(), repository.CreateCollectionParams{
		Name:     source.Name + " (Copy)",
		ParentID: source.ParentID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Recursively copy children and requests
	if err := duplicateCollectionRecursive(r.Context(), txQueries, id, newColl.ID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := CollectionResponse{
		ID:        newColl.ID,
		Name:      newColl.Name,
		CreatedAt: formatTime(newColl.CreatedAt),
		UpdatedAt: formatTime(newColl.UpdatedAt),
	}
	if newColl.ParentID.Valid {
		parentID := newColl.ParentID.Int64
		resp.ParentID = &parentID
	}

	respondJSON(w, http.StatusCreated, resp)
}

func duplicateCollectionRecursive(ctx context.Context, q *repository.Queries, sourceID, newParentID int64) error {
	// Copy requests in source collection
	requests, err := q.ListRequestsByCollection(ctx, sql.NullInt64{Int64: sourceID, Valid: true})
	if err != nil {
		return err
	}
	for _, req := range requests {
		_, err := q.CreateRequest(ctx, repository.CreateRequestParams{
			CollectionID: sql.NullInt64{Int64: newParentID, Valid: true},
			Name:         req.Name,
			Method:       req.Method,
			Url:          req.Url,
			Headers:      req.Headers,
			Body:         req.Body,
			BodyType:     req.BodyType,
		})
		if err != nil {
			return err
		}
	}

	// Copy child collections recursively
	children, err := q.ListChildCollections(ctx, sql.NullInt64{Int64: sourceID, Valid: true})
	if err != nil {
		return err
	}
	for _, child := range children {
		newChild, err := q.CreateCollection(ctx, repository.CreateCollectionParams{
			Name:     child.Name,
			ParentID: sql.NullInt64{Int64: newParentID, Valid: true},
		})
		if err != nil {
			return err
		}
		if err := duplicateCollectionRecursive(ctx, q, child.ID, newChild.ID); err != nil {
			return err
		}
	}

	return nil
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
