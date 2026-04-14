# 08 — Source Code Reading Guide

This is a step-by-step path for reading the code from the outside in, from simple to complex. Each step includes self-check questions.

---

## Step 1 — Understand the shared contract (`shared/`)

**Read first:** `shared/types/task.ts`, `shared/types/user.ts`, `shared/constants/scoring.ts`

```
shared/
├── types/
│   ├── task.ts       ← TaskStatus enum, TaskPriority enum, Task interface, VALID_TRANSITIONS
│   ├── user.ts       ← User interface, CreateUserInput
│   └── leaderboard.ts ← LeaderboardEntry interface
└── constants/
    └── scoring.ts    ← PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY
```

**Self-check questions:**
- What statuses can a task have?
- What does `VALID_TRANSITIONS['IN_PROGRESS']` return?
- How many points does a HIGH-priority task get if completed late?

---

## Step 2 — Database schema

**Read:** `backend/prisma/schema.prisma`

Draw the relationship diagram on paper:
```
User ──┬── Task (assignee)
       ├── ScoreEvent (user)
       └── ProductivityScore (1-1)
Task ─── ScoreEvent (task)
```

**Self-check questions:**
- When a User is deleted, is `ScoreEvent` deleted too? (Check `onDelete`)
- Why are `status` and `priority` in `Task` stored as `String` instead of PostgreSQL enums?
- How is `ProductivityScore` different from `ScoreEvent`?

---

## Step 3 — Entry point + middleware stack

**Read in this order:**
1. `backend/src/server.ts` — 8 lines, 1 minute
2. `backend/src/app.ts` — middleware stack
3. `backend/src/middleware/correlation-id.ts`
4. `backend/src/middleware/rate-limiter.ts`
5. `backend/src/middleware/error-handler.ts`
6. `backend/src/middleware/validation.ts`

**Self-check questions:**
- Which middleware runs first: `express.json()` or `correlationIdMiddleware`?
- Why must `errorHandler` have exactly 4 parameters?
- `validate(schema)` is a factory function — what does it return?
- When Prisma throws P2002, what response status code and error code are returned?

---

## Step 4 — One complete route (simple)

**Read:** `backend/src/routes/user.routes.ts` + `backend/src/services/user.service.ts`

Follow the flow of `POST /api/users`:

```
1. writeLimiter (rate check)
2. validate(createUserSchema) ← read the schema in user.schemas.ts
3. userService.create(req.body)
4. prisma.user.create({ data })
5. If email is duplicated → Prisma P2002 → errorHandler → 409
6. If OK → res.status(201).json(user)
```

**Self-check questions:**
- What fields are in `createUserSchema`? Which ones are required?
- Why does `userService.getAll()` use `Promise.all`?
- How does `userService.delete()` handle DONE tasks?

---

## Step 5 — Core business logic (complex)

**Read:** `backend/src/services/task.service.ts`

Focus on `taskService.update()`. Read each block and ask yourself:

```typescript
// Block 1: Load existing task — why is this needed?
const existing = await taskService.getById(id);

// Block 2: State machine validation — where does VALID_TRANSITIONS come from?
if (data.status && data.status !== existing.status) { ... }

// Block 3: Guard assigneeId change on DONE — why is it forbidden?
if (data.assigneeId != null && existing.status === 'DONE') { ... }

// Block 4: Transaction with optimistic locking — why updateMany instead of update?
const result = await tx.task.updateMany({ where: { id, status: existing.status } });
if (result.count === 0) throw ConflictError('CONCURRENT_MODIFICATION');

// Block 5: scoreTask INSIDE tx — why not outside?
await leaderboardService.scoreTask({ ... }, tx);

// Block 6: Side effects OUTSIDE tx — why?
await redisClient.del(LEADERBOARD_CACHE_KEY);
sseManager.broadcast(rankings);
```

**Self-check questions:**
- If the `result.count === 0` check is removed, what race condition can happen?
- Why is `tx` passed into `scoreTask`?
- If Redis `del` fails, does the app crash? What is the consequence?

---

## Step 6 — Scoring & Leaderboard

**Read:** `backend/src/services/leaderboard.service.ts`

Read `scoreTask()` and answer:
- What does `nowDay < dueDay` mean in business terms?
- Why use `new Date(year, month, day)` instead of `now < task.dueDate`?
- What does `upsert` do when `ProductivityScore` does not exist yet? What about when it already exists?

Read `getRankings()` and trace the flow:
```
redisClient.get() → HIT → parse JSON → return
                 → MISS (or error)
                         → prisma.user.findMany()
                         → .map().sort().map()
                         → redisClient.set('EX', 60)
                         → return
```

---

## Step 7 — Lib singletons

**Read:** `backend/src/lib/sse-manager.ts`, `backend/src/lib/redis.ts`, `backend/src/lib/prisma.ts`

**`sse-manager.ts`** — shortest and easiest of the three. Focus on:
- Why use `Map<string, Response>` instead of `Array<Response>`?
- What is the purpose of the `writableEnded || destroyed` check?
- Why does `broadcast()` use `try/catch`?

**`redis.ts`** — pay attention to 3 options:
- `lazyConnect: true` — when does it connect?
- `enableOfflineQueue: false` — what happens to commands when offline?
- `maxRetriesPerRequest: 1` — how does that affect latency?

---

## Step 8 — SSE endpoint

**Read:** `backend/src/routes/leaderboard.routes.ts`

```typescript
router.get('/stream', async (req, res) => {
  // Why set these headers?
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();  // ← Why call flushHeaders() immediately?

  sseManager.addClient(clientId, res);

  // Send initial data — why is this needed?
  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  req.on('close', () => sseManager.removeClient(clientId));
  // ← Why not call res.end()?
});
```

