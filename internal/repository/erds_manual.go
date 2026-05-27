package repository

import (
	"context"
	"database/sql"
)

type ErdDocument struct {
	ID          int64          `json:"id"`
	WorkspaceID int64          `json:"workspace_id"`
	Name        string         `json:"name"`
	Dsl         sql.NullString `json:"dsl"`
	SortOrder   int64          `json:"sort_order"`
	CreatedAt   sql.NullTime   `json:"created_at"`
	UpdatedAt   sql.NullTime   `json:"updated_at"`
}

type CreateErdDocumentParams struct {
	WorkspaceID int64          `json:"workspace_id"`
	Name        string         `json:"name"`
	Dsl         sql.NullString `json:"dsl"`
	SortOrder   int64          `json:"sort_order"`
}

type GetErdDocumentParams struct {
	ID          int64 `json:"id"`
	WorkspaceID int64 `json:"workspace_id"`
}

type UpdateErdDocumentParams struct {
	ID          int64          `json:"id"`
	WorkspaceID int64          `json:"workspace_id"`
	Name        string         `json:"name"`
	Dsl         sql.NullString `json:"dsl"`
}

type UpdateErdDocumentSortOrderParams struct {
	ID          int64 `json:"id"`
	WorkspaceID int64 `json:"workspace_id"`
	SortOrder   int64 `json:"sort_order"`
}

func (q *Queries) ListErdDocuments(ctx context.Context, workspaceID int64) ([]ErdDocument, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT id, workspace_id, name, dsl, sort_order, created_at, updated_at
FROM erd_documents
WHERE workspace_id = ?
ORDER BY sort_order ASC, name ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ErdDocument
	for rows.Next() {
		var item ErdDocument
		if err := rows.Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Dsl, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) GetErdDocument(ctx context.Context, arg GetErdDocumentParams) (ErdDocument, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT id, workspace_id, name, dsl, sort_order, created_at, updated_at
FROM erd_documents
WHERE id = ? AND workspace_id = ?
LIMIT 1`, arg.ID, arg.WorkspaceID)
	var item ErdDocument
	err := row.Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Dsl, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (q *Queries) CreateErdDocument(ctx context.Context, arg CreateErdDocumentParams) (ErdDocument, error) {
	row := q.db.QueryRowContext(ctx, `
INSERT INTO erd_documents (workspace_id, name, dsl, sort_order)
VALUES (?, ?, ?, ?)
RETURNING id, workspace_id, name, dsl, sort_order, created_at, updated_at`, arg.WorkspaceID, arg.Name, arg.Dsl, arg.SortOrder)
	var item ErdDocument
	err := row.Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Dsl, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (q *Queries) UpdateErdDocument(ctx context.Context, arg UpdateErdDocumentParams) (ErdDocument, error) {
	row := q.db.QueryRowContext(ctx, `
UPDATE erd_documents
SET name = ?, dsl = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND workspace_id = ?
RETURNING id, workspace_id, name, dsl, sort_order, created_at, updated_at`, arg.Name, arg.Dsl, arg.ID, arg.WorkspaceID)
	var item ErdDocument
	err := row.Scan(&item.ID, &item.WorkspaceID, &item.Name, &item.Dsl, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (q *Queries) DeleteErdDocument(ctx context.Context, arg GetErdDocumentParams) error {
	_, err := q.db.ExecContext(ctx, `DELETE FROM erd_documents WHERE id = ? AND workspace_id = ?`, arg.ID, arg.WorkspaceID)
	return err
}

func (q *Queries) GetMaxErdDocumentSortOrder(ctx context.Context, workspaceID int64) (int64, error) {
	row := q.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), 0) FROM erd_documents WHERE workspace_id = ?`, workspaceID)
	var maxOrder int64
	err := row.Scan(&maxOrder)
	return maxOrder, err
}

func (q *Queries) UpdateErdDocumentSortOrder(ctx context.Context, arg UpdateErdDocumentSortOrderParams) error {
	_, err := q.db.ExecContext(ctx, `
UPDATE erd_documents
SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND workspace_id = ?`, arg.SortOrder, arg.ID, arg.WorkspaceID)
	return err
}
