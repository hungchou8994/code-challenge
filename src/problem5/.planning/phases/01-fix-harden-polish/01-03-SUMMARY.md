---
phase: 01-fix-harden-polish
plan: 03
subsystem: api
tags: [cors, security, typescript, express, uuid, type-augmentation]

# Dependency graph
requires: []
provides:
  - Express Request.id type augmentation eliminating (req as any).id casts
  - UUID v4 validation on X-Request-Id header (log poisoning protection)
  - CORS restricted to ALLOWED_ORIGIN env var with localhost:3001 fallback
  - ALLOWED_ORIGIN documented in .env.example
affects: [future middleware, routes that read req.id]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Express namespace augmentation via @types/express/index.d.ts for custom Request fields
    - UUID_REGEX validation before trusting externally-supplied correlation IDs
    - Environment-variable-driven CORS with safe development fallback

key-files:
  created:
    - backend/src/@types/express/index.d.ts
  modified:
    - backend/src/middleware/correlation-id.ts
    - backend/src/app.ts
    - backend/src/test/correlation-id.test.ts
    - .env.example

key-decisions:
  - "Express @types augmentation placed at backend/src/@types/express/index.d.ts — picked up automatically by tsconfig include: ['src/**/*']"
  - "UUID_REGEX validates UUID v4 specifically (4[0-9a-f]{3}) — rejects UUID v1/v3/v5 and arbitrary strings to prevent log poisoning"
  - "CORS fallback 'http://localhost:3001' matches docker-compose.yml frontend port — dev works with zero config"

patterns-established:
  - "Type augmentation pattern: custom Express Request fields go in backend/src/@types/express/index.d.ts, not inline casts"
  - "Security validation pattern: never trust externally-supplied header values without format validation"

requirements-completed:
  - DEBT-03
  - SEC-01
  - SEC-02

# Metrics
duration: 15min
completed: 2026-04-07
---

# Phase 01 Plan 03: Security Hardening & Type Cleanup Summary

**UUID v4 validation on X-Request-Id (log poisoning protection), CORS restricted to ALLOWED_ORIGIN, and typed Express Request.id augmentation eliminating all `(req as any)` casts**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-07T05:04:00Z
- **Completed:** 2026-04-07T05:20:00Z
- **Tasks:** 2
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Created `backend/src/@types/express/index.d.ts` with `namespace Express { interface Request { id: string } }` — `req.id` is now fully typed everywhere
- `correlation-id.ts` now validates incoming `X-Request-Id` headers against UUID v4 regex before accepting them; non-UUID values get a fresh generated UUID, preventing log poisoning
- `app.ts` CORS changed from wildcard `cors()` to `cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3001' })` — browser-enforced same-origin policy now applies
- `genReqId: (req: any)` cast removed from `pinoHttp` config; uses typed `(req: Request)` via augmentation
- `.env.example` updated with `ALLOWED_ORIGIN=http://localhost:3001`

## Task Commits

Each task was committed atomically:

1. **Task 1: Express type augmentation + UUID validation** - `a998902` (feat)
2. **Task 2: CORS restricted to ALLOWED_ORIGIN** - `d1ca92a` (feat)
3. **Deviation fix: updated correlation-id tests** - `ea39fce` (fix — Rule 1)

**Plan metadata:** _(docs commit — created after summary)_

## Files Created/Modified
- `backend/src/@types/express/index.d.ts` — Express namespace augmentation, adds `id: string` to Request
- `backend/src/middleware/correlation-id.ts` — Added UUID_REGEX, validates incoming header, typed assignment to `req.id`
- `backend/src/app.ts` — Typed `genReqId`, restricted CORS to `ALLOWED_ORIGIN`
- `backend/src/test/correlation-id.test.ts` — Updated tests to match UUID validation behavior; added test for rejection of non-UUID headers
- `.env.example` — Added `ALLOWED_ORIGIN=http://localhost:3001`

## Decisions Made
- Express `@types` augmentation at `backend/src/@types/express/index.d.ts` — picked up automatically by tsconfig `include: ["src/**/*"]`, no tsconfig change needed
- UUID_REGEX validates UUID v4 specifically — rejects v1/v3/v5 and arbitrary strings, preventing log poisoning with crafted request IDs
- CORS fallback `'http://localhost:3001'` matches docker-compose.yml frontend port — dev works without setting any env vars

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated correlation-id tests to reflect new UUID validation behavior**
- **Found during:** Post-task test run (after Task 2)
- **Issue:** Two existing tests sent non-UUID strings as `X-Request-Id` and expected them to be echoed verbatim — behavior that no longer holds after SEC-01 fix. Tests failed with `expected 'generated-uuid' to be 'my-custom-id'`
- **Fix:** Updated test 1 to use a valid UUID v4 as the input (so echo test still verifies passthrough). Replaced test 3 (echo test) with a new test asserting non-UUID values are _rejected_ and replaced with a fresh UUID — directly documenting the SEC-01 security property
- **Files modified:** `backend/src/test/correlation-id.test.ts`
- **Verification:** `npm test` → 6 test files, 66 tests, all passed
- **Committed in:** `ea39fce`

---

**Total deviations:** 1 auto-fixed (Rule 1 — test alignment with new security behavior)
**Impact on plan:** Essential — tests must describe actual behavior. The fix also adds explicit coverage of the SEC-01 rejection property which was previously untested.

## Issues Encountered
- PowerShell execution policy blocks `npx`/`npm` script shims. Used `cmd /c "npm test"` and `node ../node_modules/typescript/bin/tsc` directly as workarounds — no impact on build or test results.

## User Setup Required
None - no external service configuration required. `ALLOWED_ORIGIN` defaults to `http://localhost:3001` matching docker-compose, so no env change needed for development.

## Next Phase Readiness
- Express type safety cleaned up — no more `any` casts for `req.id`
- CORS hardened for production deployments
- All 66 backend tests passing
- Ready for Plan 04 and Plan 05

---
*Phase: 01-fix-harden-polish*
*Completed: 2026-04-07*
