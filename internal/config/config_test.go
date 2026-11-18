package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMigratesLegacyNetworkNames(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"relayUrl":"https://relay.example","projectId":"project-a","network":"B","repositoryPath":"C:\\work\\project","targetRef":"main"}`), 0600); err != nil {
		t.Fatal(err)
	}
	settings, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if settings.Network != NetworkExternal {
		t.Fatalf("network = %q, want %q", settings.Network, NetworkExternal)
	}
}

func TestSaveNormalizesLegacyNetworkName(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	settings := Config{RelayURL: "https://relay.example", ProjectID: "project-a", Network: "A", RepositoryPath: "C:\\work\\project", TargetRef: "main"}
	if err := Save(path, settings); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Network != NetworkInternal {
		t.Fatalf("network = %q, want %q", loaded.Network, NetworkInternal)
	}
}
