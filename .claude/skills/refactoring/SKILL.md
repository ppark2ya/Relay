---
name: frontend-refactoring
description: >
  프론트엔드 코드 리팩토링 시 반드시 준수해야 할 원칙과 규칙을 정의한 스킬.
  현재 작업 범위 내에서만 리팩토링을 수행하며, SOLID 원칙, 컴포넌트 최적화,
  코드 품질 개선, 테스트 안전망 확보 등을 체계적으로 적용한다.
  React, Next.js, TypeScript 기반 프로젝트에 최적화되어 있다.
---

# Frontend Refactoring Skill

프론트엔드 코드를 안전하고 체계적으로 리팩토링하기 위한 원칙과 규칙 모음.

---

## 핵심 철학

> **"작동하는 코드를 먼저, 깨끗한 코드를 그 다음에, 빠른 코드를 마지막에."**

리팩토링은 기능 변경이 아니다. 외부 동작은 반드시 동일하게 유지하면서 내부 구조만 개선한다.

---

## 🚨 최우선 규칙: 작업 범위 제한 (Scope Constraint)

**현재 작업한 내용, 변경된 내용에 대해서만 리팩토링을 수행한다.**

이 규칙은 모든 다른 규칙보다 우선한다.

### 적용 기준

- ✅ 현재 PR/커밋에서 수정한 파일 및 함수
- ✅ 현재 작업과 직접적으로 연관된 코드 (import하는 유틸, 공유 컴포넌트 등)
- ✅ 현재 변경으로 인해 영향받는 테스트 코드
- ❌ 현재 작업과 무관한 파일이나 모듈
- ❌ "지나가다 발견한" 다른 영역의 코드 스멜
- ❌ 전체 프로젝트 차원의 대규모 리팩토링 (별도 태스크로 분리)

### 범위 초과 발견 시 대응

현재 작업 범위 밖에서 리팩토링이 필요한 코드를 발견하면:

1. `// TODO: [REFACTOR]` 주석으로 표시
2. 별도 이슈/태스크로 등록
3. 현재 작업에서는 손대지 않음

```typescript
// TODO: [REFACTOR] 이 유틸 함수는 제네릭으로 개선 필요 - Issue #xxx 참고
```

---

## SOLID 원칙 (프론트엔드 적용)

### S — Single Responsibility Principle (단일 책임 원칙)

**하나의 컴포넌트/함수/훅은 하나의 책임만 가진다.**

```typescript
// ❌ Bad: 데이터 페칭 + 비즈니스 로직 + UI 렌더링이 혼재
function UserProfile() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch('/api/user').then(...)
  }, []);
  const fullName = `${user?.firstName} ${user?.lastName}`;
  return <div>{fullName} < /div>;
}

// ✅ Good: 책임 분리
// hooks/useUser.ts — 데이터 페칭 책임
function useUser() {
  return useQuery({queryKey: ['user'], queryFn: fetchUser});
}

// utils/formatUser.ts — 비즈니스 로직 책임
function getFullName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}

// components/UserProfile.tsx — UI 렌더링 책임
function UserProfile() {
  const {data: user} = useUser();
  return <div>{getFullName(user)} < /div>;
}
```

**프론트엔드 적용 포인트:**

- 컴포넌트: UI 렌더링만 담당
- 커스텀 훅: 상태 관리 또는 사이드 이펙트 하나만 담당
- 유틸 함수: 순수 변환 로직 하나만 담당
- API 레이어: 서버 통신만 담당

### O — Open/Closed Principle (개방-폐쇄 원칙)

**확장에는 열려 있고, 수정에는 닫혀 있어야 한다.**

