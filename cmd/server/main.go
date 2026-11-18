package main

import (
	"context"
	"database/sql"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

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

	bridgeUploadDir := os.Getenv("BRIDGE_UPLOAD_DIR")
	if bridgeUploadDir == "" {
		bridgeUploadDir = filepath.Join(filepath.Dir(dbPath), "bridge-bundles")
	}
	bridgeMaxBytes := int64(2 << 30)
	if rawMax := os.Getenv("BRIDGE_MAX_UPLOAD_BYTES"); rawMax != "" {
		bridgeMaxBytes, err = strconv.ParseInt(rawMax, 10, 64)
		if err != nil || bridgeMaxBytes <= 0 {
			log.Fatal("BRIDGE_MAX_UPLOAD_BYTES must be a positive integer")
		}
	}
	bridgeStorage, err := service.NewBridgeStorage(bridgeUploadDir, bridgeMaxBytes)
	if err != nil {
		log.Fatal("Failed to initialize bridge storage:", err)
	}
	bridgeService := service.NewBridgeService(db, bridgeStorage, 30*24*time.Hour)
	bridgeFileUploadDir := os.Getenv("BRIDGE_FILE_UPLOAD_DIR")
	if bridgeFileUploadDir == "" {
		bridgeFileUploadDir = filepath.Join(filepath.Dir(dbPath), "bridge-files")
	}
	bridgeFileMaxBytes := int64(500 * 1024 * 1024)
	if rawMax := os.Getenv("BRIDGE_FILE_MAX_UPLOAD_BYTES"); rawMax != "" {
		bridgeFileMaxBytes, err = strconv.ParseInt(rawMax, 10, 64)
		if err != nil || bridgeFileMaxBytes <= 0 {
			log.Fatal("BRIDGE_FILE_MAX_UPLOAD_BYTES must be a positive integer")
		}
	}
	bridgeFileRetention := 14 * 24 * time.Hour
	if rawHours := os.Getenv("BRIDGE_FILE_RETENTION_HOURS"); rawHours != "" {
		hours, parseErr := strconv.ParseInt(rawHours, 10, 64)
		if parseErr != nil || hours <= 0 {
			log.Fatal("BRIDGE_FILE_RETENTION_HOURS must be a positive integer")
		}
		bridgeFileRetention = time.Duration(hours) * time.Hour
	}
	bridgeFileStorage, err := service.NewBridgeFileStorage(bridgeFileUploadDir, bridgeFileMaxBytes)
	if err != nil {
		log.Fatal("Failed to initialize bridge file storage:", err)
	}
	bridgeFileService := service.NewBridgeFileService(db, bridgeFileStorage, bridgeFileRetention)

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
	bridgeHandler := handler.NewBridgeHandler(bridgeService)
	bridgeFileHandler := handler.NewBridgeFileHandler(bridgeFileService)
	wsHandler := handler.NewWebSocketHandler(wsRelay)
	erdHandler := handler.NewErdHandler(queries)
	erdCollectionHandler := handler.NewErdCollectionHandler(queries, db)

	// Setup router
	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(middleware.CORS)

	// Health check (outside /api to avoid workspace middleware)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Bridge endpoints are consumed by installed desktop agents, so they do
	// not use Relay's browser-workspace middleware.
	r.Route("/api/bridge/v1", func(r chi.Router) {
		r.Post("/transfers", bridgeHandler.Upload)
		r.Get("/transfers", bridgeHandler.List)
		r.Get("/transfers/{id}/bundle", bridgeHandler.Download)
		r.Post("/transfers/{id}/download-ack", bridgeHandler.AcknowledgeDownload)
		r.Delete("/transfers/{id}", bridgeHandler.Delete)
		r.Post("/files", bridgeFileHandler.Upload)
		r.Get("/files", bridgeFileHandler.List)
		r.Get("/files/{id}/content", bridgeFileHandler.Download)
		r.Post("/files/{id}/download-ack", bridgeFileHandler.AcknowledgeDownload)
		r.Delete("/files/{id}", bridgeFileHandler.Delete)
	})

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
		r.Get("/collections/{id}/export/postman", collectionHandler.ExportPostman)
		r.Post("/collections/import/postman", collectionHandler.ImportPostman)

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
		r.Post("/flows/{id}/run/stream", flowHandler.RunStream)
		r.Post("/flows/{id}/duplicate", flowHandler.Duplicate)
		r.Get("/flows/{id}/steps", flowHandler.ListSteps)
		r.Post("/flows/{id}/steps", flowHandler.CreateStep)
		r.Post("/flows/{id}/import-collection", flowHandler.ImportCollection)
		r.Put("/flows/{id}/steps/{stepId}", flowHandler.UpdateStep)
		r.Delete("/flows/{id}/steps/{stepId}", flowHandler.DeleteStep)

		// ERDs
		r.Get("/erd-collections", erdCollectionHandler.List)
		r.Post("/erd-collections", erdCollectionHandler.Create)
		r.Put("/erd-collections/reorder", erdCollectionHandler.Reorder)
		r.Get("/erd-collections/{id}", erdCollectionHandler.Get)
		r.Put("/erd-collections/{id}", erdCollectionHandler.Update)
		r.Delete("/erd-collections/{id}", erdCollectionHandler.Delete)
		r.Post("/erd-collections/{id}/duplicate", erdCollectionHandler.Duplicate)
		r.Get("/erds", erdHandler.List)
		r.Post("/erds", erdHandler.Create)
		r.Put("/erds/reorder", erdHandler.Reorder)
		r.Post("/erds/preview", erdHandler.Preview)
		r.Post("/erds/generate/kotlin", erdHandler.GenerateKotlin)
		r.Post("/erds/generate/java", erdHandler.GenerateJava)
		r.Post("/erds/generate/mysql-ddl", erdHandler.GenerateMySQLDDL)
		r.Get("/erds/{id}", erdHandler.Get)
		r.Put("/erds/{id}", erdHandler.Update)
		r.Delete("/erds/{id}", erdHandler.Delete)
		r.Post("/erds/{id}/duplicate", erdHandler.Duplicate)

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

	go func() {
		cleanup := func() {
			count, err := bridgeService.CleanupExpired(context.Background())
			if err != nil {
				log.Printf("Bridge cleanup failed: %v", err)
			} else if count > 0 {
				log.Printf("Removed %d expired bridge transfer(s)", count)
			}
			fileCount, err := bridgeFileService.CleanupExpired(context.Background())
			if err != nil {
				log.Printf("Bridge file cleanup failed: %v", err)
			} else if fileCount > 0 {
				log.Printf("Removed %d expired bridge file(s)", fileCount)
			}
		}
		cleanup()
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cleanup()
		}
	}()

	log.Printf("Server starting on http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal("Server failed:", err)
	}
}
