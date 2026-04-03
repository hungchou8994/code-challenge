<!-- GSD:project-start source:PROJECT.md -->
## Project

**Scoreboard API Module Specification**

A technical specification for a scoreboard API module to be implemented by a backend engineering team. The module handles live score updates for a website's top-10 scoreboard, including secure score submission and real-time broadcasting. This is a documentation deliverable, not a running application.

**Core Value:** A clear, implementable specification that backend engineers can follow to build a secure, live-updating scoreboard — with enough detail to prevent ambiguity during implementation.

### Constraints

- **Scope**: Documentation/specification only — no implementation required
- **Audience**: Backend engineering team — spec must be precise and actionable
- **Format**: README.md (primary doc), diagram (flow), inline improvement comments
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | v22.x LTS | Runtime | Long-term support, native async, dominates API-backend space; v22 adds native WebSocket client support |
| Fastify | v5.8.x | HTTP/WebSocket API framework | Fastest Node.js HTTP framework, schema-validated routes, plugin ecosystem, OpenJS Foundation |
| Redis | v7+ (sorted sets + pub/sub) | Leaderboard store + broadcast bus | Sorted sets give O(log N) top-N queries natively; pub/sub enables multi-instance broadcast |
| JSON Web Tokens (JWT) | RFC 7519 | Score-submission auth | Stateless, verifiable, industry standard for API auth; prevents unsigned score submissions |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/websocket` | v11.2.0 | WebSocket server plugin for Fastify v5 | Chosen real-time transport; wraps `ws` with Fastify DI integration |
| `@fastify/jwt` | v10.0.0 | JWT verification plugin for Fastify v5 | Protects score-submit endpoint; integrates with Fastify's request lifecycle |
| `ioredis` | v5.10.1 | Redis client | Full-featured, supports cluster, pipeline, Lua scripting; more ergonomic than `node-redis` for complex operations |
| `ws` | v8.20.0 | Low-level WebSocket server (peer dep of `@fastify/websocket`) | Underlying transport; used directly if Fastify is not the chosen framework |
| `@fastify/rate-limit` | v9.x | Per-IP and per-user rate limiting | Mitigates score-flooding attacks on the submit endpoint |
| `@fastify/helmet` | v12.x | Security headers (CSP, HSTS, etc.) | Standard hardening for any public API |
| `zod` or `@sinclair/typebox` | latest | Schema validation | TypeBox is Fastify-native (JSON Schema); Zod if type inference matters more than raw perf |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | Type safety | Use `"strict": true`; Fastify v5 ships full TS types |
| `tsx` / `ts-node` | Local dev execution | `tsx` is faster for ESM projects |
| `vitest` | Unit + integration testing | Fastest test runner for TS; compatible with Node test harness |
| `supertest` | HTTP integration testing | Standard Fastify/Express HTTP assertion library |
| `redis-memory-server` | Redis in-process for tests | Avoids external Redis dependency during CI |
| ESLint + Prettier | Lint/format | Use `eslint-config-node` or `@typescript-eslint` ruleset |
## Installation
# Core runtime
# Schema validation (pick one)
# OR
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Fastify v5 | Express v5 | When team already has deep Express expertise and plugin migration cost is high |
| Fastify v5 | Hono | Extremely lightweight edge/serverless deployments; less ecosystem |
| `@fastify/websocket` | Socket.IO | When clients need auto-reconnect, rooms, namespaces out-of-box; Socket.IO adds ~35 KB to bundle and its own protocol overhead |
| `ioredis` | `node-redis` v5 | When using Redis 8+ features (new data types, Redis Functions); `node-redis` v5 tracks Redis 8 more closely |
| Redis pub/sub | Kafka / NATS | High-volume event streaming (>100K events/sec), durable replay, complex consumer groups — overkill for a scoreboard |
| JWT stateless auth | Session cookies | When server-side session invalidation is required; JWT works well for API-first consumption |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Socket.IO | Custom protocol, unnecessary abstraction over WebSocket, harder to debug with standard tools, ~35 KB client overhead | `@fastify/websocket` (raw WebSocket) |
| Long polling | High latency, reconnect storms, HTTP overhead on every "push" — anti-pattern for frequent updates | WebSocket or SSE |
| ORM (Sequelize, Prisma) for leaderboard | SQL + ORM cannot match Redis sorted-set O(log N) for live top-N ranking | Redis `ZADD`/`ZREVRANGE` directly |
| Passport.js | Designed for session-based auth with strategy complexity; overkill for simple JWT API auth | `@fastify/jwt` |
| `jsonwebtoken` directly | Lower-level, manual integration; no Fastify lifecycle hooks | `@fastify/jwt` (wraps `fast-jwt`) |
| Node.js v20 or older | v20 exits LTS 2026-04; v22 is the current LTS baseline | Node.js v22 LTS |
## Stack Patterns by Variant
- WebSocket connections and leaderboard state are entirely in-process
- Redis is still recommended for leaderboard persistence (process restarts lose in-memory state)
- Redis pub/sub is optional (no other instances to fan-out to)
- Redis pub/sub is mandatory for cross-instance WebSocket broadcast
- Each API server subscribes to Redis channel; on new score → publishes to Redis → all instances broadcast to their connected clients
- Sticky sessions are NOT required with this pattern
- Replace `@fastify/websocket` with native Node.js `res.write()` SSE or `@fastify/sse-plugin`
- SSE is HTTP/2-friendly, simpler client code, no upgrade handshake
- Use when the client is browser-only and bidirectionality is not needed
## Version Compatibility
| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@fastify/websocket@11.x` | `fastify@5.x` | v11 was released for Fastify v5; do NOT use v9 (Fastify v4 only) |
| `@fastify/jwt@10.x` | `fastify@5.x` | v10 aligns with Fastify v5; wraps `fast-jwt@6.x` |
| `ioredis@5.x` | Redis 6.x, 7.x | Full support for Redis 6/7 commands; limited Redis 8 feature support |
| `node-redis@5.x` | Redis 8.x | Tracks Redis 8 features; use if Redis 8+ specific commands are needed |
| `ws@8.x` | Node.js 18, 20, 22 | Peer dependency of `@fastify/websocket`; no manual installation needed |
## Sources
- Official Fastify releases — https://github.com/fastify/fastify/releases — version v5.8.x confirmed
- `@fastify/websocket` GitHub — https://github.com/fastify/fastify-websocket — v11.2.0 for Fastify v5
- `@fastify/jwt` GitHub — https://github.com/fastify/fastify-jwt — v10.0.0 for Fastify v5
- `ioredis` GitHub — https://github.com/redis/ioredis — v5.10.1 current
- `ws` npm — https://www.npmjs.com/package/ws — v8.20.0 current
- Node.js release schedule — https://nodejs.org/en/about/previous-releases — v22 LTS confirmed
- Redis sorted sets docs — https://redis.io/docs/data-types/sorted-sets/ — ZADD/ZREVRANGE patterns
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
