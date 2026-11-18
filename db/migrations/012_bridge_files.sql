-- +migrate Up
-- General files remain separate from Git bundle transfers and the web API tool's uploads.
CREATE TABLE IF NOT EXISTS bridge_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    source_network TEXT NOT NULL,
    target_network TEXT NOT NULL,
    filename TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    downloaded_at DATETIME,
    expires_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bridge_files_inbox ON bridge_files(project_id, target_network, expires_at);
CREATE INDEX IF NOT EXISTS idx_bridge_files_expiry ON bridge_files(expires_at);
