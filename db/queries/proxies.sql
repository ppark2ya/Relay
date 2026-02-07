-- name: GetProxy :one
SELECT * FROM proxies WHERE id = ? LIMIT 1;

-- name: ListProxies :many
SELECT * FROM proxies WHERE workspace_id = ? ORDER BY name;

-- name: GetActiveProxy :one
SELECT * FROM proxies WHERE is_active = TRUE AND workspace_id = ? LIMIT 1;

-- name: CreateProxy :one
INSERT INTO proxies (name, url, workspace_id) VALUES (?, ?, ?) RETURNING *;

-- name: UpdateProxy :one
UPDATE proxies SET name = ?, url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: DeleteProxy :exec
DELETE FROM proxies WHERE id = ?;

-- name: DeactivateAllProxies :exec
UPDATE proxies SET is_active = FALSE WHERE workspace_id = ?;

-- name: ActivateProxy :one
UPDATE proxies SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;
