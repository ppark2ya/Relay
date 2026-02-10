package main

import (
	"database/sql"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"relay/internal/handler"
	"relay/internal/middleware"
	"relay/internal/migration"
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
	if err := migration.Run(db); err != nil {
		log.Fatal("Failed to run migrations:", err)
	}

	// Initialize repository and services
	queries := repository.New(db)

	// File storage setup
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = filepath.Join(filepath.Dir(dbPath), "uploads")
	}
	fileStorage, err := service.NewFileStorage(uploadDir)
	if err != nil {
		log.Fatal("Failed to initialize file storage:", err)
	}

	variableResolver := service.NewVariableResolver(queries)
	requestExecutor := service.NewRequestExecutor(queries, variableResolver, fileStorage)
	flowRunner := service.NewFlowRunner(queries, requestExecutor, variableResolver)

	wsRelay := service.NewWebSocketRelay(queries, variableResolver)

	// Initialize handlers
	workspaceHandler := handler.NewWorkspaceHandler(queries)
	collectionHandler := handler.NewCollectionHandler(queries, db)
	requestHandler := handler.NewRequestHandler(queries, requestExecutor, flowRunner)
	environmentHandler := handler.NewEnvironmentHandler(queries)
	proxyHandler := handler.NewProxyHandler(queries)
	flowHandler := handler.NewFlowHandler(queries, flowRunner, db)
	historyHandler := handler.NewHistoryHandler(queries)
	fileHandler := handler.NewFileHandler(db, queries, fileStorage)
	wsHandler := handler.NewWebSocketHandler(wsRelay)

	// Setup router
	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(middleware.CORS)

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Use(middleware.WorkspaceID)

		// Workspaces
		r.Get("/workspaces", workspaceHandler.List)
		r.Post("/workspaces", workspaceHandler.Create)
		r.Get("/workspaces/{id}", workspaceHandler.Get)
		r.Put("/workspaces/{id}", workspaceHandler.Update)
		r.Delete("/workspaces/{id}", workspaceHandler.Delete)

		// Collections
		r.Get("/collections", collectionHandler.List)
		r.Post("/collections", collectionHandler.Create)
		r.Put("/collections/reorder", collectionHandler.Reorder)
		r.Get("/collections/{id}", collectionHandler.Get)
		r.Put("/collections/{id}", collectionHandler.Update)
		r.Delete("/collections/{id}", collectionHandler.Delete)
		r.Post("/collections/{id}/duplicate", collectionHandler.Duplicate)

		// Ad-hoc execute (no saved request needed)
		r.Post("/execute", requestHandler.ExecuteAdhoc)

		// Requests
		r.Get("/requests", requestHandler.List)
		r.Post("/requests", requestHandler.Create)
		r.Put("/requests/reorder", requestHandler.Reorder)
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
		r.Put("/flows/reorder", flowHandler.Reorder)
		r.Get("/flows/{id}", flowHandler.Get)
		r.Put("/flows/{id}", flowHandler.Update)
		r.Delete("/flows/{id}", flowHandler.Delete)
		r.Post("/flows/{id}/run", flowHandler.Run)
		r.Post("/flows/{id}/duplicate", flowHandler.Duplicate)
		r.Get("/flows/{id}/steps", flowHandler.ListSteps)
		r.Post("/flows/{id}/steps", flowHandler.CreateStep)
		r.Put("/flows/{id}/steps/{stepId}", flowHandler.UpdateStep)
		r.Delete("/flows/{id}/steps/{stepId}", flowHandler.DeleteStep)

		// Files
		r.Post("/files/upload", fileHandler.Upload)
		r.Post("/files/cleanup", fileHandler.Cleanup)
		r.Get("/files/{id}", fileHandler.Get)
		r.Delete("/files/{id}", fileHandler.Delete)

		// WebSocket Relay
		r.Get("/ws/relay", wsHandler.Relay)

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

