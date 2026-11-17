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

## CLI 명령어 안내

Git Bridge Agent는 커밋된 Git 브랜치를 bundle로 만들어 Relay를 통해 반대편
네트워크에 전달합니다. GitLab/GitHub에 직접 push하거나 MR/PR을 생성·병합하지
않으며, ignored 파일(예: `.env`)은 전송하지 않습니다.

### 시작 전 설정: `config set`

모든 전송 명령을 실행하기 전에 현재 PC의 Agent 설정을 저장합니다.

```powershell
bridge-agent config set `
  --relay-url https://relay.example.internal `
  --project-id project-a `
  --network B `
  --repository C:\work\project `
  --target main
```

| 옵션 | 설명 |
| --- | --- |
| `--relay-url` | Relay 서버의 HTTP 또는 HTTPS 기본 URL |
| `--project-id` | A/B Agent가 동일하게 사용하는 논리적 프로젝트 ID |
| `--network` | 현재 Agent가 실행되는 망. `A` 또는 `B` |
| `--repository` | 동기화할 로컬 Git 저장소 절대 경로 |
| `--target` | source 브랜치의 공통 기준 브랜치. 기본값은 `main` |

설정은 사용자별로 하나만 저장됩니다. 한 PC에서 A/B 흐름을 순차 테스트하는
경우에는 B에서 업로드한 뒤, `config set`으로 A 저장소와 `--network A`를 다시
지정합니다.

### 현재 설정 확인: `config show`

현재 사용자에게 저장된 설정을 JSON으로 표시합니다. 전송 전에 repository 경로와
`network` 값이 현재 PC 환경과 일치하는지 확인할 때 사용합니다.

```powershell
bridge-agent config show
```

### 브랜치 업로드: `upload --branch <브랜치>`

설정된 저장소의 로컬 브랜치를 Git bundle로 만들고 반대편 네트워크의 Relay inbox에
업로드합니다. 예를 들어 B Agent에서 실행하면 A Agent의 inbox에 나타납니다.

```powershell
bridge-agent upload --branch feature/payment
```

업로드할 브랜치는 로컬에 존재해야 하며, tracked 파일 변경 사항이 없어야 합니다.
명령은 생성된 transfer의 `id`, source/target network, SHA-256 정보를 JSON으로
출력합니다. `id`는 수신 측의 `download` 명령에 사용합니다.

### 수신함 조회: `inbox` / `status`

현재 설정의 `project-id`와 `network`에 수신 대기 중인 transfer 목록을 JSON으로
표시합니다. `status`는 `inbox`와 같은 별칭입니다.

```powershell
bridge-agent inbox
bridge-agent status
```

각 항목에는 transfer ID, 보낸 네트워크, source 브랜치, bundle SHA-256, 생성·만료
시각, 다운로드 완료 시각이 포함됩니다.

### 브랜치 다운로드: `download --id <transfer-id>`

Inbox의 transfer를 내려받아 SHA-256과 Git bundle을 검증하고, 다음 ref를 로컬
저장소에 만듭니다.

```powershell
bridge-agent download --id 12345678-1234-1234-1234-123456789abc
```

- 감사 및 추적용 ref: `refs/bridge/incoming/<transfer-id>`
- 검토용 checkout 브랜치: `bridge/<보낸-망>/<source-branch>/<transfer-id 앞 8자리>`

예를 들어 B의 `feature/payment`을 받으면
`bridge/B/feature-payment/12345678` 브랜치가 checkout됩니다. tracked 파일을
변경한 작업 디렉터리에서는 덮어쓰기 방지를 위해 명령이 실패합니다. `.env`처럼
ignored 파일은 기존 복제본에 그대로 남고 bundle에도 포함되지 않습니다.

다운로드와 checkout이 성공하면 Relay에 자동으로 다운로드 완료를 알립니다. 이후
일반 Git 명령으로 테스트하고, 검증된 브랜치만 GitLab/GitHub에 push하여 MR/PR을
직접 생성합니다.

### 전송 파일 삭제: `delete --id <transfer-id>`

Relay에 저장된 transfer와 bundle을 삭제합니다. 더 이상 필요 없는 전송 파일을
정리할 때 사용합니다.

```powershell
bridge-agent delete --id 12345678-1234-1234-1234-123456789abc
```

삭제된 bundle은 다시 다운로드할 수 없으므로, 실행 전에 대상 transfer ID와
프로젝트를 확인해야 합니다.

## 사용자 환경 검증

Mac 한 대에서 Relay, A 복제본, B 복제본을 사용해 CLI 전체 흐름을 점검하는
절차는 [CLI 사용자 검증 시나리오](docs/CLI_USER_TEST.md)에 정리되어 있습니다.

## Desktop shell

The Wails desktop shell is deliberately built only for the Agent UI. It keeps
the window hidden until the tray menu opens it, so the idle process does not
keep a WebView window visible. Build it with `make build-desktop`; this needs
the Wails v3 CLI and Windows WebView2 development prerequisites. The CLI and
desktop shell call the same Agent core.

## Release

Pushing a `v*` Git tag runs the GitHub Actions release workflow. It tests the
agent, builds the Windows amd64 desktop executable, and publishes
`bridge-agent-windows-amd64.zip` to the matching GitHub Release.
