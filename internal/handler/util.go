package handler

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

func parseID(r *http.Request, param string) (int64, error) {
	idStr := chi.URLParam(r, param)
	return strconv.ParseInt(idStr, 10, 64)
}

func decodeJSON(r *http.Request, v interface{}) error {
	return json.NewDecoder(r.Body).Decode(v)
}

func formatTime(t sql.NullTime) string {
	if t.Valid {
		return t.Time.Format("2006-01-02T15:04:05Z07:00")
	}
	return ""
}

func nullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}
