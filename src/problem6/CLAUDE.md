<!-- GSD:project-start source:PROJECT.md -->
## Project

**Live Scoreboard Backend Module**

This project defines the backend API module that accepts authorized score events, updates persistent user scores, and keeps the website's top-10 scoreboard fresh with live updates. It is intended for a backend engineering team that will implement the service-side flow, security controls, and delivery contract needed by the existing web product.

**Core Value:** The system must only accept legitimate score increases and propagate the resulting top-10 scoreboard changes to clients quickly enough to feel live.

### Constraints

- **Scope**: Backend API service module only - the output must guide server-side implementation rather than frontend behavior
- **Real-time**: Leaderboard updates should feel live - the service needs a push or streaming mechanism instead of polling-only delivery
- **Security**: Score changes must be authorization-backed - malicious users cannot be allowed to raise scores by calling the endpoint directly
- **Ranking**: Only the top 10 users matter for the surfaced scoreboard - leaderboard reads and fan-out should optimize for that slice
- **Deliverable**: Documentation-first specification - the implementation team will receive README-level design, diagrams, and improvement notes rather than finished code in this phase
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 24.14.x Active LTS | Runtime for API workers and SSE gateways | Current Active LTS is the safest production baseline, and Fastify v5 requires Node 20+ anyway. |
| TypeScript | 5.9.x | Typed contracts for score events, auth claims, and stream payloads | Keeps the mutation path explicit and reduces accidental contract drift between API, worker, and stream gateway. |
| Fastify | 5.x | Low-overhead HTTP server for score mutation and leaderboard streaming | Fastify is fast, schema-driven, and has mature rate limiting and load-shedding plugins. |
| PostgreSQL | 17.x managed | System of record for score events, user totals, and outbox rows | The module needs hard transactional guarantees, atomic upserts, and an auditable event ledger more than it needs novelty. |
| Redis | 8.0.x managed | Ranking cache, top-10 snapshot cache, replay nonce cache, and low-latency invalidation bus | Sorted sets map directly to leaderboard ranking, and Redis gives cheap fan-out without making it the source of truth. |
| HTTP/2-capable ingress | Current managed offering | TLS termination, SSE-friendly proxying, and connection management | SSE works best over HTTP/2 because browser HTTP/1 connection limits are low; ingress must also disable buffering for `text/event-stream`. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg` | 8.16.3 | PostgreSQL client and pooling | Use for the write path and projector worker. Prefer explicit SQL over a heavy ORM on the scoring transaction path. |
| `redis` | 5.8.2 | Official Redis Node client | Use for sorted sets, snapshot cache, pub/sub invalidation, and short-TTL nonce keys. For new projects, prefer this over `ioredis`. |
| `@fastify/jwt` | 10.0.0 | JWT verification for service or user auth | Use when the edge already issues JWTs. If the scoring call is purely internal and mTLS-authenticated, this can be optional. |
| `@fastify/rate-limit` | 10.3.0 | Per-IP, per-user, and per-route throttling | Apply to score mutation endpoints and aggressively on signature or auth failures. |
| `@fastify/under-pressure` | 9.0.3 | Load shedding and backpressure protection | Use on both API and SSE gateways so long-lived connections do not starve short write requests. |
| `@fastify/helmet` | 12.x | Hardened browser-facing headers | Use on the leaderboard read and stream endpoints. Do not rely on this as the primary security control for score mutation. |
| `pino` | 9.9.4 | Structured logging | Use for request ids, action ids, duplicate detection, signature failures, and outbox lag logs. |
| `prom-client` | 15.1.3 | Prometheus-compatible metrics | Use for p95/p99 score update latency, duplicate suppression counts, open SSE connections, and projector lag. |
| `node-pg-migrate` | 8.0.3 | Schema and index migrations | Use to manage unique constraints for idempotency and the outbox schema. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest` | Unit and integration test runner | Keep fast tests around signature verification, idempotency semantics, and ordering/tie-break logic. |
| `testcontainers` | Disposable PostgreSQL and Redis integration environments | Use for the real scoring transaction path, duplicate replay tests, and projector recovery tests. |
| `autocannon` | HTTP load testing | Use to validate mutation latency and ingress behavior under SSE connection pressure. |
## Recommended Delivery Pattern
### API transport
- `POST /v1/score-events` is HTTPS + JSON and should be called by a trusted application service after the underlying business action is verified. Do not let the browser invent points or action ids.
- `GET /v1/leaderboard/stream` should be Server-Sent Events, not WebSockets, because the website only needs one-way server-to-browser updates for a tiny top-10 payload.
- Send full leaderboard snapshots on each change, not row-level diffs. A top-10 snapshot is small, and full replacement is much easier to make correct after reconnects or missed updates.
- Run it over HTTP/2.
- Disable proxy buffering for `text/event-stream`.
- Send a heartbeat comment every 15-25 seconds.
- Set load balancer idle timeout comfortably above the heartbeat interval.
- Choose WebSockets only if clients must send low-latency messages back on the same connection, such as ack flows, moderator actions, or presence/session coordination. That is not needed for this module.
### Persistence
- Define canonical ordering in the backend, for example `ORDER BY total_score DESC, updated_at ASC, user_id ASC`.
- Do not rely on Redis member lexical order as the business tie-break unless that is explicitly acceptable.
### Pub/Sub and streaming delivery
- It avoids the classic dual-write bug where PostgreSQL commits but Redis publish fails.
- Redis Pub/Sub is at-most-once, so use it as an invalidation hint, not the source of truth.
- A missed invalidation is cheap to recover from because the SSE gateway can always reload the latest top-10 snapshot from Redis.
- `leaderboard:global` as a sorted set keyed by `user_id -> total_score`
- `leaderboard:top10:v1` as the precomputed JSON snapshot actually pushed to browsers
- `score:nonce:<issuer>:<nonce>` as an optional short-lived replay cache
- Use Redis Streams if multiple consumers need durable replay or if a worker missing a message is not acceptable.
- Use NATS JetStream or Kafka only if this scoreboard event stream becomes a shared platform dependency across many services or regions. For a single top-10 module, that is usually unjustified complexity.
### Idempotency and replay protection
- A signed action receipt issued by a trusted service
- An `Idempotency-Key` header on the score mutation request
- `issuer`
- `user_id`
- `action_id`
- `points`
- `nonce`
- `iat`
- `exp`
- `points` must come from the signed receipt or server-side action logic, never from a raw client field.
- Reject expired receipts.
- Reject duplicate `receipt_nonce` values.
- Treat duplicate `Idempotency-Key` with the same payload as a successful retry and return the original result.
- Treat duplicate `Idempotency-Key` with a different payload as a conflict.
## Operational Baseline
| Concern | Recommendation | Why |
|---------|----------------|-----|
| Process shape | Split `score-api`, `leaderboard-projector`, and `leaderboard-stream` into separate deployments or process classes | SSE connections are long-lived and should not compete directly with mutation workers. |
| Database connections | Put PgBouncer or your managed equivalent in front of PostgreSQL | Node services can otherwise waste connection slots during bursts or deploy churn. |
| Redis reliability | Use a managed primary/replica Redis deployment with TLS and ACLs | Redis is not the source of truth, but scoreboard freshness still matters. |
| Failure mode | If Redis is unavailable, keep accepting PostgreSQL writes and mark live push as degraded | Correct score persistence matters more than perfectly continuous streaming. Rebuild the Redis projection after recovery. |
| Reconciliation | Run a periodic repair job that recomputes the top 10 from PostgreSQL and overwrites Redis | This catches drift from operator mistakes, bad deploys, or missed projector work. |
| Security | Use private networking, least-privilege DB roles, Redis ACLs, TLS everywhere, and WAF/rate limiting at the edge | The main threat is forged or replayed score mutation, not leaderboard reads. |
| Observability | Track `score_write_latency_ms`, `duplicate_requests_total`, `invalid_signatures_total`, `outbox_lag_seconds`, `leaderboard_push_latency_ms`, and `sse_connections` | These are the signals that tell you whether the module is correct and still feels live. |
| Multi-region | Keep a single write-authority region for the global leaderboard until you have a real need for conflict resolution | Active-active scoring sounds attractive and usually creates more consistency problems than it solves. |
| Retention | Keep `score_events` for audit and replay, then archive by policy | The event ledger is the safety net for fraud review and projection rebuilds. |
## Installation
# Core
# Dev dependencies
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Browser delivery | SSE over HTTP/2 | WebSockets | Bidirectional session state is unnecessary for a top-10 scoreboard. SSE is simpler to operate and reconnect. |
| Internal fan-out | Redis Pub/Sub invalidation + cached snapshot | Redis Streams | Streams are better when you need replayable durable consumers; they are extra moving parts for a tiny, full-snapshot stream. |
| Source of truth | PostgreSQL | Redis-only leaderboard | Redis is excellent for ranking and caching, but weak as the authoritative ledger for secure score mutation and auditability. |
| Consistency pattern | Transactional outbox | Direct PostgreSQL + Redis dual-write in request handler | Dual-write failure modes are exactly the class of bug that makes leaderboards lie. |
| Redis client | `redis` | `ioredis` | `ioredis` is fine if already standardized, but the official Redis guidance now recommends `node-redis` for new Node projects. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| A public endpoint that accepts raw `user_id` and `points` from the browser | This is trivial to forge and impossible to trust | Signed action receipts or trusted server-to-server calls |
| Polling `/leaderboard` every few seconds | Wasteful and still less live than a push stream | SSE with full snapshot events |
| PostgreSQL `LISTEN/NOTIFY` as the only browser fan-out mechanism | It is useful internally, but it is not the right primary delivery mechanism for internet-facing streaming | Redis-backed invalidation with SSE gateways |
| Redis as the only persistence layer | Fast, but not strong enough for audited secure scoring | PostgreSQL as source of truth plus Redis as projection |
## Stack Patterns by Variant
- Use the exact default stack above.
- One PostgreSQL primary, one managed Redis primary/replica pair, stateless API workers, stateless SSE gateways.
- This is the highest-signal choice for a live top-10 module.
- Keep PostgreSQL as source of truth.
- Scale the projector and SSE gateways horizontally.
- Continue sending full snapshots; the payload is still tiny.
- Add PgBouncer and autoscaling before adding a more complex broker.
- Keep one score-write authority region first.
- Consider Redis Streams or a dedicated durable broker only when replayable multi-consumer delivery is a hard requirement.
- Do not move to active-active score mutation casually; that is a product and consistency decision, not a simple infra toggle.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node.js 24.x | Fastify 5.x | Fastify v5 requires Node 20+. |
| `@fastify/jwt` 10.x | Fastify 5.x | Package docs state `>=9` supports Fastify 5. |
| `@fastify/rate-limit` 10.x | Fastify 5.x | Package docs state `>=10.x` supports Fastify 5. |
| `@fastify/under-pressure` 9.x | Fastify 5.x | Official compatibility table matches Fastify 5. |
| `node-pg-migrate` 8.0.3 | Node 20.11+, PostgreSQL 13+ | Safely inside the recommended Node 24 and PostgreSQL 17 baseline. |
## Sources
- https://nodejs.org/en/about/previous-releases - verified Node 24 Active LTS status and current production guidance
- https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/ - verified Fastify v5 and Node 20+ requirement
- https://www.npmjs.com/package/fastify?activeTab=versions - checked the current Fastify v5 package line
- https://www.postgresql.org/docs/current/sql-insert.html - verified `INSERT ... ON CONFLICT` semantics and atomic upsert behavior
- https://www.postgresql.org/docs/current/transaction-iso.html - verified default isolation behavior and when stronger isolation is warranted
- https://redis.io/docs/latest/develop/data-types/sorted-sets - verified sorted set suitability for leaderboard ranking
- https://redis.io/docs/latest/develop/pubsub/ - verified Pub/Sub ordering and at-most-once delivery semantics
- https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events - verified SSE one-way behavior, reconnect model, HTTP/1 connection limits, and buffering requirements
- https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/ - verified current standardization direction for `Idempotency-Key`
- https://github.com/redis/node-redis - verified official Node Redis client guidance
- https://github.com/redis/ioredis - used only for the official note that new projects should prefer `node-redis`
- https://www.npmjs.com/package/pg?activeTab=versions - checked `pg` package version line
- https://www.npmjs.com/package/redis?activeTab=versions - checked `redis` package version line
- https://www.npmjs.com/package/%40fastify/jwt - checked plugin version and Fastify 5 compatibility
- https://www.npmjs.com/package/%40fastify/rate-limit?activeTab=versions - checked plugin version and Fastify 5 compatibility
- https://www.npmjs.com/package/%40fastify/under-pressure - checked plugin version and Fastify 5 compatibility
- https://www.npmjs.com/package/%40fastify/helmet - checked current package line and compatibility notes
- https://www.npmjs.com/package/pino - checked logger package version
- https://www.npmjs.com/package/prom-client?activeTab=code - checked metrics package version
- https://www.npmjs.com/package/node-pg-migrate?activeTab=versions - checked migration tool version and prerequisites
- https://www.npmjs.com/package/typescript?activeTab=versions - checked TypeScript version line
- https://www.npmjs.com/package/vitest - checked test runner version line
- https://www.npmjs.com/package/testcontainers?activeTab=versions - checked containerized integration test tool version line
- https://www.npmjs.com/package/autocannon?activeTab=code - checked load-testing tool version line
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
