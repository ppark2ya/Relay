-- +migrate Up
CREATE TABLE IF NOT EXISTS erd_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    dsl TEXT DEFAULT '{"entities":[]}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erd_documents_workspace ON erd_documents(workspace_id, sort_order);

-- +migrate Down
DROP TABLE IF EXISTS erd_documents;
