# Requirements: Productivity Tracker

**Defined:** 2026-04-07
**Core Value:** A reliable, well-architected task tracker where every completed task always awards the correct score, with no data inconsistency.

## v1 Requirements

### Bug Fixes — Correctness

- [x] **BUG-01**: Priority sort returns correctly ordered results across ALL pages (not just page 1) — fix DB-level ordering to use semantic priority (HIGH > MEDIUM > LOW), remove broken in-memory re-sort
- [x] **BUG-02**: Completing a task atomically awards the score — `scoreTask()` writes must be inside the same `prisma.$transaction` as the status `updateMany` so DONE and score are never split
- [x] **BUG-03**: Due date submission respects the user's local timezone — task form must not hardcode `T23:59:59.000Z` UTC; use local midnight or end-of-day in the browser's timezone

### Tech Debt — Architecture

- [x] **DEBT-01**: `VALID_TRANSITIONS` defined in exactly one place — remove the duplicate in `task.service.ts`, import from `shared/types/task.ts`
- [x] **DEBT-02**: Service layer uses typed Prisma input types — replace all `any` typings in `task.service.ts` and `user.service.ts` with `Prisma.TaskWhereInput`, `Prisma.TaskOrderByWithRelationInput`, `Prisma.TaskUpdateInput`, etc.
- [x] **DEBT-03**: Express `Request` type augmented for correlation ID — module-augment the Express namespace instead of `(req as any).id`
- [x] **DEBT-04**: Redis cache invalidation failures are logged — replace all empty `catch {}` blocks with structured Pino logger calls

### Security — Hardening

- [x] **SEC-01**: `X-Request-Id` header validated as UUID before use — reject or ignore values that are not valid UUID format to prevent log poisoning
- [x] **SEC-02**: CORS restricted to configured allowed origin — replace `cors()` wildcard with `cors({ origin: process.env.ALLOWED_ORIGIN })`

### Performance — Scalability

- [ ] **PERF-01**: Users dropdown no longer hardcodes `limit=1000` — add `/api/users/search?q=` typeahead endpoint; update frontend dropdowns to use it

### API Design — Polish

- [x] **API-01**: Leaderboard SSE error surfaces a visible error state in the UI — `es.onerror` must render an error message, not leave the leaderboard silently empty
- [x] **API-02**: `prisma generate` added as a `postinstall`/`prebuild` script — prevents CI failures from missing generated client

### Test Coverage — Reliability

- [ ] **TEST-01**: Priority sort correctness covered by test — add backend test asserting correct cross-page ordering when `sortBy=priority`
- [ ] **TEST-02**: Scoring atomicity tested — add test covering the scenario where `scoreTask` would fail after `updateMany` succeeds, verifying the whole operation rolls back
- [ ] **TEST-03**: Pagination edge cases covered — add tests for `sortBy=date`, `sortBy=assignee`, and boundary page numbers

## v2 Requirements

### Authentication

- **AUTH-01**: API endpoints protected with JWT authentication
- **AUTH-02**: Users can only modify their own tasks
- **AUTH-03**: Force-delete requires elevated role

### Scalability

- **SCALE-01**: SSE fanout via Redis pub/sub for multi-process deployments
- **SCALE-02**: Leaderboard materialized view updated via background job (not per-request table scan)
- **SCALE-03**: Database query timeout configuration on Prisma/PG adapter

### Frontend Testing

- **FE-TEST-01**: Frontend unit tests for TaskForm, UserForm, LeaderboardPage
- **FE-TEST-02**: Frontend integration tests (React Testing Library + MSW)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New task/user features | Challenge asks to fix and polish existing, not extend scope |
| Recurring tasks | Requires scheduler infrastructure, out of challenge scope |
| Notifications | Out of challenge scope |
| Mobile app | Web-first only |
| Full auth system | Explicitly excluded per challenge context (internal/trusted service) |
| Real-time multi-process SSE | Horizontal scaling is a v2 concern; single-process correctness is v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | Phase 1 | Complete |
| BUG-02 | Phase 1 | Complete |
| BUG-03 | Phase 1 | Complete |
| DEBT-01 | Phase 1 | Complete |
| DEBT-02 | Phase 1 | Complete |
| DEBT-03 | Phase 1 | Complete |
| DEBT-04 | Phase 1 | Complete |
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| PERF-01 | Phase 1 | Pending |
| API-01 | Phase 1 | Complete |
| API-02 | Phase 1 | Complete |
| TEST-01 | Phase 1 | Pending |
| TEST-02 | Phase 1 | Pending |
| TEST-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 after roadmap creation — all 15 v1 requirements confirmed mapped to Phase 1*
