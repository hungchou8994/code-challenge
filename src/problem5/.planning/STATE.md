---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 01-fix-harden-polish-05-PLAN.md
last_updated: "2026-04-07T05:15:13.096Z"
last_activity: 2026-04-07 — Roadmap created; all 15 v1 requirements mapped to Phase 1
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** A reliable, well-architected task tracker where every completed task always awards the correct score, with no data inconsistency
**Current focus:** Phase 1 — Fix, Harden & Polish

## Current Position

Phase: 1 of 1 (Fix, Harden & Polish)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-04-07 — Roadmap created; all 15 v1 requirements mapped to Phase 1

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Fix, Harden & Polish | 0/? | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 01-fix-harden-polish P01 | 12 | 3 tasks | 3 files |
| Phase 01-fix-harden-polish P02 | 35 | 2 tasks | 4 files |
| Phase 01-fix-harden-polish P03 | 15 | 2 tasks | 5 files |
| Phase 01-fix-harden-polish P04 | 15 | 2 tasks | 5 files |
| Phase 01-fix-harden-polish P05 | 8 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Fix bugs first, then refactor, then polish — correctness before code quality
- [Phase 1]: Keep `VALID_TRANSITIONS` in shared package; remove duplicate from `task.service.ts`
- [Phase 1]: Use `prisma.$transaction` to wrap `updateMany` + `scoreTask` writes for atomicity
- [Phase 1]: Use Prisma raw SQL `CASE WHEN` for semantic priority ordering
- [Phase 1]: Log Redis errors with Pino logger (not console.error)
- [Phase 1]: Add `/api/users/search?q=` typeahead endpoint to replace `limit=1000` dropdown calls
- [Phase 01-fix-harden-polish]: Frontend-only fix for BUG-03: remove Z suffix from dueDate string so browser Date() interprets as local time before UTC conversion
- [Phase 01-fix-harden-polish]: SSE error state uses inline message on leaderboard page — persistent visibility preferred over toast for connection errors
- [Phase 01-fix-harden-polish]: postinstall hook in backend/package.json auto-generates Prisma client on npm install
- [Phase 01-fix-harden-polish]: BUG-01: Raw SQL CASE WHEN for priority sort — Prisma findMany orderBy does not support raw SQL expressions
- [Phase 01-fix-harden-polish]: BUG-02: scoreTask(task, tx?) accepts optional tx param so task.service can pass its outer transaction for atomic scoring
- [Phase 01-fix-harden-polish]: Express @types augmentation at backend/src/@types/express/index.d.ts picked up by tsconfig src/**/* glob — no tsconfig change needed
- [Phase 01-fix-harden-polish]: UUID_REGEX validates UUID v4 specifically on X-Request-Id — rejects non-UUID values to prevent log poisoning (SEC-01)
- [Phase 01-fix-harden-polish]: CORS fallback 'http://localhost:3001' matches docker-compose frontend port — dev works without ALLOWED_ORIGIN env var (SEC-02)
- [Phase 01-fix-harden-polish]: PERF-01: /api/users/search endpoint returns slim {id,name,email} subset with fixed take:20; /search route placed before /:id to prevent Express routing conflict
- [Phase 01-fix-harden-polish]: TEST-01 mocks prisma.\ not findMany because sortBy=priority uses raw SQL CASE WHEN via "
- [Phase 01-fix-harden-polish]: Added \ to Prisma mock in setup.ts — essential for any test covering the raw-SQL priority sort code path

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Frontend has zero tests — TEST-01/02/03 cover backend only; frontend tests are v2 scope
- [Phase 1]: CI pipeline depends on `prisma generate` running (API-02 addresses this)

## Session Continuity

Last session: 2026-04-07T05:15:13.093Z
Stopped at: Completed 01-fix-harden-polish-05-PLAN.md
Resume file: None
