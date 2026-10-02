package migration

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

// Run executes all database migrations
func Run(db *sql.DB) error {
	if err := createTables(db); err != nil {
		return err
	}

	// Incremental migrations (idempotent)
	if err := migrateFlowSteps(db); err != nil {
		return err
	}
	migrateProxyOverrides(db)
	migrateCookies(db)
	migrateWorkspaces(db)
	migrateBinaryResponse(db)
	migrateLoopCount(db)
	migrateFlowScripts(db)
	migrateUploadedFiles(db)
	migrateWorkspaceCollectionVariables(db)
	migrateRequestScripts(db)
	migrateSortOrder(db)
	migrateErdDocuments(db)
	migrateQA(db)

	return nil
}

func migrateQA(db *sql.DB) {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS qa_topics (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6', sort_order INTEGER NOT NULL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(workspace_id, name))`,
		`CREATE TABLE IF NOT EXISTS qa_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, qa_key TEXT NOT NULL, topic_id INTEGER REFERENCES qa_topics(id) ON DELETE RESTRICT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', precondition TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT '보통', status TEXT NOT NULL DEFAULT '대기', note TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(workspace_id, qa_key))`,
		`CREATE TABLE IF NOT EXISTS qa_test_steps (id INTEGER PRIMARY KEY AUTOINCREMENT, qa_case_id INTEGER NOT NULL REFERENCES qa_cases(id) ON DELETE CASCADE, step_order INTEGER NOT NULL, action TEXT NOT NULL, expected_result TEXT NOT NULL DEFAULT '')`,
		`CREATE TABLE IF NOT EXISTS qa_case_links (id INTEGER PRIMARY KEY AUTOINCREMENT, qa_case_id INTEGER NOT NULL REFERENCES qa_cases(id) ON DELETE CASCADE, resource_type TEXT NOT NULL CHECK(resource_type IN ('request','flow')), resource_id INTEGER NOT NULL, UNIQUE(qa_case_id, resource_type, resource_id))`,
		`CREATE TABLE IF NOT EXISTS qa_case_history (id INTEGER PRIMARY KEY AUTOINCREMENT, qa_case_id INTEGER NOT NULL REFERENCES qa_cases(id) ON DELETE CASCADE, from_status TEXT NOT NULL DEFAULT '', to_status TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
		`CREATE INDEX IF NOT EXISTS idx_qa_cases_workspace ON qa_cases(workspace_id, topic_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_qa_steps_case ON qa_test_steps(qa_case_id, step_order)`,
		`CREATE TRIGGER IF NOT EXISTS cleanup_qa_request_links AFTER DELETE ON requests BEGIN DELETE FROM qa_case_links WHERE resource_type='request' AND resource_id=OLD.id; END`,
		`CREATE TRIGGER IF NOT EXISTS cleanup_qa_flow_links AFTER DELETE ON flows BEGIN DELETE FROM qa_case_links WHERE resource_type='flow' AND resource_id=OLD.id; END`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			log.Printf("qa migration failed: %v", err)
		}
	}
}

func createTables(db *sql.DB) error {
	schema := `
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

type tableColumn struct {
	notNull bool
}

func readTableColumns(db *sql.DB, table string) (map[string]tableColumn, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	columns := make(map[string]tableColumn)
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return nil, err
		}
		columns[name] = tableColumn{notNull: notNull == 1}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return columns, nil
}

func flowStepsRequestIDNullable(db *sql.DB) (bool, error) {
	columns, err := readTableColumns(db, "flow_steps")
	if err != nil {
		return false, err
	}
	column, ok := columns["request_id"]
	if !ok {
		return false, fmt.Errorf("flow_steps.request_id column not found")
	}
	return !column.notNull, nil
}

func flowStepCopyExpr(columns map[string]tableColumn, column, fallback string) string {
	if _, ok := columns[column]; ok {
		return column
	}
	return fallback
}

func migrateFlowSteps(db *sql.DB) error {
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

	requestIDNullable, err := flowStepsRequestIDNullable(db)
	if err != nil {
		return fmt.Errorf("check flow_steps request_id nullability: %w", err)
	}
	if requestIDNullable {
		return nil
	}

	return recreateFlowStepsWithNullableRequestID(db)
}

func recreateFlowStepsWithNullableRequestID(db *sql.DB) error {
	columns, err := readTableColumns(db, "flow_steps")
	if err != nil {
		return fmt.Errorf("read flow_steps columns: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`CREATE TABLE IF NOT EXISTS workspaces (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`); err != nil {
		return fmt.Errorf("create workspaces before flow_steps migration: %w", err)
	}
	if _, err := tx.Exec(`INSERT OR IGNORE INTO workspaces (id, name) VALUES (1, 'Default')`); err != nil {
		return fmt.Errorf("create default workspace before flow_steps migration: %w", err)
	}

	if _, err := tx.Exec("DROP TABLE IF EXISTS flow_steps_new"); err != nil {
		return fmt.Errorf("drop stale flow_steps_new: %w", err)
	}

	if _, err := tx.Exec(`
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
			cookies TEXT DEFAULT '{}',
			proxy_id INTEGER DEFAULT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
			loop_count INTEGER DEFAULT 1,
			pre_script TEXT DEFAULT '',
			post_script TEXT DEFAULT '',
			continue_on_error INTEGER DEFAULT 0
		)
	`); err != nil {
		return fmt.Errorf("create flow_steps_new: %w", err)
	}

	insertColumns := []string{
		"id", "flow_id", "request_id", "step_order", "delay_ms", "extract_vars", "condition",
		"name", "method", "url", "headers", "body", "body_type", "cookies", "proxy_id",
		"created_at", "updated_at", "workspace_id", "loop_count", "pre_script", "post_script",
		"continue_on_error",
	}
	selectExpressions := []string{
		"id",
		"flow_id",
		"request_id",
		"step_order",
		flowStepCopyExpr(columns, "delay_ms", "0"),
		flowStepCopyExpr(columns, "extract_vars", "'{}'"),
		flowStepCopyExpr(columns, "condition", "''"),
		flowStepCopyExpr(columns, "name", "''"),
		flowStepCopyExpr(columns, "method", "'GET'"),
		flowStepCopyExpr(columns, "url", "''"),
		flowStepCopyExpr(columns, "headers", "'{}'"),
		flowStepCopyExpr(columns, "body", "''"),
		flowStepCopyExpr(columns, "body_type", "'none'"),
		flowStepCopyExpr(columns, "cookies", "'{}'"),
		flowStepCopyExpr(columns, "proxy_id", "NULL"),
		flowStepCopyExpr(columns, "created_at", "CURRENT_TIMESTAMP"),
		flowStepCopyExpr(columns, "updated_at", "CURRENT_TIMESTAMP"),
		flowStepCopyExpr(columns, "workspace_id", "1"),
		flowStepCopyExpr(columns, "loop_count", "1"),
		flowStepCopyExpr(columns, "pre_script", "''"),
		flowStepCopyExpr(columns, "post_script", "''"),
		flowStepCopyExpr(columns, "continue_on_error", "0"),
	}

	if _, err := tx.Exec(fmt.Sprintf(`
		INSERT OR IGNORE INTO flow_steps_new
			(%s)
		SELECT %s
		FROM flow_steps
	`, strings.Join(insertColumns, ", "), strings.Join(selectExpressions, ", "))); err != nil {
		return fmt.Errorf("copy flow_steps rows: %w", err)
	}

	if _, err := tx.Exec("DROP TABLE flow_steps"); err != nil {
		return fmt.Errorf("drop flow_steps: %w", err)
	}

	if _, err := tx.Exec("ALTER TABLE flow_steps_new RENAME TO flow_steps"); err != nil {
		return fmt.Errorf("rename flow_steps_new: %w", err)
	}

	// Recreate indexes
	if _, err := tx.Exec("CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON flow_steps(flow_id)"); err != nil {
		return fmt.Errorf("create idx_flow_steps_flow: %w", err)
	}
	if _, err := tx.Exec("CREATE INDEX IF NOT EXISTS idx_flow_steps_order ON flow_steps(flow_id, step_order)"); err != nil {
		return fmt.Errorf("create idx_flow_steps_order: %w", err)
	}

	return tx.Commit()
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

func migrateSortOrder(db *sql.DB) {
	stmts := []string{
		"ALTER TABLE collections ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
		"ALTER TABLE requests ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
		"ALTER TABLE flows ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
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

func migrateErdDocuments(db *sql.DB) {
	db.Exec(`CREATE TABLE IF NOT EXISTS erd_collections (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
		parent_id INTEGER REFERENCES erd_collections(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	db.Exec(`CREATE TABLE IF NOT EXISTS erd_documents (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		workspace_id INTEGER NOT NULL DEFAULT 1 REFERENCES workspaces(id) ON DELETE CASCADE,
		collection_id INTEGER REFERENCES erd_collections(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		dsl TEXT DEFAULT '{"entities":[]}',
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	db.Exec("ALTER TABLE erd_documents ADD COLUMN collection_id INTEGER REFERENCES erd_collections(id) ON DELETE CASCADE")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_erd_collections_workspace ON erd_collections(workspace_id, parent_id, sort_order)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_erd_documents_workspace ON erd_documents(workspace_id, sort_order)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_erd_documents_collection ON erd_documents(workspace_id, collection_id, sort_order)")
}
