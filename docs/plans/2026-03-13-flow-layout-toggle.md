# Flow Layout Toggle (상하 ↔ 좌우 분할) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Flow 화면에서 Steps/Result 영역을 상하 분할 ↔ 좌우 분할로 토글할 수 있는 버튼과 리사이즈 기능 추가

**Architecture:** FlowEditor에 layout 상태(`vertical`/`horizontal`)를 추가하고, localStorage에 저장하여 세션 간 유지. 좌우 모드에서는 Sidebar와 동일한 mouse drag 리사이즈 패턴을 사용하여 분할 비율 조절. FlowResultPanel은 layout prop에 따라 border/scroll 방향을 전환.

**Tech Stack:** React useState/useRef/useEffect, localStorage, TailwindCSS

---

### Task 1: useFlowLayout 훅 생성

**Files:**
- Create: `web/src/components/flow/useFlowLayout.ts`

**Step 1: 훅 구현**

```typescript
import { useEffect, useRef, useState } from 'react';

type FlowLayout = 'vertical' | 'horizontal';

const STORAGE_KEY_LAYOUT = 'flowLayout';
const STORAGE_KEY_RATIO = 'flowSplitRatio';
const DEFAULT_RATIO = 50;
const MIN_RATIO = 20;
const MAX_RATIO = 80;

export function useFlowLayout() {
  const [layout, setLayout] = useState<FlowLayout>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_LAYOUT);
    return saved === 'horizontal' ? 'horizontal' : 'vertical';
  });

  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_RATIO);
    if (saved) {
      const n = Number(saved);
      if (n >= MIN_RATIO && n <= MAX_RATIO) return n;
    }
    return DEFAULT_RATIO;
  });

  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LAYOUT, layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RATIO, String(splitRatio));
  }, [splitRatio]);

  const toggleLayout = () => {
    setLayout(prev => (prev === 'vertical' ? 'horizontal' : 'vertical'));
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;
    isResizing.current = true;

    const containerRect = containerRef.current.getBoundingClientRect();

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const ratio = ((ev.clientX - containerRect.left) / containerRect.width) * 100;
      setSplitRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)));
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return {
    layout,
    splitRatio,
    containerRef,
    toggleLayout,
    handleResizeStart,
  };
}
```

**Step 2: Commit**

```bash
git add web/src/components/flow/useFlowLayout.ts
git commit -m "feat(flow): add useFlowLayout hook for layout toggle and resize"
```

---

### Task 2: FlowEditor에 토글 버튼 추가 및 레이아웃 전환

**Files:**
- Modify: `web/src/components/flow/FlowEditor.tsx`

**Step 1: useFlowLayout 훅 연결 및 토글 버튼 추가**

`FlowEditor.tsx` 상단 import에 추가:
```typescript
import { useFlowLayout } from './useFlowLayout';
```

컴포넌트 내부 훅 호출 추가 (line 37 뒤):
```typescript
const flowLayout = useFlowLayout();
```

Header 영역의 Save 버튼 바로 앞에 토글 버튼 추가 (line 271 앞, `<button onClick={form.handleSave}...` 앞):
```tsx
<button
  onClick={flowLayout.toggleLayout}
  className="p-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200"
  title={flowLayout.layout === 'vertical' ? 'Switch to horizontal layout' : 'Switch to vertical layout'}
>
  {flowLayout.layout === 'vertical' ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3h6M9 21h6M12 3v18M3 9v6M21 9v6M3 12h18" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9h18M3 15h18M12 3v6M12 15v6M9 3h6M9 21h6" />
    </svg>
  )}
</button>
```

아이콘은 각각 좌우 분할 / 상하 분할 모양으로 표현. 실제 구현 시 `viewBox="0 0 24 24"` 기반으로 간결한 라인 아이콘 사용.

**Step 2: 레이아웃 컨테이너 전환**

Steps + Result 영역을 layout에 따라 분기 처리.

현재 구조 (line 194~507):
```tsx
<div className="flex-1 flex flex-col overflow-hidden">
  {/* Flow Header */}
  ...
  {/* Flow Steps */}
  <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
    ...
  </div>
  {/* Flow Result */}
  {runner.flowResult && (
    <FlowResultPanel ... />
  )}
</div>
```

