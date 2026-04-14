# Interview Q&A — Backend Deep Dive

> This file collects common backend interview questions and detailed answers based on the actual codebase.
> Each answer points to **file:line** references for easier follow-up.

---

## Table of contents

1. [N+1 Query Problem](#1-n1-query-problem)
2. [Validation — Zod & Middleware](#2-validation--zod--middleware)
3. [Why the backend still validates even if the frontend already does](#3-why-the-backend-still-validates-even-if-the-frontend-already-does)
4. [Cache — Redis, TTL, Cache Invalidation](#4-cache--redis-ttl-cache-invalidation)
5. [API Request Flow — step by step through middleware](#5-api-request-flow--step-by-step-through-middleware)
6. [CORS — configuration and rationale](#6-cors--configuration-and-rationale)
7. [Logging — pino, correlation ID, structured logs](#7-logging--pino-correlation-id-structured-logs)
8. [Real-time Communication — SSE vs WebSocket](#8-real-time-communication--sse-vs-websocket)
9. [Rate Limiting](#9-rate-limiting)
10. [Error Handling — typed error hierarchy](#10-error-handling--typed-error-hierarchy)
11. [Concurrency & Race Condition Prevention](#11-concurrency--race-condition-prevention)
12. [Database Transaction & Atomicity](#12-database-transaction--atomicity)
13. [State Machine — task transitions](#13-state-machine--task-transitions)
14. [Security — Helmet, UUID validation](#14-security--helmet-uuid-validation)
15. [Scoring System — business logic](#15-scoring-system--business-logic)

---

## 1. N+1 Query Problem

### Question: “Does this project suffer from N+1 queries? How is it handled?”

**Definition:**
N+1 happens when you fetch a list of N records, then for **each** record you run another query to fetch related data → a total of N+1 queries instead of 1.

**Bad N+1 example (DO NOT do this):**
```ts
// ❌ Causes N+1: 1 query to get tasks + N queries to get assignee for each task
const tasks = await prisma.task.findMany();
for (const task of tasks) {
  task.assignee = await prisma.user.findUnique({ where: { id: task.assigneeId } });
}
```

**How this project handles it — it does NOT have N+1:**

Prisma's `include` generates a single `LEFT JOIN`:

```ts
// backend/src/services/task.service.ts:107-113
prisma.task.findMany({
  where,
  orderBy,
  skip,
  take: limit,
  include: { assignee: { select: { id: true, name: true, email: true } } },
  //       ^^^^^^^ Prisma generates a JOIN — not N separate queries
});
```

One SQL query is generated:
```sql
SELECT t.*, u.id, u.name, u.email
FROM "Task" t
LEFT JOIN "User" u ON t."assigneeId" = u.id
LIMIT 20 OFFSET 0;
```

**Case `sortBy=priority` (raw SQL):**

When sorting by priority, semantic ordering is needed (`HIGH > MEDIUM > LOW`). Prisma ORM does not support `CASE WHEN` in `ORDER BY`, so raw SQL is used. The query still uses `LEFT JOIN`, so it is not N+1:

```ts
// backend/src/services/task.service.ts:37-67
prisma.$queryRaw`
  SELECT t.id, t.title, ...,
         u.id AS assignee_id, u.name AS assignee_name, u.email AS assignee_email
  FROM "Task" t
  LEFT JOIN "User" u ON t."assigneeId" = u.id
  ${whereClause}
  ORDER BY CASE t.priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ... END ${dir}
  LIMIT ${limit} OFFSET ${skip}
`
```

**Case `leaderboard.getRankings()`:**

```ts
// backend/src/services/leaderboard.service.ts:104-108
const users = await prisma.user.findMany({
  include: { productivityScore: true },
  //        ^^^^^^^^^^^^^^^^^ 1 JOIN, not N queries
});
```

**Conclusion:** The project does **not** suffer from N+1 because it uses `include` / JOINs instead of lazy-loading related records one by one.

---

## 2. Validation — Zod & Middleware

### Question: “How is validation implemented in this project?”

There are **2 input types** that need validation, and they are handled differently:

### 2a. Request body — use `validate()` middleware

```ts
// backend/src/middleware/validation.ts:5-20
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);   // parse + coerce + strip unknown fields
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),          // e.g. "title", "assigneeId"
          message: e.message,
        }));
        throw new ValidationError(details); // → 400 with field-level details
      }
      throw err;
    }
  };
}
```

The middleware is attached to routes as a guard:

```ts
// backend/src/routes/task.routes.ts:26
router.post('/', validate(createTaskSchema), async (req, res) => { ... });
// backend/src/routes/task.routes.ts:31
router.patch('/:id', validate(updateTaskSchema), async (req, res) => { ... });
```

### 2b. Query params — inline `safeParse`

Query parameters are validated **inline** in the route handler, not through middleware, because they do not go through `req.body`:

```ts
// backend/src/routes/task.routes.ts:9-18
router.get('/', async (req, res) => {
  const parsed = taskQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message },
    });
    return;
  }
  const result = await taskService.getAll(parsed.data);
  res.json(result);
});
```

**Why `safeParse` instead of `parse`?** Because `safeParse` does not throw — it returns `{ success, data, error }`. That lets the handler control the response directly instead of throwing into `errorHandler`.

### 2c. Example schema — `createTaskSchema`

```ts
// backend/src/schemas/task.schemas.ts:6-13
export const createTaskSchema = z.object({
  title:       z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  status:      z.literal('TODO').optional().default('TODO'), // only allow TODO on create
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH']),
  assigneeId:  z.string().uuid('Invalid assignee ID').optional().nullable(),
  dueDate:     z.string().datetime({ message: 'Invalid date format. Use ISO 8601.' }),
});
```

`schema.parse()` both validates and **transforms** (e.g. number coercion, stripping unknown fields, filling defaults). After `validate()`, `req.body` is typed and sanitized.

### 2d. Validation error response

```json
HTTP 400
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "title",    "message": "Title is required" },
      { "field": "dueDate",  "message": "Invalid date format. Use ISO 8601 format." }
    ]
  }
}
```

---

## 3. Why the backend still validates even if the frontend already does

### Question: “The frontend already validates input, so why does the backend need validation too?”

This is a very common interview question. The short answer: **frontend validation is for UX, not for security**.

### Reason 1: The API is public — not just the frontend can call it

Anyone can call the API directly using `curl`, Postman, or attack scripts:

```bash
# Attacker bypasses the frontend entirely
curl -X POST http://api.example.com/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "", "priority": "ULTRA_HIGH", "dueDate": "not-a-date"}'
```

If the backend does not validate → garbage data gets into the DB.

### Reason 2: The frontend can be tampered with

JavaScript runs in the user's browser. Anyone can:
- Open DevTools and modify JS or intercept requests
- Use Burp Suite to modify payloads before sending
- Disable JS and submit forms without frontend validation

### Reason 3: Defense in depth

Security principle: **defense in depth** — multiple protection layers. If one fails, another remains.

```
FE validation → good UX (instant feedback, no roundtrip)
BE validation → security and data integrity (single source of truth)
```

### Reason 4: The backend has context the frontend does not

For example in this project:

```ts
// backend/src/services/task.service.ts:135-137
// Only the backend knows whether a user still exists in the DB
if (data.assigneeId) {
  const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
  if (!assignee) throw new NotFoundError('User', data.assigneeId);
}
```

The frontend cannot know whether `assigneeId` is still valid at submit time. The user might have been deleted in the meantime.

### Reason 5: Concurrent modification

```ts
// backend/src/services/task.service.ts:156-163
// State machine validation — FE cannot prevent concurrent requests
if (data.status && data.status !== existing.status) {
  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(data.status)) {
    throw new ConflictError('INVALID_TRANSITION', `Cannot transition...`);
  }
}
```

Two users can try to modify the same task at the same time — only the backend can enforce the state machine with locking.

### Summary

| | FE Validation | BE Validation |
|---|---|---|
| Purpose | UX, instant feedback | Security, data integrity |
| Who can bypass it | Everyone | No one (server-side) |
| Knows DB state | No | Yes |
| Concurrent safety | No | Yes (transaction) |
| Mandatory | No (optional) | Yes (mandatory) |

---

## 4. Cache — Redis, TTL, Cache Invalidation

### Question: “How is caching used? How long does it last? When is it reset?”

### 4a. What is cached?

Only **leaderboard rankings** are cached — this is the most expensive dataset (full scan + sort) and one of the most frequently read.

```ts
// backend/src/services/leaderboard.service.ts:9-10
export const LEADERBOARD_CACHE_KEY = 'leaderboard:rankings';
const CACHE_TTL = 60; // seconds
```

Other endpoints such as task lists or user lists are **not cached** because they need fresher data.

### 4b. Pattern: Cache-Aside (Lazy Loading)

```
Request → Check Redis
           ├─ HIT  → return from Redis immediately (< 1ms)
           └─ MISS → query PostgreSQL → store in Redis → return
```

Actual code:

```ts
// backend/src/services/leaderboard.service.ts:94-131
async getRankings() {
  // Step 1: Try cache
  try {
    const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
    if (cached !== null) {
      return JSON.parse(cached);  // Cache HIT — return immediately
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache read failed'); // Redis down → graceful degrade
  }

  // Step 2: Cache MISS — query DB
  const users = await prisma.user.findMany({
    include: { productivityScore: true },
  });
  const rankings = users
    .map(user => ({ ... }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  // Step 3: Write to cache with TTL 60 seconds
  try {
    await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', CACHE_TTL);
  } catch (err) {
    logger.warn({ err }, 'Redis cache write failed'); // Redis down → still return DB result
  }

  return rankings;
}
```

### 4c. TTL 60 seconds — why?

- The leaderboard does not need to be ultra real-time by polling alone
- 60 seconds is a good balance: not stale for too long, not too many DB queries
- When a task becomes DONE, the cache is **invalidated immediately**, so TTL is mainly a safety net

### 4d. Cache invalidation — when is it reset?

The cache is deleted in **3 main cases**:

**Case 1: Task transitions to DONE**
```ts
// backend/src/services/task.service.ts:249-257
if (data.status === 'DONE' && existing.status !== 'DONE' && updated?.assigneeId) {
  try {
    await redisClient.del(LEADERBOARD_CACHE_KEY); // clear old cache
  } catch (err) {
    logger.warn({ err }, 'Redis cache invalidation failed');
  }
  const updatedRankings = await leaderboardService.getRankings(); // query fresh DB data → repopulate cache
  sseManager.broadcast(updatedRankings); // push SSE to all clients
}
```

**Case 2: User is deleted**
```ts
// backend/src/services/user.service.ts:111-117
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
const updatedRankings = await leaderboardService.getRankings();
sseManager.broadcast(updatedRankings);
```

**Case 3: User is updated (name/email)**
```ts
// backend/src/services/user.service.ts:81-85
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
```
(No SSE broadcast needed because the ranking order does not change, only display data does.)

**Case 4: A DONE task is force-deleted**
```ts
// backend/src/services/task.service.ts:311-318
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
const updatedRankings = await leaderboardService.getRankings();
sseManager.broadcast(updatedRankings);
```

### 4e. Graceful degradation — what if Redis dies?

```ts
// backend/src/lib/redis.ts:5-8
export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false, // ← do not queue requests when Redis is down
  maxRetriesPerRequest: 1,   // ← fail fast
});
```

Both Redis reads and writes are wrapped in `try/catch` and only log a warning — **they do not throw**. The app still works; each request just goes to the DB instead of the cache.

### 4f. Cache stampede (potential issue)

If the cache expires exactly when 100 requests arrive, all of them may hit the DB at once. The current project does not address this yet, which is acceptable at small scale. A future improvement could use a mutex lock or stale-while-revalidate.

---

## 5. API Request Flow — step by step through middleware

### Question: “When an HTTP request reaches the backend, what steps does it go through?”

Example: `PATCH /api/tasks/:id` with body `{ "status": "DONE" }`

```
HTTP Request
     │
     ▼
[1] helmet()               — Add security headers
     │
     ▼
[2] cors()                 — Check Origin header, set CORS headers
     │                       If preflight OPTIONS → return 204 immediately
     ▼
[3] correlationIdMiddleware — Read X-Request-Id header
     │                        Validate UUID format
     │                        Attach req.id, set response header X-Request-Id
     ▼
[4] pinoHttp logger        — Log request start: { method, url, reqId, ... }
     │
     ▼
[5] express.json()         — Parse body → req.body object
     │
     ▼
[6] writeLimiter           — Rate limit PATCH/POST/DELETE
     │                        Check 60 req/minute/IP
     │                        If exceeded → 429 RATE_LIMIT_EXCEEDED
     ▼
[7] Router matching        — app.use('/api/tasks', taskRouter)
     │                        taskRouter.patch('/:id', ...)
     ▼
[8] validate(updateTaskSchema) — Zod parse req.body
     │                           If invalid → throw ValidationError → skip [9,10]
     ▼
[9] Route handler          — taskService.update(id, body)
     │                        ├─ getById(id) → NotFoundError if missing
     │                        ├─ Check VALID_TRANSITIONS
     │                        ├─ prisma.$transaction(...)
     │                        │    ├─ task.updateMany (optimistic lock)
     │                        │    └─ leaderboardService.scoreTask(...)
     │                        ├─ redisClient.del(cache key)
     │                        ├─ leaderboardService.getRankings()
     │                        └─ sseManager.broadcast(rankings)
     ▼
[10] res.json(updatedTask) — Serialize response, pinoHttp logs response: { statusCode, ms }
     │
     ▼
HTTP Response 200
```

If an error happens at any step:

```
throw NotFoundError / ConflictError / ValidationError
     │
     ▼
[errorHandler middleware]  — app.use(errorHandler) at the end
     │                        instanceof AppError → serialize error JSON
     │                        Prisma P2002 → 409 DUPLICATE_*
     │                        Prisma P2003 → 409 FOREIGN_KEY_CONSTRAINT
     │                        Unknown → 500 INTERNAL_ERROR + console.error
     ▼
HTTP Response 4xx/5xx
```

---

## 6. CORS — configuration and rationale

### Question: “How is CORS configured? Why is it needed?”

### 6a. What is CORS?

The browser enforces the **Same-Origin Policy** — a script running on `http://localhost:3001` (frontend) is **not allowed** to call `http://localhost:3000` (backend) unless the backend explicitly allows it through CORS headers.

### 6b. Project configuration

```ts
// backend/src/app.ts:23-27
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || 'http://localhost:3001')
    : '*',
}));
```

| Environment | Allowed Origin | Why |
|---|---|---|
| `production` | `ALLOWED_ORIGIN` env var (for example `https://myapp.com`) | Restrict to known domains |
| `development` / `test` | `*` (all) | Convenient for dev/test |

### 6c. CORS headers set by the backend

```
Access-Control-Allow-Origin: https://myapp.com
```

With default `cors()` middleware, the browser also sees:
```
Access-Control-Allow-Methods: GET, HEAD, PUT, PATCH, POST, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
```

### 6d. CORS does not block server-to-server access

CORS is enforced only by browsers. `curl`, Postman, and backend-to-backend traffic are unaffected. That is why CORS is not a true security boundary by itself.

### 6e. Why use `ALLOWED_ORIGIN` env var?

To avoid hardcoding domains. In deployment, you just set:
```
ALLOWED_ORIGIN=https://prod.myapp.com
```
No code change or rebuild needed.

### 6f. Preflight request (`OPTIONS`)

Browsers automatically send an OPTIONS request before PATCH/POST/DELETE:
```
OPTIONS /api/tasks/123
Origin: http://localhost:3001
Access-Control-Request-Method: PATCH
```

The `cors()` middleware handles this automatically and returns 204, after which the browser sends the real request.

---

## 7. Logging — pino, correlation ID, structured logs

### Question: “How is logging implemented? How do you trace a request?”

### 7a. Structured logging with Pino

Instead of plain `console.log`, the project uses structured JSON logs:

```json
{
  "level": 30,
  "time": "10:32:15.123",
  "reqId": "550e8400-e29b-41d4-a716-446655440000",
  "req": { "method": "PATCH", "url": "/api/tasks/abc", "remoteAddress": "127.0.0.1" },
  "msg": "request received"
}
```

Benefit: easy querying in tools like Datadog, Loki, or CloudWatch.

### 7b. Automatic HTTP request logging

```ts
// backend/src/app.ts:15-20
const httpLogger = pinoHttp({
  genReqId: (req: Request) => req.id,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
    : undefined,
});
```

`pino-http` automatically logs:
- incoming requests: method, url, remoteAddress
- outgoing responses: statusCode, response time

### 7c. Correlation ID (request tracing)

Each request gets a unique UUID so the whole lifecycle can be traced:

```ts
// backend/src/middleware/correlation-id.ts:7-13
export function correlationIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (incoming && UUID_REGEX.test(incoming)) ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
```

Debug flow:
1. Frontend sends request → response includes `X-Request-Id`
2. If an error happens, the user sends that ID to the developer
3. The developer searches logs by `reqId` to find the full request chain

### 7d. Service-level logging

Each service has its own named logger:

```ts
const logger = pino({ name: 'task-service' });
```

Used for non-fatal issues such as Redis failures:

```ts
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
```

### 7e. Unhandled errors — `console.error`

```ts
console.error('Unhandled error:', err);
```

Only used for unexpected 500-level failures.

---

## 8. Real-time Communication — SSE vs WebSocket

### Question: “How is the realtime leaderboard implemented? Why SSE instead of WebSocket?”

### 8a. What is SSE?

SSE is a special HTTP protocol: **one-way** from server → client. The HTTP connection stays open and the server can push data at any time.

### 8b. Server side

```ts
router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = randomUUID();
  sseManager.addClient(clientId, res);

  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  req.on('close', () => { sseManager.removeClient(clientId); });
});
```

### 8c. `SseManager` — in-memory registry

```ts
class SseManager {
  private clients: Map<string, Response> = new Map();

  broadcast(data: unknown): void {
    const payload = `event: score-update\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, res] of this.clients.entries()) {
      if (res.writableEnded || res.destroyed) {
        this.clients.delete(id);
        continue;
      }
      try {
        res.write(payload);
      } catch {
        this.clients.delete(id);
      }
    }
  }
}
```

### 8d. Broadcast trigger

When scores change, the server broadcasts automatically:

```ts
const updatedRankings = await leaderboardService.getRankings();
sseManager.broadcast(updatedRankings);
```

### 8e. Frontend — `EventSource`

```ts
const source = new EventSource('/api/leaderboard/stream');
source.addEventListener('score-update', (e) => {
  setRankings(JSON.parse(e.data));
});
source.onerror = () => { /* show error state */ };
```

### 8f. SSE vs WebSocket — when to use which?

| | SSE | WebSocket |
|---|---|---|
| Direction | Server → Client | Bidirectional |
| Protocol | HTTP/1.1 | WS upgrade |
| Auto reconnect | Yes | Must implement manually |
| Best for | Live feeds, notifications, leaderboards | Chat, games, collaborative editing |
| Proxy/load balancer | Easier | More complex |

**The leaderboard only needs server push** → SSE is simpler and sufficient.

---

## 9. Rate Limiting

### Question: “How is rate limiting implemented?”

```ts
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  skip: (req) => !['POST', 'PATCH', 'DELETE'].includes(req.method),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: '...' }
    });
  },
});
```

Key points:
- Only **write operations** are limited
- Default in-memory store means counters reset on server restart
- For multi-instance production, a Redis-backed store would be needed

---

## 10. Error Handling — typed error hierarchy

### Question: “How are errors handled consistently?”

### 10a. Error class hierarchy

```ts
AppError (base)
  ├── NotFoundError    → 404 NOT_FOUND
  ├── ValidationError  → 400 VALIDATION_ERROR + details array
  └── ConflictError    → 409 + custom code
```

### 10b. Services throw, routes do not catch

Services throw typed errors; Express 5 forwards async errors automatically to `errorHandler`.

### 10c. Global `errorHandler`

It converts:
- `AppError` → structured 4xx JSON
- Prisma `P2002` → 409 duplicate error
- Prisma `P2003` → 409 foreign-key error
- unknown errors → 500 `INTERNAL_ERROR`

### 10d. Consistent error response format

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Task with id abc-123 not found",
    "details": []
  }
}
```

The frontend only needs to inspect `response.error.code`.

---

## 11. Concurrency & Race Condition Prevention

### Question: “What happens if 2 requests try to mark the same task as DONE at the same time?”

### 11a. The problem

```
Request A: READ task { status: IN_PROGRESS }
Request B: READ task { status: IN_PROGRESS }
Request A: UPDATE task SET status=DONE  ✓  → score awarded
Request B: UPDATE task SET status=DONE  ✓  → score awarded AGAIN
```

### 11b. The solution: optimistic locking with `updateMany`

```ts
await prisma.$transaction(async (tx) => {
  const result = await tx.task.updateMany({
    where: {
      id,
      status: existing.status,
    },
    data: updateData,
  });
  if (result.count === 0) {
    throw new ConflictError('CONCURRENT_MODIFICATION', 'Task was modified by a concurrent request. Please refresh and retry.');
  }
  await leaderboardService.scoreTask({ ... }, tx);
});
```

Why it is safe:
- DB executes `WHERE id=X AND status='IN_PROGRESS'` atomically
- Only one request wins the race
- The loser gets 409

### 11c. Scoring inside the same transaction

If `scoreTask` fails, the whole transaction rolls back. That avoids a state where the task is `DONE` but no score exists.

---

## 12. Database Transaction & Atomicity

### Question: “Where are transactions used, and why?”

### Transaction 1: Task update + scoring
- update task status
- insert `score_event`
- update `productivity_score`
- if any step fails → rollback all

### Transaction 2: User deletion
- null out `assigneeId` on DONE tasks
- delete user
- if deletion fails → task updates roll back too

### Transaction 3: Force delete a DONE task
- find related `scoreEvent`
- delete score events
- delete task
- recalculate aggregate score from remaining score events

**Principle:** DB-external side effects such as Redis deletion and SSE broadcast stay **outside** the transaction because they cannot be rolled back.

---

## 13. State Machine — task transitions

### Question: “How are task status transitions enforced?”

### 13a. Valid transitions

```ts
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]:        [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE],
  [TaskStatus.DONE]:        [],
};
```

### 13b. Enforcement in service

The service loads the current status, looks up allowed next states, and throws `INVALID_TRANSITION` if the requested change is not allowed.

### 13c. Why define it in `shared/`?

- **Backend** uses it for enforcement
- **Frontend** uses it for UI affordances only

This keeps a single source of truth.

---

## 14. Security — Helmet, UUID validation

### Question: “What security measures are applied?”

### 14a. Helmet

`helmet()` sets standard HTTP security headers such as CSP, HSTS, frame protection, and MIME sniffing protection.

### 14b. UUID validation on `X-Request-Id`

Only valid UUID v4 values are accepted. This prevents log injection / log poisoning from attacker-controlled header values.

### 14c. CORS restriction in production

Production only allows requests from `ALLOWED_ORIGIN`.

### 14d. Rate limiting

60 write requests per minute per IP helps reduce spam and abuse.

### 14e. Parameterized Prisma queries

Prisma ORM uses parameterized queries, and raw SQL is still written through safe tagged templates.

---

## 15. Scoring System — business logic

### Question: “How is the score calculated? Are there any edge cases?”

### 15a. Formula

```
score = PRIORITY_POINTS[priority] + bonus - penalty
```

Where:
- `LOW = 5`
- `MEDIUM = 10`
- `HIGH = 20`
- early completion adds `+5`
- late completion applies `-3`

### 15b. Date-only comparison (edge case)

The code strips time and compares only the date, so completing on the deadline day counts as on time.

### 15c. Score event immutability

Each completion creates a separate `ScoreEvent`. `ProductivityScore` is only an aggregate built from those events.

### 15d. Can negative scores happen?

In the current constants, no practical case goes below zero because the smallest result is `LOW late = 2`. But the code does not clamp to zero, so future rule changes could allow negatives.

### 15e. Example score table

| Priority | Completion | Score |
|---|---|---|
| HIGH | Early | 20 + 5 = 25 |
| HIGH | On time | 20 + 0 = 20 |
| HIGH | Late | 20 - 3 = 17 |
| LOW | Early | 5 + 5 = 10 |
| LOW | Late | 5 - 3 = 2 |

---

## Quick Reference — Code Locations

| Topic | File | Lines |
|---|---|---|
| Middleware stack order | `backend/src/app.ts` | 22-40 |
| CORS config | `backend/src/app.ts` | 23-27 |
| Correlation ID middleware | `backend/src/middleware/correlation-id.ts` | 7-13 |
| Rate limiter | `backend/src/middleware/rate-limiter.ts` | 5-18 |
| Zod validate middleware | `backend/src/middleware/validation.ts` | 5-20 |
| Global error handler | `backend/src/middleware/error-handler.ts` | 34-74 |
| Error class hierarchy | `backend/src/middleware/error-handler.ts` | 4-32 |
| Task schemas | `backend/src/schemas/task.schemas.ts` | 1-38 |
| User schemas | `backend/src/schemas/user.schemas.ts` | 1-32 |
| N+1 prevention (`include`) | `backend/src/services/task.service.ts` | 107-113 |
| N+1 prevention (raw SQL) | `backend/src/services/task.service.ts` | 37-67 |
| State machine enforcement | `backend/src/services/task.service.ts` | 156-163 |
| Optimistic locking | `backend/src/services/task.service.ts` | 204-214 |
| Scoring transaction | `backend/src/services/task.service.ts` | 204-239 |
| Cache invalidation (task) | `backend/src/services/task.service.ts` | 249-257 |
| Cache invalidation (user) | `backend/src/services/user.service.ts` | 111-117 |
| Cache-aside pattern | `backend/src/services/leaderboard.service.ts` | 94-131 |
| Date-only comparison | `backend/src/services/leaderboard.service.ts` | 30-36 |
| Cache TTL const | `backend/src/services/leaderboard.service.ts` | 10 |
| SSE server setup | `backend/src/routes/leaderboard.routes.ts` | 13-28 |
| SSE manager broadcast | `backend/src/lib/sse-manager.ts` | 14-29 |
| Redis graceful degrade | `backend/src/lib/redis.ts` | 5-8 |
| Valid transitions | `shared/types/task.ts` | 44-48 |
| Scoring constants | `shared/constants/scoring.ts` | 1-10 |
