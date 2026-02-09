-- name: GetUploadedFile :one
SELECT * FROM uploaded_files WHERE id = ? LIMIT 1;

-- name: CreateUploadedFile :one
INSERT INTO uploaded_files (workspace_id, original_name, stored_name, content_type, size)
VALUES (?, ?, ?, ?, ?) RETURNING *;

-- name: DeleteUploadedFile :exec
DELETE FROM uploaded_files WHERE id = ?;

-- name: ListAllUploadedFiles :many
SELECT id, stored_name FROM uploaded_files;
