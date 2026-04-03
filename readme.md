# 99Tech Code Challenge #1

This repository contains solutions for three problems from the 99Tech Code Challenge. Each solution lives under `src/problem{N}/`.

---

## Repository Structure

```
src/
├── problem4/   # Algorithm — Sum to N (three approaches)
├── problem5/   # Fullstack App — Team Productivity Tracker
└── problem6/   # API Specification — Scoreboard Module
```

---

## Problem 4 — Sum to N

**Location:** `src/problem4/`

Three distinct implementations of a function that computes the sum of all integers from `1` to `n`.

| Implementation | Function | Complexity |
|---|---|---|
| Iterative | `sum_to_n_a(n)` | O(n) time, O(1) space |
| Mathematical formula | `sum_to_n_b(n)` | O(1) time, O(1) space |
| Recursive | `sum_to_n_c(n)` | O(n) time, O(n) space |

**Files:**
- `sum.ts` — TypeScript source with all three implementations
- `sum.js` — Compiled JavaScript output
- `explain.md` — Detailed explanation and complexity analysis for each approach

**Run:**
```bash
node src/problem4/sum.js
```

---

## Problem 5 — Team Productivity Tracker

**Location:** `src/problem5/`

A fullstack application for tracking team task completion with a live scoring leaderboard.

**Stack:**
- **Backend:** Express 5, TypeScript, Prisma 7, PostgreSQL 16, Redis 7, Zod
- **Frontend:** Next.js 15 (App Router), React 19, TanStack Query 5, shadcn/ui, Tailwind CSS v4
- **Infrastructure:** Docker Compose (4 services)
- **Testing:** Vitest + Supertest (57 tests)

**Key Features:**
- Full CRUD for Users and Tasks
- Forward-only task status transitions: `TODO → IN_PROGRESS → DONE`
- Scoring system: LOW = 5 pts, MEDIUM = 10 pts, HIGH = 20 pts, with early completion bonus (+5) and late penalty (-3)
- Redis cache-aside leaderboard with 60s TTL
- Real-time leaderboard updates via Server-Sent Events (SSE)
- Rate limiting, correlation IDs, structured JSON logging

**Services:**

| Service | URL |
|---|---|
| Frontend | http://localhost:3001 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/api/health |
| SSE stream | http://localhost:3000/api/leaderboard/stream |

**Quick Start (Docker):**
```bash
cd src/problem5
docker compose up --build
```

**Local Development:**
```bash
cd src/problem5
cp .env.example backend/.env   # configure DATABASE_URL, REDIS_URL
npm install
npm run dev
```

**Run Tests:**
```bash
cd src/problem5
npm run test -w backend
```

See `src/problem5/README.md` for the full API reference and `src/problem5/SYSTEM_DESIGN.md` for architecture details.

---

## Problem 6 — Scoreboard API Module Specification

**Location:** `src/problem6/`

A documentation-first backend API specification for a live scoreboard module, intended as an implementation contract for a backend engineering team.

**Recommended Stack (from spec):** Node.js 24 LTS, Fastify 5, TypeScript 5.9, PostgreSQL 17, Redis 8, JWT (HS256)

**Endpoints Specified:**

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/scores` | POST | JWT Bearer | Submit a score increment |
| `/leaderboard` | GET | Public | Get current top-10 rankings |
| `/leaderboard/stream` | GET | Public (Origin-checked) | SSE stream of live top-10 updates |

**Key Design Decisions:**
- Score deltas are resolved server-side — the client never supplies a raw numeric score
- Atomic nonce check-and-store for replay attack prevention
- Per-user rate limiting and per-IP controls
- Uniform error contract: `{ error, code }` with 6 named error codes
- Real-time fan-out via Redis Pub/Sub for horizontal scaling

**Files:**
- `README.md` — Full specification (authoritative implementation contract)
- `docs/endpoints.md` — Endpoint specs
- `docs/security-model.md` — Security model and error contract
- `docs/sse-endpoint.md` — SSE endpoint spec

This problem contains documentation only — no executable code.

---

## Requirements

| Problem | Requirements |
|---|---|
| Problem 4 | Node.js (any modern version) |
| Problem 5 | Node.js 20.19+ or 22+, Docker & Docker Compose |
| Problem 6 | No runtime — documentation only |
