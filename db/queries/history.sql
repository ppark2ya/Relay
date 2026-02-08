-- name: GetHistory :one
SELECT * FROM request_history WHERE id = ? LIMIT 1;

-- name: ListHistory :many
SELECT * FROM request_history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?;

-- name: ListHistoryByRequest :many
SELECT * FROM request_history WHERE request_id = ? ORDER BY created_at DESC LIMIT ?;

-- name: CreateHistory :one
INSERT INTO request_history (
    request_id, flow_id, method, url, request_headers, request_body,
    status_code, response_headers, response_body, duration_ms, error, body_size, is_binary, workspace_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: DeleteHistory :exec
DELETE FROM request_history WHERE id = ?;

-- name: DeleteOldHistory :exec
DELETE FROM request_history WHERE created_at < datetime('now', '-30 days');
