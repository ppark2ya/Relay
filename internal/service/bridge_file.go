package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

var (
	ErrInvalidBridgeFileManifest = errors.New("invalid bridge file manifest")
	ErrBridgeFileTooLarge        = errors.New("bridge file exceeds configured size limit")
)

// BridgeFileManifest describes an opaque, user-selected file. Relay does not
// inspect or execute its contents.
type BridgeFileManifest struct {
	ProjectID     string `json:"projectId"`
	SourceNetwork string `json:"sourceNetwork"`
	TargetNetwork string `json:"targetNetwork"`
	Filename      string `json:"filename"`
	SHA256        string `json:"sha256"`
}

type BridgeFile struct {
	ID            string     `json:"id"`
	ProjectID     string     `json:"projectId"`
	SourceNetwork string     `json:"sourceNetwork"`
	TargetNetwork string     `json:"targetNetwork"`
	Filename      string     `json:"filename"`
	SHA256        string     `json:"sha256"`
	Size          int64      `json:"size"`
	CreatedAt     time.Time  `json:"createdAt"`
	DownloadedAt  *time.Time `json:"downloadedAt,omitempty"`
	ExpiresAt     time.Time  `json:"expiresAt"`
	storedName    string
}

type BridgeFileStorage struct {
	baseDir  string
	maxBytes int64
}

func NewBridgeFileStorage(baseDir string, maxBytes int64) (*BridgeFileStorage, error) {
	if maxBytes <= 0 {
		return nil, fmt.Errorf("bridge file max bytes must be positive")
	}
	if err := osMkdirAll(baseDir); err != nil {
		return nil, fmt.Errorf("create bridge file directory: %w", err)
	}
	return &BridgeFileStorage{baseDir: baseDir, maxBytes: maxBytes}, nil
}

// osMkdirAll is kept small to make storage behaviour testable without sharing
// bundle-specific storage implementation details.
var osMkdirAll = func(path string) error { return os.MkdirAll(path, 0755) }

func (s *BridgeFileStorage) Store(reader io.Reader, expectedSHA256 string) (storedName string, size int64, actualSHA256 string, err error) {
	storedName = uuid.NewString() + ".blob"
	finalPath := filepath.Join(s.baseDir, storedName)
	tempPath := finalPath + ".tmp"

	f, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", 0, "", fmt.Errorf("create temporary bridge file: %w", err)
	}
	defer func() {
		_ = f.Close()
		if err != nil {
			_ = os.Remove(tempPath)
		}
	}()

	hasher := sha256.New()
	written, copyErr := io.Copy(io.MultiWriter(f, hasher), io.LimitReader(reader, s.maxBytes+1))
	if copyErr != nil {
		return "", 0, "", fmt.Errorf("write bridge file: %w", copyErr)
	}
	if written > s.maxBytes {
		return "", 0, "", ErrBridgeFileTooLarge
	}
	actualSHA256 = hex.EncodeToString(hasher.Sum(nil))
	if len(expectedSHA256) != 64 || !strings.EqualFold(actualSHA256, expectedSHA256) {
		return "", 0, "", fmt.Errorf("bridge file SHA-256 does not match manifest")
	}
	if err := f.Sync(); err != nil {
		return "", 0, "", fmt.Errorf("sync bridge file: %w", err)
	}
	if err := f.Close(); err != nil {
		return "", 0, "", fmt.Errorf("close bridge file: %w", err)
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		return "", 0, "", fmt.Errorf("finalize bridge file: %w", err)
	}
	return storedName, written, actualSHA256, nil
}

func (s *BridgeFileStorage) Open(storedName string) (*os.File, error) {
	if filepath.Base(storedName) != storedName {
		return nil, fmt.Errorf("invalid stored bridge file name")
	}
	return os.Open(filepath.Join(s.baseDir, storedName))
}

func (s *BridgeFileStorage) Delete(storedName string) error {
	if filepath.Base(storedName) != storedName {
		return fmt.Errorf("invalid stored bridge file name")
	}
	err := os.Remove(filepath.Join(s.baseDir, storedName))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

type BridgeFileService struct {
	db        *sql.DB
	storage   *BridgeFileStorage
	retention time.Duration
	now       func() time.Time
}

func NewBridgeFileService(db *sql.DB, storage *BridgeFileStorage, retention time.Duration) *BridgeFileService {
	return &BridgeFileService{db: db, storage: storage, retention: retention, now: time.Now}
}

func validateBridgeFilename(name string) bool {
	return name != "" && utf8.ValidString(name) && len(name) <= 255 && filepath.Base(name) == name &&
		!strings.ContainsAny(name, `/\\\"`) && !strings.ContainsAny(name, "\r\n\x00")
}

func validateBridgeFileManifest(m BridgeFileManifest) error {
	for key, value := range map[string]string{
		"projectId": m.ProjectID, "sourceNetwork": m.SourceNetwork, "targetNetwork": m.TargetNetwork,
		"filename": m.Filename, "sha256": m.SHA256,
	} {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%w: %s is required", ErrInvalidBridgeFileManifest, key)
		}
	}
	if !validateBridgeFilename(m.Filename) {
		return fmt.Errorf("%w: filename must be a safe single file name", ErrInvalidBridgeFileManifest)
	}
	if len(m.SHA256) != 64 {
		return fmt.Errorf("%w: sha256 must be a SHA-256 hex digest", ErrInvalidBridgeFileManifest)
	}
	source, sourceOK := NormalizeBridgeNetwork(m.SourceNetwork)
	target, targetOK := NormalizeBridgeNetwork(m.TargetNetwork)
	if !sourceOK || !targetOK || source == target {
		return fmt.Errorf("%w: sourceNetwork and targetNetwork must be different external/internal values", ErrInvalidBridgeFileManifest)
	}
	return nil
}

