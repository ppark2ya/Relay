package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"relay/internal/service"

	"github.com/go-chi/chi/v5"
)

type BridgeHandler struct {
	bridge *service.BridgeService
}

func NewBridgeHandler(bridge *service.BridgeService) *BridgeHandler {
	return &BridgeHandler{bridge: bridge}
}

func (h *BridgeHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "invalid multipart upload: "+err.Error())
		return
	}
	var manifest service.BridgeManifest
	if err := json.Unmarshal([]byte(r.FormValue("manifest")), &manifest); err != nil {
		respondError(w, http.StatusBadRequest, "manifest must be valid JSON")
		return
	}
	bundle, _, err := r.FormFile("bundle")
	if err != nil {
		respondError(w, http.StatusBadRequest, "bundle is required")
		return
	}
	defer bundle.Close()

	transfer, err := h.bridge.Create(r.Context(), manifest, bundle)
	if err != nil {
		status := http.StatusBadRequest
		if !errors.Is(err, service.ErrBridgeBundleTooLarge) && !errors.Is(err, service.ErrInvalidBridgeManifest) && !strings.Contains(err.Error(), "SHA-256") {
			status = http.StatusInternalServerError
		}
		respondError(w, status, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, transfer)
}

func (h *BridgeHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := r.URL.Query().Get("projectId")
	targetNetwork, validNetwork := service.NormalizeBridgeNetwork(r.URL.Query().Get("targetNetwork"))
	if projectID == "" || !validNetwork {
		respondError(w, http.StatusBadRequest, "projectId and targetNetwork (external or internal) are required")
		return
	}
	transfers, err := h.bridge.List(r.Context(), projectID, targetNetwork)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "list bridge transfers: "+err.Error())
		return
	}
	respondJSON(w, http.StatusOK, transfers)
}

func (h *BridgeHandler) Download(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	transfer, bundle, err := h.bridge.Open(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		respondError(w, http.StatusNotFound, "bridge transfer not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "open bridge bundle: "+err.Error())
		return
	}
	defer bundle.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(transfer.Size, 10))
	w.Header().Set("Content-Disposition", `attachment; filename="`+transfer.ID+`.bundle"`)
	if _, err := io.Copy(w, bundle); err != nil {
		// The response may already be streaming; logging is handled by Chi's
		// request logger and there is no safe JSON response at this point.
		return
	}
}

func (h *BridgeHandler) AcknowledgeDownload(w http.ResponseWriter, r *http.Request) {
	if err := h.bridge.AcknowledgeDownload(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "bridge transfer not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "acknowledge bridge download: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *BridgeHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.bridge.Delete(r.Context(), chi.URLParam(r, "id")); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respondError(w, http.StatusNotFound, "bridge transfer not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "delete bridge transfer: "+err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
