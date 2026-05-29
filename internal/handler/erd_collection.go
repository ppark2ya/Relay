package handler

import (
	"context"
	"database/sql"
	"errors"
	"net/http"

	"relay/internal/middleware"
	"relay/internal/repository"
)

type ErdCollectionHandler struct {
	queries *repository.Queries
	db      *sql.DB
}

func NewErdCollectionHandler(queries *repository.Queries, db *sql.DB) *ErdCollectionHandler {
	return &ErdCollectionHandler{queries: queries, db: db}
}

type ErdCollectionRequest struct {
	Name     string `json:"name"`
	ParentID *int64 `json:"parentId"`
}

type ErdCollectionReorderRequest struct {
	Orders []struct {
		ID        int64  `json:"id"`
		ParentID  *int64 `json:"parentId"`
		SortOrder int64  `json:"sortOrder"`
	} `json:"orders"`
}

type ErdCollectionResponse struct {
	ID        int64                   `json:"id"`
	Name      string                  `json:"name"`
	ParentID  *int64                  `json:"parentId,omitempty"`
	SortOrder int64                   `json:"sortOrder"`
	Children  []ErdCollectionResponse `json:"children,omitempty"`
	Erds      []ErdResponse           `json:"erds,omitempty"`
	CreatedAt string                  `json:"createdAt"`
	UpdatedAt string                  `json:"updatedAt"`
}

