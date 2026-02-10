-- name: GetCollection :one
SELECT * FROM collections WHERE id = ? LIMIT 1;

-- name: ListCollections :many
SELECT * FROM collections WHERE workspace_id = ? ORDER BY name;

-- name: ListRootCollections :many
SELECT * FROM collections WHERE parent_id IS NULL AND workspace_id = ? ORDER BY name;

-- name: ListChildCollections :many
SELECT * FROM collections WHERE parent_id = ? ORDER BY name;

-- name: CreateCollection :one
INSERT INTO collections (name, parent_id, workspace_id) VALUES (?, ?, ?) RETURNING *;

-- name: UpdateCollection :one
UPDATE collections SET name = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: DeleteCollection :exec
DELETE FROM collections WHERE id = ?;

-- name: GetCollectionVariables :one
SELECT variables FROM collections WHERE id = ?;

-- name: UpdateCollectionVariables :one
UPDATE collections SET variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;
