-- name: GetCollection :one
SELECT * FROM collections WHERE id = ? LIMIT 1;

-- name: ListCollections :many
SELECT * FROM collections ORDER BY name;

-- name: ListRootCollections :many
SELECT * FROM collections WHERE parent_id IS NULL ORDER BY name;

-- name: ListChildCollections :many
SELECT * FROM collections WHERE parent_id = ? ORDER BY name;

-- name: CreateCollection :one
INSERT INTO collections (name, parent_id) VALUES (?, ?) RETURNING *;

-- name: UpdateCollection :one
UPDATE collections SET name = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: DeleteCollection :exec
DELETE FROM collections WHERE id = ?;