```typescript
// ❌ Bad: 새 타입 추가 시 컴포넌트 내부 수정 필요
function Alert({type}: { type: 'success' | 'error' | 'warning' }) {
  if (type === 'success') return <div className = "green" >
...
  </div>;
  if (type === 'error') return <div className = "red" >
...
  </div>;
  if (type === 'warning') return <div className = "yellow" >
...
  </div>;
}

// ✅ Good: 설정 맵으로 확장 가능
const ALERT_CONFIG: Record<string, { className: string; icon: ReactNode }> = {
  success: {className: 'green', icon: <CheckIcon / >},
  error: {className: 'red', icon: <XIcon / >},
  warning: {className: 'yellow', icon: <AlertIcon / >},
};

function Alert({type}: { type: keyof typeof ALERT_CONFIG }) {
  const config = ALERT_CONFIG[type];
  return <div className = {config.className} > {config.icon} < /div>;
}
```

### L — Liskov Substitution Principle (리스코프 치환 원칙)

**하위 컴포넌트는 상위 컴포넌트를 대체할 수 있어야 한다.**

```typescript
// ✅ Good: HTML 네이티브 props를 확장하여 대체 가능성 보장
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({variant = 'primary', className, ...props}, ref) => (
    <button ref = {ref}
className = {cn(variants[variant], className
)
}
{...
  props
}
/>
)
)
;
```

### I — Interface Segregation Principle (인터페이스 분리 원칙)

**컴포넌트가 사용하지 않는 props에 의존하지 않도록 한다.**

```typescript
// ❌ Bad: 거대한 단일 인터페이스
interface UserCardProps {
  user: User;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  showAdminControls: boolean;
  analyticsData: AnalyticsPayload;
}

// ✅ Good: 필요한 단위로 분리
interface UserCardProps {
  name: string;
  email: string;
  avatarUrl: string;
  actions?: ReactNode; // 슬롯 패턴으로 액션 위임
}
```

### D — Dependency Inversion Principle (의존성 역전 원칙)

**구체 구현이 아닌 추상(인터페이스)에 의존한다.**

```typescript
// ❌ Bad: 구체 구현에 직접 의존
function UserList() {
  const users = useAxiosGet('/api/users'); // axios에 직접 결합
}

// ✅ Good: 추상 레이어를 통해 의존
// api/userApi.ts
interface UserRepository {
  getAll(): Promise<User[]>;
}

// hooks/useUsers.ts
function useUsers(repository: UserRepository) {
  return useQuery({queryKey: ['users'], queryFn: repository.getAll});
}
```

---

## 기본 리팩토링 원칙

### 1. Do No Harm — 외부 동작 보존

리팩토링 후 기능이 동일하게 작동하는지 반드시 검증한다.

**체크리스트:**

- [ ] 기존 테스트가 모두 통과하는가?
- [ ] UI가 시각적으로 동일한가? (스냅샷 테스트 또는 시각적 확인)
- [ ] API 호출 패턴이 변하지 않았는가?
- [ ] 이벤트 핸들링이 동일하게 동작하는가?
- [ ] 접근성(a11y) 속성이 유지되는가?

### 2. Small, Incremental Changes — 작고 점진적인 변경

한 번에 하나의 리팩토링만 수행한다.

```
✅ 올바른 순서:
  커밋 1: 변수명 개선
  커밋 2: 함수 추출
  커밋 3: 타입 강화
  커밋 4: 컴포넌트 분리

❌ 잘못된 접근:
  커밋 1: 변수명 + 함수 추출 + 타입 변경 + 컴포넌트 분리 + CSS 리팩토링
```

### 3. Red-Green-Refactor — 테스트 안전망

```
1. Red   → 변경 전 기존 테스트가 통과하는지 확인
2. Green → 리팩토링 수행
3. Check → 기존 테스트가 여전히 통과하는지 확인
```

테스트가 없는 코드를 리팩토링할 때는, 리팩토링 전에 최소한의 테스트를 먼저 작성한다.

### 4. Component-Based Optimization — 컴포넌트 기반 최적화

스파게티 코드를 작고 재사용 가능한 모듈로 분해한다.

**분리 기준:**

