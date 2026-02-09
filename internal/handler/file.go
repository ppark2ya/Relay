package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"relay/internal/middleware"
	"relay/internal/repository"
	"relay/internal/service"
)

type FileHandler struct {
	db          *sql.DB
	queries     *repository.Queries
	fileStorage *service.FileStorage
}

func NewFileHandler(db *sql.DB, queries *repository.Queries, fileStorage *service.FileStorage) *FileHandler {
	return &FileHandler{db: db, queries: queries, fileStorage: fileStorage}
}

type UploadedFileResponse struct {
	ID          int64  `json:"id"`
	OriginalName string `json:"originalName"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	CreatedAt   string `json:"createdAt,omitempty"`
}

func toUploadedFileResponse(f repository.UploadedFile) UploadedFileResponse {
	return UploadedFileResponse{
		ID:           f.ID,
		OriginalName: f.OriginalName,
		ContentType:  f.ContentType,
		Size:         f.Size,
		CreatedAt:    formatTime(f.CreatedAt),
	}
}

func (h *FileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "Failed to parse multipart form: "+err.Error())
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "File is required: "+err.Error())
		return
	}
	defer file.Close()

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	storedName, size, err := h.fileStorage.Store(file)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to store file: "+err.Error())
		return
	}

	wsID := middleware.GetWorkspaceID(r.Context())
	uploaded, err := h.queries.CreateUploadedFile(r.Context(), repository.CreateUploadedFileParams{
		WorkspaceID:  wsID,
		OriginalName: header.Filename,
		StoredName:   storedName,
		ContentType:  contentType,
		Size:         size,
	})
	if err != nil {
		// Clean up stored file on DB error
		h.fileStorage.Delete(storedName)
		respondError(w, http.StatusInternalServerError, "Failed to save file metadata: "+err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, toUploadedFileResponse(uploaded))
}

func (h *FileHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	f, err := h.queries.GetUploadedFile(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "File not found")
		return
	}

	respondJSON(w, http.StatusOK, toUploadedFileResponse(f))
}

func (h *FileHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	f, err := h.queries.GetUploadedFile(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "File not found")
		return
	}

	// Delete from disk first, then DB
	h.fileStorage.Delete(f.StoredName)

	if err := h.queries.DeleteUploadedFile(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to delete file metadata: "+err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *FileHandler) Cleanup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DryRun bool `json:"dryRun"`
	}
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&req)
	}

	result, err := service.CleanupOrphanFiles(r.Context(), h.db, h.queries, h.fileStorage, req.DryRun)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Cleanup failed: "+err.Error())
		return
	}

	respondJSON(w, http.StatusOK, result)
}
