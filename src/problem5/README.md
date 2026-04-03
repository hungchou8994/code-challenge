# Team Productivity Tracker

A fullstack team productivity tracking application. Teams manage users and tasks; completing tasks earns points based on priority and timeliness. A leaderboard ranks members by their total score in real time via Server-Sent Events.

**Stack:** Express 5 + TypeScript · Next.js 15 · PostgreSQL 16 · Redis 7 · Prisma 7 · shadcn/ui · TanStack Query

---

## Quick Start (Docker — recommended)

> Requirements: [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
docker compose up --build
```

That's it. Docker will:
1. Start a PostgreSQL 16 database
2. Start a Redis 7 cache (backend waits for it to be healthy)
3. Build and start the backend (runs migrations + seed automatically on first boot)
4. Build and start the frontend

| Service      | URL                              |
|--------------|----------------------------------|
| Frontend     | http://localhost:3001            |
| Backend API  | http://localhost:3000            |
| Health check | http://localhost:3000/api/health |
| SSE stream   | http://localhost:3000/api/leaderboard/stream |

To stop:
```bash
docker compose down
```

To stop and delete the database volume (full reset):
```bash
docker compose down -v
```

---

## Local Development (without Docker)

### Requirements

- Node.js 20.19+ (or 22+)
- PostgreSQL 16 running locally (or via Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`)
- Redis 7 running locally (or via Docker: `docker run -d -p 6379:6379 redis:7-alpine`)

### Setup

```bash
# 1. Install all dependencies
npm install

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env if your DB/Redis connection differs

# 3. Run database migrations
npm run db:migrate -w backend

# 4. Start both backend and frontend
npm run dev
```

| Service     | URL                             |
|-------------|---------------------------------|
| Frontend    | http://localhost:3000 (Next.js) |
| Backend API | http://localhost:3001           |

### Running services individually

```bash
# Backend only
npm run dev:backend

# Frontend only
cd frontend && npm run dev
```

---

## Running Tests

Backend API tests use Vitest + Supertest with a mocked Prisma client and mocked Redis (no live services required).

```bash
# From repo root
npm run test -w backend

# Or from the backend directory
cd backend && npm test
```

Expected output: **57 tests passing** across 4 test files:

| File | Tests | Coverage |
|------|-------|---------|
| `users.test.ts` | 13 | CRUD, validation, conflict |
| `tasks.test.ts` | 28 | Status transitions, scoring, cache invalidation |
| `leaderboard.test.ts` | 8 | Rankings, health check, cache hit/miss/degradation |
| `sse.test.ts` | 8 | SseManager addClient / removeClient / broadcast |

---

## Project Structure

```
problem5/
├── docker-compose.yml
├── package.json                   # Monorepo root (npm workspaces)
├── tsconfig.base.json
├── shared/                        # Shared TypeScript types and constants
│   ├── types/                     # User, Task, Leaderboard interfaces
│   └── constants/                 # Scoring constants (PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY)
├── backend/                       # Express 5 API
│   ├── Dockerfile
│   ├── prisma/
│   │   └── schema.prisma          # DB schema (users, tasks, score_events, productivity_scores)
│   └── src/
│       ├── app.ts                 # Express app setup (pino-http, correlation ID, rate limiter)
│       ├── server.ts              # Entry point (connects Redis, starts HTTP server)
│       ├── lib/
│       │   ├── prisma.ts          # Prisma client singleton
│       │   ├── redis.ts           # ioredis client singleton (lazyConnect, graceful degradation)
│       │   └── sse-manager.ts     # SSE connection registry (addClient, removeClient, broadcast)
│       ├── routes/                # user, task, leaderboard (+ /stream SSE endpoint), health
│       ├── services/              # taskService (scoring + cache invalidation + SSE broadcast)
│       │                          # leaderboardService (cache-aside pattern, 60s TTL)
│       ├── schemas/               # Zod validation schemas
│       ├── middleware/
│       │   ├── correlation-id.ts  # X-Request-Id header (read or generate UUID)
│       │   ├── rate-limiter.ts    # Write-method rate limit (60 req/min per IP, 429 on breach)
│       │   ├── error-handler.ts   # Centralised error → { error: { code, message } }
│       │   └── validation.ts      # Zod request validation middleware
│       └── test/                  # Vitest + Supertest test files
└── frontend/                      # Next.js 15 App Router
    ├── Dockerfile
    └── src/
        ├── app/                   # Pages: / (dashboard), /users, /tasks, /leaderboard
        ├── components/            # UI components (forms, tables, badges, nav)
        └── lib/
            └── api-client.ts      # Typed API client
```

---

## API Reference

Base URL: `http://localhost:3000`

All write endpoints (`POST`, `PATCH`, `DELETE`) are rate-limited to **60 requests per minute per IP**. Exceeding returns `429` with a standard error body.

Every response includes an `X-Request-Id` header for request tracing.

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/:id` | Get user by ID |
| `POST` | `/api/users` | Create user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks` | List tasks (filter: `?status=TODO&assigneeId=<uuid>`) |
| `GET` | `/api/tasks/:id` | Get task by ID |
| `POST` | `/api/tasks` | Create task |
| `PATCH` | `/api/tasks/:id` | Update task (including status transition) |
| `DELETE` | `/api/tasks/:id` | Delete task |

### Leaderboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/leaderboard` | Get ranked leaderboard (Redis cache-aside, 60s TTL) |
| `GET` | `/api/leaderboard/stream` | SSE stream — pushes `score-update` events on task completion |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Extended health check — always `200`; reports `db` + `redis` status |

#### Health response shape

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "uptime": 42.3
}
```

`status` is `"degraded"` (never `503`) when either dependency is unhealthy.

---

## Scoring Rules

Points are awarded when a task transitions to `DONE`.

| Priority | Base Points |
|----------|-------------|
| LOW      | 5           |
| MEDIUM   | 10          |
| HIGH     | 20          |

| Modifier | Points |
|----------|--------|
| Completed before due date | +5 |
| Completed after due date  | -3 |

**Constraints:**
- Status transitions are forward-only: `TODO → IN_PROGRESS → DONE`
- A task must be assigned to a user before it can be marked `DONE`
- `DONE` is a terminal state — no reversals
- Scores are calculated server-side only; clients cannot submit score values

---

## Design Notes

See [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for a detailed writeup covering the scoring data model, Redis cache-aside strategy, SSE real-time architecture, scaling considerations, and anti-cheat measures.
