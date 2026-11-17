package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

var ErrBridgeBundleTooLarge = errors.New("bridge bundle exceeds configured size limit")

// BridgeStorage stores opaque Git bundle payloads. It deliberately does not
// expose Git operations; Relay remains a transport and retention service.
type BridgeStorage struct {
	baseDir  string
	maxBytes int64
}

func NewBridgeStorage(baseDir string, maxBytes int64) (*BridgeStorage, error) {
	if maxBytes <= 0 {
		return nil, fmt.Errorf("bridge max bytes must be positive")
	}
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("create bridge directory: %w", err)
	}
	return &BridgeStorage{baseDir: baseDir, maxBytes: maxBytes}, nil
}

func (s *BridgeStorage) Store(reader io.Reader, expectedSHA256 string) (storedName string, size int64, actualSHA256 string, err error) {
	storedName = uuid.NewString() + ".bundle"
	finalPath := filepath.Join(s.baseDir, storedName)
	tempPath := finalPath + ".tmp"

	f, err := os.OpenFile(tempPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return "", 0, "", fmt.Errorf("create temporary bundle: %w", err)
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
		return "", 0, "", fmt.Errorf("write bundle: %w", copyErr)
	}
	if written > s.maxBytes {
		return "", 0, "", ErrBridgeBundleTooLarge
	}
	actualSHA256 = hex.EncodeToString(hasher.Sum(nil))
	if expectedSHA256 == "" || actualSHA256 != expectedSHA256 {
		return "", 0, "", fmt.Errorf("bundle SHA-256 does not match manifest")
	}
	if err := f.Sync(); err != nil {
		return "", 0, "", fmt.Errorf("sync bundle: %w", err)
	}
	if err := f.Close(); err != nil {
		return "", 0, "", fmt.Errorf("close bundle: %w", err)
	}
	if err := os.Rename(tempPath, finalPath); err != nil {
		return "", 0, "", fmt.Errorf("finalize bundle: %w", err)
	}
	return storedName, written, actualSHA256, nil
}

func (s *BridgeStorage) Open(storedName string) (*os.File, error) {
	if filepath.Base(storedName) != storedName {
		return nil, fmt.Errorf("invalid stored bundle name")
	}
	return os.Open(filepath.Join(s.baseDir, storedName))
}

func (s *BridgeStorage) Delete(storedName string) error {
	if filepath.Base(storedName) != storedName {
		return fmt.Errorf("invalid stored bundle name")
	}
	err := os.Remove(filepath.Join(s.baseDir, storedName))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
