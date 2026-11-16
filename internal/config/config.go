package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
	return config, config.Validate()
}

func (c Config) Validate() error {
	if strings.TrimSpace(c.RelayURL) == "" {
		return fmt.Errorf("relayUrl is required")
	}
	if strings.TrimSpace(c.ProjectID) == "" {
		return fmt.Errorf("projectId is required")
	}
	if c.Network != "A" && c.Network != "B" {
		return fmt.Errorf("network must be A or B")
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