변경:
```tsx
<div className="flex-1 flex flex-col overflow-hidden">
  {/* Flow Header - 변경 없음 */}
  ...

  {/* Steps + Result 컨테이너 */}
  <div
    ref={flowLayout.containerRef}
    className={`flex-1 flex overflow-hidden ${
      flowLayout.layout === 'horizontal' ? 'flex-row' : 'flex-col'
    }`}
  >
    {/* Flow Steps */}
    <div
      className="overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900"
      style={
        flowLayout.layout === 'horizontal' && runner.flowResult
          ? { width: `${flowLayout.splitRatio}%` }
          : undefined
      }
    >
      <div className={flowLayout.layout === 'horizontal' ? '' : 'max-w-3xl mx-auto'}>
        ...steps content 동일...
      </div>
    </div>

    {/* Resize Handle - horizontal 모드에서만 표시 */}
    {flowLayout.layout === 'horizontal' && runner.flowResult && (
      <div
        className="w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 bg-gray-200 dark:bg-gray-700 transition-colors shrink-0"
        onMouseDown={flowLayout.handleResizeStart}
      />
    )}

    {/* Flow Result */}
    {runner.flowResult && (
      <FlowResultPanel
        flowResult={runner.flowResult}
        expandedResultIds={runner.expandedResultIds}
        copiedKey={runner.copiedKey}
        onToggleExpand={runner.toggleResultExpand}
        onCopyBody={runner.handleCopyBody}
        layout={flowLayout.layout}
      />
    )}
  </div>
</div>
```

- vertical 모드: Steps는 `flex-1` (기존처럼), Result는 하단
- horizontal 모드: Steps는 `width: splitRatio%`, Result는 나머지 공간
- Result가 없을 때는 Steps가 전체 사용 (style 미적용)

**Step 3: Commit**

```bash
git add web/src/components/flow/FlowEditor.tsx
git commit -m "feat(flow): add layout toggle button and horizontal/vertical container switching"
```

---

### Task 3: FlowResultPanel에 layout prop 적용

**Files:**
- Modify: `web/src/components/flow/FlowResultPanel.tsx`

**Step 1: layout prop 추가 및 스타일 분기**

Props 인터페이스에 layout 추가:
```typescript
interface FlowResultPanelProps {
  flowResult: FlowResult;
  expandedResultIds: Set<string>;
  copiedKey: string | null;
  onToggleExpand: (key: string) => void;
  onCopyBody: (key: string, body: string) => void;
  layout: 'vertical' | 'horizontal';
}
```

컴포넌트 파라미터에 `layout` 추가:
```typescript
export function FlowResultPanel({
  flowResult,
  expandedResultIds,
  copiedKey,
  onToggleExpand,
  onCopyBody,
  layout,
}: FlowResultPanelProps) {
```

루트 div의 className을 layout에 따라 분기:
```tsx
<div className={
  layout === 'horizontal'
    ? 'bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto flex-1'
    : 'bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto'
}>
```

- **vertical**: 기존과 동일 (`border-t`, `max-h-80`)
- **horizontal**: `border-l`, `max-h` 제거, `flex-1`로 전체 높이 사용

**Step 2: Commit**

```bash
git add web/src/components/flow/FlowResultPanel.tsx
git commit -m "feat(flow): support horizontal layout in FlowResultPanel"
```

---

### Task 4: 수동 테스트 및 최종 확인

**Step 1: 개발 서버 실행**

```bash
make dev-frontend
make dev-backend
```

**Step 2: 수동 테스트 체크리스트**

- [ ] Flow 선택 후 Header에 토글 버튼 표시 확인
- [ ] 토글 클릭 시 상하 ↔ 좌우 전환 확인
- [ ] Flow 실행 후 Result가 올바른 위치에 표시되는지 확인
- [ ] 좌우 모드에서 리사이즈 핸들 드래그로 비율 조절 확인
- [ ] 리사이즈 비율이 20%~80% 범위 제한 확인
- [ ] 페이지 새로고침 후 레이아웃/비율 유지 확인 (localStorage)
- [ ] Result 없을 때 Steps가 전체 영역 사용 확인
- [ ] 다크 모드에서 리사이즈 핸들 색상 확인

**Step 3: 최종 커밋**

```bash
git add -A
git commit -m "feat(flow): add layout toggle for steps/result split view"
```
