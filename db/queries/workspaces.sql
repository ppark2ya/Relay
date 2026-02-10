-- name: ListWorkspaces :many
SELECT * FROM workspaces ORDER BY name;

-- name: GetWorkspace :one
SELECT * FROM workspaces WHERE id = ? LIMIT 1;

-- name: CreateWorkspace :one
INSERT INTO workspaces (name) VALUES (?) RETURNING *;

-- name: UpdateWorkspace :one
UPDATE workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces WHERE id = ?;

-- name: GetWorkspaceVariables :one
SELECT variables FROM workspaces WHERE id = ?;

-- name: UpdateWorkspaceVariables :one
UPDATE workspaces SET variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;