- 200줄 이상의 컴포넌트 → 하위 컴포넌트로 분리
- 3회 이상 반복되는 패턴 → 공통 컴포넌트/훅으로 추출
- 독립적으로 테스트 가능한 로직 → 커스텀 훅으로 분리

### 5. Readability First — 가독성 우선

성능 최적화보다 가독성을 우선한다. 성능 문제는 측정 후 최적화한다.

```typescript
// ❌ Bad: 영리하지만 읽기 어려움
const r = d.filter(x => x.s === 'a' && x.t > Date.now() - 864e5).map(x => ({...x, f: true}));

// ✅ Good: 명확하고 읽기 쉬움
const activeItems = data
  .filter(item => item.status === 'active')
  .filter(item => item.timestamp > oneDayAgo)
  .map(item => ({...item, isFresh: true}));
```

### 6. Separation of Concerns — 관심사 분리

```
📁 feature/
├── components/     # UI 컴포넌트 (순수 렌더링)
├── hooks/          # 상태 관리 & 사이드 이펙트
├── api/            # 서버 통신
├── utils/          # 순수 유틸리티 함수
├── types/          # 타입 정의
├── constants/      # 상수 값
└── __tests__/      # 테스트
```

### 7. Eliminate Code Smells — 코드 스멜 제거

**중첩 조건문 → Guard Clause:**

```typescript
// ❌ Bad
function processOrder(order: Order) {
  if (order) {
    if (order.items.length > 0) {
      if (order.status === 'pending') {
        // 실제 로직
      }
    }
  }
}

// ✅ Good
function processOrder(order: Order) {
  if (!order) return;
  if (order.items.length === 0) return;
  if (order.status !== 'pending') return;

  // 실제 로직
}
```

**중복 코드 → 추상화:**

```typescript
// ❌ Bad: 여러 컴포넌트에서 동일한 에러 처리 반복
// ✅ Good: 커스텀 훅으로 추출
function useApiCall<T>(queryKey: string[], queryFn: () => Promise<T>) {
  return useQuery({
    queryKey,
    queryFn,
    retry: 3,
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}
```

### 8. Remove Dead Code — 죽은 코드 제거

- 사용되지 않는 import 제거
- 주석 처리된 코드 블록 삭제 (Git 히스토리에 있으므로)
- 도달 불가능한 코드 경로 제거
- 사용되지 않는 npm 의존성 제거
- deprecated된 API 호출 최신화

### 9. Consistent Naming — 일관된 네이밍

| 대상         | 컨벤션                           | 예시                                       |
|------------|-------------------------------|------------------------------------------|
| 컴포넌트       | PascalCase                    | `UserProfile`, `OrderList`               |
| 훅          | camelCase + `use` 접두사         | `useUser`, `useOrderList`                |
| 유틸 함수      | camelCase + 동사 시작             | `formatDate`, `calculateTotal`           |
| 상수         | SCREAMING_SNAKE_CASE          | `MAX_RETRY_COUNT`, `API_BASE_URL`        |
| 타입/인터페이스   | PascalCase                    | `UserResponse`, `OrderItem`              |
| 이벤트 핸들러    | camelCase + `handle`/`on` 접두사 | `handleSubmit`, `onClickDelete`          |
| Boolean 변수 | `is`/`has`/`should` 접두사       | `isLoading`, `hasError`, `shouldRefetch` |

### 10. Document & Version Control — 문서화 및 버전 관리

- 리팩토링 커밋은 기능 커밋과 분리
- 커밋 메시지에 `refactor:` 접두사 사용 (Conventional Commits)
- 복잡한 리팩토링은 PR 설명에 변경 이유와 영향 범위 명시
- Breaking change가 있을 경우 마이그레이션 가이드 작성

---

## 프론트엔드 특화 리팩토링 규칙

### 타입 안전성 강화

