# Flow Script DSL 문법 가이드

Relay Flow의 Pre-Script / Post-Script에서 사용하는 DSL(Domain-Specific Language) 문법입니다.

## 개요

스크립트는 JSON 형식으로 작성되며, 세 가지 주요 섹션으로 구성됩니다:

```json
{
  "assertions": [...],     // 응답 검증 (Post-Script 전용)
  "setVariables": [...],   // 변수 조작
  "flow": {...}            // 흐름 제어
}
```

---

## 1. Assertions (응답 검증)

HTTP 응답을 검증합니다. **Post-Script에서만 사용 가능합니다.**

### 1.1 Status Code 검증

```json
{
  "assertions": [
    { "type": "status", "operator": "eq", "value": 200 },
    { "type": "status", "operator": "in", "value": [200, 201, 204] }
  ]
}
```

### 1.2 JSONPath 검증

응답 Body에서 JSONPath로 값을 추출하여 검증합니다.

```json
{
  "assertions": [
    { "type": "jsonpath", "path": "$.success", "operator": "eq", "value": true },
    { "type": "jsonpath", "path": "$.data.count", "operator": "gt", "value": 0 },
    { "type": "jsonpath", "path": "$.error", "operator": "eq", "value": null }
  ]
}
```

### 1.3 Header 검증

```json
{
  "assertions": [
    { "type": "header", "name": "Content-Type", "operator": "contains", "value": "application/json" },
    { "type": "header", "name": "X-Request-Id", "operator": "exists" }
  ]
}
```

### 1.4 Response Time 검증

```json
{
  "assertions": [
    { "type": "responseTime", "operator": "lt", "value": 1000 }
  ]
}
```

### 1.5 Body Contains 검증

```json
{
  "assertions": [
    { "type": "bodyContains", "value": "success" },
    { "type": "bodyContains", "value": "\"status\":\"ok\"" }
  ]
}
```

### 연산자 목록

| 연산자 | 설명 | 예시 |
|--------|------|------|
| `eq` | 같음 (==) | `{"operator": "eq", "value": 200}` |
| `ne` | 같지 않음 (!=) | `{"operator": "ne", "value": 0}` |
| `gt` | 초과 (>) | `{"operator": "gt", "value": 10}` |
| `gte` | 이상 (>=) | `{"operator": "gte", "value": 1}` |
| `lt` | 미만 (<) | `{"operator": "lt", "value": 100}` |
| `lte` | 이하 (<=) | `{"operator": "lte", "value": 50}` |
| `contains` | 포함 | `{"operator": "contains", "value": "token"}` |
| `in` | 목록 중 하나 | `{"operator": "in", "value": [200, 201]}` |
| `exists` | 존재 여부 | `{"operator": "exists"}` |
| `regex` | 정규식 매치 | `{"operator": "regex", "value": "^[A-Z]+$"}` |

---

## 2. Variables (변수 조작)

### 2.1 값 설정 (set)

**리터럴 값 설정:**
```json
{
  "setVariables": [
    { "name": "status", "value": "completed" },
    { "name": "count", "value": 0 },
    { "name": "enabled", "value": true }
  ]
}
```

**응답에서 JSONPath로 추출:**
```json
{
  "setVariables": [
    { "name": "token", "from": "$.data.accessToken" },
    { "name": "userId", "from": "$.user.id" },
    { "name": "items", "from": "$.data.items[*].id" }
  ]
}
```

**다른 변수 참조:**
```json
{
  "setVariables": [
    { "name": "backup", "value": "{{original}}" }
  ]
}
```

### 2.2 숫자 증감 (increment / decrement)

```json
{
  "setVariables": [
    { "name": "counter", "operation": "increment" },
    { "name": "counter", "operation": "increment", "by": 5 },
    { "name": "remaining", "operation": "decrement" },
    { "name": "remaining", "operation": "decrement", "by": 10 }
  ]
}
```

### 2.3 수학 연산 (math)

```json
{
  "setVariables": [
    {
      "name": "total",
      "operation": "math",
      "expression": "{{price}} * {{quantity}}"
    },
    {
      "name": "average",
      "operation": "math",
      "expression": "({{sum}} / {{count}})"
    },
    {
      "name": "percentage",
      "operation": "math",
      "expression": "({{current}} / {{total}}) * 100"
    }
  ]
}
```

**지원 연산자:** `+`, `-`, `*`, `/`, `%` (나머지), `(`, `)`

### 2.4 문자열 연결 (concat)

