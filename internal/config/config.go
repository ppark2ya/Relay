package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	NetworkExternal = "external"
	NetworkInternal = "internal"
)

type Config struct {
	RelayURL       string `json:"relayUrl"`
	ProjectID      string `json:"projectId"`
	Network        string `json:"network"`
	RepositoryPath string `json:"repositoryPath"`
	TargetRef      string `json:"targetRef"`
}

func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "git-bridge", "config.json"), nil
}

func Load(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return Config{}, fmt.Errorf("parse bridge config: %w", err)
	}
	config.Network = normalizeNetwork(config.Network)
	return config, config.Validate()
}

func (c Config) Validate() error {
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

func Save(path string, config Config) error {
	config.Network = normalizeNetwork(config.Network)
	if err := config.Validate(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	temp := path + ".tmp"
	if err := os.WriteFile(temp, append(data, '\n'), 0600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return os.Rename(temp, path)
}

func normalizeNetwork(network string) string {
	return strings.ToLower(strings.TrimSpace(network))
}
