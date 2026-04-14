# 06 — Frontend: Next.js, React Query & API Client

---

## Frontend architecture

```
frontend/src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout: Providers + Nav + Toaster
│   ├── page.tsx              # Dashboard (/)
│   ├── users/page.tsx        # User management (/users)
│   ├── tasks/page.tsx        # Task management (/tasks)
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

**All pages are Client Components** (`'use client'`) — there are no Server Components for data fetching. Data is fetched in the browser through React Query.

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

`Providers` wraps the whole app with TanStack Query's `QueryClientProvider`:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,          // Data stays fresh for 60s
      refetchOnWindowFocus: false, // Do not refetch when user switches tabs
    },
  },
});
```

### File-based routing
```
app/page.tsx             → /
app/users/page.tsx       → /users
app/tasks/page.tsx       → /tasks
app/leaderboard/page.tsx → /leaderboard
```
Next.js automatically maps file paths to URLs.

---

## TanStack React Query

React Query is a **server state management** library — different from client state libraries like Redux or Zustand.

### Core concepts

**`useQuery`** — fetch and cache data:
```typescript
const { data, isLoading, isError } = useQuery({
  queryKey: ['tasks', { status, assigneeId }, page],  // Cache key
  queryFn: () => api.tasks.list({ status, assigneeId, page }),
});
```
- `queryKey`: used by React Query for caching, deduping, and invalidation
- `queryFn`: async function that fetches data
- `isLoading`: true during the initial fetch
- `data`: result after successful fetch

**`useMutation`** — perform write operations:
```typescript
const createMutation = useMutation({
  mutationFn: api.tasks.create,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });  // Refresh tasks list
    toast.success('Task created');
  },
  onError: (err: Error) => toast.error(err.message),
});

// Call it:
createMutation.mutate(data);
// Or:
await createMutation.mutateAsync(data);
```

### Query keys and invalidation

```typescript
// When creating a new task → invalidate all queries whose key starts with ['tasks']
queryClient.invalidateQueries({ queryKey: ['tasks'] });

// Invalidated queries:
// ['tasks', { status: 'TODO' }, 1]  ✓
// ['tasks', { status: 'DONE' }, 2]  ✓
// ['tasks']                          ✓
// ['users']                          ✗ (different prefix)
```

**Pattern on the tasks page:**
```typescript
const updateMutation = useMutation({
  mutationFn: ({ id, data }) => api.tasks.update(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    // When task → DONE, leaderboard changes → invalidate leaderboard too
  },
});
```

### staleTime

```typescript
// In Providers:
staleTime: 60_000  // Data is considered fresh for 60s

// Override per query:
useQuery({
  queryKey: ['users', 'search', searchQuery],
  staleTime: 30_000,  // Search results stay fresh for 30s
});
```

When data becomes stale, React Query may refetch in the background. When still fresh, it serves cached data immediately.

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
    throw new Error(message);  // React Query / onError handler receives this
  }

  if (res.status === 204) return undefined as T;  // No Content
  return res.json();
}
```

**`NEXT_PUBLIC_` prefix:** Next.js only exposes environment variables with this prefix to the browser. Other env vars are server-side only.

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
      // Aggregate from multiple endpoints
      const [totalResult, completedResult, leaderboard] = await Promise.all([
        api.tasks.list({ limit: 1 }),        // Only need total count
        api.tasks.list({ status: 'DONE', limit: 1 }),
        api.leaderboard.get(),
      ]);
      return { totalTasks: totalResult.total, ... };
    }
  }
};
```

`api.dashboard.getStats()` is an example of a lightweight **BFF pattern**: the frontend aggregates data from multiple API calls instead of requiring a dedicated endpoint.

---

## Pages

### Tasks Page (most complex)

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

**State machine in the UI:**
```typescript
const NEXT_STATUS = { TODO: 'IN_PROGRESS', IN_PROGRESS: 'DONE' };
const NEXT_STATUS_LABEL = { TODO: 'Start', IN_PROGRESS: 'Complete' };

// In render:
{NEXT_STATUS[task.status] && task.assigneeId && (
  <Button onClick={() => updateMutation.mutate({ id: task.id, data: { status: NEXT_STATUS[task.status] } })}>
    {NEXT_STATUS_LABEL[task.status]}
  </Button>
)}
{NEXT_STATUS[task.status] && !task.assigneeId && (
  <span>Assign first</span>  // DONE tasks have no nextStatus → do not show
)}
```

### Leaderboard Page (SSE)

**File:** `frontend/src/app/leaderboard/page.tsx`

It does not use React Query because SSE is a stream, not a request-response interaction:

```typescript
useEffect(() => {
  const es = new EventSource(`${API_BASE}/api/leaderboard/stream`);

  es.addEventListener('score-update', (e) => {
    setEntries(JSON.parse(e.data));  // Each event → update state
    setLastUpdated(new Date());
    setIsLoading(false);
  });

  es.onerror = () => {
    setIsLoading(false);
    setIsError(true);
  };

  return () => es.close();  // Cleanup on unmount
}, []);
```

---

## Component patterns

### Task Form — Popover + Command combobox

**File:** `frontend/src/components/task-form.tsx`

Pattern: user search with debounce-less server-side search:
```typescript
const [searchQuery, setSearchQuery] = useState('');
const [comboOpen, setComboOpen] = useState(false);

const { data: users = [] } = useQuery({
  queryKey: ['users', 'search', searchQuery],
  queryFn: () => api.users.search(searchQuery || undefined),
  enabled: comboOpen,        // Only fetch when dropdown is open
  staleTime: 30_000,
});

// In JSX:
<Command shouldFilter={false}>          {/* Disable client-side filter — already filtered server-side */}
  <CommandInput
    value={searchQuery}
    onValueChange={setSearchQuery}      {/* Each keystroke → query key changes → new fetch */}
  />
  ...
</Command>
```

**Why no debounce?** React Query deduplicates requests with the same key within the `staleTime` window. If the user types “ali” and the data is still fresh, there may be no extra network request. In real production, adding debounce would still help reduce request volume.

### FilterBar — same idea, but used for filtering instead of a form

**File:** `frontend/src/components/filter-bar.tsx`

After the fix, `FilterBar` uses the same pattern with `comboOpen`, server-side search, and `shouldFilter={false}`.

---

## shadcn/ui

The project uses **shadcn/ui** — not as an npm library, but as a collection of components copied into `frontend/src/components/ui/`:

```
button.tsx, dialog.tsx, select.tsx, popover.tsx,
command.tsx, input.tsx, label.tsx, table.tsx, ...
```

Each component is built from Radix UI primitives + Tailwind CSS styling. You **own the code**, so you can customize it freely.

**`cn()` utility:**
```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));  // Merge Tailwind classes, resolving conflicts
}

// Usage:
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

`NEXT_PUBLIC_` means build-time injection. Next.js replaces `process.env.NEXT_PUBLIC_API_URL` at build time.

---

## Frontend data flow summary

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

At the same time (in parallel):
EventSource /api/leaderboard/stream
        │
        ├── 'score-update' event received
        │
        └── setEntries(newRankings) → re-render leaderboard
```
