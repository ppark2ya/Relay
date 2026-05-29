package repository

import (
	"context"
	"database/sql"
)

type ErdDocument struct {
	ID           int64          `json:"id"`
	WorkspaceID  int64          `json:"workspace_id"`
	CollectionID sql.NullInt64  `json:"collection_id"`
	Name         string         `json:"name"`
	Dsl          sql.NullString `json:"dsl"`
	SortOrder    int64          `json:"sort_order"`
	CreatedAt    sql.NullTime   `json:"created_at"`
	UpdatedAt    sql.NullTime   `json:"updated_at"`
}

type CreateErdDocumentParams struct {
	WorkspaceID  int64          `json:"workspace_id"`
	CollectionID sql.NullInt64  `json:"collection_id"`
	Name         string         `json:"name"`
	Dsl          sql.NullString `json:"dsl"`
	SortOrder    int64          `json:"sort_order"`
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

type ListErdDocumentsByCollectionParams struct {
	WorkspaceID  int64         `json:"workspace_id"`
	CollectionID sql.NullInt64 `json:"collection_id"`
}

type GetMaxErdDocumentSortOrderParams struct {
	WorkspaceID  int64         `json:"workspace_id"`
	CollectionID sql.NullInt64 `json:"collection_id"`
}

type UpdateErdDocumentSortOrderParams struct {
	ID           int64         `json:"id"`
	WorkspaceID  int64         `json:"workspace_id"`
	CollectionID sql.NullInt64 `json:"collection_id"`
	SortOrder    int64         `json:"sort_order"`
}

type ErdCollection struct {
	ID          int64         `json:"id"`
	WorkspaceID int64         `json:"workspace_id"`
	ParentID    sql.NullInt64 `json:"parent_id"`
	Name        string        `json:"name"`
	SortOrder   int64         `json:"sort_order"`
	CreatedAt   sql.NullTime  `json:"created_at"`
	UpdatedAt   sql.NullTime  `json:"updated_at"`
}

type CreateErdCollectionParams struct {
	WorkspaceID int64         `json:"workspace_id"`
	ParentID    sql.NullInt64 `json:"parent_id"`
	Name        string        `json:"name"`
	SortOrder   int64         `json:"sort_order"`
}

type GetErdCollectionParams struct {
	ID          int64 `json:"id"`
	WorkspaceID int64 `json:"workspace_id"`
}

type UpdateErdCollectionParams struct {
	ID          int64         `json:"id"`
	WorkspaceID int64         `json:"workspace_id"`
	ParentID    sql.NullInt64 `json:"parent_id"`
	Name        string        `json:"name"`
}

type ListChildErdCollectionsParams struct {
	ParentID    int64 `json:"parent_id"`
	WorkspaceID int64 `json:"workspace_id"`
}

type GetMaxErdCollectionSortOrderParams struct {
	WorkspaceID int64         `json:"workspace_id"`
	ParentID    sql.NullInt64 `json:"parent_id"`
}

type UpdateErdCollectionParentAndSortOrderParams struct {
	ID          int64         `json:"id"`
	WorkspaceID int64         `json:"workspace_id"`
	ParentID    sql.NullInt64 `json:"parent_id"`
	SortOrder   int64         `json:"sort_order"`
}

type erdDocumentScanner interface {
	Scan(dest ...any) error
}

func scanErdDocument(row erdDocumentScanner) (ErdDocument, error) {
	var item ErdDocument
	err := row.Scan(
		&item.ID,
		&item.WorkspaceID,
		&item.CollectionID,
		&item.Name,
		&item.Dsl,
		&item.SortOrder,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	return item, err
}

type erdCollectionScanner interface {
	Scan(dest ...any) error
}

func scanErdCollection(row erdCollectionScanner) (ErdCollection, error) {
	var item ErdCollection
	err := row.Scan(
		&item.ID,
		&item.WorkspaceID,
		&item.ParentID,
		&item.Name,
		&item.SortOrder,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	return item, err
}

func (q *Queries) ListErdDocuments(ctx context.Context, workspaceID int64) ([]ErdDocument, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT id, workspace_id, collection_id, name, dsl, sort_order, created_at, updated_at
FROM erd_documents
WHERE workspace_id = ?
ORDER BY sort_order ASC, name ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ErdDocument
	for rows.Next() {
		item, err := scanErdDocument(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) ListErdDocumentsByCollection(ctx context.Context, arg ListErdDocumentsByCollectionParams) ([]ErdDocument, error) {
	var rows *sql.Rows
	var err error
	if arg.CollectionID.Valid {
		rows, err = q.db.QueryContext(ctx, `
SELECT id, workspace_id, collection_id, name, dsl, sort_order, created_at, updated_at
FROM erd_documents
WHERE workspace_id = ? AND collection_id = ?
ORDER BY sort_order ASC, name ASC`, arg.WorkspaceID, arg.CollectionID.Int64)
	} else {
		rows, err = q.db.QueryContext(ctx, `
SELECT id, workspace_id, collection_id, name, dsl, sort_order, created_at, updated_at
FROM erd_documents
WHERE workspace_id = ? AND collection_id IS NULL
ORDER BY sort_order ASC, name ASC`, arg.WorkspaceID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ErdDocument
	for rows.Next() {
		item, err := scanErdDocument(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) GetErdDocument(ctx context.Context, arg GetErdDocumentParams) (ErdDocument, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT id, workspace_id, collection_id, name, dsl, sort_order, created_at, updated_at
FROM erd_documents
WHERE id = ? AND workspace_id = ?
LIMIT 1`, arg.ID, arg.WorkspaceID)
	return scanErdDocument(row)
}

func (q *Queries) CreateErdDocument(ctx context.Context, arg CreateErdDocumentParams) (ErdDocument, error) {
	row := q.db.QueryRowContext(ctx, `
INSERT INTO erd_documents (workspace_id, collection_id, name, dsl, sort_order)
VALUES (?, ?, ?, ?, ?)
RETURNING id, workspace_id, collection_id, name, dsl, sort_order, created_at, updated_at`, arg.WorkspaceID, arg.CollectionID, arg.Name, arg.Dsl, arg.SortOrder)
	return scanErdDocument(row)
}

func (q *Queries) UpdateErdDocument(ctx context.Context, arg UpdateErdDocumentParams) (ErdDocument, error) {
	row := q.db.QueryRowContext(ctx, `
UPDATE erd_documents
SET name = ?, dsl = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND workspace_id = ?
RETURNING id, workspace_id, collection_id, name, dsl, sort_order, created_at, updated_at`, arg.Name, arg.Dsl, arg.ID, arg.WorkspaceID)
	return scanErdDocument(row)
}

func (q *Queries) DeleteErdDocument(ctx context.Context, arg GetErdDocumentParams) error {
	_, err := q.db.ExecContext(ctx, `DELETE FROM erd_documents WHERE id = ? AND workspace_id = ?`, arg.ID, arg.WorkspaceID)
	return err
}

func (q *Queries) DeleteErdDocumentsByCollection(ctx context.Context, arg ListErdDocumentsByCollectionParams) error {
	var err error
	if arg.CollectionID.Valid {
		_, err = q.db.ExecContext(ctx, `DELETE FROM erd_documents WHERE workspace_id = ? AND collection_id = ?`, arg.WorkspaceID, arg.CollectionID.Int64)
	} else {
		_, err = q.db.ExecContext(ctx, `DELETE FROM erd_documents WHERE workspace_id = ? AND collection_id IS NULL`, arg.WorkspaceID)
	}
	return err
}

func (q *Queries) GetMaxErdDocumentSortOrder(ctx context.Context, arg GetMaxErdDocumentSortOrderParams) (int64, error) {
	var row *sql.Row
	if arg.CollectionID.Valid {
		row = q.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), 0) FROM erd_documents WHERE workspace_id = ? AND collection_id = ?`, arg.WorkspaceID, arg.CollectionID.Int64)
	} else {
		row = q.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), 0) FROM erd_documents WHERE workspace_id = ? AND collection_id IS NULL`, arg.WorkspaceID)
	}
	var maxOrder int64
	err := row.Scan(&maxOrder)
	return maxOrder, err
}

func (q *Queries) UpdateErdDocumentSortOrder(ctx context.Context, arg UpdateErdDocumentSortOrderParams) error {
	_, err := q.db.ExecContext(ctx, `
UPDATE erd_documents
SET collection_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND workspace_id = ?`, arg.CollectionID, arg.SortOrder, arg.ID, arg.WorkspaceID)
	return err
}

func (q *Queries) ListErdCollections(ctx context.Context, workspaceID int64) ([]ErdCollection, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT id, workspace_id, parent_id, name, sort_order, created_at, updated_at
FROM erd_collections
WHERE workspace_id = ?
ORDER BY sort_order ASC, name ASC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ErdCollection
	for rows.Next() {
		item, err := scanErdCollection(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) ListChildErdCollections(ctx context.Context, arg ListChildErdCollectionsParams) ([]ErdCollection, error) {
	rows, err := q.db.QueryContext(ctx, `
SELECT id, workspace_id, parent_id, name, sort_order, created_at, updated_at
FROM erd_collections
WHERE workspace_id = ? AND parent_id = ?
ORDER BY sort_order ASC, name ASC`, arg.WorkspaceID, arg.ParentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []ErdCollection
	for rows.Next() {
		item, err := scanErdCollection(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (q *Queries) GetErdCollection(ctx context.Context, arg GetErdCollectionParams) (ErdCollection, error) {
	row := q.db.QueryRowContext(ctx, `
SELECT id, workspace_id, parent_id, name, sort_order, created_at, updated_at
FROM erd_collections
WHERE id = ? AND workspace_id = ?
LIMIT 1`, arg.ID, arg.WorkspaceID)
	return scanErdCollection(row)
}

func (q *Queries) CreateErdCollection(ctx context.Context, arg CreateErdCollectionParams) (ErdCollection, error) {
	row := q.db.QueryRowContext(ctx, `
INSERT INTO erd_collections (workspace_id, parent_id, name, sort_order)
VALUES (?, ?, ?, ?)
RETURNING id, workspace_id, parent_id, name, sort_order, created_at, updated_at`, arg.WorkspaceID, arg.ParentID, arg.Name, arg.SortOrder)
	return scanErdCollection(row)
}

func (q *Queries) UpdateErdCollection(ctx context.Context, arg UpdateErdCollectionParams) (ErdCollection, error) {
	row := q.db.QueryRowContext(ctx, `
UPDATE erd_collections
SET name = ?, parent_id = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND workspace_id = ?
RETURNING id, workspace_id, parent_id, name, sort_order, created_at, updated_at`, arg.Name, arg.ParentID, arg.ID, arg.WorkspaceID)
	return scanErdCollection(row)
}

func (q *Queries) DeleteErdCollection(ctx context.Context, arg GetErdCollectionParams) error {
	_, err := q.db.ExecContext(ctx, `DELETE FROM erd_collections WHERE id = ? AND workspace_id = ?`, arg.ID, arg.WorkspaceID)
	return err
}

func (q *Queries) GetMaxErdCollectionSortOrder(ctx context.Context, arg GetMaxErdCollectionSortOrderParams) (int64, error) {
	var row *sql.Row
	if arg.ParentID.Valid {
		row = q.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), 0) FROM erd_collections WHERE workspace_id = ? AND parent_id = ?`, arg.WorkspaceID, arg.ParentID.Int64)
	} else {
		row = q.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), 0) FROM erd_collections WHERE workspace_id = ? AND parent_id IS NULL`, arg.WorkspaceID)
	}
	var maxOrder int64
	err := row.Scan(&maxOrder)
	return maxOrder, err
}

func (q *Queries) UpdateErdCollectionParentAndSortOrder(ctx context.Context, arg UpdateErdCollectionParentAndSortOrderParams) error {
	_, err := q.db.ExecContext(ctx, `
UPDATE erd_collections
SET parent_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND workspace_id = ?`, arg.ParentID, arg.SortOrder, arg.ID, arg.WorkspaceID)
	return err
}
