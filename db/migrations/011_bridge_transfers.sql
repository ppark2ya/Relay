-- +migrate Up
-- Bridge bundle metadata is kept separate from the API test tool's uploaded_files.
CREATE TABLE IF NOT EXISTS bridge_transfers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    source_network TEXT NOT NULL,
    target_network TEXT NOT NULL,
    source_ref TEXT NOT NULL,
    target_ref TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    base_sha TEXT NOT NULL DEFAULT '',
    bundle_sha256 TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    downloaded_at DATETIME,
    expires_at DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_inbox
    ON bridge_transfers(project_id, target_network, expires_at);
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_expiry ON bridge_transfers(expires_at);
