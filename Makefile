.PHONY: test build-cli build-desktop build-windows

test:
	go test ./...

build-cli:
	go build -o build/bridge-agent ./cmd/bridge-agent

# Regenerates Wails bindings then builds the same bridge-agent executable in
# tray/UI mode. Running it with CLI arguments still dispatches to the CLI.
build-desktop:
	go run github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0 generate bindings -d cmd/bridge-agent/assets/bindings -f='-tags wails' ./cmd/bridge-agent
	go build -tags wails -o build/bridge-agent ./cmd/bridge-agent

build-windows:
	go run github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0 generate bindings -d cmd/bridge-agent/assets/bindings -f='-tags wails' ./cmd/bridge-agent
	GOOS=windows GOARCH=amd64 go build -tags wails -ldflags="-H windowsgui" -o build/bridge-agent.exe ./cmd/bridge-agent
