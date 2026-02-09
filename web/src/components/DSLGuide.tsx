import { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface DSLGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

// Custom components for better markdown rendering
const components = {
  code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match;

    if (isInline) {
      return (
        <code className="bg-gray-100 dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }

    return (
      <code className="block text-sm font-mono" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
    <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono my-3 border border-gray-800" {...props}>
      {children}
    </pre>
  ),
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm" {...props}>
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
    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-300" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<'td'>) => (
    <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-600 dark:text-gray-400" {...props}>
      {children}
    </td>
  ),
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 border-b border-gray-300 dark:border-gray-600 pb-2 mb-4" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) => (
    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-3 pb-1 border-b border-gray-200 dark:border-gray-700" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mt-5 mb-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
    <p className="text-gray-600 dark:text-gray-300 leading-relaxed my-2" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-gray-800 dark:text-gray-200" {...props}>
      {children}
    </strong>
  ),
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
    <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 my-2 ml-2 space-y-1" {...props}>
      {children}
    </ul>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
    <li className="text-gray-600 dark:text-gray-300" {...props}>
      {children}
    </li>
  ),
  hr: (props: React.ComponentPropsWithoutRef<'hr'>) => (
    <hr className="border-gray-300 dark:border-gray-600 my-6" {...props} />
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

export function DSLGuide({ isOpen, onClose }: DSLGuideProps) {
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
              Flow Script DSL Guide
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {DSL_GUIDE_CONTENT}
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
