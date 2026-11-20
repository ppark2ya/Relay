package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"bridge-agent/internal/agent"
	"bridge-agent/internal/config"
)

func runCLI(arguments []string) error {
	if len(arguments) < 1 {
		usage()
		return nil
	}
	var err error
	switch arguments[0] {
	case "config":
		err = runConfig(arguments[1:])
	case "upload":
		err = withService(func(service *agent.Service) error {
			flags := flag.NewFlagSet("upload", flag.ContinueOnError)
			branch := flags.String("branch", "", "local source branch")
			if err := flags.Parse(arguments[1:]); err != nil {
				return err
			}
			if *branch == "" {
				return fmt.Errorf("--branch is required")
			}
			transfer, err := service.Upload(context.Background(), *branch)
			if err == nil {
				printJSON(transfer)
			}
			return err
		})
	case "inbox", "status":
		err = withService(func(service *agent.Service) error {
			transfers, err := service.Inbox(context.Background())
			if err == nil {
				printJSON(transfers)
			}
			return err
		})
	case "download":
		err = withService(func(service *agent.Service) error {
			flags := flag.NewFlagSet("download", flag.ContinueOnError)
			id := flags.String("id", "", "transfer ID")
			if err := flags.Parse(arguments[1:]); err != nil {
				return err
			}
			if *id == "" {
				return fmt.Errorf("--id is required")
			}
			result, err := service.Download(context.Background(), *id)
			if err == nil {
				printJSON(result)
			}
			return err
		})
	case "delete":
		err = withService(func(service *agent.Service) error {
			flags := flag.NewFlagSet("delete", flag.ContinueOnError)
			id := flags.String("id", "", "transfer ID")
			if err := flags.Parse(arguments[1:]); err != nil {
				return err
			}
			if *id == "" {
				return fmt.Errorf("--id is required")
			}
			return service.Delete(context.Background(), *id)
		})
	case "file":
		err = runFile(arguments[1:])
	default:
		usage()
		err = fmt.Errorf("unknown command %q", arguments[0])
	}
	return err
}

func runFile(arguments []string) error {
	if len(arguments) == 0 {
		return fmt.Errorf("file requires upload, inbox, download, or delete")
	}
	return withService(func(service *agent.Service) error {
		switch arguments[0] {
		case "upload":
			flags := flag.NewFlagSet("file upload", flag.ContinueOnError)
			path := flags.String("path", "", "local file path")
			if err := flags.Parse(arguments[1:]); err != nil {
				return err
			}
			if *path == "" {
				return fmt.Errorf("--path is required")
			}
			transfer, err := service.UploadFile(context.Background(), *path)
			if err == nil {
				printJSON(transfer)
			}
			return err
		case "inbox":
			files, err := service.FileInbox(context.Background())
			if err == nil {
				printJSON(files)
			}
			return err
		case "download":
			flags := flag.NewFlagSet("file download", flag.ContinueOnError)
			id := flags.String("id", "", "file transfer ID")
			output := flags.String("output", "", "destination file path")
			if err := flags.Parse(arguments[1:]); err != nil {
				return err
			}
			if *id == "" || *output == "" {
				return fmt.Errorf("--id and --output are required")
			}
			return service.DownloadFile(context.Background(), *id, *output)
		case "delete":
			flags := flag.NewFlagSet("file delete", flag.ContinueOnError)
			id := flags.String("id", "", "file transfer ID")
			if err := flags.Parse(arguments[1:]); err != nil {
				return err
			}
			if *id == "" {
				return fmt.Errorf("--id is required")
			}
			return service.DeleteFile(context.Background(), *id)
		default:
			return fmt.Errorf("unknown file command %q", arguments[0])
		}
	})
}

func withService(action func(*agent.Service) error) error {
	path, err := config.DefaultPath()
	if err != nil {
		return err
	}
	settings, err := config.Load(path)
	if err != nil {
		return fmt.Errorf("load %s: %w", path, err)
	}
	service, err := agent.New(settings, "")
	if err != nil {
		return err
	}
	return action(service)
}

func runConfig(arguments []string) error {
	if len(arguments) == 0 {
		return fmt.Errorf("config requires show or set")
	}
	path, err := config.DefaultPath()
	if err != nil {
		return err
	}
	switch arguments[0] {
	case "show":
		store, err := config.LoadProfiles(path)
		if err != nil {
			return err
		}
		profile, err := store.Active()
		if err != nil {
			return err
		}
		settings := profile.Config()
		settings.UserName = store.UserName
		printJSON(settings)
		return nil
	case "user":
		if len(arguments) != 4 || arguments[1] != "set" || arguments[2] != "--name" {
			return fmt.Errorf("usage: bridge-agent config user set --name USER_NAME")
		}
		if err := config.SetUserName(path, arguments[3]); err != nil {
			return err
		}
		fmt.Println("saved", path)
		return nil
	case "set":
		flags := flag.NewFlagSet("config set", flag.ContinueOnError)
		userName := flags.String("user-name", "", "Agent user name")
		relayURL := flags.String("relay-url", "", "Relay base URL")
		projectID := flags.String("project-id", "", "logical project ID")
		network := flags.String("network", "", "external or internal")
		repository := flags.String("repository", "", "local Git repository path")
		target := flags.String("target", "main", "target branch")
		if err := flags.Parse(arguments[1:]); err != nil {
			return err
		}
		settings := config.Config{UserName: *userName, RelayURL: *relayURL, ProjectID: *projectID, Network: *network, RepositoryPath: *repository, TargetRef: *target}
		if err := config.Save(path, settings); err != nil {
			return err
		}
		fmt.Println("saved", path)
		return nil
	default:
		return fmt.Errorf("unknown config command %q", arguments[0])
	}
}

func printJSON(value any) {
	data, _ := json.MarshalIndent(value, "", "  ")
	fmt.Println(string(data))
}

func usage() {
	fmt.Fprintln(os.Stderr, `Usage:
  bridge-agent config set --user-name NAME --relay-url URL --project-id ID --network external|internal --repository PATH [--target main]
  bridge-agent config show
  bridge-agent config user set --name NAME
  bridge-agent upload --branch feature/name
  bridge-agent inbox
  bridge-agent download --id TRANSFER_ID
  bridge-agent delete --id TRANSFER_ID
  bridge-agent file upload --path FILE
  bridge-agent file inbox
  bridge-agent file download --id TRANSFER_ID --output FILE
  bridge-agent file delete --id TRANSFER_ID`)
}
