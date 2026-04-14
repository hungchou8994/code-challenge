# 00 — Project Overview

## What is this project?

**Team Productivity Tracker** is a REST API + web app for managing tasks and calculating productivity scores for each team member. When someone completes a task, the system automatically calculates points based on priority and due date. The leaderboard updates in real time via **Server-Sent Events (SSE)**.

This is a code challenge submission for the **Backend Developer (2 YOE)** position. Evaluation criteria include clean code, feature completeness, performance/scalability, and API design.

---

## Technology stack

| Layer | Technology | Role |
|-----|-----------|---------|
| Backend | Node.js 22 + TypeScript | Runtime |
| HTTP framework | Express 5 | REST API |
| ORM | Prisma 7 + `@prisma/adapter-pg` | Database access |
| Database | PostgreSQL 16 | Data storage |
| Cache | Redis 7 + ioredis | Leaderboard cache |
| Validation | Zod | Runtime schema validation |
| Frontend | Next.js 15 (App Router) | Web UI |
| State mgmt | TanStack React Query | Server state + client-side caching |
| Testing | Vitest + Supertest | Backend unit/integration tests |
| Container | Docker + Docker Compose | Runtime environment |

---

## Monorepo structure

```
problem5/
├── shared/          # Shared types and constants (no separate build)
│   ├── types/       # User, Task, Leaderboard interfaces + enums
│   └── constants/   # PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY
├── backend/         # Express REST API
│   ├── prisma/      # Schema.prisma, migrations, seed
│   └── src/
│       ├── app.ts          # Express app initialization + middleware stack
│       ├── server.ts       # Entry point (dotenv + app.listen)
│       ├── routes/         # HTTP routing (thin layer)
│       ├── services/       # Business logic (fat layer)
│       ├── middleware/     # correlationId, validation, errorHandler, rateLimiter
│       ├── schemas/        # Zod schemas for request body + query
│       ├── lib/            # Singleton clients: prisma, redis, sse-manager
│       └── test/           # Vitest + Supertest tests
└── frontend/        # Next.js 15 App Router
    └── src/
        ├── app/            # Pages: /, /users, /tasks, /leaderboard
        ├── components/     # UI components
        └── lib/
            └── api-client.ts  # Typed HTTP client
```

---

## Typical request flow

```
Browser
  │
  │  HTTP request
  ▼
Express app.ts
  ├── helmet()             — Security headers
  ├── cors()               — CORS policy
  ├── correlationIdMiddleware — Assign X-Request-Id
  ├── pinoHttp()           — Request logging
  ├── express.json()       — Body parsing
  ├── writeLimiter         — Rate limit (POST/PATCH/DELETE)
  │
  ├── /api/health  → healthRouter
  ├── /api/users   → userRouter   → userService   → prisma (PostgreSQL)
  ├── /api/tasks   → taskRouter   → taskService   → prisma + redis + sseManager
  └── /api/leaderboard → leaderboardRouter → leaderboardService → redis + prisma
  │
  └── errorHandler()  — Catches all errors, returns standardized JSON
```

---

## Key concepts to understand

### 1. Layered architecture
- **Routes**: accept requests, validate query params, call services, return responses
- **Services**: all business logic — transactions, scoring, cache invalidation
- **Lib**: singleton clients — no business logic

### 2. Task state machine
```
TODO  →  IN_PROGRESS  →  DONE
                          ↑
                       Terminal (cannot go backward)
```
When transitioning to `DONE`: calculate score + invalidate Redis cache + broadcast SSE.

### 3. Scoring
```
score = PRIORITY_POINTS[priority] + (isEarly ? +5 : 0) - (isLate ? 3 : 0)
```
Comparison is **date-only** (time is ignored). Completing on the due date counts as on time: no bonus, no penalty.

### 4. Cache-aside pattern
```
GET /leaderboard:
  1. Try Redis → if HIT: return immediately
  2. If MISS: query PostgreSQL
  3. Write result to Redis (TTL 60s)
  4. Return
```
If Redis fails, the system falls back to DB and does not crash.

### 5. SSE (Server-Sent Events)
- Client opens a connection to `GET /api/leaderboard/stream`
- Server keeps the connection open and pushes an event whenever a task becomes `DONE` or a user is deleted
- `SseManager` is the in-memory registry of all open connections

### 6. Error hierarchy
```
AppError (base)
├── NotFoundError      → 404 NOT_FOUND
├── ValidationError    → 400 VALIDATION_ERROR
└── ConflictError      → 409 (multiple codes: INVALID_TRANSITION, USER_HAS_TASKS, ...)
```

---

## Documentation reading order

| File | What you learn |
|------|--------|
| `01-backend-core.md` | Express app, middleware stack, routing pattern |
| `02-database.md` | Prisma schema, 4 models, data relationships |
| `03-services.md` | Business logic: user, task, leaderboard services |
| `04-scoring-system.md` | Detailed scoring mechanism |
| `05-realtime.md` | Redis cache + SSE leaderboard |
| `06-frontend.md` | Next.js, React Query, api-client |
| `07-testing.md` | Vitest, mock strategy, test patterns |
| `08-reading-guide.md` | Guided source-code reading order |
