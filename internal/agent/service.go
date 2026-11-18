package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"bridge-agent/internal/config"
	gitops "bridge-agent/internal/git"
	"bridge-agent/internal/relay"
)

type Service struct {
	Config   config.Config
	Relay    *relay.Client
	CacheDir string
}

func New(config config.Config, cacheDir string) (*Service, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}
	client, err := relay.NewClient(config.RelayURL)
	if err != nil {
		return nil, err
	}
	if cacheDir == "" {
		base, err := os.UserCacheDir()
		if err != nil {
			return nil, err
		}
		cacheDir = filepath.Join(base, "git-bridge", "bundles")
	}
	return &Service{Config: config, Relay: client, CacheDir: cacheDir}, nil
}

func otherNetwork(network string) string {
	if network == config.NetworkInternal {
		return config.NetworkExternal
	}
	return config.NetworkInternal
}

func (s *Service) Upload(ctx context.Context, branch string) (relay.Transfer, error) {
	if err := os.MkdirAll(s.CacheDir, 0700); err != nil {
		return relay.Transfer{}, err
	}
	sourceRef, err := gitops.NormalizeBranchRef(branch)
	if err != nil {
		return relay.Transfer{}, err
	}
	bundlePath := filepath.Join(s.CacheDir, strings.ReplaceAll(strings.TrimPrefix(sourceRef, "refs/heads/"), "/", "-")+".bundle")
	defer os.Remove(bundlePath)
	bundle, err := gitops.CreateBundle(ctx, s.Config.RepositoryPath, sourceRef, s.Config.TargetRef, bundlePath)
	if err != nil {
		return relay.Transfer{}, err
	}
	return s.Relay.Upload(ctx, relay.Manifest{
		ProjectID: s.Config.ProjectID, SourceNetwork: s.Config.Network, TargetNetwork: otherNetwork(s.Config.Network),
		SourceRef: bundle.SourceRef, TargetRef: s.Config.TargetRef, HeadSHA: bundle.HeadSHA,
		BaseSHA: bundle.BaseSHA, BundleSHA256: bundle.SHA256,
	}, bundle.Path)
}

func (s *Service) Inbox(ctx context.Context) ([]relay.Transfer, error) {
	return s.Relay.List(ctx, s.Config.ProjectID, s.Config.Network)
}

func (s *Service) Download(ctx context.Context, transferID string) (gitops.ImportResult, error) {
	transfers, err := s.Inbox(ctx)
	if err != nil {
		return gitops.ImportResult{}, err
	}
	var transfer *relay.Transfer
	for index := range transfers {
		if transfers[index].ID == transferID {
			transfer = &transfers[index]
			break
		}
	}
	if transfer == nil {
		return gitops.ImportResult{}, fmt.Errorf("transfer %s is not in this agent's inbox", transferID)
	}
	if err := os.MkdirAll(s.CacheDir, 0700); err != nil {
		return gitops.ImportResult{}, err
	}
	bundlePath := filepath.Join(s.CacheDir, transfer.ID+".bundle")
	if err := s.Relay.Download(ctx, transfer.ID, bundlePath); err != nil {
		return gitops.ImportResult{}, err
	}
	defer os.Remove(bundlePath)
	result, err := gitops.ImportAndCheckout(ctx, s.Config.RepositoryPath, bundlePath, transfer.ID, transfer.SourceNetwork, transfer.SourceRef, transfer.BundleSHA256)
	if err != nil {
		return gitops.ImportResult{}, err
	}
	if err := s.Relay.AcknowledgeDownload(ctx, transfer.ID); err != nil {
		return gitops.ImportResult{}, err
	}
	return result, nil
}

func (s *Service) Delete(ctx context.Context, transferID string) error {
	return s.Relay.Delete(ctx, transferID)
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func (s *Service) UploadFile(ctx context.Context, path string) (relay.FileTransfer, error) {
	info, err := os.Stat(path)
	if err != nil {
		return relay.FileTransfer{}, err
	}
	if !info.Mode().IsRegular() {
		return relay.FileTransfer{}, fmt.Errorf("only regular files can be uploaded")
	}
	sha, err := fileSHA256(path)
	if err != nil {
		return relay.FileTransfer{}, err
	}
	return s.Relay.UploadFile(ctx, relay.FileManifest{ProjectID: s.Config.ProjectID, SourceNetwork: s.Config.Network, TargetNetwork: otherNetwork(s.Config.Network), Filename: filepath.Base(path), SHA256: sha}, path)
}

func (s *Service) FileInbox(ctx context.Context) ([]relay.FileTransfer, error) {
	return s.Relay.ListFiles(ctx, s.Config.ProjectID, s.Config.Network)
}

func (s *Service) DownloadFile(ctx context.Context, transferID, destination string) error {
	files, err := s.FileInbox(ctx)
	if err != nil {
		return err
	}
	var transfer *relay.FileTransfer
	for index := range files {
		if files[index].ID == transferID {
			transfer = &files[index]
			break
		}
	}
	if transfer == nil {
		return fmt.Errorf("file transfer %s is not in this agent's inbox", transferID)
	}
	if err := s.Relay.DownloadFile(ctx, transfer.ID, destination, transfer.SHA256); err != nil {
		return err
	}
	return s.Relay.AcknowledgeFileDownload(ctx, transfer.ID)
}

func (s *Service) DeleteFile(ctx context.Context, transferID string) error {
	return s.Relay.DeleteFile(ctx, transferID)
}
