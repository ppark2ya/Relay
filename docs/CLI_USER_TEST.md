# CLI 사용자 검증 시나리오

이 문서는 하나의 Mac에서 A/B 망을 모사해 Git Bridge의 bundle 전송 흐름을
검증하는 절차다. 실제 A/B 네트워크, GitLab, GitHub 또는 Windows Agent는
필요하지 않다. 테스트 복제본 두 개는 반드시 같은 `main` 커밋에서 시작해야
한다.

## 준비

다음 예시는 Relay 소스가 `~/workspace/relay`, Agent 소스가
`~/workspace/git-bridge`에 있다고 가정한다.

```bash
# 터미널 1: 테스트 전용 Relay 실행
cd ~/workspace/relay
mkdir -p .local-test
PORT=18080 \
DB_PATH="$PWD/.local-test/relay.db" \
BRIDGE_UPLOAD_DIR="$PWD/.local-test/bridge-bundles" \
go run ./cmd/server
```

별도 터미널에서 같은 기준 커밋을 공유하는 A/B 작업 복제본을 준비한다. 이미
테스트할 프로젝트의 bare 저장소가 있다면 그 주소를 `SOURCE_REPOSITORY`에
사용한다.

```bash
mkdir -p ~/git-bridge-e2e
git clone SOURCE_REPOSITORY ~/git-bridge-e2e/A-project
git clone SOURCE_REPOSITORY ~/git-bridge-e2e/B-project

git -C ~/git-bridge-e2e/A-project switch main
git -C ~/git-bridge-e2e/B-project switch -c feature/mac-e2e
```

`B-project`에서 검증 가능한 작은 변경을 만들고 커밋한다.

```bash
cd ~/git-bridge-e2e/B-project
printf 'Git Bridge E2E\n' >> bridge-e2e.txt
git add bridge-e2e.txt
git commit -m "test: bridge bundle transfer"
```

## B에서 업로드

Agent CLI는 사용자별 단일 설정을 사용한다. 따라서 한 Mac에서 A/B를 모사할
때는 아래처럼 먼저 B 설정으로 업로드하고, 이후 A 설정으로 바꿔 다운로드한다.

```bash
cd ~/workspace/git-bridge

go run ./cmd/bridge-agent config set \
  --relay-url http://127.0.0.1:18080 \
  --project-id mac-e2e \
  --network B \
  --repository ~/git-bridge-e2e/B-project \
  --target main

go run ./cmd/bridge-agent upload --branch feature/mac-e2e
```

출력 JSON의 `id`를 기록한다. 이 값이 A에서 다운로드할 transfer ID다.

## A에서 확인 및 다운로드

```bash
go run ./cmd/bridge-agent config set \
  --relay-url http://127.0.0.1:18080 \
  --project-id mac-e2e \
  --network A \
  --repository ~/git-bridge-e2e/A-project \
  --target main

go run ./cmd/bridge-agent inbox
```

Inbox에 B에서 만든 transfer가 보이면, 다운로드 전 안전장치를 먼저 확인한다.

```bash
cd ~/git-bridge-e2e/A-project
printf 'local-only\n' >> README.md

cd ~/workspace/git-bridge
go run ./cmd/bridge-agent download --id TRANSFER_ID
```

tracked 파일 변경이 있으므로 다운로드는 실패해야 한다. 테스트 복제본의 변경을
되돌린 뒤 다시 실행한다.

```bash
git -C ~/git-bridge-e2e/A-project restore README.md
printf 'local secret\n' > ~/git-bridge-e2e/A-project/.env

cd ~/workspace/git-bridge
go run ./cmd/bridge-agent download --id TRANSFER_ID
```

## 결과 확인

```bash
cd ~/git-bridge-e2e/A-project
git branch --show-current
git show --stat --oneline HEAD
git show-ref | rg 'refs/bridge/incoming'
test -f .env && echo '.env preserved'
```

다음을 모두 확인한다.

- `bridge/B/feature-mac-e2e/<transfer-id 일부>` 형태의 새 로컬 브랜치가
  checkout된다.
- B에서 만든 `bridge-e2e.txt`와 커밋이 A에 존재한다.
- `refs/bridge/incoming/<transfer-id>` ref가 보존된다.
- A의 ignored 파일 `.env`는 그대로 남아 있다.
- `go run ./cmd/bridge-agent inbox`에서 해당 transfer의 다운로드 완료 상태를
  확인할 수 있다.

반대 방향(A에서 B)도 같은 순서로 검증할 수 있다. A에서 새 feature 브랜치를
커밋하고 `--network A` 설정으로 업로드한 뒤, B 설정으로 바꾸어 inbox와
download를 실행한다.

## 범위

이 시나리오는 Relay API, bundle SHA 검증, Git ref 생성, working tree 보호,
ignored 파일 보존을 검증한다. Windows tray, Windows 자동 시작, WebView2 UI는
Windows 장비 또는 VM에서 별도로 검증해야 한다.
