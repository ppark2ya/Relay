//go:build wails

package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	"os"
	"runtime"
	"strings"

	"bridge-agent/internal/agent"
	"bridge-agent/internal/config"
	"bridge-agent/internal/relay"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed assets/*
var assets embed.FS

// DesktopService is shared with the CLI through the agent service. Wails
// generates frontend bindings for these methods during the desktop build.
type DesktopService struct{}

func (DesktopService) configPath() (string, error) {
	return config.DefaultPath()
}

func (DesktopService) load() (*agent.Service, error) {
	path, err := config.DefaultPath()
	if err != nil {
		return nil, err
	}
	settings, err := config.Load(path)
	if err != nil {
		return nil, fmt.Errorf("load agent configuration: %w", err)
	}
	return agent.New(settings, "")
}

func (service DesktopService) GetConfig() (config.Config, error) {
	path, err := service.configPath()
	if err != nil {
		return config.Config{}, err
	}
	return config.Load(path)
}

func (service DesktopService) SaveConfig(settings config.Config) error {
	path, err := service.configPath()
	if err != nil {
		return err
	}
	return config.Save(path, settings)
}

func (service DesktopService) GetProfiles() (config.ProfileStore, error) {
	path, err := service.configPath()
	if err != nil {
		return config.ProfileStore{}, err
	}
	return config.LoadProfiles(path)
}

func (service DesktopService) SetUserName(userName string) error {
	path, err := service.configPath()
	if err != nil {
		return err
	}
	return config.SetUserName(path, userName)
}

func (service DesktopService) SetActiveProfile(name string) error {
	path, err := service.configPath()
	if err != nil {
		return err
	}
	return config.SetActiveProfile(path, name)
}

func (service DesktopService) CreateProfile(profile config.Profile) error {
	path, err := service.configPath()
	if err != nil {
		return err
	}
	return config.CreateProfile(path, profile)
}

func (service DesktopService) UpdateProfile(currentName string, profile config.Profile) error {
	path, err := service.configPath()
	if err != nil {
		return err
	}
	return config.UpdateProfile(path, currentName, profile)
}

func (service DesktopService) DeleteProfile(name string) error {
	path, err := service.configPath()
	if err != nil {
		return err
	}
	return config.DeleteProfile(path, name)
}

// PickRepositoryPath opens the native directory picker used by the settings UI.
// An empty result means the user cancelled the dialog.
func (DesktopService) PickRepositoryPath(currentPath string) (string, error) {
	dialog := application.Get().Dialog.OpenFile().
		CanChooseDirectories(true).
		CanChooseFiles(false).
		SetTitle("Git 프로젝트 폴더 선택").
		SetButtonText("선택")
	if info, err := os.Stat(currentPath); err == nil && info.IsDir() {
		dialog.SetDirectory(currentPath)
	}
	return promptSelection(dialog.PromptForSingleSelection)
}

func promptSelection(prompt func() (string, error)) (string, error) {
	selection, err := prompt()
	if err != nil && strings.Contains(strings.ToLower(err.Error()), "cancel") {
		return "", nil
	}
	return selection, err
}

func (DesktopService) PickFilePath() (string, error) {
	dialog := application.Get().Dialog.OpenFile().CanChooseFiles(true).CanChooseDirectories(false).SetTitle("전송할 파일 선택").SetButtonText("선택")
	return promptSelection(dialog.PromptForSingleSelection)
}

func (DesktopService) PickSavePath(filename string) (string, error) {
	dialog := application.Get().Dialog.SaveFile().SetMessage("파일 저장 위치 선택").SetFilename(filename).SetButtonText("저장")
	return promptSelection(dialog.PromptForSingleSelection)
}

func (service DesktopService) Inbox() ([]relay.Transfer, error) {
	agentService, err := service.load()
	if err != nil {
		return nil, err
	}
	return agentService.Inbox(context.Background())
}

func (service DesktopService) Upload(branch string) (relay.Transfer, error) {
	agentService, err := service.load()
	if err != nil {
		return relay.Transfer{}, err
	}
	return agentService.Upload(context.Background(), branch)
}

func (service DesktopService) Download(transferID string) (any, error) {
	agentService, err := service.load()
	if err != nil {
		return nil, err
	}
	return agentService.Download(context.Background(), transferID)
}

func (service DesktopService) Delete(transferID string) error {
	agentService, err := service.load()
	if err != nil {
		return err
	}
	return agentService.Delete(context.Background(), transferID)
}

func (service DesktopService) FileInbox() ([]relay.FileTransfer, error) {
	agentService, err := service.load()
	if err != nil {
		return nil, err
	}
	return agentService.FileInbox(context.Background())
}

func (service DesktopService) UploadFile(path string) (relay.FileTransfer, error) {
	agentService, err := service.load()
	if err != nil {
		return relay.FileTransfer{}, err
	}
	return agentService.UploadFile(context.Background(), path)
}

func (service DesktopService) DownloadFile(transferID, destination string) error {
	agentService, err := service.load()
	if err != nil {
		return err
	}
	return agentService.DownloadFile(context.Background(), transferID, destination)
}

func (service DesktopService) DeleteFile(transferID string) error {
	agentService, err := service.load()
	if err != nil {
		return err
	}
	return agentService.DeleteFile(context.Background(), transferID)
}

func main() {
	if len(os.Args) > 1 {
		if err := runCLI(os.Args[1:]); err != nil {
			fmt.Fprintln(os.Stderr, "bridge-agent:", err)
			os.Exit(1)
		}
		return
	}

	app := application.New(application.Options{
		Name:        "Git Bridge Agent",
		Description: "Manual Git bundle transfer agent",
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
		Services: []application.Service{application.NewService(&DesktopService{})},
		Windows:  application.WindowsOptions{DisableQuitOnLastWindowClosed: true},
	})

	tray := app.SystemTray.New()
	var window *application.WebviewWindow
	openWindow := func() {
		if window == nil {
			window = app.Window.NewWithOptions(application.WebviewWindowOptions{
				Title:         "Git Bridge Agent",
				Name:          "Git Bridge Agent",
				Width:         900,
				Height:        650,
				DisableResize: false,
				Windows:       application.WindowsWindow{HiddenOnTaskbar: true},
			})
			window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
				window.Hide()
				event.Cancel()
			})
		}
		window.Show()
		window.Focus()
	}

	menu := app.NewMenu()
	menu.Add("전송 관리 열기").OnClick(func(context *application.Context) {
		openWindow()
	})
	menu.AddSeparator()
	menu.Add("종료").OnClick(func(context *application.Context) { app.Quit() })
	tray.SetLabel("Git Bridge Agent")
	tray.SetMenu(menu)
	if runtime.GOOS == "windows" {
		if enabled, err := app.Autostart.IsEnabled(); err == nil && !enabled {
			if err := app.Autostart.Enable(); err != nil {
				log.Printf("Could not enable login startup: %v", err)
			}
		}
	}

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
