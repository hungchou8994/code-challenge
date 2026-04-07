---
phase: 01-fix-harden-polish
plan: 02
subsystem: api
tags: [prisma, postgresql, redis, pino, typescript, transactions, raw-sql]

# Dependency graph
requires:
  - phase: 01-fix-harden-polish
    provides: Plan 01 baseline (SSE, health, prisma generate)

provides:
  - Priority sort via DB-level CASE WHEN SQL (BUG-01 fixed, cross-page sort correct)
  - Atomic task scoring — updateMany + scoreTask in one prisma.$transaction (BUG-02 fixed)
  - VALID_TRANSITIONS defined once in shared/types/task.ts (DEBT-01 resolved)
  - Typed Prisma inputs in task.service and user.service — no `any` (DEBT-02 resolved)
  - Redis cache invalidation failures logged with pino in all three services (DEBT-04 resolved)

affects: [01-fix-harden-polish-03, 01-fix-harden-polish-04, any plan touching task scoring or sort]

# Tech tracking
tech-stack:
  added: [pino (standalone logger in service layer), Prisma.$queryRaw + Prisma.sql + Prisma.join + Prisma.raw]
  patterns:
    - "Service-layer pino logger: import pino from 'pino'; const logger = pino({ name: 'service-name' })"
    - "Atomic scoring: scoreTask(task, tx) accepts optional tx for composition inside outer transaction"
    - "Raw SQL priority sort: prisma.$queryRaw with CASE WHEN + LEFT JOIN for assignee data"
    - "Transaction-first status transitions: updateMany + scoreTask inside prisma.$transaction, side effects outside"

key-files:
  created: []
  modified:
    - backend/src/services/task.service.ts
    - backend/src/services/leaderboard.service.ts
    - backend/src/services/user.service.ts
    - backend/src/test/tasks.test.ts

key-decisions:
  - "BUG-01: Used prisma.$queryRaw with CASE WHEN + LEFT JOIN instead of findMany for priority sort — Prisma findMany orderBy does not support raw SQL expressions"
  - "BUG-02: scoreTask signature extended with optional tx parameter (backward compatible) so task.service can pass its outer transaction; leaderboard.service falls back to its own prisma.$transaction when tx is absent"
  - "DEBT-04: Used import pino from 'pino' directly in each service (pino is a transitive dep of pino-http); no shared logger module created — deferred to future refactor if needed"
  - "Test fix: Added mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma)) to transition tests where the transaction callback must run"

patterns-established:
  - "Service logger pattern: each service creates its own pino instance with { name: 'service-name' }"
  - "Atomic transaction composition: outer service calls scoreTask(task, tx) with tx param so scoring is part of the same DB transaction as the status update"
  - "Raw SQL only for sort — all WHERE conditions use Prisma.sql parameterized templates; only sort direction uses Prisma.raw (validated to 'ASC'/'DESC' only)"

requirements-completed: [BUG-01, BUG-02, DEBT-01, DEBT-02, DEBT-04]

# Metrics
duration: ~35min
completed: 2026-04-07
---

# Phase 01 Plan 02: Fix Critical Bugs + Tech Debt in Service Layer Summary

**Priority sort now uses DB-level CASE WHEN SQL across all pages; task completion atomically scores via a single prisma.$transaction wrapping updateMany + scoreTask(task, tx)**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-07T04:45:00Z
- **Completed:** 2026-04-07T05:10:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Fixed BUG-01: `GET /api/tasks?sortBy=priority` now returns HIGH > MEDIUM > LOW on every page via raw SQL CASE WHEN — the prior in-memory sort only worked on the first page
- Fixed BUG-02: `PATCH /api/tasks/:id` → DONE transition now atomically updates task status and scores in one `prisma.$transaction`; a DONE task with no ScoreEvent is impossible
- Cleared DEBT-01/02/04: VALID_TRANSITIONS imported from shared, `any` types replaced with Prisma input types, all three services now log Redis failures with pino

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix scoring atomicity + VALID_TRANSITIONS + any types in leaderboard.service.ts** - `17230e1` (feat)
2. **Task 2: Fix priority sort + scoring atomicity + DEBT-01/02/04 in task.service.ts and user.service.ts** - `3a2504d` (feat)

**Plan metadata:** _(docs commit — see state updates below)_

## Files Created/Modified
- `backend/src/services/leaderboard.service.ts` - Added `tx?` param to `scoreTask`; replaced empty `catch {}` with `logger.warn`; added pino logger
- `backend/src/services/task.service.ts` - BUG-01 (raw SQL priority sort), BUG-02 (prisma.$transaction wrapping), DEBT-01 (import VALID_TRANSITIONS from shared), DEBT-02 (Prisma typed inputs), DEBT-04 (pino logger + logged catch blocks)
- `backend/src/services/user.service.ts` - DEBT-02 (Prisma.UserWhereInput), DEBT-04 (pino logger + logged catch blocks)
- `backend/src/test/tasks.test.ts` - Added `$transaction` mock to 3 transition tests to eliminate mock queue bleed-over caused by new transaction-wrapping

## Decisions Made
- **Prisma.$queryRaw for priority sort:** `findMany` orderBy does not accept raw SQL expressions; used `prisma.$queryRaw` with a `LEFT JOIN "User"` to include assignee data in one query instead of N+1 enrichment.
- **scoreTask tx composition pattern:** Extended signature to `scoreTask(task, tx?)`. When `tx` provided: uses it directly. When absent: wraps in own `prisma.$transaction`. This is backward-compatible and allows the outer task.service transaction to include scoring atomically.
- **Inline pino logger per service:** No shared logger module — each service creates `pino({ name: 'service-name' })`. Deferred logger module extraction to avoid scope creep.
- **Test fix approach:** Added `mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma))` to tests that exercise the new transaction path. This was required because `vi.clearAllMocks()` resets call counts but does NOT clear `mockResolvedValueOnce` queues, causing mock bleed-over between tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock queue bleed-over from transaction wrapping**
- **Found during:** Task 2 (task.service.ts refactoring)
- **Issue:** After wrapping status transitions in `prisma.$transaction`, 3 existing tests failed because they did not mock `$transaction`. Without the mock, the callback never ran — `updateMany` was never called, `updated` stayed null, and unmatched `mockResolvedValueOnce` entries bled into subsequent tests' mock queues.
- **Fix:** Added `mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma))` to the 3 affected tests (TODO→IN_PROGRESS transition, TODO→DONE invalid transition, concurrent modification).
- **Files modified:** `backend/src/test/tasks.test.ts`
- **Verification:** All 66 tests pass after fix.
- **Committed in:** `3a2504d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Necessary correctness fix for test suite. The plan's transaction refactoring required the test mocks to be updated accordingly. No scope creep.

## Issues Encountered
- Prisma `import type { Prisma }` cannot be used for `Prisma.sql`, `Prisma.raw`, `Prisma.join` (namespace values, not just types). Had to switch to `import { Prisma }` (value import). TypeScript correctly caught this.
- The Prisma-generated client is at `backend/src/generated/prisma/client/client.js` (not `index.js`). Import path confirmed from prior plan context.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three service files are now type-safe and have proper error logging
- Task scoring is atomic — safe foundation for any scoring-related features
- Priority sort is correct at the DB level — pagination works correctly
- 66/66 tests pass — ready for Plan 03

---
*Phase: 01-fix-harden-polish*
*Completed: 2026-04-07*
