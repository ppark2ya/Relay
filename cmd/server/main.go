package main

import (
	"database/sql"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/repository"
	"relay/internal/service"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	_ "modernc.org/sqlite"
)

//go:embed dist/*
var webFS embed.FS

func main() {
	// Database setup
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./relay.db"
	}

	db, err := sql.Open("sqlite", dbPath+"?_foreign_keys=on")
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	// Run migrations
	if err := runMigrations(db); err != nil {
		log.Fatal("Failed to run migrations:", err)
	}

	// Initialize repository and services
	queries := repository.New(db)

	variableResolver := service.NewVariableResolver(queries)
	requestExecutor := service.NewRequestExecutor(queries, variableResolver)
	flowRunner := service.NewFlowRunner(queries, requestExecutor, variableResolver)

	// Initialize handlers
	collectionHandler := handler.NewCollectionHandler(queries, db)
	requestHandler := handler.NewRequestHandler(queries, requestExecutor)
	environmentHandler := handler.NewEnvironmentHandler(queries)
	proxyHandler := handler.NewProxyHandler(queries)
	flowHandler := handler.NewFlowHandler(queries, flowRunner, db)
	historyHandler := handler.NewHistoryHandler(queries)

	// Setup router
	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(middleware.CORS)

	// API routes
	r.Route("/api", func(r chi.Router) {
		// Collections
		r.Get("/collections", collectionHandler.List)
		r.Post("/collections", collectionHandler.Create)
		r.Get("/collections/{id}", collectionHandler.Get)
		r.Put("/collections/{id}", collectionHandler.Update)
		r.Delete("/collections/{id}", collectionHandler.Delete)
		r.Post("/collections/{id}/duplicate", collectionHandler.Duplicate)

		// Ad-hoc execute (no saved request needed)
		r.Post("/execute", requestHandler.ExecuteAdhoc)

		// Requests
		r.Get("/requests", requestHandler.List)
		r.Post("/requests", requestHandler.Create)
		r.Get("/requests/{id}", requestHandler.Get)
		r.Put("/requests/{id}", requestHandler.Update)
		r.Delete("/requests/{id}", requestHandler.Delete)
		r.Post("/requests/{id}/execute", requestHandler.Execute)
		r.Post("/requests/{id}/duplicate", requestHandler.Duplicate)

		// Environments
		r.Get("/environments", environmentHandler.List)
		r.Post("/environments", environmentHandler.Create)
		r.Get("/environments/{id}", environmentHandler.Get)
		r.Put("/environments/{id}", environmentHandler.Update)
		r.Delete("/environments/{id}", environmentHandler.Delete)
		r.Post("/environments/{id}/activate", environmentHandler.Activate)

		// Proxies
		r.Get("/proxies", proxyHandler.List)
		r.Post("/proxies", proxyHandler.Create)
		r.Get("/proxies/{id}", proxyHandler.Get)
		r.Put("/proxies/{id}", proxyHandler.Update)
		r.Delete("/proxies/{id}", proxyHandler.Delete)
		r.Post("/proxies/{id}/activate", proxyHandler.Activate)
		r.Post("/proxies/deactivate", proxyHandler.Deactivate)
		r.Post("/proxies/{id}/test", proxyHandler.Test)

		// Flows
		r.Get("/flows", flowHandler.List)
		r.Post("/flows", flowHandler.Create)
		r.Get("/flows/{id}", flowHandler.Get)
		r.Put("/flows/{id}", flowHandler.Update)
		r.Delete("/flows/{id}", flowHandler.Delete)
		r.Post("/flows/{id}/run", flowHandler.Run)
		r.Post("/flows/{id}/duplicate", flowHandler.Duplicate)
		r.Get("/flows/{id}/steps", flowHandler.ListSteps)
		r.Post("/flows/{id}/steps", flowHandler.CreateStep)
		r.Put("/flows/{id}/steps/{stepId}", flowHandler.UpdateStep)
		r.Delete("/flows/{id}/steps/{stepId}", flowHandler.DeleteStep)

		// History
		r.Get("/history", historyHandler.List)
		r.Get("/history/{id}", historyHandler.Get)
		r.Delete("/history/{id}", historyHandler.Delete)
	})

	// Serve static files
	distFS, err := fs.Sub(webFS, "dist")
	if err != nil {
		log.Fatal("Failed to get dist filesystem:", err)
	}

	fileServer := http.FileServer(http.FS(distFS))
	r.Handle("/*", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to serve the file, if not found serve index.html for SPA routing
		path := r.URL.Path
		if path == "/" {
			path = "/index.html"
		}

		if _, err := fs.Stat(distFS, path[1:]); os.IsNotExist(err) {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	}))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal("Server failed:", err)
	}
}

func runMigrations(db *sql.DB) error {
	migration := `
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_collection ON requests(collection_id);
CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);
CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON flow_steps(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_steps_order ON flow_steps(flow_id, step_order);
CREATE INDEX IF NOT EXISTS idx_history_request ON request_history(request_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON request_history(created_at DESC);
`
	if _, err := db.Exec(migration); err != nil {
		return err
	}

	// Migrate existing flow_steps: add inline fields and make request_id nullable
	if err := migrateFlowSteps(db); err != nil {
		log.Printf("Flow steps migration: %v", err)
	}

	return nil
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
		return err
	}

	// Recreate table to make request_id nullable (SQLite doesn't support ALTER COLUMN)
	// Check if request_id is still NOT NULL by attempting to insert a NULL
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
		return err
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
		return err
	}

	_, err = db.Exec("DROP TABLE flow_steps")
	if err != nil {
		return err
	}

	_, err = db.Exec("ALTER TABLE flow_steps_new RENAME TO flow_steps")
	if err != nil {
		return err
	}

	// Recreate indexes
	db.Exec("CREATE INDEX IF NOT EXISTS idx_flow_steps_flow ON flow_steps(flow_id)")
	db.Exec("CREATE INDEX IF NOT EXISTS idx_flow_steps_order ON flow_steps(flow_id, step_order)")

	return nil
}
