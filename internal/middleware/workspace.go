package middleware

import (
	"context"
	"net/http"
	"strconv"
)

type contextKey string

const workspaceKey contextKey = "workspaceID"

func WorkspaceID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		wsID := int64(1) // default
		if h := r.Header.Get("X-Workspace-ID"); h != "" {
			if id, err := strconv.ParseInt(h, 10, 64); err == nil && id > 0 {
				wsID = id
			}
		}
		ctx := context.WithValue(r.Context(), workspaceKey, wsID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetWorkspaceID(ctx context.Context) int64 {
	if id, ok := ctx.Value(workspaceKey).(int64); ok {
		return id
	}
	return 1
}
