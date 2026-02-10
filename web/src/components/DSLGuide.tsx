import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DSLGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

type GuideTab = 'dsl' | 'javascript';

// Custom components for better markdown rendering
const components = {
  code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match;

    if (isInline) {
      return (
        <code className="bg-gray-100 dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    }

    return (
      <code className="block text-xs font-mono" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-3 rounded-lg overflow-x-auto text-xs font-mono my-2 border border-gray-800" {...props}>
      {children}
    </pre>
  ),
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-xs" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentPropsWithoutRef<'thead'>) => (
    <thead className="bg-gray-100 dark:bg-gray-800" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<'th'>) => (
    <th className="border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-300" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-gray-600 dark:text-gray-400" {...props}>
      {children}
    </td>
  ),
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-gray-300 dark:border-gray-600 pb-1.5 mb-3" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-5 mb-2 pb-1 border-b border-gray-200 dark:border-gray-700" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3 mb-1.5" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed my-1.5" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-gray-800 dark:text-gray-200" {...props}>
      {children}
    </strong>
  ),
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
    <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-300 my-1.5 ml-2 space-y-0.5" {...props}>
      {children}
    </ul>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
    <li className="text-xs text-gray-600 dark:text-gray-300" {...props}>
      {children}
    </li>
  ),
  hr: (props: React.ComponentPropsWithoutRef<'hr'>) => (
    <hr className="border-gray-300 dark:border-gray-600 my-4" {...props} />
  ),
};

