package migration

import (
	"database/sql"
	"fmt"
	"log"
)

// Run executes all database migrations
func Run(db *sql.DB) error {
	if err := createTables(db); err != nil {
		return err
	}

	// Incremental migrations (idempotent)
	migrateFlowSteps(db)
	migrateProxyOverrides(db)
	migrateCookies(db)
	migrateWorkspaces(db)
	migrateBinaryResponse(db)
	migrateLoopCount(db)
	migrateFlowScripts(db)
	migrateUploadedFiles(db)
	migrateWorkspaceCollectionVariables(db)
	migrateRequestScripts(db)

	return nil
}

func createTables(db *sql.DB) error {
	schema := `
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
    body_size INTEGER DEFAULT 0,
    is_binary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_collection ON requests(collection_id);
CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);
CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON flow_steps(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_steps_order ON flow_steps(flow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_history_request ON request_history(request_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON request_history(created_at DESC);
`
	_, err := db.Exec(schema)
	return err
}

func migrateFlowSteps(db *sql.DB) {
	// Add new columns (ignore errors if they already exist)
	alterStatements := []string{
		"ALTER TABLE flow_steps ADD COLUMN name TEXT NOT NULL DEFAULT ''",
		"ALTER TABLE flow_steps ADD COLUMN method TEXT NOT NULL DEFAULT 'GET'",
		"ALTER TABLE flow_steps ADD COLUMN url TEXT NOT NULL DEFAULT ''",
		"ALTER TABLE flow_steps ADD COLUMN headers TEXT DEFAULT '{}'",
		"ALTER TABLE flow_steps ADD COLUMN body TEXT DEFAULT ''",
		"ALTER TABLE flow_steps ADD COLUMN body_type TEXT DEFAULT 'none'",
	}
	for _, stmt := range alterStatements {
		db.Exec(stmt) // Ignore "duplicate column" errors
	}

	// Backfill inline fields from linked requests
	_, err := db.Exec(`
		UPDATE flow_steps SET
			name = COALESCE((SELECT r.name FROM requests r WHERE r.id = flow_steps.request_id), name),
			method = COALESCE((SELECT r.method FROM requests r WHERE r.id = flow_steps.request_id), method),
			url = COALESCE((SELECT r.url FROM requests r WHERE r.id = flow_steps.request_id), url),
			headers = COALESCE((SELECT r.headers FROM requests r WHERE r.id = flow_steps.request_id), headers),
			body = COALESCE((SELECT r.body FROM requests r WHERE r.id = flow_steps.request_id), body),
			body_type = COALESCE((SELECT r.body_type FROM requests r WHERE r.id = flow_steps.request_id), body_type)
		WHERE request_id IS NOT NULL AND url = ''
	`)
	if err != nil {
		log.Printf("Flow steps backfill: %v", err)
	}

	// Recreate table to make request_id nullable (SQLite doesn't support ALTER COLUMN)
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS flow_steps_new (
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
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		log.Printf("Flow steps new table: %v", err)
		return
	}

	_, err = db.Exec(`
		INSERT OR IGNORE INTO flow_steps_new
			(id, flow_id, request_id, step_order, delay_ms, extract_vars, condition,
			 name, method, url, headers, body, body_type, created_at, updated_at)
		SELECT id, flow_id, request_id, step_order, delay_ms, extract_vars, condition,
			   name, method, url, headers, body, body_type, created_at, updated_at
		FROM flow_steps
	`)
	if err != nil {
		log.Printf("Flow steps copy: %v", err)
		return
	}

	if _, err = db.Exec("DROP TABLE flow_steps"); err != nil {
		log.Printf("Flow steps drop: %v", err)
		return
	}

	if _, err = db.Exec("ALTER TABLE flow_steps_new RENAME TO flow_steps"); err != nil {
		log.Printf("Flow steps rename: %v", err)
		return
	}

	// Recreate indexes
	db.Exec("CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON flow_steps(flow_id)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_flow_steps_order ON flow_steps(flow_id, step_order)")
}

