package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"relay/internal/service"

	"github.com/go-chi/chi/v5"
)

type BridgeFileHandler struct{ files *service.BridgeFileService }

func NewBridgeFileHandler(files *service.BridgeFileService) *BridgeFileHandler {
	return &BridgeFileHandler{files: files}
}

func (h *BridgeFileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "invalid multipart upload: "+err.Error())
		return
	}
	var manifest service.BridgeFileManifest
	if err := json.Unmarshal([]byte(r.FormValue("manifest")), &manifest); err != nil {
		respondError(w, http.StatusBadRequest, "manifest must be valid JSON")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()
	transfer, err := h.files.Create(r.Context(), manifest, file)
	if err != nil {
		status := http.StatusBadRequest
		if !errors.Is(err, service.ErrBridgeFileTooLarge) && !errors.Is(err, service.ErrInvalidBridgeFileManifest) && !errors.Is(err, sql.ErrNoRows) && err.Error() != "bridge file SHA-256 does not match manifest" {
			status = http.StatusInternalServerError
		}
		respondError(w, status, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, transfer)
}

func (h *BridgeFileHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("projectId")
	targetNetwork, valid := service.NormalizeBridgeNetwork(r.URL.Query().Get("targetNetwork"))
	if projectID == "" || !valid {
		respondError(w, http.StatusBadRequest, "projectId and targetNetwork (external or internal) are required")
		return
	}
	files, err := h.files.List(r.Context(), projectID, targetNetwork, service.NormalizeBridgeGroupID(r.URL.Query().Get("groupId")))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "list bridge files: "+err.Error())
		return
	}
	respondJSON(w, http.StatusOK, files)
}

func (h *BridgeFileHandler) Download(w http.ResponseWriter, r *http.Request) {
	file, reader, err := h.files.Open(r.Context(), chi.URLParam(r, "id"))
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, "bridge file not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "open bridge file: "+err.Error())
		return
	}
	defer reader.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(file.Size, 10))
	w.Header().Set("Content-Disposition", `attachment; filename="`+file.Filename+`"`)
	_, _ = io.Copy(w, reader)
}

func (h *BridgeFileHandler) AcknowledgeDownload(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		UserName string `json:"userName"`
	}
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			respondError(w, http.StatusBadRequest, "download acknowledgement must be valid JSON")
			return
		}
	}
	if err := h.files.AcknowledgeDownload(r.Context(), chi.URLParam(r, "id"), payload.UserName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "bridge file not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "acknowledge bridge file download: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *BridgeFileHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.files.Delete(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "bridge file not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "delete bridge file: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
