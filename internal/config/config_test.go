package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRejectsLegacyNetworkNames(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"relayUrl":"https://relay.example","projectId":"project-a","network":"B","repositoryPath":"C:\\work\\project","targetRef":"main"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("expected legacy network name to be rejected")
	}
}

func TestSaveRejectsLegacyNetworkName(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	settings := Config{RelayURL: "https://relay.example", ProjectID: "project-a", Network: "A", RepositoryPath: "C:\\work\\project", TargetRef: "main"}
	if err := Save(path, settings); err == nil {
		t.Fatal("expected legacy network name to be rejected")
	}
}
