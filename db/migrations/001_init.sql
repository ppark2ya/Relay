-- +migrate Up
CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS environments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    variables TEXT DEFAULT '{}',
    is_active BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proxies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS flow_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flow_id INTEGER NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    delay_ms INTEGER DEFAULT 0,
    extract_vars TEXT DEFAULT '{}',
    condition TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_requests_collection ON requests(collection_id);
CREATE INDEX idx_collections_parent ON collections(parent_id);
CREATE INDEX idx_flow_steps_flow ON flow_steps(flow_id);
CREATE INDEX idx_flow_steps_order ON flow_steps(flow_id, step_order);
CREATE INDEX idx_history_request ON request_history(request_id);
CREATE INDEX idx_history_created ON request_history(created_at DESC);

-- +migrate Down
DROP TABLE IF EXISTS request_history;
DROP TABLE IF EXISTS flow_steps;
DROP TABLE IF EXISTS flows;
DROP TABLE IF EXISTS proxies;
DROP TABLE IF EXISTS environments;
DROP TABLE IF EXISTS requests;
DROP TABLE IF EXISTS collections;