```json
{
  "setVariables": [
    {
      "name": "fullName",
      "operation": "concat",
      "values": ["{{firstName}}", " ", "{{lastName}}"]
    },
    {
      "name": "authHeader",
      "operation": "concat",
      "values": ["Bearer ", "{{token}}"]
    }
  ]
}
```

### 2.5 조건부 설정 (conditional)

```json
{
  "setVariables": [
    {
      "name": "status",
      "operation": "conditional",
      "condition": "{{code}} == 200",
      "ifTrue": "success",
      "ifFalse": "failed"
    }
  ]
}
```

---

## 3. Flow Control (흐름 제어)

### 3.1 기본 액션

```json
{
  "flow": {
    "action": "next"
  }
}
```

| 액션 | 설명 |
|------|------|
| `next` | 다음 Step으로 진행 (기본값) |
| `stop` | Flow 실행 중단 |
| `repeat` | 현재 Step 다시 실행 |
| `goto` | 특정 Step으로 점프 |

### 3.2 Goto (특정 Step으로 이동)

**Step 이름으로 이동:**
```json
{
  "flow": {
    "action": "goto",
    "step": "3. 결제 확인"
  }
}
```

**Step 순서로 이동 (1-based):**
```json
{
  "flow": {
    "action": "goto",
    "stepOrder": 5
  }
}
```

### 3.3 조건부 흐름 제어

```json
{
  "flow": {
    "type": "conditional",
    "condition": "{{counter}} < {{target}}",
    "onTrue": {
      "action": "repeat"
    },
    "onFalse": {
      "action": "next"
    }
  }
}
```

**복잡한 조건:**
```json
{
  "flow": {
    "type": "conditional",
    "condition": "{{status}} == 'pending' && {{retryCount}} < 3",
    "onTrue": {
      "action": "goto",
      "step": "2. 상태 조회"
    },
    "onFalse": {
      "action": "stop"
    }
  }
}
```

### 3.4 다중 조건 분기 (switch)

```json
{
  "flow": {
    "type": "switch",
    "cases": [
      {
        "condition": "{{amount}} >= 50000",
        "action": "goto",
        "step": "5만원 투입"
      },
      {
        "condition": "{{amount}} >= 10000",
        "action": "goto",
        "step": "1만원 투입"
      },
      {
        "condition": "{{amount}} >= 1000",
        "action": "goto",
        "step": "1천원 투입"
      }
    ],
    "default": {
      "action": "goto",
      "step": "완료"
    }
  }
}
```

---

## 4. 조건식 문법

### 4.1 비교 연산자

| 연산자 | 설명 | 예시 |
|--------|------|------|
| `==` | 같음 | `{{status}} == "ok"` |
| `!=` | 다름 | `{{error}} != null` |
| `>` | 초과 | `{{count}} > 0` |
| `>=` | 이상 | `{{count}} >= 1` |
| `<` | 미만 | `{{retry}} < 3` |
| `<=` | 이하 | `{{progress}} <= 100` |

### 4.2 논리 연산자

| 연산자 | 설명 | 예시 |
|--------|------|------|
| `&&` | AND | `{{a}} > 0 && {{b}} > 0` |
| `\|\|` | OR | `{{status}} == "ok" \|\| {{status}} == "success"` |
| `!` | NOT | `!{{isError}}` |

### 4.3 존재 확인

```
{{token}}              // token 변수가 존재하고 비어있지 않으면 true
!{{error}}             // error 변수가 없거나 비어있으면 true
```

### 4.4 문자열 비교

```
{{type}} == "premium"
{{name}} != ""
{{message}} contains "success"
```

---

## 5. 내장 변수

스크립트에서 사용할 수 있는 내장 변수입니다.

| 변수 | 설명 | 사용 가능 |
|------|------|----------|
| `{{__statusCode__}}` | HTTP 응답 상태 코드 | Post-Script |
| `{{__responseTime__}}` | 응답 시간 (ms) | Post-Script |
| `{{__responseBody__}}` | 응답 Body (문자열) | Post-Script |
| `{{__iteration__}}` | 현재 반복 횟수 (1-based) | 모두 |
| `{{__loopCount__}}` | 총 반복 횟수 | 모두 |
| `{{__stepName__}}` | 현재 Step 이름 | 모두 |
| `{{__stepOrder__}}` | 현재 Step 순서 | 모두 |
| `{{__flowName__}}` | Flow 이름 | 모두 |
| `{{__timestamp__}}` | 현재 Unix timestamp (ms) | 모두 |
| `{{__uuid__}}` | 랜덤 UUID 생성 | 모두 |

---

## 6. 실전 예제

### 예제 1: 기본 검증 및 변수 추출