```typescript
// ❌ Bad: any, as 남용
const data = response.data as any;
const value = (event.target as any).value;

// ✅ Good: 엄격한 타입 정의
interface ApiResponse<T> {
  data: T;
  status: number;
}

function handleChange(event: ChangeEvent<HTMLInputElement>) {
  const {value} = event.target;
}
```

**규칙:**

- `any` 사용 금지. 불가피한 경우 `unknown` + 타입 가드 사용
- `as` 타입 단언 최소화. 타입 가드 또는 제네릭 활용
- API 응답은 반드시 Zod 등으로 런타임 검증
- `strict: true` tsconfig 필수

### React 렌더링 최적화

불필요한 리렌더링을 방지하되, **측정 후** 최적화한다.

```typescript
// 메모이제이션이 필요한 경우에만 사용
// ❌ Bad: 모든 곳에 무분별한 memo
const SimpleText = memo(({text}: { text: string }) => <span>{text} < /span>);

// ✅ Good: 비용이 큰 연산이나 빈번한 리렌더링이 발생할 때만
const ExpensiveChart = memo(({data}: { data: ChartData[] }) => {
  // 복잡한 차트 렌더링 로직
});
```

**규칙:**

- `useMemo`, `useCallback`은 측정된 성능 문제가 있을 때만 사용
- 상태를 가능한 낮은 레벨의 컴포넌트에 배치 (State Colocation)
- 컨텍스트는 자주 변경되는 값과 거의 변경되지 않는 값을 분리
- `key` prop은 안정적이고 고유한 값 사용 (index 사용 금지)

### 커스텀 훅 추출 규칙

```typescript
// 훅으로 추출해야 하는 시점:
// 1. 동일한 상태 + 이펙트 패턴이 2회 이상 반복될 때
// 2. 컴포넌트 내 로직이 UI와 무관한 비즈니스 로직일 때
// 3. 테스트를 위해 로직을 분리해야 할 때

// ✅ Good: 관심사가 명확한 커스텀 훅
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

### API 레이어 표준화

```typescript
// ✅ Good: react-query와 함께하는 표준 API 패턴
// api/userApi.ts
export const userApi = {
  getAll: (): Promise<User[]> => httpClient.get('/users'),
  getById: (id: string): Promise<User> => httpClient.get(`/users/${id}`),
  create: (data: CreateUserDto): Promise<User> => httpClient.post('/users', data),
} as const;

// hooks/useUsers.ts
export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: userApi.getAll,
  });
}

// Query Key 팩토리 패턴
export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', id] as const,
  list: (filters: UserFilters) => ['users', 'list', filters] as const,
};
```

### 에러 처리 표준화

```typescript
// ✅ Good: 계층별 에러 처리
// 1. API 레이어: HTTP 에러 → 도메인 에러 변환
// 2. 훅 레이어: react-query의 에러 상태 활용
// 3. 컴포넌트 레이어: ErrorBoundary로 UI 폴백

// ErrorBoundary 활용
<ErrorBoundary fallback = { < ErrorFallback / >
}>
<Suspense fallback = { < Skeleton / >
}>
<UserProfile / >
</Suspense>
< /ErrorBoundary>
```

### 폼 처리 표준화

```typescript
// ✅ Good: react-hook-form + zod 조합
const userSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  email: z.string().email('올바른 이메일을 입력하세요'),
});

type UserFormValues = z.infer<typeof userSchema>;

function UserForm() {
  const {register, handleSubmit, formState: {errors}} = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
  });

  return (
    <form onSubmit = {handleSubmit(onSubmit)} >
      <Input {...register('name')}
  error = {errors.name?.message}
  />
  < Input
  {...
    register('email')
  }
  error = {errors.email?.message}
  />
  < /form>
)
  ;
}
```

### CSS/스타일링 리팩토링

- 인라인 스타일 → CSS Modules 또는 Tailwind 클래스로 이동
- 매직 넘버 → CSS 변수 또는 테마 토큰으로 치환
- 중복 스타일 → 공통 유틸 클래스 또는 variant로 통합
- `!important` 사용 금지 (specificity 문제를 근본적으로 해결)

### Import 정리

```typescript
// ✅ Good: 일관된 import 순서
// 1. React / 프레임워크
import {useState, useEffect} from 'react';
import {useRouter} from 'next/router';

