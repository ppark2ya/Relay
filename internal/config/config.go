package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	NetworkExternal = "external"
	NetworkInternal = "internal"
)

// Config is the runtime configuration used by one project.
type Config struct {
	UserName       string `json:"userName"`
	RelayURL       string `json:"relayUrl"`
	ProjectID      string `json:"projectId"`
	Network        string `json:"network"`
	RepositoryPath string `json:"repositoryPath"`
	TargetRef      string `json:"targetRef"`
}

// Profile is a named project configuration saved on one user's Agent.
type Profile struct {
	Name           string `json:"name"`
	RelayURL       string `json:"relayUrl"`
	ProjectID      string `json:"projectId"`
	Network        string `json:"network"`
	RepositoryPath string `json:"repositoryPath"`
	TargetRef      string `json:"targetRef"`
}

func ProfileFromConfig(name string, settings Config) Profile {
	return Profile{Name: name, RelayURL: settings.RelayURL, ProjectID: settings.ProjectID, Network: settings.Network, RepositoryPath: settings.RepositoryPath, TargetRef: settings.TargetRef}
}

func (p Profile) Config() Config {
	return Config{RelayURL: p.RelayURL, ProjectID: p.ProjectID, Network: p.Network, RepositoryPath: p.RepositoryPath, TargetRef: p.TargetRef}
}

func (p Profile) Validate() error {
	if strings.TrimSpace(p.Name) == "" {
		return fmt.Errorf("profile name is required")
	}
	return p.Config().ValidateProject()
}

// ProfileStore keeps profiles in display order and records the selected one.
type ProfileStore struct {
	UserName      string    `json:"userName"`
	ActiveProfile string    `json:"activeProfile"`
	Profiles      []Profile `json:"profiles"`
}

func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "git-bridge", "config.json"), nil
}

func normalizeNetwork(network string) string {
	return strings.ToLower(strings.TrimSpace(network))
}

func (c Config) normalized() Config {
	c.UserName = strings.TrimSpace(c.UserName)
	c.Network = normalizeNetwork(c.Network)
	return c
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.UserName) == "" {
		return fmt.Errorf("userName is required")
	}
	return c.ValidateProject()
}

func (c Config) ValidateProject() error {
	if strings.TrimSpace(c.RelayURL) == "" {
		return fmt.Errorf("relayUrl is required")
	}
	if strings.TrimSpace(c.ProjectID) == "" {
		return fmt.Errorf("projectId is required")
	}
	if c.Network != NetworkExternal && c.Network != NetworkInternal {
		return fmt.Errorf("network must be external or internal")
	}
	if strings.TrimSpace(c.RepositoryPath) == "" {
		return fmt.Errorf("repositoryPath is required")
	}
	if strings.TrimSpace(c.TargetRef) == "" {
		return fmt.Errorf("targetRef is required")
	}
	return nil
}

func normalizeProfile(profile Profile) Profile {
	profile.Name = strings.TrimSpace(profile.Name)
	profile.Network = normalizeNetwork(profile.Network)
	return profile
}

func (s ProfileStore) Validate() error {
	if len(s.Profiles) == 0 {
		return fmt.Errorf("at least one profile is required")
	}
	if strings.TrimSpace(s.ActiveProfile) == "" {
		return fmt.Errorf("activeProfile is required")
	}
	seen := make(map[string]struct{}, len(s.Profiles))
	activeFound := false
	for _, profile := range s.Profiles {
		if err := profile.Validate(); err != nil {
			return err
		}
		if _, exists := seen[profile.Name]; exists {
			return fmt.Errorf("duplicate profile name %q", profile.Name)
		}
		seen[profile.Name] = struct{}{}
		if profile.Name == s.ActiveProfile {
			activeFound = true
		}
	}
	if !activeFound {
		return fmt.Errorf("active profile %q does not exist", s.ActiveProfile)
	}
	return nil
}

func (s ProfileStore) Active() (Profile, error) {
	for _, profile := range s.Profiles {
		if profile.Name == s.ActiveProfile {
			return profile, nil
		}
	}
	return Profile{}, fmt.Errorf("active profile %q does not exist", s.ActiveProfile)
}

func legacyProfileName(settings Config) string { return strings.TrimSpace(settings.ProjectID) }

