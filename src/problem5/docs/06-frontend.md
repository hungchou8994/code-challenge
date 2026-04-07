# 06 — Frontend: Next.js, React Query & API Client

---

## Kiến trúc frontend

```
frontend/src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout: Providers + Nav + Toaster
│   ├── page.tsx              # Dashboard (/)
│   ├── users/page.tsx        # Users management (/users)
│   ├── tasks/page.tsx        # Tasks management (/tasks)
│   └── leaderboard/page.tsx  # Realtime leaderboard (/leaderboard)
├── components/
│   ├── task-form.tsx         # Create/Edit task dialog
│   ├── user-form.tsx         # Create/Edit user dialog
│   ├── filter-bar.tsx        # Task filter (status + assignee)
│   ├── leaderboard-table.tsx # Ranked table
│   ├── pagination-bar.tsx    # Pagination controls
│   └── ui/                   # shadcn/ui primitives
└── lib/
    └── api-client.ts         # Typed HTTP client
```

**Tất cả pages đều là Client Components** (`'use client'`) — không có Server Components cho data fetching. Data lấy qua React Query từ browser.

---

## Next.js App Router

### Root Layout

**File:** `frontend/src/app/layout.tsx`

```typescript
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>           {/* React Query client provider */}
          <Nav />             {/* Navigation bar */}
          <main>{children}</main>
          <Toaster />         {/* sonner toast notifications */}
        </Providers>
      </body>
    </html>
  );
}
```

`Providers` wrap toàn bộ app với `QueryClientProvider` của TanStack Query:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // Data fresh trong 60s
      refetchOnWindowFocus: false, // Không refetch khi user switch tab
    },
  },
});
```

### File-based routing
```
app/page.tsx            → /
app/users/page.tsx      → /users
app/tasks/page.tsx      → /tasks
app/leaderboard/page.tsx → /leaderboard
```
Next.js tự động map file path → URL.

---

## TanStack React Query

React Query là thư viện **server state management** — khác với client state (Redux, Zustand).

### Khái niệm cốt lõi

**`useQuery`** — fetch và cache data:
```typescript
const { data, isLoading, isError } = useQuery({
  queryKey: ['tasks', { status, assigneeId }, page],  // Cache key
  queryFn: () => api.tasks.list({ status, assigneeId, page }),
});
```
- `queryKey`: React Query dùng key này để cache, dedup, invalidate
- `queryFn`: async function fetch data
- `isLoading`: true khi đang fetch lần đầu
- `data`: data sau khi fetch thành công

**`useMutation`** — thực hiện write operations:
```typescript
const createMutation = useMutation({
  mutationFn: api.tasks.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });  // Refresh tasks list
    toast.success('Task created');
  },
  onError: (err: Error) => toast.error(err.message),
});

// Gọi:
createMutation.mutate(data);
// Hoặc:
await createMutation.mutateAsync(data);
```

### Query keys và invalidation

```typescript
// Khi tạo task mới → invalidate tất cả queries có key bắt đầu bằng ['tasks']
queryClient.invalidateQueries({ queryKey: ['tasks'] });

// Các queries bị invalidate:
// ['tasks', { status: 'TODO' }, 1]  ✓
// ['tasks', { status: 'DONE' }, 2]  ✓
// ['tasks']                          ✓
// ['users']                          ✗ (khác prefix)
```

**Pattern trong tasks page:**
```typescript
const updateMutation = useMutation({
  mutationFn: ({ id, data }) => api.tasks.update(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    // Khi task → DONE, leaderboard thay đổi → invalidate cả leaderboard
  },
});
```

### staleTime

```typescript
// In Providers:
staleTime: 60_000  // Data được coi là fresh trong 60s

// Override per-query:
useQuery({
  queryKey: ['users', 'search', searchQuery],
  staleTime: 30_000,  // Search results fresh trong 30s
});
```

Khi data stale, React Query sẽ refetch background. Khi còn fresh, dùng cached data luôn.

---

## API Client

**File:** `frontend/src/lib/api-client.ts`

### Base request function

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || `Request failed: ${res.status}`;
    throw new Error(message);  // React Query / onError handler sẽ nhận
  }

  if (res.status === 204) return undefined as T;  // No Content
  return res.json();
}
```

**`NEXT_PUBLIC_` prefix**: Next.js chỉ expose env vars có prefix này ra browser. Các env vars khác chỉ available server-side.

### Namespaced API

```typescript
export const api = {
  users: {
    list:   (params?) => request('/api/users?' + buildQs(params)),
    search: (q?)     => request(`/api/users/search${q ? '?q=' + q : ''}`),
    get:    (id)     => request(`/api/users/${id}`),
    create: (data)   => request('/api/users', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, d)  => request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
    delete: (id)     => request(`/api/users/${id}`, { method: 'DELETE' }),
  },
  tasks: { ... },
  leaderboard: { ... },
  dashboard: {
    getStats: async () => {
      // Aggregate từ nhiều endpoints
      const [totalResult, completedResult, leaderboard] = await Promise.all([
        api.tasks.list({ limit: 1 }),        // Chỉ cần total count
        api.tasks.list({ status: 'DONE', limit: 1 }),
        api.leaderboard.get(),
      ]);
      return { totalTasks: totalResult.total, ... };
    }
  }
};
```

