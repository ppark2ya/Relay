-- +migrate Up
CREATE TABLE IF NOT EXISTS erd_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES erd_collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE erd_documents ADD COLUMN collection_id INTEGER REFERENCES erd_collections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_erd_collections_workspace ON erd_collections(workspace_id, parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_erd_documents_collection ON erd_documents(workspace_id, collection_id, sort_order);

-- +migrate Down
DROP TABLE IF EXISTS erd_collections;
