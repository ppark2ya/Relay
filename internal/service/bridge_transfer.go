package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrInvalidBridgeManifest = errors.New("invalid bridge manifest")

type BridgeManifest struct {
	ProjectID     string `json:"projectId"`
	SourceNetwork string `json:"sourceNetwork"`
	TargetNetwork string `json:"targetNetwork"`
	SourceRef     string `json:"sourceRef"`
	TargetRef     string `json:"targetRef"`
	HeadSHA       string `json:"headSha"`
	BaseSHA       string `json:"baseSha"`
	BundleSHA256  string `json:"bundleSha256"`
}

type BridgeTransfer struct {
	ID            string     `json:"id"`
	ProjectID     string     `json:"projectId"`
	SourceNetwork string     `json:"sourceNetwork"`
	TargetNetwork string     `json:"targetNetwork"`
	SourceRef     string     `json:"sourceRef"`
	TargetRef     string     `json:"targetRef"`
	HeadSHA       string     `json:"headSha"`
	BaseSHA       string     `json:"baseSha"`
	BundleSHA256  string     `json:"bundleSha256"`
	Size          int64      `json:"size"`
	CreatedAt     time.Time  `json:"createdAt"`
	DownloadedAt  *time.Time `json:"downloadedAt,omitempty"`
	ExpiresAt     time.Time  `json:"expiresAt"`
	storedName    string
}

type BridgeService struct {
	db        *sql.DB
	storage   *BridgeStorage
	retention time.Duration
	now       func() time.Time
}

func NewBridgeService(db *sql.DB, storage *BridgeStorage, retention time.Duration) *BridgeService {
	return &BridgeService{db: db, storage: storage, retention: retention, now: time.Now}
}

func validateBridgeManifest(m BridgeManifest) error {
	values := map[string]string{
		"projectId": m.ProjectID, "sourceNetwork": m.SourceNetwork, "targetNetwork": m.TargetNetwork,
		"sourceRef": m.SourceRef, "targetRef": m.TargetRef, "headSha": m.HeadSHA, "bundleSha256": m.BundleSHA256,
	}
	for name, value := range values {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%w: %s is required", ErrInvalidBridgeManifest, name)
		}
	}
	if (m.SourceNetwork != "A" && m.SourceNetwork != "B") || (m.TargetNetwork != "A" && m.TargetNetwork != "B") {
		return fmt.Errorf("%w: sourceNetwork and targetNetwork must be A or B", ErrInvalidBridgeManifest)
	}
	if m.SourceNetwork == m.TargetNetwork {
		return fmt.Errorf("%w: sourceNetwork and targetNetwork must differ", ErrInvalidBridgeManifest)
	}
	if len(m.BundleSHA256) != 64 {
		return fmt.Errorf("%w: bundleSha256 must be a SHA-256 hex digest", ErrInvalidBridgeManifest)
	}
	return nil
}