const DSL_GUIDE_CONTENT = `# Flow Script DSL 문법 가이드

Relay Flow의 Pre-Script / Post-Script에서 사용하는 DSL(Domain-Specific Language) 문법입니다.

## 개요

스크립트는 JSON 형식으로 작성되며, 세 가지 주요 섹션으로 구성됩니다:

\`\`\`json
{
  "assertions": [...],     // 응답 검증 (Post-Script 전용)
  "setVariables": [...],   // 변수 조작
  "flow": {...}            // 흐름 제어
}
\`\`\`

---

## 1. Assertions (응답 검증)

HTTP 응답을 검증합니다. **Post-Script에서만 사용 가능합니다.**

### 1.1 Status Code 검증

\`\`\`json
{
  "assertions": [
    { "type": "status", "operator": "eq", "value": 200 },
    { "type": "status", "operator": "in", "value": [200, 201, 204] }
  ]
}
\`\`\`

### 1.2 JSONPath 검증

응답 Body에서 JSONPath로 값을 추출하여 검증합니다.

\`\`\`json
{
  "assertions": [
    { "type": "jsonpath", "path": "$.success", "operator": "eq", "value": true },
    { "type": "jsonpath", "path": "$.data.count", "operator": "gt", "value": 0 },
    { "type": "jsonpath", "path": "$.error", "operator": "eq", "value": null }
  ]
}
\`\`\`

### 1.3 Header 검증

\`\`\`json
{
  "assertions": [
    { "type": "header", "name": "Content-Type", "operator": "contains", "value": "application/json" },
    { "type": "header", "name": "X-Request-Id", "operator": "exists" }
  ]
}
\`\`\`

### 1.4 Response Time 검증

\`\`\`json
{
  "assertions": [
    { "type": "responseTime", "operator": "lt", "value": 1000 }
  ]
}
\`\`\`

### 1.5 Body Contains 검증

\`\`\`json
{
  "assertions": [
    { "type": "bodyContains", "value": "success" },
    { "type": "bodyContains", "value": "\\"status\\":\\"ok\\"" }
  ]
}
\`\`\`

### 연산자 목록

| 연산자 | 설명 | 예시 |
|--------|------|------|
| \`eq\` | 같음 (==) | \`{"operator": "eq", "value": 200}\` |
| \`ne\` | 같지 않음 (!=) | \`{"operator": "ne", "value": 0}\` |
| \`gt\` | 초과 (>) | \`{"operator": "gt", "value": 10}\` |
| \`gte\` | 이상 (>=) | \`{"operator": "gte", "value": 1}\` |
| \`lt\` | 미만 (<) | \`{"operator": "lt", "value": 100}\` |
| \`lte\` | 이하 (<=) | \`{"operator": "lte", "value": 50}\` |
| \`contains\` | 포함 | \`{"operator": "contains", "value": "token"}\` |
| \`in\` | 목록 중 하나 | \`{"operator": "in", "value": [200, 201]}\` |
| \`exists\` | 존재 여부 | \`{"operator": "exists"}\` |
| \`regex\` | 정규식 매치 | \`{"operator": "regex", "value": "^[A-Z]+$"}\` |

---

## 2. Variables (변수 조작)

### 2.1 값 설정 (set)

**리터럴 값 설정:**
\`\`\`json
{
  "setVariables": [
    { "name": "status", "value": "completed" },
    { "name": "count", "value": 0 },
    { "name": "enabled", "value": true }
  ]
}
\`\`\`

**응답에서 JSONPath로 추출:**
\`\`\`json
{
  "setVariables": [
    { "name": "token", "from": "$.data.accessToken" },
    { "name": "userId", "from": "$.user.id" }
  ]
}
\`\`\`

### 2.2 숫자 증감 (increment / decrement)

\`\`\`json
{
  "setVariables": [
    { "name": "counter", "operation": "increment" },
    { "name": "counter", "operation": "increment", "by": 5 },
    { "name": "remaining", "operation": "decrement" }
  ]
}
\`\`\`

### 2.3 수학 연산 (math)

\`\`\`json
{
  "setVariables": [
    {
      "name": "total",
      "operation": "math",
      "expression": "{{price}} * {{quantity}}"
    }
  ]
}
\`\`\`

**지원 연산자:** \`+\`, \`-\`, \`*\`, \`/\`, \`%\` (나머지), \`(\`, \`)\`

### 2.4 문자열 연결 (concat)

\`\`\`json
{
  "setVariables": [
    {
      "name": "fullName",
      "operation": "concat",
      "values": ["{{firstName}}", " ", "{{lastName}}"]
    }
  ]
}
\`\`\`

### 2.5 조건부 설정 (conditional)

\`\`\`json
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
\`\`\`

---

## 3. Flow Control (흐름 제어)

### 3.1 기본 액션

\`\`\`json
{
  "flow": {
    "action": "next"
  }
}
\`\`\`

| 액션 | 설명 |
|------|------|
| \`next\` | 다음 Step으로 진행 (기본값) |
| \`stop\` | Flow 실행 중단 |
| \`repeat\` | 현재 Step 다시 실행 |
| \`goto\` | 특정 Step으로 점프 |

### 3.2 Goto (특정 Step으로 이동)

**Step 이름으로 이동:**
\`\`\`json
{
  "flow": {
    "action": "goto",
    "step": "3. 결제 확인"
  }
}
\`\`\`

**Step 순서로 이동 (1-based):**
\`\`\`json
{
  "flow": {
    "action": "goto",
    "stepOrder": 5
  }
}
\`\`\`

### 3.3 조건부 흐름 제어

\`\`\`json
{
  "flow": {
    "type": "conditional",
    "condition": "{{counter}} < {{target}}",
    "onTrue": { "action": "repeat" },
    "onFalse": { "action": "next" }
  }
}
\`\`\`

### 3.4 다중 조건 분기 (switch)

\`\`\`json
{
  "flow": {
    "type": "switch",
    "cases": [
      { "condition": "{{amount}} >= 50000", "action": "goto", "step": "5만원" },
      { "condition": "{{amount}} >= 10000", "action": "goto", "step": "1만원" }
    ],
    "default": { "action": "goto", "step": "완료" }
  }
}
\`\`\`

---

## 4. 조건식 문법

### 비교 연산자

| 연산자 | 설명 | 예시 |
|--------|------|------|
| \`==\` | 같음 | \`{{status}} == "ok"\` |
| \`!=\` | 다름 | \`{{error}} != null\` |
| \`>\` | 초과 | \`{{count}} > 0\` |
| \`>=\` | 이상 | \`{{count}} >= 1\` |
| \`<\` | 미만 | \`{{retry}} < 3\` |
| \`<=\` | 이하 | \`{{progress}} <= 100\` |

### 논리 연산자

| 연산자 | 설명 | 예시 |
|--------|------|------|
| \`&&\` | AND | \`{{a}} > 0 && {{b}} > 0\` |
| \`\\|\\|\` | OR | \`{{x}} == 1 \\|\\| {{y}} == 1\` |
| \`contains\` | 포함 | \`{{msg}} contains "success"\` |

---

## 5. 내장 변수

| 변수 | 설명 | 사용 가능 |
|------|------|----------|
| \`{{__statusCode__}}\` | HTTP 응답 상태 코드 | Post-Script |
| \`{{__responseTime__}}\` | 응답 시간 (ms) | Post-Script |
| \`{{__iteration__}}\` | 현재 반복 횟수 (1-based) | 모두 |
| \`{{__loopCount__}}\` | 총 반복 횟수 | 모두 |
| \`{{__stepName__}}\` | 현재 Step 이름 | 모두 |
| \`{{__stepOrder__}}\` | 현재 Step 순서 | 모두 |
| \`{{__flowName__}}\` | Flow 이름 | 모두 |
| \`{{__timestamp__}}\` | 현재 Unix timestamp (ms) | 모두 |
| \`{{__uuid__}}\` | 랜덤 UUID 생성 | 모두 |

---

## 6. 실전 예제

### 예제 1: 기본 검증 및 변수 추출

\`\`\`json
{
  "assertions": [
    { "type": "status", "operator": "eq", "value": 200 },
    { "type": "jsonpath", "path": "$.success", "operator": "eq", "value": true }
  ],
  "setVariables": [
    { "name": "token", "from": "$.data.accessToken" }
  ]
}
\`\`\`

### 예제 2: 카운터 기반 반복

\`\`\`json
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
\`\`\`

### 예제 3: 폴링 (상태 확인 반복)

\`\`\`json
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
\`\`\`

---

## 7. 제한 사항

### 실행 제한

| 항목 | 제한값 |
|------|--------|
| 최대 반복 횟수 | 1,000 |
| 최대 goto 점프 | 100 |
| 스크립트 타임아웃 | 5초 |
| Assertion 최대 개수 | 50 |

### 지원하지 않는 기능

- JavaScript 코드 실행
- 파일 시스템 접근
- 추가 HTTP 요청 발생
- 외부 라이브러리 호출
`;

