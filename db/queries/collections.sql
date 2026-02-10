-- name: GetCollection :one
SELECT * FROM collections WHERE id = ? LIMIT 1;

-- name: ListCollections :many
SELECT * FROM collections WHERE workspace_id = ? ORDER BY sort_order ASC, name ASC;

-- name: ListRootCollections :many
SELECT * FROM collections WHERE parent_id IS NULL AND workspace_id = ? ORDER BY sort_order ASC, name ASC;

-- name: ListChildCollections :many
SELECT * FROM collections WHERE parent_id = ? ORDER BY sort_order ASC, name ASC;

-- name: CreateCollection :one
INSERT INTO collections (name, parent_id, workspace_id, sort_order) VALUES (?, ?, ?, ?) RETURNING *;

-- name: UpdateCollection :one
UPDATE collections SET name = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: DeleteCollection :exec
DELETE FROM collections WHERE id = ?;

-- name: GetCollectionVariables :one
SELECT variables FROM collections WHERE id = ?;

-- name: UpdateCollectionVariables :one
UPDATE collections SET variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: UpdateCollectionSortOrder :exec
UPDATE collections SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: UpdateCollectionParentAndSortOrder :exec
UPDATE collections SET parent_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: GetMaxRootCollectionSortOrder :one
SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM collections WHERE workspace_id = ? AND parent_id IS NULL;

-- name: GetMaxChildCollectionSortOrder :one
SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM collections WHERE parent_id = ?;
