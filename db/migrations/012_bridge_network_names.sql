-- +migrate Up
-- Preserve transfers created by the initial A/B-only Agent release.
UPDATE bridge_transfers SET source_network = 'internal' WHERE source_network = 'A';
UPDATE bridge_transfers SET target_network = 'internal' WHERE target_network = 'A';
UPDATE bridge_transfers SET source_network = 'external' WHERE source_network = 'B';
UPDATE bridge_transfers SET target_network = 'external' WHERE target_network = 'B';
