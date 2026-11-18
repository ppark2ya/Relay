package service

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestParseBridgeStorageOwner(t *testing.T) {
	tests := []struct {
		name    string
		uid     string
		gid     string
		enabled bool
		want    BridgeStorageOwner
		wantErr bool
	}{
		{name: "disabled when both values are empty"},
		{name: "valid pair", uid: "10001", gid: "10002", enabled: true, want: BridgeStorageOwner{UID: 10001, GID: 10002}},
		{name: "uid without gid", uid: "10001", wantErr: true},
		{name: "gid without uid", gid: "10002", wantErr: true},
		{name: "invalid uid", uid: "abc", gid: "10002", wantErr: true},
		{name: "negative gid", uid: "10001", gid: "-1", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, enabled, err := ParseBridgeStorageOwner(tt.uid, tt.gid)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseBridgeStorageOwner() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err != nil {
				return
			}
			if enabled != tt.enabled {
				t.Fatalf("ParseBridgeStorageOwner() enabled = %v, want %v", enabled, tt.enabled)
			}
			if got != tt.want {
				t.Fatalf("ParseBridgeStorageOwner() owner = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestApplyBridgeStorageOwnership(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("ownership is not supported on Windows")
	}

	root := t.TempDir()
	bundles := filepath.Join(root, "bridge-bundles")
	files := filepath.Join(root, "bridge-files")
	for _, path := range []string{
		filepath.Join(bundles, "nested"),
		filepath.Join(files, "nested"),
	} {
		if err := os.MkdirAll(path, 0755); err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range []string{
		filepath.Join(bundles, "nested", "bundle.tar.gz"),
		filepath.Join(files, "nested", "document.txt"),
	} {
		if err := os.WriteFile(path, []byte("test"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	owner := BridgeStorageOwner{UID: os.Getuid(), GID: os.Getgid()}
	if err := ApplyBridgeStorageOwnership(owner, bundles, files, bundles); err != nil {
		t.Fatalf("ApplyBridgeStorageOwnership() error = %v", err)
	}
}