const JS_GUIDE_CONTENT = `# JavaScript Script 가이드 (Postman 호환)

Relay Flow의 Pre-Script / Post-Script에서 JavaScript 모드로 사용하는 Postman 호환 스크립팅 API입니다.

## 개요

Flow Step 편집 시 스크립트 모드를 **JavaScript**로 전환하면 Postman과 유사한 \`pm.*\` API를 사용할 수 있습니다. 내부적으로 [goja](https://github.com/dop251/goja) (Go 기반 JS 엔진)를 사용하며, ES5.1 문법을 지원합니다.

### 실행 순서

\`\`\`text
1. Pre-Script  (변수 설정, 요청 전 준비)
2. HTTP 요청 실행
3. Post-Script (응답 검증, 변수 추출, 흐름 제어)
\`\`\`

---

## 1. 변수 관리

### 1.1 pm.environment — 환경 변수 (DB 영속)

활성화된 Environment에 저장되며, Flow 실행 후에도 유지됩니다.

\`\`\`javascript
// 읽기
var token = pm.environment.get("token");

// 쓰기 (DB에 영속)
pm.environment.set("token", "Bearer abc123");

// 존재 여부 확인
if (pm.environment.has("token")) {
  // ...
}
\`\`\`

### 1.2 pm.variables — 런타임 변수 (세션 한정)

현재 Flow 실행 중에만 유효하며, 실행 완료 후 사라집니다.

\`\`\`javascript
// 읽기 (런타임 변수 → 환경 변수 순으로 탐색)
var page = pm.variables.get("currentPage");

// 쓰기 (세션 내에서만 유지)
pm.variables.set("currentPage", "2");
\`\`\`

### 1.3 pm.globals — 글로벌 변수 (워크스페이스 범위, DB 영속)

워크스페이스 전체에서 공유되며, 모든 Flow/Environment에서 접근 가능합니다.

\`\`\`javascript
// 읽기
var baseUrl = pm.globals.get("baseUrl");

// 쓰기 (DB에 영속)
pm.globals.set("baseUrl", "https://api.example.com");

// 존재 여부 확인
pm.globals.has("baseUrl"); // true

// 삭제
pm.globals.unset("baseUrl");

// 전체 삭제
pm.globals.clear();
\`\`\`

### 1.4 pm.collectionVariables — 컬렉션 변수 (DB 영속)

해당 컬렉션 범위에서만 접근 가능합니다.

\`\`\`javascript
// 읽기
var apiKey = pm.collectionVariables.get("apiKey");

// 쓰기 (DB에 영속)
pm.collectionVariables.set("apiKey", "my-key");

// 존재 여부 확인
pm.collectionVariables.has("apiKey"); // true

// 삭제
pm.collectionVariables.unset("apiKey");

// 전체 삭제
pm.collectionVariables.clear();
\`\`\`

### 변수 우선순위

변수 조회 시 아래 순서로 탐색합니다 (높은 우선순위 → 낮은 우선순위):

| 우선순위 | 스코프 | API |
|---------|--------|-----|
| 1 | 런타임 변수 | \`pm.variables\` |
| 2 | 환경 변수 (쓰기 대기) | \`pm.environment.set()\` 호출 결과 |
| 3 | 환경 변수 | \`pm.environment\` |
| 4 | 컬렉션 변수 (쓰기 대기) | \`pm.collectionVariables.set()\` 호출 결과 |
| 5 | 컬렉션 변수 | \`pm.collectionVariables\` |
| 6 | 글로벌 변수 (쓰기 대기) | \`pm.globals.set()\` 호출 결과 |
| 7 | 글로벌 변수 | \`pm.globals\` |

---

## 2. 응답 검증 (Post-Script 전용)

### 2.1 pm.response — 응답 객체

\`\`\`javascript
// 상태 코드
var statusCode = pm.response.code;       // 200
var statusCode = pm.response.status;     // 200 (별칭)

// 응답 시간 (ms)
var duration = pm.response.responseTime; // 150

// 응답 Body
var body = pm.response.text();           // 문자열
var json = pm.response.json();           // JSON 파싱된 객체

// 응답 헤더
var contentType = pm.response.headers.get("Content-Type");
\`\`\`

### 2.2 pm.test() — 테스트 실행

\`\`\`javascript
pm.test("상태 코드가 200이어야 한다", function() {
  pm.response.to.have.status(200);
});

pm.test("응답에 success 필드가 있어야 한다", function() {
  var json = pm.response.json();
  pm.expect(json).to.have.property("success");
  pm.expect(json.success).to.be.true;
});

pm.test("응답 시간이 1초 미만이어야 한다", function() {
  pm.expect(pm.response.responseTime).to.be.below(1000);
});
\`\`\`

### 2.3 pm.expect() — Chai 스타일 Assertion

**동등성 비교:**
\`\`\`javascript
pm.expect(value).to.equal(200);          // 동등 비교
pm.expect(value).to.eql(200);            // equal 별칭
\`\`\`

**Boolean 비교:**
\`\`\`javascript
pm.expect(value).to.be.true;             // true 확인
pm.expect(value).to.be.false;            // false 확인
pm.expect(value).to.be.null;             // null 확인
pm.expect(value).to.be.undefined;        // null/undefined 확인
\`\`\`

**타입 검사:**
\`\`\`javascript
pm.expect(value).to.be.a("string");      // string 타입
pm.expect(value).to.be.a("number");      // number 타입
pm.expect(value).to.be.an("object");     // object 타입
pm.expect(value).to.be.an("array");      // array 타입
\`\`\`

**수치 비교:**
\`\`\`javascript
pm.expect(value).to.be.above(10);        // > 10
pm.expect(value).to.be.greaterThan(10);  // above 별칭
pm.expect(value).to.be.below(100);       // < 100
pm.expect(value).to.be.lessThan(100);    // below 별칭
\`\`\`

**문자열/배열:**
\`\`\`javascript
pm.expect(str).to.include("token");      // 문자열 포함
pm.expect(str).to.contain("token");      // include 별칭
pm.expect(obj).to.have.property("id");   // 속성 존재
pm.expect(arr).to.have.length(3);        // 길이 확인
\`\`\`

### 2.4 pm.response.to — Chai 스타일 검증

\`\`\`javascript
pm.response.to.have.status(200);         // 상태 코드 검증
pm.response.to.have.header("Content-Type"); // 헤더 존재 확인
pm.response.to.have.jsonBody();          // JSON 파싱 가능 확인
\`\`\`

---

## 3. 요청 정보 접근

### 3.1 pm.request — 현재 요청 (읽기 전용)

\`\`\`javascript
var url = pm.request.url;                // 요청 URL
var method = pm.request.method;          // GET, POST 등

// 요청 헤더
var auth = pm.request.headers.get("Authorization");

// 요청 Body
var body = pm.request.body.toString();
\`\`\`

### 3.2 pm.info — 실행 컨텍스트

\`\`\`javascript
var iteration = pm.info.iteration;       // 현재 반복 횟수 (1-based)
var loopCount = pm.info.loopCount;       // 총 반복 횟수
var stepName = pm.info.requestName;      // 현재 Step 이름
\`\`\`

---

## 4. 흐름 제어

### 4.1 pm.execution — Flow 제어

\`\`\`javascript
// 현재 Step 건너뛰기 (다음 Step으로)
pm.execution.skipRequest();

// 특정 Step으로 이동 (Step 이름 기준)
pm.execution.setNextRequest("3. 결제 확인");

// Flow 실행 중단
pm.execution.setNextRequest(null);
\`\`\`

**조건부 분기 예시:**
\`\`\`javascript
var json = pm.response.json();
if (json.status === "pending") {
  pm.execution.setNextRequest("2. 상태 확인");  // 다시 확인
} else if (json.status === "completed") {
  pm.execution.setNextRequest("4. 결과 조회");  // 완료 처리
} else {
  pm.execution.setNextRequest(null);            // 에러 시 중단
}
\`\`\`

---

## 5. HTTP 요청 보내기

### 5.1 pm.sendRequest() — 스크립트 내 HTTP 요청

스크립트 내에서 추가 HTTP 요청을 보낼 수 있습니다. 실행당 최대 **10회**까지 허용됩니다.

**URL 문자열 (GET):**
\`\`\`javascript
pm.sendRequest("https://api.example.com/health", function(err, response) {
  if (err) {
    console.log("요청 실패: " + err);
    return;
  }
  console.log("상태: " + response.code);
  var data = response.json();
});
\`\`\`

**요청 객체:**
\`\`\`javascript
pm.sendRequest({
  url: "https://api.example.com/auth/token",
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    username: "admin",
    password: "secret"
  })
}, function(err, response) {
  if (err) return;

  var token = response.json().accessToken;
  pm.environment.set("token", "Bearer " + token);
});
\`\`\`

**응답 객체 (callback의 response):**

| 속성/메서드 | 설명 |
|------------|------|
| \`response.code\` | HTTP 상태 코드 |
| \`response.status\` | \`code\` 별칭 |
| \`response.text()\` | 응답 Body (문자열) |
| \`response.json()\` | 응답 Body (JSON 파싱) |
| \`response.headers.get(name)\` | 헤더 값 조회 (대소문자 무시) |

---

## 6. {{변수}} 템플릿

스크립트 내에서 \`{{변수명}}\` 문법을 사용하면 실행 전에 자동으로 값이 치환됩니다.

\`\`\`javascript
// {{baseUrl}}이 "https://api.example.com"으로 치환
pm.sendRequest("{{baseUrl}}/users", function(err, res) {
  // ...
});

// 변수 조합
var token = "{{tokenPrefix}}" + " " + "{{accessToken}}";
pm.environment.set("auth", token);
\`\`\`

### 내장 변수

| 변수 | 설명 | 사용 가능 |
|------|------|----------|
| \`{{__statusCode__}}\` | HTTP 응답 상태 코드 | Post-Script |
| \`{{__responseTime__}}\` | 응답 시간 (ms) | Post-Script |
| \`{{__responseBody__}}\` | 응답 Body 전체 | Post-Script |
| \`{{__iteration__}}\` | 현재 반복 횟수 (1-based) | 모두 |
| \`{{__loopCount__}}\` | 총 반복 횟수 | 모두 |
| \`{{__stepName__}}\` | 현재 Step 이름 | 모두 |
| \`{{__stepOrder__}}\` | 현재 Step 순서 | 모두 |
| \`{{__flowName__}}\` | Flow 이름 | 모두 |
| \`{{__timestamp__}}\` | 현재 Unix timestamp (ms) | 모두 |
| \`{{__uuid__}}\` | 랜덤 UUID v4 | 모두 |

---

## 7. 실전 예제

### 예제 1: 로그인 후 토큰 저장 (Pre-Script)

\`\`\`javascript
pm.sendRequest({
  url: "{{baseUrl}}/auth/login",
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: pm.environment.get("username"),
    password: pm.environment.get("password")
  })
}, function(err, response) {
  if (!err && response.code === 200) {
    var token = response.json().data.accessToken;
    pm.environment.set("token", "Bearer " + token);
  }
});
\`\`\`

### 예제 2: 응답 검증 및 변수 추출 (Post-Script)

\`\`\`javascript
pm.test("로그인 성공", function() {
  pm.response.to.have.status(200);
  pm.response.to.have.jsonBody();
});

pm.test("토큰이 반환되어야 한다", function() {
  var json = pm.response.json();
  pm.expect(json.data).to.have.property("accessToken");
  pm.expect(json.data.accessToken).to.be.a("string");
});

// 다음 Step에서 사용할 변수 저장
var json = pm.response.json();
pm.environment.set("userId", json.data.userId + "");
pm.environment.set("token", "Bearer " + json.data.accessToken);
\`\`\`

### 예제 3: 조건부 흐름 제어 (Post-Script)

\`\`\`javascript
var json = pm.response.json();
var status = json.data.status;

pm.variables.set("jobStatus", status);

if (status === "processing") {
  // 아직 처리 중이면 현재 Step 반복
  pm.execution.setNextRequest(pm.info.requestName);
} else if (status === "completed") {
  // 완료되면 결과 조회 Step으로 이동
  pm.execution.setNextRequest("결과 조회");
} else {
  // 실패 시 Flow 중단
  pm.execution.setNextRequest(null);
}
\`\`\`

### 예제 4: 글로벌/컬렉션 변수 활용

\`\`\`javascript
// 글로벌 변수에 공통 설정 저장
pm.globals.set("apiVersion", "v2");

// 컬렉션 변수로 API 키 관리
if (!pm.collectionVariables.has("apiKey")) {
  pm.sendRequest("{{baseUrl}}/api-keys", function(err, res) {
    if (!err) {
      pm.collectionVariables.set("apiKey", res.json().key);
    }
  });
}
\`\`\`

### 예제 5: 반복 카운터 패턴

\`\`\`javascript
// Pre-Script: 카운터 초기화
var count = parseInt(pm.variables.get("retryCount") || "0");
pm.variables.set("retryCount", (count + 1) + "");

// Post-Script: 조건에 따라 반복
var count = parseInt(pm.variables.get("retryCount"));
var json = pm.response.json();

pm.test("응답 확인 (시도 " + count + "회)", function() {
  pm.expect(pm.response.code).to.equal(200);
});

if (json.data.status !== "ready" && count < 10) {
  pm.execution.setNextRequest(pm.info.requestName);
}
\`\`\`

---

## 8. API 전체 레퍼런스

### pm 객체

| API | 설명 | Pre | Post |
|-----|------|:---:|:----:|
| \`pm.environment.get(name)\` | 환경 변수 읽기 | O | O |
| \`pm.environment.set(name, value)\` | 환경 변수 쓰기 (DB 영속) | O | O |
| \`pm.environment.has(name)\` | 환경 변수 존재 확인 | O | O |
| \`pm.variables.get(name)\` | 런타임 변수 읽기 | O | O |
| \`pm.variables.set(name, value)\` | 런타임 변수 쓰기 | O | O |
| \`pm.globals.get(name)\` | 글로벌 변수 읽기 | O | O |
| \`pm.globals.set(name, value)\` | 글로벌 변수 쓰기 (DB 영속) | O | O |
| \`pm.globals.has(name)\` | 글로벌 변수 존재 확인 | O | O |
| \`pm.globals.unset(name)\` | 글로벌 변수 삭제 | O | O |
| \`pm.globals.clear()\` | 글로벌 변수 전체 삭제 | O | O |
| \`pm.collectionVariables.get(name)\` | 컬렉션 변수 읽기 | O | O |
| \`pm.collectionVariables.set(name, value)\` | 컬렉션 변수 쓰기 (DB 영속) | O | O |
| \`pm.collectionVariables.has(name)\` | 컬렉션 변수 존재 확인 | O | O |
| \`pm.collectionVariables.unset(name)\` | 컬렉션 변수 삭제 | O | O |
| \`pm.collectionVariables.clear()\` | 컬렉션 변수 전체 삭제 | O | O |
| \`pm.response.code\` | 응답 상태 코드 | - | O |
| \`pm.response.status\` | 상태 코드 (별칭) | - | O |
| \`pm.response.responseTime\` | 응답 시간 (ms) | - | O |
| \`pm.response.text()\` | 응답 Body (문자열) | - | O |
| \`pm.response.json()\` | 응답 Body (JSON) | - | O |
| \`pm.response.headers.get(name)\` | 응답 헤더 조회 | - | O |
| \`pm.response.to.have.status(code)\` | 상태 코드 검증 | - | O |
| \`pm.response.to.have.header(name)\` | 헤더 존재 검증 | - | O |
| \`pm.response.to.have.jsonBody()\` | JSON Body 검증 | - | O |
| \`pm.test(name, fn)\` | 테스트 실행 | O | O |
| \`pm.expect(value)\` | Chai 스타일 assertion | O | O |
| \`pm.request.url\` | 요청 URL | O | O |
| \`pm.request.method\` | 요청 메서드 | O | O |
| \`pm.request.headers.get(name)\` | 요청 헤더 조회 | O | O |
| \`pm.request.body.toString()\` | 요청 Body | O | O |
| \`pm.info.iteration\` | 현재 반복 횟수 | O | O |
| \`pm.info.loopCount\` | 총 반복 횟수 | O | O |
| \`pm.info.requestName\` | 현재 Step 이름 | O | O |
| \`pm.execution.skipRequest()\` | Step 건너뛰기 | O | O |
| \`pm.execution.setNextRequest(name)\` | 다음 Step 지정 | O | O |
| \`pm.sendRequest(url\\|obj, callback)\` | HTTP 요청 발송 | O | O |

### pm.expect() 체인

| 체인 | 설명 |
|------|------|
| \`.to.equal(v)\` / \`.to.eql(v)\` | 동등 비교 |
| \`.to.be.true\` / \`.to.be.false\` | Boolean 확인 |
| \`.to.be.null\` / \`.to.be.undefined\` | null/undefined 확인 |
| \`.to.be.a(type)\` / \`.to.be.an(type)\` | 타입 확인 (\`"string"\`, \`"number"\`, \`"object"\`, \`"array"\`) |
| \`.to.be.above(n)\` / \`.to.be.greaterThan(n)\` | 초과 비교 |
| \`.to.be.below(n)\` / \`.to.be.lessThan(n)\` | 미만 비교 |
| \`.to.include(s)\` / \`.to.contain(s)\` | 문자열 포함 |
| \`.to.have.property(name)\` | 속성 존재 확인 |
| \`.to.have.length(n)\` | 길이 확인 |

---

## 9. 제한 사항

| 항목 | 제한값 |
|------|--------|
| 스크립트 타임아웃 | 5초 |
| \`pm.sendRequest\` 최대 호출 | 10회 / 스크립트 |
| JS 엔진 | ES5.1 (goja) |
| 사용 불가 | \`eval()\`, \`Function()\` |
| 파일 시스템 접근 | 불가 |
| \`console.log\` | no-op (출력 없음) |

### DSL 모드와의 비교

| 기능 | DSL (JSON) | JavaScript |
|------|-----------|------------|
| 문법 | JSON 선언형 | 명령형 스크립트 |
| 학습 난이도 | 쉬움 | 보통 |
| 조건 분기 | \`conditional\`, \`switch\` | \`if/else\`, \`switch\` |
| HTTP 요청 | 불가 | \`pm.sendRequest()\` |
| JSONPath 추출 | \`"from": "$.path"\` | \`pm.response.json().path\` |
| 테스트/검증 | \`assertions\` 배열 | \`pm.test()\` + \`pm.expect()\` |
| 변수 스코프 | 런타임 변수만 | 4단계 스코프 (런타임/환경/컬렉션/글로벌) |
| 적합한 용도 | 단순 검증, 변수 추출 | 복잡한 로직, 인증 플로우 |
`;

export function DSLGuide({ isOpen, onClose }: DSLGuideProps) {
  const [activeTab, setActiveTab] = useState<GuideTab>('dsl');

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Flow Script Guide
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
          <button
            onClick={() => setActiveTab('dsl')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'dsl'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            DSL (JSON)
          </button>
          <button
            onClick={() => setActiveTab('javascript')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'javascript'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            JavaScript (Postman)
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {activeTab === 'dsl' ? DSL_GUIDE_CONTENT : JS_GUIDE_CONTENT}
            </ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
