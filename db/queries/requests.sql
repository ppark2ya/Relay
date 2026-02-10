-- name: GetRequest :one
SELECT * FROM requests WHERE id = ? LIMIT 1;

-- name: ListRequests :many
SELECT * FROM requests WHERE workspace_id = ? ORDER BY sort_order ASC, name ASC;

-- name: ListRequestsByCollection :many
SELECT * FROM requests WHERE collection_id = ? ORDER BY sort_order ASC, name ASC;

-- name: CreateRequest :one
INSERT INTO requests (collection_id, name, method, url, headers, body, body_type, cookies, proxy_id, workspace_id, pre_script, post_script, sort_order)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: UpdateRequest :one
UPDATE requests SET
    collection_id = ?,
    name = ?,
    method = ?,
    url = ?,
    headers = ?,
    body = ?,
    body_type = ?,
    cookies = ?,
    proxy_id = ?,
    pre_script = ?,
    post_script = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE id = ? RETURNING *;

-- name: DeleteRequest :exec
DELETE FROM requests WHERE id = ?;

-- name: UpdateRequestSortOrder :exec
UPDATE requests SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: UpdateRequestCollectionAndSortOrder :exec
UPDATE requests SET collection_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;

-- name: GetMaxRequestSortOrder :one
SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM requests WHERE collection_id = ?;