---

## Step 9 — Frontend: api-client

**Read:** `frontend/src/lib/api-client.ts`

```typescript
// Base function:
async function request<T>(path, init?): Promise<T>

// Trace through:
// 1. fetch() — URL, headers
// 2. !res.ok → parse error body → throw Error
// 3. res.status === 204 → return undefined (No Content)
// 4. res.json() → parse + return
```

**Questions:**
- When is `NEXT_PUBLIC_API_URL` injected: build time or runtime?
- How many API endpoints does `api.dashboard.getStats()` call? In parallel or sequentially?
- What URL does `api.tasks.forceDelete(id)` call?

---

## Step 10 — Frontend: one full page

**Read:** `frontend/src/app/tasks/page.tsx`

This is the most complex page — all important patterns appear here.

Trace the flow from when the user clicks the “Complete” button:
```
1. Button onClick → handleTransition(task)
2. handleTransition → updateMutation.mutate({ id, data: { status: 'DONE' } })
3. mutationFn → api.tasks.update(id, { status: 'DONE' })
4. fetch PATCH /api/tasks/:id { status: 'DONE' }
5. Backend: taskService.update() → transaction → score → SSE broadcast
6. 200 OK → onSuccess callback
7. queryClient.invalidateQueries(['tasks']) → re-render task list
8. queryClient.invalidateQueries(['leaderboard']) → if leaderboard page is open, refetch
9. toast.success('Task updated')
```

---

## Step 11 — Tests

**Read in this order:**
1. `backend/src/test/setup.ts` — global mock setup
2. `backend/src/test/users.test.ts` — simplest tests, learn the pattern
3. `backend/src/test/leaderboard.test.ts` — cache behavior tests (Test A/B/C/D)
4. `backend/src/test/tasks.test.ts` — most complex tests (transaction, scoring atomicity)

**For each test, ask yourself:**
- Arrange: which mocks are set up?
- Act: what HTTP request is sent?
- Assert: what is being verified?

---

## Self-study checklist

After reading, you should be able to answer:

**Backend:**
- [ ] What is the middleware order in the Express app? Why does order matter?
- [ ] When `POST /api/tasks` receives an invalid body, where is the error handled?
- [ ] Why does `task.update()` use `updateMany` instead of `update`?
- [ ] Why does `scoreTask` run in the same transaction as the status update?
- [ ] If Redis fails, does the app go down? What is the consequence?
- [ ] `onDelete: Restrict` vs `onDelete: Cascade` — where is each used, and why?

**Scoring:**
- [ ] If a task is completed at 10:00 AM on the deadline day, how is it scored?
- [ ] Why use `updateMany` with `where: { status: existing.status }` to prevent double-scoring?
- [ ] When force-deleting a DONE task, why use `aggregate(SUM)` instead of decrementing?

**Realtime:**
- [ ] When is the cache invalidated? When is it rebuilt?
- [ ] If 5 browser tabs have the leaderboard open, how many SSE connections does the server need?
- [ ] Why must SSE side effects run OUTSIDE the Prisma transaction?

**Testing:**
- [ ] Where is Prisma mocked? When are mocks reset?
- [ ] How is `mockResolvedValueOnce` different from `mockResolvedValue`?
- [ ] What does `$transaction.mockImplementation(fn => fn(mockPrisma))` do?

**Frontend:**
- [ ] If `useQuery` with the same `queryKey` is used in 2 different components, are there 2 network requests?
- [ ] Does `invalidateQueries(['tasks'])` invalidate `['tasks', filters, page]`?
- [ ] Why does the leaderboard page use `useEffect + EventSource` instead of `useQuery`?

---

## Tips for reading code effectively

1. **Trace one request end-to-end** — pick one API endpoint and read route → service → DB → response
2. **Read types first** — understand the shape of the data before reading the logic
3. **Grep constants** — find where `VALID_TRANSITIONS` is used to understand its role
4. **Read tests alongside source** — tests explain expected behavior and are often easier to understand than production code alone
5. **Keep asking “why”** — do not just learn what the code does, learn why it does it that way

---

## Quick reference reading order

```
shared/types/task.ts                        (5 min)
shared/constants/scoring.ts                 (2 min)
backend/prisma/schema.prisma               (10 min)
backend/src/server.ts                       (1 min)
backend/src/app.ts                          (5 min)
backend/src/middleware/error-handler.ts    (10 min)
backend/src/middleware/validation.ts        (3 min)
backend/src/middleware/correlation-id.ts    (3 min)
backend/src/middleware/rate-limiter.ts      (3 min)
backend/src/schemas/task.schemas.ts         (5 min)
backend/src/routes/task.routes.ts           (5 min)
backend/src/lib/prisma.ts                   (3 min)
backend/src/lib/redis.ts                    (3 min)
backend/src/lib/sse-manager.ts              (5 min)
backend/src/services/user.service.ts       (15 min)
backend/src/services/leaderboard.service.ts (15 min)
backend/src/services/task.service.ts       (30 min)  ← This is the most important file
backend/src/routes/leaderboard.routes.ts    (5 min)
backend/src/test/setup.ts                   (3 min)
backend/src/test/users.test.ts             (15 min)
backend/src/test/leaderboard.test.ts       (20 min)
backend/src/test/tasks.test.ts             (45 min)  ← Most tests here
frontend/src/lib/api-client.ts             (10 min)
frontend/src/app/tasks/page.tsx            (20 min)
frontend/src/app/leaderboard/page.tsx       (5 min)
frontend/src/components/task-form.tsx      (10 min)
                                          ─────────
                                          ~275 min (~4.5 hours for a careful read)
```
