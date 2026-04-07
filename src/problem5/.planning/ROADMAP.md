# Roadmap: Productivity Tracker

## Overview

A single-phase fix-and-polish pass on an existing REST API + Next.js task tracker. The phase corrects three critical bugs (broken priority sort, scoring atomicity gap, timezone off-by-one), eliminates identified tech debt (duplicate constants, `any` types, unsafe `req` casting, silent Redis errors), hardens security (CORS, request-ID validation), improves scalability (typeahead endpoint replacing `limit=1000`), polishes the API surface (SSE error UI, CI-safe `prisma generate` script), and extends the backend test suite to cover the repaired logic. When complete, every task completion reliably awards the correct score with no data inconsistency.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Fix, Harden & Polish** - Correct all bugs, clear tech debt, harden security, and extend test coverage across the existing codebase (completed 2026-04-07)

## Phase Details

### Phase 1: Fix, Harden & Polish
**Goal**: The codebase is correct, type-safe, observable, and secure — every task completion atomically awards the right score, priority sorting is correct across all pages, the API surface is hardened against misuse, and the test suite covers all repaired logic
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, BUG-03, DEBT-01, DEBT-02, DEBT-03, DEBT-04, SEC-01, SEC-02, PERF-01, API-01, API-02, TEST-01, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Requesting `GET /api/tasks?sortBy=priority&page=2` returns tasks correctly ranked by HIGH > MEDIUM > LOW relative to all other pages — no lexicographic mis-ordering
  2. Completing a task (PATCH status → DONE) either atomically awards the correct score or rolls back entirely — a task marked DONE always has a matching score event, never zero
  3. A due date entered in the task form is stored with the user's local timezone offset, so UTC+ users see the same calendar day in the UI after submission
  4. Redis cache invalidation failures produce a structured Pino log entry rather than disappearing silently, and CORS rejects requests from origins not in `ALLOWED_ORIGIN`
  5. Backend tests pass for priority sort correctness, scoring atomicity rollback, and pagination edge cases; `prisma generate` runs automatically on install/build so CI never fails with a missing-client error
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Frontend fixes: BUG-03 timezone, API-01 SSE error UI, API-02 postinstall
- [x] 01-02-PLAN.md — Backend service fixes: BUG-01 priority sort, BUG-02 atomicity, DEBT-01/02/04
- [x] 01-03-PLAN.md — Security and typing: SEC-01 UUID validation, SEC-02 CORS, DEBT-03 Express augmentation
- [x] 01-04-PLAN.md — Typeahead endpoint and frontend migration: PERF-01
- [x] 01-05-PLAN.md — Test coverage: TEST-01 priority sort, TEST-02 atomicity rollback, TEST-03 pagination

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fix, Harden & Polish | 5/5 | Complete   | 2026-04-07 |
