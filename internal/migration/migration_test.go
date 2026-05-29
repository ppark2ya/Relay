package migration

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()

	db, err := sql.Open("sqlite", ":memory:?_foreign_keys=on")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	return db
}

func TestRunPreservesFlowStepScriptsOnRepeatedRuns(t *testing.T) {
	db := openTestDB(t)

	if err := Run(db); err != nil {
		t.Fatalf("first migration run: %v", err)
	}

	if _, err := db.Exec(`INSERT INTO flows (id, name, workspace_id, sort_order) VALUES (1, 'flow', 1, 1)`); err != nil {
		t.Fatalf("insert flow: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO flow_steps (
			id, flow_id, request_id, step_order, delay_ms, extract_vars, condition,
			name, method, url, headers, body, body_type, cookies, proxy_id,
			workspace_id, loop_count, pre_script, post_script, continue_on_error
		)
		VALUES (
			1, 1, NULL, 1, 250, '{"token":"$.token"}', '{{enabled}}',
			'step', 'POST', 'https://example.test', '{"X-Test":"1"}',
			'{"ok":true}', 'json', '{"session":"abc"}', 42,
			1, 3, 'pm.variables.set("before", "yes");',
			'pm.test("after", function () {});', 1
		)
	`); err != nil {
		t.Fatalf("insert flow step: %v", err)
	}

	if err := Run(db); err != nil {
		t.Fatalf("second migration run: %v", err)
	}

	var got struct {
		Cookies         string
		ProxyID         sql.NullInt64
		WorkspaceID     int64
		LoopCount       sql.NullInt64
		PreScript       sql.NullString
		PostScript      sql.NullString
		ContinueOnError sql.NullInt64
	}
	err := db.QueryRow(`
		SELECT cookies, proxy_id, workspace_id, loop_count, pre_script, post_script, continue_on_error
		FROM flow_steps
		WHERE id = 1
	`).Scan(
		&got.Cookies,
		&got.ProxyID,
		&got.WorkspaceID,
		&got.LoopCount,
		&got.PreScript,
		&got.PostScript,
		&got.ContinueOnError,
	)
	if err != nil {
		t.Fatalf("query flow step: %v", err)
	}

	if got.Cookies != `{"session":"abc"}` {
		t.Fatalf("cookies = %q, want preserved value", got.Cookies)
	}
	if !got.ProxyID.Valid || got.ProxyID.Int64 != 42 {
		t.Fatalf("proxy_id = %+v, want 42", got.ProxyID)
	}
	if got.WorkspaceID != 1 {
		t.Fatalf("workspace_id = %d, want 1", got.WorkspaceID)
	}
	if !got.LoopCount.Valid || got.LoopCount.Int64 != 3 {
		t.Fatalf("loop_count = %+v, want 3", got.LoopCount)
	}
	if !got.PreScript.Valid || got.PreScript.String != `pm.variables.set("before", "yes");` {
		t.Fatalf("pre_script = %+v, want preserved value", got.PreScript)
	}
	if !got.PostScript.Valid || got.PostScript.String != `pm.test("after", function () {});` {
		t.Fatalf("post_script = %+v, want preserved value", got.PostScript)
	}
	if !got.ContinueOnError.Valid || got.ContinueOnError.Int64 != 1 {
		t.Fatalf("continue_on_error = %+v, want 1", got.ContinueOnError)
	}
	assertNoFlowStepsNewTable(t, db)
}

func TestRunMigratesLegacyFlowStepsRequestIDToNullable(t *testing.T) {
	db := openTestDB(t)

	_, err := db.Exec(`
		CREATE TABLE collections (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			parent_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE requests (
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
		CREATE TABLE flows (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE flow_steps (
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
		INSERT INTO collections (id, name) VALUES (1, 'collection');
		INSERT INTO requests (id, collection_id, name, method, url, headers, body, body_type)
			VALUES (1, 1, 'request', 'PATCH', 'https://example.test/legacy', '{"A":"B"}', '{"a":1}', 'json');
		INSERT INTO flows (id, name, description) VALUES (1, 'legacy flow', 'legacy');
		INSERT INTO flow_steps (id, flow_id, request_id, step_order, delay_ms, extract_vars, condition)
			VALUES (1, 1, 1, 7, 500, '{"id":"$.id"}', '{{shouldRun}}');
	`)
	if err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}

	if err := Run(db); err != nil {
		t.Fatalf("migration run: %v", err)
	}

	if requestIDColumnNotNull(t, db) {
		t.Fatalf("request_id is still NOT NULL after migration")
	}

	var got struct {
		RequestID       sql.NullInt64
		StepOrder       int64
		DelayMs         sql.NullInt64
		ExtractVars     sql.NullString
		Condition       sql.NullString
		Name            string
		Method          string
		URL             string
		Headers         sql.NullString
		Body            sql.NullString
		BodyType        sql.NullString
		Cookies         sql.NullString
		WorkspaceID     int64
		LoopCount       sql.NullInt64
		PreScript       sql.NullString
		PostScript      sql.NullString
		ContinueOnError sql.NullInt64
	}
	err = db.QueryRow(`
		SELECT request_id, step_order, delay_ms, extract_vars, condition,
			name, method, url, headers, body, body_type, cookies, workspace_id,
			loop_count, pre_script, post_script, continue_on_error
		FROM flow_steps
		WHERE id = 1
	`).Scan(
		&got.RequestID,
		&got.StepOrder,
		&got.DelayMs,
		&got.ExtractVars,
		&got.Condition,
		&got.Name,
		&got.Method,
		&got.URL,
		&got.Headers,
		&got.Body,
		&got.BodyType,
		&got.Cookies,
		&got.WorkspaceID,
		&got.LoopCount,
		&got.PreScript,
		&got.PostScript,
		&got.ContinueOnError,
	)
	if err != nil {
		t.Fatalf("query migrated legacy step: %v", err)
	}

	if !got.RequestID.Valid || got.RequestID.Int64 != 1 {
		t.Fatalf("request_id = %+v, want 1", got.RequestID)
	}
	if got.StepOrder != 7 {
		t.Fatalf("step_order = %d, want 7", got.StepOrder)
	}
	if !got.DelayMs.Valid || got.DelayMs.Int64 != 500 {
		t.Fatalf("delay_ms = %+v, want 500", got.DelayMs)
	}
	if !got.ExtractVars.Valid || got.ExtractVars.String != `{"id":"$.id"}` {
		t.Fatalf("extract_vars = %+v, want preserved value", got.ExtractVars)
	}
	if !got.Condition.Valid || got.Condition.String != `{{shouldRun}}` {
		t.Fatalf("condition = %+v, want preserved value", got.Condition)
	}
	if got.Name != "request" || got.Method != "PATCH" || got.URL != "https://example.test/legacy" {
		t.Fatalf("backfilled request fields = (%q, %q, %q)", got.Name, got.Method, got.URL)
	}
	if !got.Headers.Valid || got.Headers.String != `{"A":"B"}` {
		t.Fatalf("headers = %+v, want request headers", got.Headers)
	}
	if !got.Body.Valid || got.Body.String != `{"a":1}` {
		t.Fatalf("body = %+v, want request body", got.Body)
	}
	if !got.BodyType.Valid || got.BodyType.String != "json" {
		t.Fatalf("body_type = %+v, want json", got.BodyType)
	}
	if !got.Cookies.Valid || got.Cookies.String != `{}` {
		t.Fatalf("cookies = %+v, want default {}", got.Cookies)
	}
	if got.WorkspaceID != 1 {
		t.Fatalf("workspace_id = %d, want 1", got.WorkspaceID)
	}
	if !got.LoopCount.Valid || got.LoopCount.Int64 != 1 {
		t.Fatalf("loop_count = %+v, want 1", got.LoopCount)
	}
	if got.PreScript.String != "" || got.PostScript.String != "" {
		t.Fatalf("scripts = (%+v, %+v), want empty defaults", got.PreScript, got.PostScript)
	}
	if !got.ContinueOnError.Valid || got.ContinueOnError.Int64 != 0 {
		t.Fatalf("continue_on_error = %+v, want 0", got.ContinueOnError)
	}
	assertNoFlowStepsNewTable(t, db)
}

func requestIDColumnNotNull(t *testing.T, db *sql.DB) bool {
	t.Helper()

	rows, err := db.Query(`PRAGMA table_info(flow_steps)`)
	if err != nil {
		t.Fatalf("pragma table_info: %v", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, typ string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &typ, &notNull, &defaultValue, &pk); err != nil {
			t.Fatalf("scan table_info: %v", err)
		}
		if name == "request_id" {
			return notNull == 1
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read table_info: %v", err)
	}

	t.Fatalf("request_id column not found")
	return false
}

func assertNoFlowStepsNewTable(t *testing.T, db *sql.DB) {
	t.Helper()

	var count int
	err := db.QueryRow(`
		SELECT COUNT(*)
		FROM sqlite_master
		WHERE type = 'table' AND name = 'flow_steps_new'
	`).Scan(&count)
	if err != nil {
		t.Fatalf("query sqlite_master: %v", err)
	}
	if count != 0 {
		t.Fatalf("flow_steps_new table remains after migration")
	}
}
