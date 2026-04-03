# System Design: Team Productivity Tracking Leaderboard

## Overview

This document describes the design of the leaderboard subsystem — how scores are calculated, stored, and served — along with the real-time delivery strategy, Redis caching layer, scaling considerations, and anti-cheat measures.

---

## 1. Scoring Rules

Scores are awarded when a task transitions to `DONE`. The rules are:

| Event | Points |
|---|---|
| Complete a LOW priority task | +5 base |
| Complete a MEDIUM priority task | +10 base |
| Complete a HIGH priority task | +20 base |
| Completed before `dueDate` (early) | +5 bonus |
| Completed after `dueDate` (late) | -3 penalty |
| Completed exactly on `dueDate` | no modifier |

**Constraints:**
- A task must be assigned to a user before it can be marked `DONE`. Unassigned tasks cannot earn points.
- Status transitions are strictly forward-only: `TODO → IN_PROGRESS → DONE`. No reversals.
- Once a task is `DONE`, it is a terminal state. Score events are immutable.
- Scores are computed server-side only — clients cannot submit point values.

**Example:** A HIGH priority task completed one day before its due date awards `20 + 5 = 25` points.

---

## 2. Data Model

Four tables handle the full scoring lifecycle:

```
users               -- team members
tasks               -- work items, each with a status and priority
score_events        -- immutable audit log; one row per task completion
productivity_scores -- denormalized cache; one row per user, updated incrementally
```

### Why two scoring tables?

**`score_events`** is an append-only event log. Every task completion creates a row recording the base points, bonus, penalty, and total awarded at that moment. This provides a full audit trail — you can replay history, debug anomalies, or recalculate totals from scratch.

**`productivity_scores`** is a denormalized cache. It holds the running `totalScore` and `tasksCompleted` per user so that the leaderboard can be served with a single `SELECT` rather than aggregating `score_events` every time. It is updated atomically (via `upsert`) on each task completion.

This pattern — event log + materialized cache — is a lightweight version of event sourcing suitable for the scale of this system.

---

## 3. Request Flow: Task Completion

```
PATCH /api/tasks/:id  { status: "DONE" }
         │
         ▼
   Validate transition (TODO→IN_PROGRESS→DONE only)
         │
         ▼
   Check assignee is set (required for DONE)
         │
         ▼
   prisma.task.update(...)            ← update task row
         │
         ▼
   leaderboardService.scoreTask()    ← synchronous, same request
     ├── prisma.scoreEvent.create()  ← append to audit log
     └── prisma.productivityScore.upsert({ totalScore: { increment } })
         │
         ▼
   redisClient.del('leaderboard:rankings')  ← invalidate cache
         │
         ▼
   sseManager.broadcast(updatedRankings)    ← push to all SSE clients
         │
         ▼
   Return updated task (200 OK)
```

Scoring is **synchronous** — it completes within the same HTTP request. This is the simplest correct approach for the current scale. The leaderboard is always consistent immediately after a task is completed; no background jobs, queues, or eventual consistency to reason about.

---

## 4. Leaderboard Query

```
GET /api/leaderboard
```

**Cache-aside flow:**

1. Try `redis.get('leaderboard:rankings')` — on hit, return cached JSON immediately (no DB query).
2. On miss: fetch all users left-joined to `productivity_scores`, sort by `totalScore` descending, assign ranks.
3. Write result to Redis with a 60-second TTL (`redis.set(..., 'EX', 60)`).
4. If Redis is unavailable at any point, fall back transparently to a direct DB query — no error exposed to the client.

Because scores are pre-aggregated in `productivity_scores`, the DB query is an O(n) scan of the user table — fast and predictable.

---

## 5. Real-Time Leaderboard (SSE)

The leaderboard updates in real time using **Server-Sent Events (SSE)**.

### Endpoint

```
GET /api/leaderboard/stream
```

### How it works

```
Browser opens EventSource('/api/leaderboard/stream')
         │
         ▼
   Server sets headers:
     Content-Type: text/event-stream
     Cache-Control: no-cache
     X-Accel-Buffering: no
         │
         ▼
   Server sends initial event with current rankings
         │
         ▼
   Connection stays open indefinitely
         │
   On task DONE (any client):
         ▼
   taskService invalidates Redis cache
         │
         ▼
   sseManager.broadcast(updatedRankings)
         │
         ▼
   All connected clients receive 'score-update' event
         │
         ▼
   Frontend updates leaderboard UI (< 1 second)
```

### Why SSE over WebSocket or polling?

| Approach | Verdict | Reason |
|----------|---------|--------|
| **SSE** | ✅ Chosen | Unidirectional (server → client only), works through HTTP proxies, auto-reconnects via `EventSource`, zero extra packages, simpler server implementation |
| Polling | ❌ | Wastes requests when nothing changes; leaderboard feels delayed |
| WebSocket | ❌ | Bi-directional protocol — overkill for one-way score broadcasts; larger bundle, more complex server state |

### SseManager

`SseManager` is a singleton that maintains a registry of active SSE connections:

- `addClient(id, res)` — registers a response stream with a UUID key
- `removeClient(id)` — cleans up on `close` event (browser tab closed, network drop)
- `broadcast(data)` — writes `event: score-update\ndata: <json>\n\n` to every active stream

### Multi-instance consideration

In a single-instance deployment (current), `SseManager` holds all connections in memory — correct and efficient. In a multi-instance deployment (e.g., behind a load balancer), each instance only holds a subset of connections. Score updates handled by instance A would not reach clients connected to instance B.

**Solution (v2):** Use Redis Pub/Sub. Each instance subscribes to a `leaderboard:updates` channel. When any instance scores a task, it publishes the updated rankings to that channel; all instances receive it and broadcast to their local SSE clients.

