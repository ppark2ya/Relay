-- +migrate Up
-- Add script columns to flow_steps for pre/post script execution
ALTER TABLE flow_steps ADD COLUMN pre_script TEXT DEFAULT '';
ALTER TABLE flow_steps ADD COLUMN post_script TEXT DEFAULT '';
ALTER TABLE flow_steps ADD COLUMN continue_on_error INTEGER DEFAULT 0;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN
