-- +migrate Up
ALTER TABLE workspaces ADD COLUMN variables TEXT DEFAULT '{}';
ALTER TABLE collections ADD COLUMN variables TEXT DEFAULT '{}';