---

## 6. Redis Caching Layer

| Aspect | Detail |
|--------|--------|
| Key | `leaderboard:rankings` |
| TTL | 60 seconds |
| Pattern | Cache-aside (read-through on miss) |
| Invalidation | Synchronous `del` after every DONE transition or DONE task deletion |
| Degradation | `try/catch` around every Redis call; falls back to DB on any error |
| Client | ioredis with `lazyConnect: true`, `enableOfflineQueue: false` — errors thrown immediately when Redis is down, no request queuing |

---

## 7. Scaling Considerations

### Bottleneck: Synchronous scoring in the request path

At current scale (tens of users, hundreds of tasks), synchronous scoring adds one `INSERT` and one `UPSERT` to the task update request — negligible latency (~1–2 ms on the same Postgres instance).

At higher scale (thousands of tasks per minute), this becomes a write bottleneck. The fix:

1. Task update writes to `tasks` table and publishes a `task.completed` event (e.g., to a Redis stream or a `task_events` Postgres table).
2. A separate scoring worker consumes events and writes `score_events` + updates `productivity_scores`.
3. The leaderboard becomes eventually consistent (seconds of lag), which is acceptable for a leaderboard use case.

### Bottleneck: Leaderboard re-ranking on every read

The cache-aside layer (60s TTL) already eliminates most repeated DB queries. For further optimization:

- **Database-level sort**: Move sorting into SQL (`ORDER BY total_score DESC`) with an index on `productivity_scores.total_score`.
- **Pagination**: Return top-N results rather than the full list, capping response size regardless of team size.

### Bottleneck: Denormalized score cache can drift

If a bug causes a `score_events` row to be created without the corresponding `productivityScore` upsert (e.g., a crash between the two writes), the cached total diverges from the event log.

Mitigation: wrap both writes in a Postgres transaction (`prisma.$transaction([...])`). A periodic reconciliation job that computes `SUM(totalAwarded)` from `score_events` and compares it to `productivityScore.totalScore` would catch any remaining drift.

### Rate limiting

Write endpoints (`POST`, `PATCH`, `DELETE`) are limited to **60 requests per minute per IP** using an in-memory store. For multi-instance deployments, the store should be backed by Redis (`rate-limit-redis`) so counters are shared across all instances.

---

## 8. Anti-Cheat / Integrity Measures

1. **Immutable transitions**: `DONE` is a terminal state enforced in the API layer. A completed task cannot be un-completed and re-completed to farm points.
2. **Immutable score events**: The `score_events` table is append-only (no `UPDATE` or `DELETE` issued by the application). Any replay attack would require inserting a fake `task.completed` event upstream.
3. **Assignee required for DONE**: Points cannot be credited to a user unless they were assigned to the task at completion time.
4. **Server-side timestamp**: Early/late determination uses the server clock (`new Date()` on the backend), not any client-supplied timestamp.
5. **Server-side score calculation**: Clients submit task status changes only; point values are computed entirely on the backend.
6. **Audit log**: The `score_events` table records every point award. Any anomalous score can be traced back to a specific task and timestamp.
7. **Rate limiting on writes**: Prevents automated scripts from spamming task completions to farm points.

For a production system, additional measures would include:
- Manager approval required before a task can move to `DONE`.
- Detecting statistically anomalous scoring velocity per user.
- Distributed tracing (OpenTelemetry) to correlate score events back to their originating requests.

---

## 9. Observability

| Feature | Implementation |
|---------|----------------|
| Structured logging | `pino-http` — NDJSON in production, pretty-printed in development |
| Correlation IDs | `X-Request-Id` header — echoed from client or generated via `randomUUID()`; included in every log line |
| Health check | `GET /api/health` — always `200`; reports live `database` and `redis` status; `degraded` (not `503`) when a dependency is down |
| Request tracing | Each log line includes `method`, `url`, `statusCode`, `responseTime`, and `reqId` |

---

## 10. Architecture Diagram

```
Browser (Next.js 15)  :3001
    │
    ├── HTTP (fetch / TanStack Query)      → CRUD operations
    │
    └── EventSource /api/leaderboard/stream  → real-time score updates
             │
             ▼
    Express 5 API  :3000
      ├── correlationId middleware          → X-Request-Id on every request
      ├── pino-http middleware              → structured JSON logs
      ├── writeLimiter middleware           → 60 req/min per IP on POST/PATCH/DELETE
      │
      ├── /api/users       → userService      → PostgreSQL (users)
      ├── /api/tasks       → taskService      → PostgreSQL (tasks)
      │                        └── on DONE:
      │                            ├── leaderboardService.scoreTask()
      │                            │     ├── score_events (INSERT)
      │                            │     └── productivity_scores (UPSERT)
      │                            ├── redis.del('leaderboard:rankings')
      │                            └── sseManager.broadcast(updatedRankings)
      ├── /api/leaderboard → leaderboardService
      │                        ├── redis.get('leaderboard:rankings')  ← cache hit
      │                        └── PostgreSQL + redis.set(..., EX 60) ← cache miss
      ├── /api/leaderboard/stream → sseManager.addClient(...)
      └── /api/health      → Promise.allSettled([db.ping, redis.ping])

    Redis 7  :6379
      └── leaderboard:rankings  (JSON string, 60s TTL)

    PostgreSQL 16  :5432
      └── tables: users, tasks, score_events, productivity_scores

    Docker Compose
      ├── db       (postgres:16)
      ├── redis    (redis:7-alpine)  ← backend depends_on: service_healthy
      ├── backend  (Node 22, /backend/Dockerfile)
      └── frontend (Node 22, /frontend/Dockerfile)
```