func (s *BridgeFileService) Create(ctx context.Context, manifest BridgeFileManifest, file io.Reader) (BridgeFile, error) {
	if err := validateBridgeFileManifest(manifest); err != nil {
		return BridgeFile{}, err
	}
	manifest.SourceNetwork, _ = NormalizeBridgeNetwork(manifest.SourceNetwork)
	manifest.TargetNetwork, _ = NormalizeBridgeNetwork(manifest.TargetNetwork)
	storedName, size, actualSHA, err := s.storage.Store(file, manifest.SHA256)
	if err != nil {
		return BridgeFile{}, err
	}
	now := s.now().UTC()
	transfer := BridgeFile{ID: uuid.NewString(), ProjectID: manifest.ProjectID, SourceNetwork: manifest.SourceNetwork, TargetNetwork: manifest.TargetNetwork, Filename: manifest.Filename, SHA256: actualSHA, Size: size, CreatedAt: now, ExpiresAt: now.Add(s.retention), storedName: storedName}
	_, err = s.db.ExecContext(ctx, `INSERT INTO bridge_files (id, project_id, source_network, target_network, filename, sha256, stored_name, size, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, transfer.ID, transfer.ProjectID, transfer.SourceNetwork, transfer.TargetNetwork, transfer.Filename, transfer.SHA256, transfer.storedName, transfer.Size, transfer.CreatedAt, transfer.ExpiresAt)
	if err != nil {
		_ = s.storage.Delete(storedName)
		return BridgeFile{}, fmt.Errorf("save bridge file: %w", err)
	}
	return transfer, nil
}

const bridgeFileColumns = `id, project_id, source_network, target_network, filename, sha256, stored_name, size, created_at, downloaded_at, expires_at`

func scanBridgeFile(scanner interface{ Scan(...any) error }) (BridgeFile, error) {
	var file BridgeFile
	var downloaded sql.NullTime
	err := scanner.Scan(&file.ID, &file.ProjectID, &file.SourceNetwork, &file.TargetNetwork, &file.Filename, &file.SHA256, &file.storedName, &file.Size, &file.CreatedAt, &downloaded, &file.ExpiresAt)
	if err == nil && downloaded.Valid {
		file.DownloadedAt = &downloaded.Time
	}
	return file, err
}

func (s *BridgeFileService) Get(ctx context.Context, id string) (BridgeFile, error) {
	return scanBridgeFile(s.db.QueryRowContext(ctx, `SELECT `+bridgeFileColumns+` FROM bridge_files WHERE id = ? AND expires_at > ?`, id, s.now().UTC()))
}

func (s *BridgeFileService) List(ctx context.Context, projectID, targetNetwork string) ([]BridgeFile, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+bridgeFileColumns+` FROM bridge_files WHERE project_id = ? AND target_network = ? AND expires_at > ? ORDER BY created_at DESC`, projectID, targetNetwork, s.now().UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	files := []BridgeFile{}
	for rows.Next() {
		file, err := scanBridgeFile(rows)
		if err != nil {
			return nil, err
		}
		files = append(files, file)
	}
	return files, rows.Err()
}

func (s *BridgeFileService) Open(ctx context.Context, id string) (BridgeFile, io.ReadCloser, error) {
	file, err := s.Get(ctx, id)
	if err != nil {
		return BridgeFile{}, nil, err
	}
	reader, err := s.storage.Open(file.storedName)
	return file, reader, err
}

func (s *BridgeFileService) AcknowledgeDownload(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE bridge_files SET downloaded_at = COALESCE(downloaded_at, ?) WHERE id = ? AND expires_at > ?`, s.now().UTC(), id, s.now().UTC())
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *BridgeFileService) Delete(ctx context.Context, id string) error {
	file, err := scanBridgeFile(s.db.QueryRowContext(ctx, `SELECT `+bridgeFileColumns+` FROM bridge_files WHERE id = ?`, id))
	if err != nil {
		return err
	}
	if err := s.storage.Delete(file.storedName); err != nil {
		return fmt.Errorf("delete bridge file: %w", err)
	}
	_, err = s.db.ExecContext(ctx, "DELETE FROM bridge_files WHERE id = ?", id)
	return err
}

func (s *BridgeFileService) CleanupExpired(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+bridgeFileColumns+` FROM bridge_files WHERE expires_at <= ?`, s.now().UTC())
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	files := []BridgeFile{}
	for rows.Next() {
		file, err := scanBridgeFile(rows)
		if err != nil {
			return 0, err
		}
		files = append(files, file)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, file := range files {
		if err := s.storage.Delete(file.storedName); err != nil {
			return 0, err
		}
		if _, err := s.db.ExecContext(ctx, "DELETE FROM bridge_files WHERE id = ?", file.ID); err != nil {
			return 0, err
		}
	}
	return len(files), nil
}