`api.dashboard.getStats()` là ví dụ về **BFF pattern nhẹ**: frontend tự aggregate data từ nhiều API calls thay vì cần endpoint riêng.

---

## Pages

### Tasks Page (phức tạp nhất)

**File:** `frontend/src/app/tasks/page.tsx`

```typescript
// State
const [filters, setFilters] = useState({ status: '', assigneeId: '', assigneeName: '' });
const [page, setPage] = useState(1);

// Data fetching
const { data: tasksResult, isLoading } = useQuery({
  queryKey: ['tasks', { status: filters.status, assigneeId: filters.assigneeId }, page],
  queryFn: () => api.tasks.list({ status, assigneeId, page, limit: 10 }),
});

// Mutations
const updateMutation = useMutation({
  mutationFn: ({ id, data }) => api.tasks.update(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    toast.success('Task updated');
  },
});
```

**State machine trong UI:**
```typescript
const NEXT_STATUS = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'DONE' };
const NEXT_STATUS_LABEL = { TODO: 'Start', IN_PROGRESS: 'Complete' };

// Trong render:
{NEXT_STATUS[task.status] && task.assigneeId && (
  <Button onClick={() => updateMutation.mutate({ id: task.id, data: { status: NEXT_STATUS[task.status] } })}>
    {NEXT_STATUS_LABEL[task.status]}
  </Button>
)}
{NEXT_STATUS[task.status] && !task.assigneeId && (
  <span>Assign first</span>  // DONE tasks không có nextStatus → không show
)}
```

### Leaderboard Page (SSE)

**File:** `frontend/src/app/leaderboard/page.tsx`

Không dùng React Query vì SSE là stream, không phải request-response:

```typescript
useEffect(() => {
  const es = new EventSource(`${API_BASE}/api/leaderboard/stream`);

  es.addEventListener('score-update', (e) => {
    setEntries(JSON.parse(e.data));  // Mỗi event → update state
    setLastUpdated(new Date());
    setIsLoading(false);
  });

  es.onerror = () => {
    setIsLoading(false);
    setIsError(true);
  };

  return () => es.close();  // Cleanup khi unmount
}, []);
```

---

## Component patterns

### Task Form — Popover + Command combobox

**File:** `frontend/src/components/task-form.tsx`

Pattern search user với debounce-less server-side search:
```typescript
const [searchQuery, setSearchQuery] = useState('');
const [comboOpen, setComboOpen] = useState(false);

const { data: users = [] } = useQuery({
  queryKey: ['users', 'search', searchQuery],
  queryFn: () => api.users.search(searchQuery || undefined),
  enabled: comboOpen,        // Chỉ fetch khi dropdown mở
  staleTime: 30_000,
});

// Trong JSX:
<Command shouldFilter={false}>          {/* Tắt client-side filter — đã filter server-side */}
  <CommandInput
    value={searchQuery}
    onValueChange={setSearchQuery}      {/* Mỗi keystroke → query key thay đổi → fetch mới */}
  />
  ...
</Command>
```

**Tại sao không debounce?** React Query deduplicate requests với cùng key trong window `staleTime`. Nếu user gõ "ali" và data vẫn fresh, không có network request. Trong thực tế production nên thêm debounce để giảm requests.

### FilterBar — tương tự nhưng ở filter, không phải form

**File:** `frontend/src/components/filter-bar.tsx`

Sau fix, FilterBar cũng dùng cùng pattern với `comboOpen` guard, server-side search, `shouldFilter={false}`.

---

## shadcn/ui

Dự án dùng **shadcn/ui** — không phải thư viện npm, mà là collection of components được copy vào `frontend/src/components/ui/`:

```
button.tsx, dialog.tsx, select.tsx, popover.tsx,
command.tsx, input.tsx, label.tsx, table.tsx, ...
```

Mỗi component là Radix UI primitive + Tailwind CSS styling. Bạn **sở hữu code** nên có thể customize thoải mái.

**`cn()` utility:**
```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));  // Merge Tailwind classes, giải quyết conflicts
}

// Dùng:
<Button className={cn("base-classes", condition && "conditional-classes")} />
```

---

## Environment variables

```bash
# frontend/.env.local (dev)
NEXT_PUBLIC_API_URL=http://localhost:3000

# Docker Compose (production)
NEXT_PUBLIC_API_URL=http://backend:3000
```

`NEXT_PUBLIC_` — build-time injection. Next.js replace string literal `process.env.NEXT_PUBLIC_API_URL` tại build time.

---

## Tổng kết data flow frontend

```
User action (click button)
        │
        ▼
useMutation.mutate(data)
        │
        ├── api.tasks.update(id, data)  ← fetch POST/PATCH/DELETE
        │         │
        │         ▼ Backend
        │         └── 200 OK / error response
        │
        ├── onSuccess: queryClient.invalidateQueries(['tasks'])
        │         │
        │         ▼
        │    useQuery(['tasks', ...]) → isStale → refetch → re-render table
        │
        └── toast.success('Task updated')

Đồng thời (parallel):
EventSource /api/leaderboard/stream
        │
        ├── 'score-update' event received
        │
        └── setEntries(newRankings) → re-render leaderboard
```