// LoadProfiles loads profiles. Old single-project files are converted and
// written back atomically when they are first read.
func LoadProfiles(path string) (ProfileStore, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return ProfileStore{}, err
	}
	var envelope struct {
		Profiles json.RawMessage `json:"profiles"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return ProfileStore{}, fmt.Errorf("parse bridge config: %w", err)
	}
	if len(envelope.Profiles) == 0 {
		var legacy Config
		if err := json.Unmarshal(data, &legacy); err != nil {
			return ProfileStore{}, fmt.Errorf("parse bridge config: %w", err)
		}
		legacy = legacy.normalized()
		if err := legacy.ValidateProject(); err != nil {
			return ProfileStore{}, err
		}
		name := legacyProfileName(legacy)
		store := ProfileStore{UserName: legacy.UserName, ActiveProfile: name, Profiles: []Profile{normalizeProfile(ProfileFromConfig(name, legacy))}}
		if err := SaveProfiles(path, store); err != nil {
			return ProfileStore{}, fmt.Errorf("migrate bridge config: %w", err)
		}
		return store, nil
	}
	var store ProfileStore
	if err := json.Unmarshal(data, &store); err != nil {
		return ProfileStore{}, fmt.Errorf("parse bridge profile store: %w", err)
	}
	store.ActiveProfile = strings.TrimSpace(store.ActiveProfile)
	store.UserName = strings.TrimSpace(store.UserName)
	for index := range store.Profiles {
		store.Profiles[index] = normalizeProfile(store.Profiles[index])
	}
	return store, store.Validate()
}

func SaveProfiles(path string, store ProfileStore) error {
	store.ActiveProfile = strings.TrimSpace(store.ActiveProfile)
	store.UserName = strings.TrimSpace(store.UserName)
	for index := range store.Profiles {
		store.Profiles[index] = normalizeProfile(store.Profiles[index])
	}
	if err := store.Validate(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	temp := path + ".tmp"
	if err := os.WriteFile(temp, append(data, '\n'), 0600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return os.Rename(temp, path)
}

func Load(path string) (Config, error) {
	store, err := LoadProfiles(path)
	if err != nil {
		return Config{}, err
	}
	profile, err := store.Active()
	if err != nil {
		return Config{}, err
	}
	settings := profile.Config()
	settings.UserName = store.UserName
	return settings, settings.Validate()
}

// Save updates the active profile for backward-compatible CLI configuration.
func Save(path string, settings Config) error {
	settings = settings.normalized()
	if err := settings.Validate(); err != nil {
		return err
	}
	store, err := LoadProfiles(path)
	if errors.Is(err, os.ErrNotExist) {
		name := legacyProfileName(settings)
		return SaveProfiles(path, ProfileStore{UserName: settings.UserName, ActiveProfile: name, Profiles: []Profile{ProfileFromConfig(name, settings)}})
	}
	if err != nil {
		return err
	}
	for index := range store.Profiles {
		if store.Profiles[index].Name == store.ActiveProfile {
			store.UserName = settings.UserName
			store.Profiles[index] = ProfileFromConfig(store.ActiveProfile, settings)
			return SaveProfiles(path, store)
		}
	}
	return fmt.Errorf("active profile %q does not exist", store.ActiveProfile)
}

func SetUserName(path, userName string) error {
	store, err := LoadProfiles(path)
	if err != nil {
		return err
	}
	userName = strings.TrimSpace(userName)
	if userName == "" {
		return fmt.Errorf("userName is required")
	}
	store.UserName = userName
	return SaveProfiles(path, store)
}

func SetActiveProfile(path, name string) error {
	store, err := LoadProfiles(path)
	if err != nil {
		return err
	}
	store.ActiveProfile = strings.TrimSpace(name)
	return SaveProfiles(path, store)
}

func CreateProfile(path string, profile Profile) error {
	store, err := LoadProfiles(path)
	if errors.Is(err, os.ErrNotExist) {
		profile = normalizeProfile(profile)
		return SaveProfiles(path, ProfileStore{ActiveProfile: profile.Name, Profiles: []Profile{profile}})
	}
	if err != nil {
		return err
	}
	store.Profiles = append(store.Profiles, profile)
	store.ActiveProfile = strings.TrimSpace(profile.Name)
	return SaveProfiles(path, store)
}

func UpdateProfile(path, currentName string, profile Profile) error {
	store, err := LoadProfiles(path)
	if err != nil {
		return err
	}
	currentName = strings.TrimSpace(currentName)
	profile = normalizeProfile(profile)
	for index := range store.Profiles {
		if store.Profiles[index].Name == currentName {
			if profile.Name != currentName {
				for _, existing := range store.Profiles {
					if existing.Name == profile.Name {
						return fmt.Errorf("duplicate profile name %q", profile.Name)
					}
				}
			}
			store.Profiles[index] = profile
			if store.ActiveProfile == currentName {
				store.ActiveProfile = profile.Name
			}
			return SaveProfiles(path, store)
		}
	}
	return fmt.Errorf("profile %q does not exist", currentName)
}

func DeleteProfile(path, name string) error {
	store, err := LoadProfiles(path)
	if err != nil {
		return err
	}
	name = strings.TrimSpace(name)
	profiles := make([]Profile, 0, len(store.Profiles)-1)
	found := false
	for _, profile := range store.Profiles {
		if profile.Name == name {
			found = true
			continue
		}
		profiles = append(profiles, profile)
	}
	if !found {
		return fmt.Errorf("profile %q does not exist", name)
	}
	if len(profiles) == 0 {
		return os.Remove(path)
	}
	store.Profiles = profiles
	if store.ActiveProfile == name {
		store.ActiveProfile = profiles[0].Name
	}
	return SaveProfiles(path, store)
}
