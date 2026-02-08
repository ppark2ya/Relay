-- name: GetRequest :one
SELECT * FROM requests WHERE id = ? LIMIT 1;

-- name: ListRequests :many
SELECT * FROM requests WHERE workspace_id = ? ORDER BY name;

-- name: ListRequestsByCollection :many
SELECT * FROM requests WHERE collection_id = ? ORDER BY name;

-- name: CreateRequest :one
INSERT INTO requests (collection_id, name, method, url, headers, body, body_type, cookies, proxy_id, workspace_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *;

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
    updated_at = CURRENT_TIMESTAMP
WHERE id = ? RETURNING *;

-- name: DeleteRequest :exec
DELETE FROM requests WHERE id = ?;
