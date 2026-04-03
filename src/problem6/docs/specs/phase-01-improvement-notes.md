# Phase 01 Improvement Notes

These notes help backend engineers carry the Phase 1 boundary forward without blurring it into later persistence, projection, or live-delivery work.

## Decide during implementation

### signed grants vs internal-only trusted callers

Phase 1 intentionally allows both trust patterns, but the implementation team should choose the default operating model for the real environment:

- Prefer internal-only trusted callers when the application already has a backend service that can submit score events directly after verifying the underlying action.
- Prefer signed grants when the website must present proof of a completed action directly to the score API and the platform cannot guarantee a service-to-service handoff for every flow.
- Whichever default is chosen, preserve the invariant that browsers never mint scoring authority on their own.

### starter throttle budgets

The published per-IP, per-issuer, per-subject-user, and invalid-signature thresholds are starter budgets, not permanently tuned limits.

Implementation should size them using:

- expected steady-state score submission rate
- retry behavior for legitimate producers
- tolerance for shared IPs and NAT-heavy traffic
- operator alert thresholds for probing or replay attempts

Tune the numbers without changing the documented throttle dimensions or the rejection semantics visible at the boundary.

## Defer to later phases

The following work is intentionally out of scope for Phase 1 and should be implemented in later phases:

- durable idempotency enforcement in PostgreSQL with unique action or idempotency constraints
- PostgreSQL mutation flow for immutable score events and user total updates
- Redis projection for top-10 ranking and cached leaderboard snapshots
- SSE delivery for live leaderboard updates and reconnect behavior
- outbox-driven fan-out from committed score state rather than inline dual writes

## Hard requirements to preserve

- trusted evidence remains the only authority for score increases; client-authored points, delta, or raw user identifiers are never authoritative
- unauthorized, malformed, expired, replayed, or out-of-policy requests are rejected before any score mutation is attempted
- the ordered Phase 1 validation pipeline remains fixed unless the public contract is deliberately revised everywhere
- layered abuse controls stay in place, including pre-auth coarse throttling, invalid-signature penalties, issuer-level limits, subject-user limits, and operator kill-switches
- the public boundary keeps using the documented contract statuses and does not grow ad hoc rejection semantics that are missing from the spec set

## Follow-on guidance

- Phase 2 should treat the Phase 1 handoff payload as already validated and avoid reintroducing client authority through downstream shortcuts.
- Phase 3 should derive visible leaderboard state from committed persistence, not from request-handler memory.
- Phase 4 should publish only committed top-10 changes and keep reconnect behavior snapshot-based.
