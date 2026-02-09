package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"relay/internal/repository"
)

type OrphanFile struct {
	Type         string `json:"type"`                   // "unreferenced" | "disk_only"
	FileID       int64  `json:"fileId,omitempty"`
	StoredName   string `json:"storedName"`
	OriginalName string `json:"originalName,omitempty"`
}

type CleanupResult struct {
	Orphans []OrphanFile `json:"orphans"`
	Deleted int          `json:"deleted"`
	DryRun  bool         `json:"dryRun"`
}

func CleanupOrphanFiles(ctx context.Context, db *sql.DB, queries *repository.Queries, fs *FileStorage, dryRun bool) (*CleanupResult, error) {
	// 1. Get all uploaded files from DB
	dbFiles, err := queries.ListAllUploadedFiles(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list uploaded files: %w", err)
	}

	// Build maps: id → row, storedName → id
	dbByID := make(map[int64]repository.ListAllUploadedFilesRow, len(dbFiles))
	dbByName := make(map[string]int64, len(dbFiles))
	for _, f := range dbFiles {
		dbByID[f.ID] = f
		dbByName[f.StoredName] = f.ID
	}

	// 2. Collect all fileId references from request/flow_step bodies
	referencedIDs, err := collectReferencedFileIDs(ctx, db)
	if err != nil {
		return nil, fmt.Errorf("failed to collect file references: %w", err)
	}

	// 3. Find unreferenced DB files
	var orphans []OrphanFile
	for _, f := range dbFiles {
		if !referencedIDs[f.ID] {
			orphans = append(orphans, OrphanFile{
				Type:       "unreferenced",
				FileID:     f.ID,
				StoredName: f.StoredName,
			})
		}
	}

	// 4. Find disk-only files
	diskFiles, err := fs.ListDir()
	if err != nil {
		return nil, fmt.Errorf("failed to list disk files: %w", err)
	}
	for _, name := range diskFiles {
		if _, exists := dbByName[name]; !exists {
			orphans = append(orphans, OrphanFile{
				Type:       "disk_only",
				StoredName: name,
			})
		}
	}

	result := &CleanupResult{
		Orphans: orphans,
		DryRun:  dryRun,
	}

	if dryRun || len(orphans) == 0 {
		return result, nil
	}

	// 5. Delete orphans
	for _, o := range orphans {
		switch o.Type {
		case "unreferenced":
			_ = fs.Delete(o.StoredName)
			_ = queries.DeleteUploadedFile(ctx, o.FileID)
			result.Deleted++
		case "disk_only":
			_ = fs.Delete(o.StoredName)
			result.Deleted++
		}
	}

	return result, nil
}

type fileRef struct {
	FileID *int64 `json:"fileId,omitempty"`
}

func collectReferencedFileIDs(ctx context.Context, db *sql.DB) (map[int64]bool, error) {
	query := `
		SELECT body FROM requests WHERE body_type = 'formdata' AND body != ''
		UNION ALL
		SELECT body FROM flow_steps WHERE body_type = 'formdata' AND body != ''
	`
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	refs := make(map[int64]bool)
	for rows.Next() {
		var body string
		if err := rows.Scan(&body); err != nil {
			return nil, err
		}

		var items []fileRef
		if err := json.Unmarshal([]byte(body), &items); err != nil {
			continue // skip malformed JSON
		}
		for _, item := range items {
			if item.FileID != nil {
				refs[*item.FileID] = true
			}
		}
	}

	return refs, rows.Err()
}