```json
{
  "assertions": [
    { "type": "status", "operator": "eq", "value": 200 },
    { "type": "jsonpath", "path": "$.success", "operator": "eq", "value": true }
  ],
  "setVariables": [
    { "name": "token", "from": "$.data.accessToken" },
    { "name": "expiresIn", "from": "$.data.expiresIn" }
  ]
}
```

### 예제 2: 카운터 기반 반복

```json
{
  "assertions": [
    { "type": "status", "operator": "eq", "value": 200 }
  ],
  "setVariables": [
    { "name": "current", "operation": "increment" }
  ],
  "flow": {
    "type": "conditional",
    "condition": "{{current}} < {{target}}",
    "onTrue": { "action": "repeat" },
    "onFalse": { "action": "next" }
  }
}
```

### 예제 3: 폴링 (상태 확인 반복)

```json
{
  "setVariables": [
    { "name": "status", "from": "$.data.status" },
    { "name": "retryCount", "operation": "increment" }
  ],
  "flow": {
    "type": "conditional",
    "condition": "{{status}} == 'pending' && {{retryCount}} < 10",
    "onTrue": { "action": "repeat" },
    "onFalse": { "action": "next" }
  }
}
```

### 예제 4: 현금 투입 시뮬레이션 (Postman 스크립트 변환)

**Pre-Script (Step 시작 전):**
```json
{}
```

**Post-Script (5만원 투입 Step):**
```json
{
  "assertions": [
    { "type": "status", "operator": "eq", "value": 200 }
  ],
  "setVariables": [
    { "name": "current_50k", "operation": "increment" }
  ],
  "flow": {
    "type": "conditional",
    "condition": "{{current_50k}} < {{target_50k}}",
    "onTrue": {
      "action": "repeat"
    },
    "onFalse": {
      "type": "switch",
      "cases": [
        {
          "condition": "{{target_10k}} > 0",
          "action": "goto",
          "step": "8-2. 현금 투입 - 1만원"
        },
        {
          "condition": "{{target_1k}} > 0",
          "action": "goto",
          "step": "8-3. 현금 투입 - 1천원"
        }
      ],
      "default": {
        "action": "goto",
        "step": "9. 승인 대기"
      }
    }
  }
}
```

### 예제 5: 에러 처리 및 재시도

```json
{
  "assertions": [
    { "type": "status", "operator": "in", "value": [200, 201] }
  ],
  "setVariables": [
    {
      "name": "success",
      "operation": "conditional",
      "condition": "{{__statusCode__}} == 200",
      "ifTrue": true,
      "ifFalse": false
    },
    { "name": "retryCount", "operation": "increment" }
  ],
  "flow": {
    "type": "conditional",
    "condition": "!{{success}} && {{retryCount}} < 3",
    "onTrue": { "action": "repeat" },
    "onFalse": {
      "type": "conditional",
      "condition": "{{success}}",
      "onTrue": { "action": "next" },
      "onFalse": { "action": "stop" }
    }
  }
}
```

---

## 7. 제한 사항

### 실행 제한

| 항목 | 제한값 | 설명 |
|------|--------|------|
| 최대 반복 횟수 | 1,000 | repeat 액션 실행 횟수 |
| 최대 goto 점프 | 100 | 무한 루프 방지 |
| 스크립트 타임아웃 | 5초 | 단일 스크립트 실행 시간 |
| Assertion 최대 개수 | 50 | 단일 스크립트 내 |
| 변수 연산 최대 개수 | 100 | 단일 스크립트 내 |

### 지원하지 않는 기능 (DSL 모드)

- 파일 시스템 접근
- 외부 라이브러리 호출

> JavaScript 코드 실행과 스크립트 내 HTTP 요청은 **JavaScript 모드**에서 지원됩니다 (`pm.sendRequest()` 사용).

---

## 8. 디버깅

### 스크립트 실행 결과

Flow 실행 결과에서 각 Step의 스크립트 실행 정보를 확인할 수 있습니다:

```json
{
  "stepId": 1,
  "postScriptResult": {
    "success": true,
    "assertionsPassed": 2,
    "assertionsFailed": 0,
    "errors": [],
    "updatedVars": {
      "token": "eyJhbGc...",
      "counter": "5"
    },
    "flowAction": "next"
  }
}
```

### 변수 검사

실행 중인 변수 값을 확인하려면 `extractVars`와 함께 사용하세요:

```json
{
  "setVariables": [
    { "name": "debug_counter", "value": "{{counter}}" },
    { "name": "debug_status", "value": "{{status}}" }
  ]
}
```