func migrateProxyOverrides(db *sql.DB) {
	stmts := []string{
		"ALTER TABLE requests ADD COLUMN proxy_id INTEGER DEFAULT NULL",
		"ALTER TABLE flow_steps ADD COLUMN proxy_id INTEGER DEFAULT NULL",
	}
	for _, s := range stmts {
		db.Exec(s) // Ignore "duplicate column" errors
	}
}

func migrateCookies(db *sql.DB) {
	stmts := []string{
		"ALTER TABLE requests ADD COLUMN cookies TEXT DEFAULT '{}'",
		"ALTER TABLE flow_steps ADD COLUMN cookies TEXT DEFAULT '{}'",
	}
	for _, s := range stmts {
		db.Exec(s) // Ignore "duplicate column" errors
	}
}

func migrateWorkspaces(db *sql.DB) {
	// 1. Create workspaces table
	db.Exec(`CREATE TABLE IF NOT EXISTS workspaces (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)

	// 2. Create default workspace (id=1)
	db.Exec(`INSERT OR IGNORE INTO workspaces (id, name) VALUES (1, 'Default')`)

	// 3. Add workspace_id column to all tables (idempotent — ignore errors if already exists)
	tables := []string{"collections", "requests", "environments", "proxies", "flows", "flow_steps", "request_history"}
	for _, t := range tables {
		db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE", t))
	}
}

func migrateBinaryResponse(db *sql.DB) {
	stmts := []string{
		"ALTER TABLE request_history ADD COLUMN body_size INTEGER DEFAULT 0",
		"ALTER TABLE request_history ADD COLUMN is_binary INTEGER DEFAULT 0",
	}
	for _, s := range stmts {
		db.Exec(s) // Ignore "duplicate column" errors
	}
}

func migrateLoopCount(db *sql.DB) {
	db.Exec("ALTER TABLE flow_steps ADD COLUMN loop_count INTEGER DEFAULT 1")
}

func migrateFlowScripts(db *sql.DB) {
	stmts := []string{
		"ALTER TABLE flow_steps ADD COLUMN pre_script TEXT DEFAULT ''",
		"ALTER TABLE flow_steps ADD COLUMN post_script TEXT DEFAULT ''",
		"ALTER TABLE flow_steps ADD COLUMN continue_on_error INTEGER DEFAULT 0",
	}
	for _, s := range stmts {
		db.Exec(s) // Ignore "duplicate column" errors
	}
	// Create index for step name lookups (for goto by name)
	db.Exec("CREATE INDEX IF NOT EXISTS idx_flow_steps_name ON flow_steps(flow_id, name)")
}

func migrateUploadedFiles(db *sql.DB) {
	db.Exec(`CREATE TABLE IF NOT EXISTS uploaded_files (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
		original_name TEXT NOT NULL,
		stored_name TEXT NOT NULL,
		content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
		size INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	db.Exec("CREATE INDEX IF NOT EXISTS idx_uploaded_files_workspace ON uploaded_files(workspace_id)")
}

func migrateRequestScripts(db *sql.DB) {
	stmts := []string{
		"ALTER TABLE requests ADD COLUMN pre_script TEXT DEFAULT ''",
		"ALTER TABLE requests ADD COLUMN post_script TEXT DEFAULT ''",
	}
	for _, s := range stmts {
		db.Exec(s) // Ignore "duplicate column" errors
	}
}

func migrateWorkspaceCollectionVariables(db *sql.DB) {
	// Add variables column to workspaces for pm.globals
	db.Exec("ALTER TABLE workspaces ADD COLUMN variables TEXT DEFAULT '{}'")
	// Add variables column to collections for pm.collectionVariables
	db.Exec("ALTER TABLE collections ADD COLUMN variables TEXT DEFAULT '{}'")
}
