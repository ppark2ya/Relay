-- name: GetEnvironment :one
SELECT * FROM environments WHERE id = ? LIMIT 1;

-- name: ListEnvironments :many
SELECT * FROM environments WHERE workspace_id = ? ORDER BY name;

-- name: GetActiveEnvironment :one
SELECT * FROM environments WHERE is_active = TRUE AND workspace_id = ? LIMIT 1;

-- name: CreateEnvironment :one
INSERT INTO environments (name, variables, workspace_id) VALUES (?, ?, ?) RETURNING *;

-- name: UpdateEnvironment :one
UPDATE environments SET name = ?, variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: DeleteEnvironment :exec
DELETE FROM environments WHERE id = ?;

-- name: DeactivateAllEnvironments :exec
UPDATE environments SET is_active = FALSE WHERE workspace_id = ?;

-- name: ActivateEnvironment :one
UPDATE environments SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;
