package config

import (
	"bytes"
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

func TestLoadProfilesMigratesLegacyConfigUsingProjectID(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	legacy := `{"relayUrl":"https://relay.example","projectId":"logging","network":"external","repositoryPath":"C:\\work\\logging","targetRef":"main"}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatal(err)
	}
	store, err := LoadProfiles(path)
	if err != nil {
		t.Fatal(err)
	}
	if store.ActiveProfile != "logging" || len(store.Profiles) != 1 || store.Profiles[0].RepositoryPath != `C:\work\logging` {
		t.Fatalf("unexpected store: %#v", store)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(data, []byte(`"profiles"`)) || !bytes.Contains(data, []byte(`"activeProfile": "logging"`)) {
		t.Fatalf("legacy config was not migrated: %s", data)
	}
}

func TestProfileStoreLifecycle(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	logging := Profile{Name: "logging", RelayURL: "https://relay.example", ProjectID: "logging", Network: "external", RepositoryPath: `C:\work\logging`, TargetRef: "main"}
	orders := Profile{Name: "orders", RelayURL: "https://relay.example", ProjectID: "orders", Network: "external", RepositoryPath: `C:\work\orders`, TargetRef: "develop"}
	if err := CreateProfile(path, logging); err != nil {
		t.Fatal(err)
	}
	if err := CreateProfile(path, orders); err != nil {
		t.Fatal(err)
	}
	store, err := LoadProfiles(path)
	if err != nil {
		t.Fatal(err)
	}
	if store.ActiveProfile != "orders" || len(store.Profiles) != 2 {
		t.Fatalf("unexpected create result: %#v", store)
	}
	if err := SetActiveProfile(path, "logging"); err != nil {
		t.Fatal(err)
	}
	logging.Name = "logging-dev"
	if err := UpdateProfile(path, "logging", logging); err != nil {
		t.Fatal(err)
	}
	store, err = LoadProfiles(path)
	if err != nil {
		t.Fatal(err)
	}
	if store.ActiveProfile != "logging-dev" {
		t.Fatalf("active profile was not renamed: %#v", store)
	}
	if err := DeleteProfile(path, "logging-dev"); err != nil {
		t.Fatal(err)
	}
	store, err = LoadProfiles(path)
	if err != nil || store.ActiveProfile != "orders" || len(store.Profiles) != 1 {
		t.Fatalf("unexpected delete result: %#v, %v", store, err)
	}
	if err := DeleteProfile(path, "orders"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("config file should be removed, stat error = %v", err)
	}
}

func TestUpdateProfileRejectsDuplicateName(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	first := Profile{Name: "first", RelayURL: "https://relay.example", ProjectID: "first", Network: "external", RepositoryPath: `C:\work\first`, TargetRef: "main"}
	second := Profile{Name: "second", RelayURL: "https://relay.example", ProjectID: "second", Network: "external", RepositoryPath: `C:\work\second`, TargetRef: "main"}
	if err := SaveProfiles(path, ProfileStore{ActiveProfile: "first", Profiles: []Profile{first, second}}); err != nil {
		t.Fatal(err)
	}
	first.Name = "second"
	if err := UpdateProfile(path, "first", first); err == nil {
		t.Fatal("expected duplicate name error")
	}
}
