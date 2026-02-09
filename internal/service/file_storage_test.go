package service

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestFileStorage_StoreAndLoad(t *testing.T) {
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage: %v", err)
	}

	content := []byte("hello world")
	storedName, size, err := fs.Store(bytes.NewReader(content))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}
	if size != int64(len(content)) {
		t.Errorf("size: got %d, want %d", size, len(content))
	}
	if storedName == "" {
		t.Fatal("storedName should not be empty")
	}

	// Verify file exists on disk
	if _, err := os.Stat(filepath.Join(dir, storedName)); err != nil {
		t.Fatalf("file not found on disk: %v", err)
	}

	// Load
	loaded, err := fs.Load(storedName)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !bytes.Equal(loaded, content) {
		t.Errorf("loaded content: got %q, want %q", loaded, content)
	}
}

func TestFileStorage_Delete(t *testing.T) {
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage: %v", err)
	}

	storedName, _, err := fs.Store(bytes.NewReader([]byte("to be deleted")))
	if err != nil {
		t.Fatalf("Store: %v", err)
	}

	if err := fs.Delete(storedName); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// Verify file is gone
	if _, err := os.Stat(filepath.Join(dir, storedName)); !os.IsNotExist(err) {
		t.Error("expected file to be deleted from disk")
	}

	// Load should fail
	if _, err := fs.Load(storedName); err == nil {
		t.Error("expected Load to fail after Delete")
	}
}

func TestFileStorage_LoadNonexistent(t *testing.T) {
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage: %v", err)
	}

	_, err = fs.Load("nonexistent.bin")
	if err == nil {
		t.Error("expected error loading nonexistent file")
	}
}

func TestFileStorage_StoreUniqueNames(t *testing.T) {
	dir := t.TempDir()
	fs, err := NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage: %v", err)
	}

	name1, _, _ := fs.Store(bytes.NewReader([]byte("file1")))
	name2, _, _ := fs.Store(bytes.NewReader([]byte("file2")))

	if name1 == name2 {
		t.Error("expected unique stored names for different files")
	}
}

func TestFileStorage_CreatesDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "uploads")
	_, err := NewFileStorage(dir)
	if err != nil {
		t.Fatalf("NewFileStorage should create nested dirs: %v", err)
	}

	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("directory not created: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected a directory")
	}
}
