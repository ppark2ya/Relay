-- name: GetFlow :one
SELECT * FROM flows WHERE id = ? LIMIT 1;

-- name: ListFlows :many
SELECT * FROM flows WHERE workspace_id = ? ORDER BY name;

-- name: CreateFlow :one
INSERT INTO flows (name, description, workspace_id) VALUES (?, ?, ?) RETURNING *;

-- name: UpdateFlow :one
UPDATE flows SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *;

-- name: DeleteFlow :exec
DELETE FROM flows WHERE id = ?;

-- name: GetFlowStep :one
SELECT * FROM flow_steps WHERE id = ? LIMIT 1;

-- name: ListFlowSteps :many
SELECT * FROM flow_steps WHERE flow_id = ? ORDER BY step_order;

-- name: CreateFlowStep :one
INSERT INTO flow_steps (flow_id, request_id, step_order, delay_ms, extract_vars, condition,
                        name, method, url, headers, body, body_type, proxy_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *;

-- name: UpdateFlowStep :one
UPDATE flow_steps SET
    request_id = ?,
    step_order = ?,
    delay_ms = ?,
    extract_vars = ?,
    condition = ?,
    name = ?,
    method = ?,
    url = ?,
    headers = ?,
    body = ?,
    body_type = ?,
    proxy_id = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE id = ? RETURNING *;

-- name: DeleteFlowStep :exec
DELETE FROM flow_steps WHERE id = ?;

-- name: DeleteFlowStepsByFlow :exec
DELETE FROM flow_steps WHERE flow_id = ?;
