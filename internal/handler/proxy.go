package handler

import (
	"crypto/tls"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"relay/internal/repository"
)

type ProxyHandler struct {
	queries *repository.Queries
}

func NewProxyHandler(queries *repository.Queries) *ProxyHandler {
	return &ProxyHandler{queries: queries}
}

type ProxyRequest struct {
	Name string `json:"name"`
	URL  string `json:"url"`
}

type ProxyResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	IsActive  bool   `json:"isActive"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func (h *ProxyHandler) List(w http.ResponseWriter, r *http.Request) {
	proxies, err := h.queries.ListProxies(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := make([]ProxyResponse, 0, len(proxies))
	for _, p := range proxies {
		resp = append(resp, ProxyResponse{
			ID:        p.ID,
			Name:      p.Name,
			URL:       p.Url,
			IsActive:  p.IsActive.Valid && p.IsActive.Bool,
			CreatedAt: formatTime(p.CreatedAt),
			UpdatedAt: formatTime(p.UpdatedAt),
		})
	}

	respondJSON(w, http.StatusOK, resp)
}

func (h *ProxyHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	proxy, err := h.queries.GetProxy(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Proxy not found")
		return
	}

	respondJSON(w, http.StatusOK, ProxyResponse{
		ID:        proxy.ID,
		Name:      proxy.Name,
		URL:       proxy.Url,
		IsActive:  proxy.IsActive.Valid && proxy.IsActive.Bool,
		CreatedAt: formatTime(proxy.CreatedAt),
		UpdatedAt: formatTime(proxy.UpdatedAt),
	})
}

func (h *ProxyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req ProxyRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	proxy, err := h.queries.CreateProxy(r.Context(), repository.CreateProxyParams{
		Name: req.Name,
		Url:  req.URL,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusCreated, ProxyResponse{
		ID:        proxy.ID,
		Name:      proxy.Name,
		URL:       proxy.Url,
		IsActive:  proxy.IsActive.Valid && proxy.IsActive.Bool,
		CreatedAt: formatTime(proxy.CreatedAt),
		UpdatedAt: formatTime(proxy.UpdatedAt),
	})
}

func (h *ProxyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	var req ProxyRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	proxy, err := h.queries.UpdateProxy(r.Context(), repository.UpdateProxyParams{
		ID:   id,
		Name: req.Name,
		Url:  req.URL,
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, ProxyResponse{
		ID:        proxy.ID,
		Name:      proxy.Name,
		URL:       proxy.Url,
		IsActive:  proxy.IsActive.Valid && proxy.IsActive.Bool,
		CreatedAt: formatTime(proxy.CreatedAt),
		UpdatedAt: formatTime(proxy.UpdatedAt),
	})
}

func (h *ProxyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	if err := h.queries.DeleteProxy(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ProxyHandler) Activate(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	// Deactivate all first
	h.queries.DeactivateAllProxies(r.Context())

	proxy, err := h.queries.ActivateProxy(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, ProxyResponse{
		ID:        proxy.ID,
		Name:      proxy.Name,
		URL:       proxy.Url,
		IsActive:  true,
		CreatedAt: formatTime(proxy.CreatedAt),
		UpdatedAt: formatTime(proxy.UpdatedAt),
	})
}

func (h *ProxyHandler) Deactivate(w http.ResponseWriter, r *http.Request) {
	if err := h.queries.DeactivateAllProxies(r.Context()); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *ProxyHandler) Test(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r, "id")
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid ID")
		return
	}

	proxy, err := h.queries.GetProxy(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "Proxy not found")
		return
	}

	proxyURL, err := url.Parse(proxy.Url)
	if err != nil || proxyURL.Host == "" {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   "Invalid proxy URL format",
		})
		return
	}

	// Actually connect through the proxy to verify it works
	client := &http.Client{
		Transport: &http.Transport{
			Proxy:           http.ProxyURL(proxyURL),
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		Timeout: 10 * time.Second,
	}

	resp, err := client.Get("https://www.google.com")
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Proxy connection failed: %s", err.Error()),
		})
		return
	}
	resp.Body.Close()

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Proxy is working (status %d)", resp.StatusCode),
	})
}
