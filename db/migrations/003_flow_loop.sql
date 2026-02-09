-- +migrate Up
ALTER TABLE flow_steps ADD COLUMN loop_count INTEGER DEFAULT 1;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN
