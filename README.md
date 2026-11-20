# Git Bridge Agent

Windows에서는 `bridge-agent.exe` 하나만 사용합니다. 인수 없이 실행하면
백그라운드 트레이 Agent로 시작하고, 명령을 전달하면 CLI로 실행된 후 종료합니다.
트레이 Agent는 PowerShell 또는 콘솔 창을 열지 않습니다. 종료는 트레이 메뉴의
`종료`를 사용합니다.
Git bundle 전송과 일반 단일 파일 전송을 Relay를 통해 반대편 네트워크로 전달합니다.
GitLab/GitHub에 푸시하거나 MR/PR을 생성·병합하지 않으며, 무시되는 환경 파일도
복사하지 않습니다.

## CLI 초기 설정

```powershell
bridge-agent config set `
  --user-name 홍길동 `
  --relay-url https://relay.example.internal `
  --project-id project-a `
  --network external `
  --repository C:\work\project `
  --target main
```

```powershell
bridge-agent upload --branch feature/payment
bridge-agent inbox
bridge-agent download --id <transfer-id>
bridge-agent file upload --path C:\release\result.zip
```

`download` 명령은 번들을 검증하고 `refs/bridge/incoming/<id>`로 가져온 뒤,
새 로컬 브랜치 `bridge/<network>/<branch>/<id>`를 체크아웃합니다. 추적 대상
파일이 변경된 작업 디렉터리는 덮어쓰지 않습니다. `.env` 같은 무시되는 파일은
기존 복제본에 그대로 남으며 전송되지 않습니다.

테스트가 끝나면 일반 Git 명령으로 체크아웃된 브랜치를 푸시하고,
GitLab/GitHub에서 MR/PR을 직접 생성합니다.

## CLI 명령어 안내

Git Bridge Agent는 커밋된 Git 브랜치를 bundle로 만들어 Relay를 통해 반대편
네트워크에 전달합니다. GitLab/GitHub에 직접 push하거나 MR/PR을 생성·병합하지
않으며, ignored 파일(예: `.env`)은 전송하지 않습니다.

### 시작 전 설정: `config set`

모든 전송 명령을 실행하기 전에 현재 PC의 Agent 설정을 저장합니다.

```powershell
bridge-agent config set `
  --user-name 홍길동 `
  --relay-url https://relay.example.internal `
  --project-id project-a `
  --network external `
  --repository C:\work\project `
  --target main
```

| 옵션 | 설명 |
| --- | --- |
| `--user-name` | 이 PC의 Agent 설치에서 공통으로 사용할 사용자명. 업로드·다운로드 이력에 기록됨 |
| `--relay-url` | Relay 서버의 HTTP 또는 HTTPS 기본 URL |
| `--project-id` | internal/external Agent가 동일하게 사용하는 논리적 프로젝트 ID |
| `--network` | 현재 Agent가 실행되는 환경. `external` 또는 `internal` |
| `--repository` | 동기화할 로컬 Git 저장소 절대 경로 |
| `--target` | source 브랜치의 공통 기준 브랜치. 기본값은 `main` |

처음 설정하면 해당 프로젝트가 활성 프로필로 저장됩니다. 한 PC에서 external/internal
흐름을 순차 테스트하는 경우에는 별도 프로필을 만들거나, 활성 프로필의 `--network`와
저장소 경로를 변경합니다.

### 사용자명 설정: `config user set --name <사용자명>`

사용자명은 프로젝트별 설정이 아니라 Agent 설치 전체에서 공통으로 사용합니다. Git bundle과
일반 파일을 업로드한 사람, 그리고 다운로드를 완료한 사람이 수신함에 표시됩니다. 기존
설정을 사용하는 Agent는 업데이트 후 사용자명을 한 번 설정해야 새 전송을 수행할 수 있습니다.

```powershell
bridge-agent config user set --name 홍길동
```

Relay는 현재 배포망 ACL을 신뢰하고 사용자별 로그인이나 토큰 인증을 제공하지 않습니다.
따라서 사용자명은 사내 표시·추적용이며 권한 제어 또는 변조 방지 감사 수단은 아닙니다.

## 여러 프로젝트 사용

Agent는 한 사용자 안에서 여러 프로젝트 프로필을 저장할 수 있습니다. 각 프로필은
Relay URL, `project-id`, 네트워크 역할, 로컬 저장소 경로, 기준 브랜치를 독립적으로
가집니다.

UI 상단의 프로젝트 선택 목록에서 활성 프로필을 바꾸면 Git 전송과 파일 전송의
수신함·업로드 대상이 즉시 해당 프로젝트로 바뀝니다. **프로젝트 추가**로 새 프로필을
만들고, 설정 화면에서 이름과 연결 정보를 저장합니다. 삭제는 로컬 Agent 설정만
지우며 Relay에 보관된 전송 파일이나 로컬 Git 저장소에는 영향을 주지 않습니다.

기존 단일 설정은 Agent 업데이트 후 처음 읽을 때 `project-id`를 이름으로 한 프로필로
자동 이관됩니다. CLI는 현재 UI에서 선택한 활성 프로필을 사용합니다.

### 현재 설정 확인: `config show`

현재 사용자에게 저장된 설정을 JSON으로 표시합니다. 전송 전에 repository 경로와
`network` 값이 현재 PC 환경과 일치하는지 확인할 때 사용합니다.

```powershell
bridge-agent config show
```

### 브랜치 업로드: `upload --branch <브랜치>`

설정된 저장소의 로컬 브랜치를 Git bundle로 만들고 반대편 네트워크의 Relay inbox에
업로드합니다. 예를 들어 external Agent에서 실행하면 internal Agent의 inbox에
나타납니다.

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

각 항목에는 transfer ID, 보낸 네트워크, source 브랜치, bundle SHA-256, 업로드자,
생성·만료 시각, 사용자별 다운로드 완료 이력이 포함됩니다.

### 브랜치 다운로드: `download --id <transfer-id>`

Inbox의 transfer를 내려받아 SHA-256과 Git bundle을 검증하고, 다음 ref를 로컬
저장소에 만듭니다.

```powershell
bridge-agent download --id 12345678-1234-1234-1234-123456789abc
```

- 감사 및 추적용 ref: `refs/bridge/incoming/<transfer-id>`
- 검토용 checkout 브랜치: `bridge/<보낸-망>/<source-branch>/<transfer-id 앞 8자리>`

예를 들어 external의 `feature/payment`을 받으면
`bridge/external/feature-payment/12345678` 브랜치가 checkout됩니다. tracked 파일을
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

## 일반 파일 전송

일반 파일은 Git bundle과 별도 수신함으로 전달됩니다. 현재 설정의 `project-id`와
`network`를 사용하며, 업로드하면 자동으로 반대편 네트워크에만 표시됩니다. 폴더는
전송할 수 없고 단일 파일만 지원합니다. 모든 확장자를 전송할 수 있지만, Agent는
파일을 자동 실행하거나 자동으로 압축 해제하지 않습니다.

Relay의 기본 정책은 파일당 최대 500MiB, 업로드 후 14일 보관입니다. 다운로드가
성공하면 SHA-256을 검증한 뒤 사용자별 수신 완료를 기록하며, 수신자는 수신함에서
불필요한 파일을 직접 삭제할 수 있습니다. 전송 파일이 만료되거나 삭제되면 관련
사용자 이력도 함께 제거됩니다.

```powershell
bridge-agent file upload --path C:\release\result.zip
bridge-agent file inbox
bridge-agent file download --id <transfer-id> --output C:\Users\me\Downloads\result.zip
bridge-agent file delete --id <transfer-id>
```

트레이 UI에서는 **파일 전송** 탭에서 파일을 선택해 업로드하고, 수신 파일의
**저장** 버튼을 누른 뒤 매번 저장 위치를 선택합니다.

## 사용자 환경 검증

Mac 한 대에서 Relay, A 복제본, B 복제본을 사용해 CLI 전체 흐름을 점검하는
절차는 [CLI 사용자 검증 시나리오](docs/CLI_USER_TEST.md)에 정리되어 있습니다.

## 데스크톱 셸

Wails 데스크톱 셸은 Agent UI 전용으로 빌드합니다. 트레이 메뉴에서 UI를 열기
전까지 창을 숨기므로, 유휴 상태의 프로세스는 WebView 창을 표시한 채 유지하지
않습니다. `make build-desktop`으로 빌드할 수 있으며 Wails v3 CLI와 Windows
WebView2 개발 사전 조건이 필요합니다. CLI와 데스크톱 셸은 동일한 Agent core를
사용합니다.

## 릴리스

`v*` Git 태그를 푸시하면 GitHub Actions 릴리스 워크플로가 실행됩니다. Agent를
테스트하고 Windows amd64 데스크톱 실행 파일을 빌드한 뒤,
`bridge-agent-windows-amd64.zip`을 같은 버전의 GitHub 릴리스에 게시합니다.