// 2. 외부 라이브러리
import {useQuery} from '@tanstack/react-query';
import {z} from 'zod';

// 3. 내부 모듈 (절대 경로)
import {Button} from '@/shared/ui';
import {useAuth} from '@/features/auth';

// 4. 상대 경로 (현재 feature 내)
import {UserCard} from './UserCard';
import type {UserFormValues} from './types';

// 5. 스타일
import styles from './UserProfile.module.css';
```

### 접근성(a11y) 유지

리팩토링 과정에서 접근성이 퇴화하지 않도록 주의한다.

- 시맨틱 HTML 요소 유지 (`div` 남용 금지)
- `aria-*` 속성 누락 여부 확인
- 키보드 내비게이션 동작 확인
- 포커스 관리 로직 보존

---

## 리팩토링 수행 절차

Claude가 리팩토링을 수행할 때 따라야 하는 단계:

```
1. 범위 확인
   → 현재 변경된 파일/함수 식별
   → 범위 밖 코드는 TODO 주석 처리

2. 현재 상태 분석
   → 코드 스멜 식별
   → 위반된 원칙 목록화
   → 우선순위 정리 (심각도 순)

3. 테스트 확인
   → 기존 테스트 존재 여부 확인
   → 테스트 없으면 최소한의 테스트 먼저 작성

4. 점진적 리팩토링 수행
   → 한 번에 하나의 개선만 적용
   → 각 단계마다 테스트 통과 확인

5. 검증
   → 모든 테스트 통과 확인
   → 타입 체크 통과 확인
   → 린트 규칙 통과 확인
   → 외부 동작 동일성 확인

6. 결과 보고
   → 변경 사항 요약
   → 적용된 원칙 명시
   → 범위 밖 발견 사항 TODO로 기록
```

---

## 안티패턴 체크리스트

리팩토링 시 다음 안티패턴을 발견하면 우선적으로 개선한다:

| 안티패턴                    | 해결 방법                                       |
|-------------------------|---------------------------------------------|
| Prop Drilling (3단계 이상)  | Context, Zustand, 또는 Composition 패턴         |
| God Component (300줄 이상) | 하위 컴포넌트 + 커스텀 훅으로 분리                        |
| useEffect 지옥            | react-query, 이벤트 핸들러, 커스텀 훅으로 대체            |
| 비즈니스 로직 in 컴포넌트         | 커스텀 훅 또는 유틸 함수로 추출                          |
| 하드코딩된 값                 | 상수, 환경변수, 설정 파일로 분리                         |
| 일관성 없는 에러 처리            | ErrorBoundary + 표준 에러 핸들링 훅                 |
| 타입 없는 API 응답            | Zod 스키마 + 타입 추론                             |
| 조건부 렌더링 중첩              | 조기 반환, 컴포넌트 맵, Polymorphic 패턴               |
| 스타일 인라인 남용              | CSS Modules, Tailwind, 또는 styled-components |
| 테스트 없는 유틸 함수            | 단위 테스트 추가 후 리팩토링                            |

---

## 리팩토링 커밋 메시지 컨벤션

```
refactor(scope): 변경 요약

- 적용된 원칙: SRP, Guard Clause
- 영향 범위: UserProfile 컴포넌트
- Breaking Change: 없음
```

예시:

```
refactor(user): UserProfile 컴포넌트에서 데이터 페칭 로직 분리

- useUser 커스텀 훅으로 데이터 페칭 책임 분리 (SRP)
- API 응답 타입 Zod 스키마로 런타임 검증 추가
- 영향 범위: UserProfile, UserProfileSkeleton
- Breaking Change: 없음
```
