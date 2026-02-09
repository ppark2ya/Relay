package service

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

type FileStorage struct {
	baseDir string
}

func NewFileStorage(baseDir string) (*FileStorage, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create upload directory: %w", err)
	}
	return &FileStorage{baseDir: baseDir}, nil
}

func (fs *FileStorage) Store(data io.Reader) (storedName string, size int64, err error) {
	storedName = uuid.New().String() + ".bin"
	filePath := filepath.Join(fs.baseDir, storedName)

	f, err := os.Create(filePath)
	if err != nil {
		return "", 0, fmt.Errorf("failed to create file: %w", err)
	}
	defer f.Close()

	size, err = io.Copy(f, data)
	if err != nil {
		os.Remove(filePath)
		return "", 0, fmt.Errorf("failed to write file: %w", err)
	}

	return storedName, size, nil
}

func (fs *FileStorage) Load(storedName string) ([]byte, error) {
	filePath := filepath.Join(fs.baseDir, storedName)
	return os.ReadFile(filePath)
}

func (fs *FileStorage) Delete(storedName string) error {
	filePath := filepath.Join(fs.baseDir, storedName)
	return os.Remove(filePath)
}

func (fs *FileStorage) ListDir() ([]string, error) {
	entries, err := os.ReadDir(fs.baseDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read upload directory: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names, nil
}
