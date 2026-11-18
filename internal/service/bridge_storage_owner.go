package service

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// BridgeStorageOwner is the Unix user and group that own bridge storage data.
// It is intentionally limited to the bundle and generic-file storage trees.
type BridgeStorageOwner struct {
	UID int
	GID int
}

// ParseBridgeStorageOwner reads a UID/GID pair. Both values must be provided
// together so a partial configuration cannot leave the storage in an
// unexpected state.
func ParseBridgeStorageOwner(uidValue, gidValue string) (BridgeStorageOwner, bool, error) {
	uidValue = strings.TrimSpace(uidValue)
	gidValue = strings.TrimSpace(gidValue)
	if uidValue == "" && gidValue == "" {
		return BridgeStorageOwner{}, false, nil
	}
	if uidValue == "" || gidValue == "" {
		return BridgeStorageOwner{}, false, fmt.Errorf("BRIDGE_STORAGE_OWNER_UID and BRIDGE_STORAGE_OWNER_GID must be set together")
	}

	uid, err := parseOwnerID("BRIDGE_STORAGE_OWNER_UID", uidValue)
	if err != nil {
		return BridgeStorageOwner{}, false, err
	}
	gid, err := parseOwnerID("BRIDGE_STORAGE_OWNER_GID", gidValue)
	if err != nil {
		return BridgeStorageOwner{}, false, err
	}

	return BridgeStorageOwner{UID: uid, GID: gid}, true, nil
}

func parseOwnerID(name, value string) (int, error) {
	id, err := strconv.Atoi(value)
	if err != nil || id < 0 {
		return 0, fmt.Errorf("%s must be a non-negative integer", name)
	}
	return id, nil
}

// ApplyBridgeStorageOwnership recursively changes ownership for storage roots
// and their contents. Symlinks are not followed or changed, preventing a
// storage symlink from affecting files outside the configured storage tree.
func ApplyBridgeStorageOwnership(owner BridgeStorageOwner, roots ...string) error {
	visited := make(map[string]struct{}, len(roots))
	for _, root := range roots {
		cleanRoot := filepath.Clean(root)
		if _, seen := visited[cleanRoot]; seen {
			continue
		}
		visited[cleanRoot] = struct{}{}

		if err := filepath.WalkDir(cleanRoot, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.Type()&os.ModeSymlink != 0 {
				return nil
			}
			if err := os.Chown(path, owner.UID, owner.GID); err != nil {
				return fmt.Errorf("change ownership of %q: %w", path, err)
			}
			return nil
		}); err != nil {
			return fmt.Errorf("initialize bridge storage ownership for %q: %w", cleanRoot, err)
		}
	}
	return nil
}