func (s *BridgeService) Create(ctx context.Context, manifest BridgeManifest, bundle io.Reader) (BridgeTransfer, error) {
	if err := validateBridgeManifest(manifest); err != nil {
		return BridgeTransfer{}, err
	}
	storedName, size, _, err := s.storage.Store(bundle, manifest.BundleSHA256)
	if err != nil {
		return BridgeTransfer{}, err
	}

	now := s.now().UTC()
	transfer := BridgeTransfer{
		ID: uuid.NewString(), ProjectID: manifest.ProjectID, SourceNetwork: manifest.SourceNetwork,
		TargetNetwork: manifest.TargetNetwork, SourceRef: manifest.SourceRef, TargetRef: manifest.TargetRef,
		HeadSHA: manifest.HeadSHA, BaseSHA: manifest.BaseSHA, BundleSHA256: manifest.BundleSHA256,
		Size: size, CreatedAt: now, ExpiresAt: now.Add(s.retention), storedName: storedName,
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO bridge_transfers
		(id, project_id, source_network, target_network, source_ref, target_ref, head_sha, base_sha, bundle_sha256, stored_name, size, created_at, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		transfer.ID, transfer.ProjectID, transfer.SourceNetwork, transfer.TargetNetwork, transfer.SourceRef, transfer.TargetRef,
		transfer.HeadSHA, transfer.BaseSHA, transfer.BundleSHA256, storedName, transfer.Size, transfer.CreatedAt, transfer.ExpiresAt)
	if err != nil {
		_ = s.storage.Delete(storedName)
		return BridgeTransfer{}, fmt.Errorf("save bridge transfer: %w", err)
	}
	return transfer, nil
}

func scanBridgeTransfer(scanner interface{ Scan(...any) error }) (BridgeTransfer, error) {
	var transfer BridgeTransfer
	var downloaded sql.NullTime
	err := scanner.Scan(&transfer.ID, &transfer.ProjectID, &transfer.SourceNetwork, &transfer.TargetNetwork,
		&transfer.SourceRef, &transfer.TargetRef, &transfer.HeadSHA, &transfer.BaseSHA, &transfer.BundleSHA256,
		&transfer.storedName, &transfer.Size, &transfer.CreatedAt, &downloaded, &transfer.ExpiresAt)
	if err == nil && downloaded.Valid {
		transfer.DownloadedAt = &downloaded.Time
	}
	return transfer, err
}

const bridgeTransferColumns = `id, project_id, source_network, target_network, source_ref, target_ref, head_sha, base_sha,
	bundle_sha256, stored_name, size, created_at, downloaded_at, expires_at`

func (s *BridgeService) Get(ctx context.Context, id string) (BridgeTransfer, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+bridgeTransferColumns+` FROM bridge_transfers WHERE id = ? AND expires_at > ?`, id, s.now().UTC())
	transfer, err := scanBridgeTransfer(row)
	if errors.Is(err, sql.ErrNoRows) {
		return BridgeTransfer{}, sql.ErrNoRows
	}
	return transfer, err
}

func (s *BridgeService) List(ctx context.Context, projectID, targetNetwork string) ([]BridgeTransfer, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+bridgeTransferColumns+` FROM bridge_transfers
		WHERE project_id = ? AND target_network = ? AND expires_at > ? ORDER BY created_at DESC`, projectID, targetNetwork, s.now().UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	transfers := []BridgeTransfer{}
	for rows.Next() {
		transfer, err := scanBridgeTransfer(rows)
		if err != nil {
			return nil, err
		}
		transfers = append(transfers, transfer)
	}
	return transfers, rows.Err()
}

func (s *BridgeService) Open(ctx context.Context, id string) (BridgeTransfer, io.ReadCloser, error) {
	transfer, err := s.Get(ctx, id)
	if err != nil {
		return BridgeTransfer{}, nil, err
	}
	file, err := s.storage.Open(transfer.storedName)
	if err != nil {
		return BridgeTransfer{}, nil, err
	}
	return transfer, file, nil
}

func (s *BridgeService) AcknowledgeDownload(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `UPDATE bridge_transfers SET downloaded_at = COALESCE(downloaded_at, ?) WHERE id = ? AND expires_at > ?`, s.now().UTC(), id, s.now().UTC())
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

func (s *BridgeService) Delete(ctx context.Context, id string) error {
	transfer, err := s.getIncludingExpired(ctx, id)
	if err != nil {
		return err
	}
	if err := s.storage.Delete(transfer.storedName); err != nil {
		return fmt.Errorf("delete bridge bundle: %w", err)
	}
	_, err = s.db.ExecContext(ctx, "DELETE FROM bridge_transfers WHERE id = ?", id)
	return err
}

func (s *BridgeService) getIncludingExpired(ctx context.Context, id string) (BridgeTransfer, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+bridgeTransferColumns+` FROM bridge_transfers WHERE id = ?`, id)
	transfer, err := scanBridgeTransfer(row)
	if errors.Is(err, sql.ErrNoRows) {
		return BridgeTransfer{}, sql.ErrNoRows
	}
	return transfer, err
}

func (s *BridgeService) CleanupExpired(ctx context.Context) (int, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+bridgeTransferColumns+` FROM bridge_transfers WHERE expires_at <= ?`, s.now().UTC())
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	var expired []BridgeTransfer
	for rows.Next() {
		transfer, err := scanBridgeTransfer(rows)
		if err != nil {
			return 0, err
		}
		expired = append(expired, transfer)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	for _, transfer := range expired {
		if err := s.storage.Delete(transfer.storedName); err != nil {
			return 0, err
		}
		if _, err := s.db.ExecContext(ctx, "DELETE FROM bridge_transfers WHERE id = ?", transfer.ID); err != nil {
			return 0, err
		}
	}
	return len(expired), nil
}
