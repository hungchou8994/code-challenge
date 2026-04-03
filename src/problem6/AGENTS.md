# Agents Guide

## Project

**Live Scoreboard Backend Module**

This repo is currently planning the backend API module that accepts authorized score events, updates persistent user scores, and keeps the website's top-10 scoreboard live. The current deliverable is an implementation-ready specification package for backend engineers, not shipped product code.

**Core Value:** The system must only accept legitimate score increases and propagate the resulting top-10 scoreboard changes to clients quickly enough to feel live.

## Constraints

- Backend API service scope only
- Real-time scoreboard updates are required
- Score mutations must be authorization-backed
- The visible read model only needs the top 10 users
- Deliverables must include implementation documentation, a flow diagram, and improvement notes

## Working Context

- Project context: `.planning/PROJECT.md`
- Requirements: `.planning/REQUIREMENTS.md`
- Research: `.planning/research/`
- Execution roadmap: `.planning/ROADMAP.md`
- State and current focus: `.planning/STATE.md`

## Recommended Technical Direction

- PostgreSQL is the source of truth for score events and user totals
- Redis holds the top-10 projection and live-delivery cache
- SSE is the default browser push transport for live scoreboard updates
- Score writes use trusted callers or signed grants plus idempotent processing
- Fan-out should occur from committed state, not inline dual writes

## Workflow

Before making material changes, start from the current GSD artifact state:

1. Read `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md`.
2. Continue work from the active phase in `.planning/STATE.md`.
3. Keep requirement-to-phase traceability current when scope changes.
4. Preserve the backend-module scope; do not drift into unrelated frontend or product work.

## Next Step

Current next command: `$gsd-plan-phase 1`
