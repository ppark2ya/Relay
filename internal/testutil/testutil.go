package testutil

import (
	"database/sql"
	"testing"

	"relay/internal/repository"

	_ "modernc.org/sqlite"
)

const ddl = `
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    variables TEXT DEFAULT '{}'
);

INSERT OR IGNORE INTO workspaces (id, name) VALUES (1, 'Default');

CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    variables TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    url TEXT NOT NULL,
    headers TEXT DEFAULT '{}',
    body TEXT DEFAULT '',
    body_type TEXT DEFAULT 'none',
    cookies TEXT DEFAULT '{}',
    proxy_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    pre_script TEXT DEFAULT '',
    post_script TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS environments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    variables TEXT DEFAULT '{}',
    is_active BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS flow_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
    step_order INTEGER NOT NULL,
    delay_ms INTEGER DEFAULT 0,
    extract_vars TEXT DEFAULT '{}',
    condition TEXT DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL DEFAULT 'GET',
    url TEXT NOT NULL DEFAULT '',
    headers TEXT DEFAULT '{}',
    body TEXT DEFAULT '',
    body_type TEXT DEFAULT 'none',
    cookies TEXT DEFAULT '{}',
    proxy_id INTEGER DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    loop_count INTEGER DEFAULT 1,
    pre_script TEXT DEFAULT '',
    post_script TEXT DEFAULT '',
    continue_on_error INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS request_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER REFERENCES requests(id) ON DELETE SET NULL,
    flow_id INTEGER REFERENCES flows(id) ON DELETE SET NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    request_headers TEXT DEFAULT '{}',
    request_body TEXT DEFAULT '',
    status_code INTEGER,
    response_headers TEXT DEFAULT '{}',
    response_body TEXT DEFAULT '',
    duration_ms INTEGER,
    error TEXT DEFAULT '',
    body_size INTEGER DEFAULT 0,
    is_binary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS uploaded_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_workspace ON uploaded_files(workspace_id);

CREATE INDEX IF NOT EXISTS idx_requests_collection ON requests(collection_id);
CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);
CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON flow_steps(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_steps_order ON flow_steps(flow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_history_request ON request_history(request_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON request_history(created_at DESC);
`

// SetupTestDB creates an in-memory SQLite database with all tables and returns a Queries instance.
func SetupTestDB(t *testing.T) *repository.Queries {
	t.Helper()
	_, q := SetupTestDBWithConn(t)
	return q
}

// SetupTestDBWithConn creates an in-memory SQLite database and returns both the raw *sql.DB and Queries.
func SetupTestDBWithConn(t *testing.T) (*sql.DB, *repository.Queries) {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if _, err := db.Exec(ddl); err != nil {
		t.Fatalf("failed to run migrations: %v", err)
	}

	return db, repository.New(db)
}