func (h *ErdCollectionHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := middleware.GetWorkspaceID(r.Context())
	collections, err := h.queries.ListErdCollections(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	erds, err := h.queries.ListErdDocuments(r.Context(), wsID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	erdsByCollection := make(map[int64][]ErdResponse)
	for _, erd := range erds {
		if erd.CollectionID.Valid {
			erdsByCollection[erd.CollectionID.Int64] = append(erdsByCollection[erd.CollectionID.Int64], mapErdResponse(erd))
		}
	}

	collectionMap := make(map[int64]*ErdCollectionResponse)
	childrenMap := make(map[int64][]int64)
	for _, collection := range collections {
		resp := mapErdCollectionResponse(collection)
		resp.Erds = erdsByCollection[collection.ID]
		if resp.Erds == nil {
			resp.Erds = []ErdResponse{}
		}
		collectionMap[collection.ID] = &resp
		if collection.ParentID.Valid {
			childrenMap[collection.ParentID.Int64] = append(childrenMap[collection.ParentID.Int64], collection.ID)
		}
	}

	var buildTree func(id int64) ErdCollectionResponse
	buildTree = func(id int64) ErdCollectionResponse {
		source := collectionMap[id]
		result := *source
		result.Children = []ErdCollectionResponse{}
		for _, childID := range childrenMap[id] {
			result.Children = append(result.Children, buildTree(childID))
		}
		return result
	}

	roots := []ErdCollectionResponse{}
	for _, collection := range collections {
		if !collection.ParentID.Valid {
			roots = append(roots, buildTree(collection.ID))
		}
	}
	respondJSON(w, http.StatusOK, roots)
}

func (h *ErdCollectionHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	collection, err := h.queries.GetErdCollection(r.Context(), repository.GetErdCollectionParams{
		ID:          id,
		WorkspaceID: middleware.GetWorkspaceID(r.Context()),
	})
	if err != nil {
		respondError(w, http.StatusNotFound, "ERD collection not found")
		return
	}
	respondJSON(w, http.StatusOK, mapErdCollectionResponse(collection))
}

func (h *ErdCollectionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req ErdCollectionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "Name is required")
		return
	}

	wsID := middleware.GetWorkspaceID(r.Context())
	parentID := nullableInt64(req.ParentID)
	if parentID.Valid {
		if _, err := h.queries.GetErdCollection(r.Context(), repository.GetErdCollectionParams{ID: parentID.Int64, WorkspaceID: wsID}); err != nil {
			respondError(w, http.StatusNotFound, "Parent ERD collection not found")
			return
		}
	}
	maxOrder, err := h.queries.GetMaxErdCollectionSortOrder(r.Context(), repository.GetMaxErdCollectionSortOrderParams{
		WorkspaceID: wsID,
		ParentID:    parentID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	collection, err := h.queries.CreateErdCollection(r.Context(), repository.CreateErdCollectionParams{
		WorkspaceID: wsID,
		ParentID:    parentID,
		Name:        req.Name,
		SortOrder:   maxOrder + 1,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, mapErdCollectionResponse(collection))
}

func (h *ErdCollectionHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req ErdCollectionRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if req.Name == "" {
		respondError(w, http.StatusBadRequest, "Name is required")
		return
	}

	wsID := middleware.GetWorkspaceID(r.Context())
	parentID := nullableInt64(req.ParentID)
	if err := h.validateParent(r.Context(), wsID, id, parentID); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	collection, err := h.queries.UpdateErdCollection(r.Context(), repository.UpdateErdCollectionParams{
		ID:          id,
		WorkspaceID: wsID,
		ParentID:    parentID,
		Name:        req.Name,
	})
	if err != nil {
		respondError(w, http.StatusNotFound, "ERD collection not found")
		return
	}
	respondJSON(w, http.StatusOK, mapErdCollectionResponse(collection))
}

func (h *ErdCollectionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}
	wsID := middleware.GetWorkspaceID(r.Context())
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	txQueries := h.queries.WithTx(tx)
	if err := deleteErdCollectionRecursive(r.Context(), txQueries, wsID, id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ErdCollectionHandler) Duplicate(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}
	wsID := middleware.GetWorkspaceID(r.Context())
	source, err := h.queries.GetErdCollection(r.Context(), repository.GetErdCollectionParams{ID: id, WorkspaceID: wsID})
	if err != nil {
		respondError(w, http.StatusNotFound, "ERD collection not found")
		return
	}

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer tx.Rollback()

	txQueries := h.queries.WithTx(tx)
	maxOrder, err := txQueries.GetMaxErdCollectionSortOrder(r.Context(), repository.GetMaxErdCollectionSortOrderParams{
		WorkspaceID: wsID,
		ParentID:    source.ParentID,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	duplicated, err := txQueries.CreateErdCollection(r.Context(), repository.CreateErdCollectionParams{
		WorkspaceID: wsID,
		ParentID:    source.ParentID,
		Name:        source.Name + " Copy",
		SortOrder:   maxOrder + 1,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := duplicateErdCollectionRecursive(r.Context(), txQueries, wsID, source.ID, duplicated.ID); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := tx.Commit(); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, mapErdCollectionResponse(duplicated))
}

func (h *ErdCollectionHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req ErdCollectionReorderRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	wsID := middleware.GetWorkspaceID(r.Context())
	for _, item := range req.Orders {
		parentID := nullableInt64(item.ParentID)
		if err := h.validateParent(r.Context(), wsID, item.ID, parentID); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := h.queries.UpdateErdCollectionParentAndSortOrder(r.Context(), repository.UpdateErdCollectionParentAndSortOrderParams{
			ID:          item.ID,
			WorkspaceID: wsID,
			ParentID:    parentID,
			SortOrder:   item.SortOrder,
		}); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ErdCollectionHandler) validateParent(ctx context.Context, workspaceID, id int64, parentID sql.NullInt64) error {
	if !parentID.Valid {
		return nil
	}
	if parentID.Int64 == id {
		return errors.New("Cannot move ERD collection into itself")
	}
	if _, err := h.queries.GetErdCollection(ctx, repository.GetErdCollectionParams{ID: parentID.Int64, WorkspaceID: workspaceID}); err != nil {
		return errors.New("Parent ERD collection not found")
	}
	if h.isDescendant(ctx, workspaceID, parentID.Int64, id) {
		return errors.New("Cannot move ERD collection into its own descendant")
	}
	return nil
}

func (h *ErdCollectionHandler) isDescendant(ctx context.Context, workspaceID, candidateID, ancestorID int64) bool {
	current := candidateID
	for {
		collection, err := h.queries.GetErdCollection(ctx, repository.GetErdCollectionParams{ID: current, WorkspaceID: workspaceID})
		if err != nil || !collection.ParentID.Valid {
			return false
		}
		if collection.ParentID.Int64 == ancestorID {
			return true
		}
		current = collection.ParentID.Int64
	}
}

func duplicateErdCollectionRecursive(ctx context.Context, q *repository.Queries, workspaceID, sourceID, newParentID int64) error {
	erds, err := q.ListErdDocumentsByCollection(ctx, repository.ListErdDocumentsByCollectionParams{
		WorkspaceID:  workspaceID,
		CollectionID: sql.NullInt64{Int64: sourceID, Valid: true},
	})
	if err != nil {
		return err
	}
	for _, erd := range erds {
		if _, err := q.CreateErdDocument(ctx, repository.CreateErdDocumentParams{
			WorkspaceID:  workspaceID,
			CollectionID: sql.NullInt64{Int64: newParentID, Valid: true},
			Name:         erd.Name,
			Dsl:          erd.Dsl,
			SortOrder:    erd.SortOrder,
		}); err != nil {
			return err
		}
	}

	children, err := q.ListChildErdCollections(ctx, repository.ListChildErdCollectionsParams{
		ParentID:    sourceID,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return err
	}
	for _, child := range children {
		newChild, err := q.CreateErdCollection(ctx, repository.CreateErdCollectionParams{
			WorkspaceID: workspaceID,
			ParentID:    sql.NullInt64{Int64: newParentID, Valid: true},
			Name:        child.Name,
			SortOrder:   child.SortOrder,
		})
		if err != nil {
			return err
		}
		if err := duplicateErdCollectionRecursive(ctx, q, workspaceID, child.ID, newChild.ID); err != nil {
			return err
		}
	}
	return nil
}

func deleteErdCollectionRecursive(ctx context.Context, q *repository.Queries, workspaceID, id int64) error {
	children, err := q.ListChildErdCollections(ctx, repository.ListChildErdCollectionsParams{
		ParentID:    id,
		WorkspaceID: workspaceID,
	})
	if err != nil {
		return err
	}
	for _, child := range children {
		if err := deleteErdCollectionRecursive(ctx, q, workspaceID, child.ID); err != nil {
			return err
		}
	}
	if err := q.DeleteErdDocumentsByCollection(ctx, repository.ListErdDocumentsByCollectionParams{
		WorkspaceID:  workspaceID,
		CollectionID: sql.NullInt64{Int64: id, Valid: true},
	}); err != nil {
		return err
	}
	return q.DeleteErdCollection(ctx, repository.GetErdCollectionParams{ID: id, WorkspaceID: workspaceID})
}

func mapErdCollectionResponse(collection repository.ErdCollection) ErdCollectionResponse {
	resp := ErdCollectionResponse{
		ID:        collection.ID,
		Name:      collection.Name,
		SortOrder: collection.SortOrder,
		CreatedAt: formatTime(collection.CreatedAt),
		UpdatedAt: formatTime(collection.UpdatedAt),
	}
	if collection.ParentID.Valid {
		parentID := collection.ParentID.Int64
		resp.ParentID = &parentID
	}
	return resp
}
