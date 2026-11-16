# Git Bridge Agent

Windows users run one `bridge-agent.exe`: without arguments it runs in the
background tray; with a command it runs as a CLI and exits when the command
finishes.
The v1 transfer flow sends committed Git branches as bundles through Relay; it
does not create merge requests, push to GitLab/GitHub, merge branches, or copy
ignored environment files.

## CLI setup

```powershell
bridge-agent config set `
  --relay-url https://relay.example.internal `
  --project-id project-a `
  --network B `
  --repository C:\work\project `
  --target main
```

```powershell
bridge-agent upload --branch feature/payment
bridge-agent inbox
bridge-agent download --id <transfer-id>
```

`download` verifies the bundle, fetches it to `refs/bridge/incoming/<id>`, and
checks out a new local `bridge/<network>/<branch>/<id>` branch. It refuses to
overwrite a working tree with tracked changes. Ignored files such as `.env`
remain in the existing clone and are never transferred.

After testing, use normal Git commands to push the checked-out branch and
create an MR/PR in GitLab/GitHub.

## Desktop shell

The Wails desktop shell is deliberately built only for the Agent UI. It keeps
the window hidden until the tray menu opens it, so the idle process does not
keep a WebView window visible. Build it with `make build-desktop`; this needs
the Wails v3 CLI and Windows WebView2 development prerequisites. The CLI and
desktop shell call the same Agent core.
