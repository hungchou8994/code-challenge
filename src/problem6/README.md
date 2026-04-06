# Scoreboard API Module Specification

## Purpose & Audience

This document specifies the Scoreboard API Module — a backend service that maintains a live top-10 scoreboard for a website. The module accepts score increments from authenticated users via a secure HTTP endpoint, authorizes each increment with a trusted action-completion proof, computes awarded points server-side, and broadcasts real-time leaderboard updates to connected clients via Server-Sent Events (SSE). The live leaderboard is served from a Redis projection built from durable PostgreSQL state.

This specification is written for a backend engineering team. It is the authoritative implementation contract — not a tutorial or reference guide. The team should implement to the SHALL requirements defined in each section. Implementation details (specific Redis commands, Fastify plugin choices, library versions) are provided as non-normative hints where helpful, but they are not normative unless stated with SHALL or MUST language.

**How to read this spec:** The Security Model section (§ Security Model) defines the authentication contract, transport requirements, and error vocabulary shared across all endpoints. The Endpoints section (§ Endpoints) specifies each endpoint's request schema, response schema, and validation rules. The Execution Flow section (§ Execution Flow) shows the complete score submission lifecycle as a sequence diagram — from client action to real-time broadcast. The Improvement Suggestions section (§ Improvement Suggestions) collects non-normative enhancement ideas for post-v1 consideration.

## Architecture Overview

The module exposes three endpoints: `POST /scores` (authenticated write path), `GET /leaderboard` (public read path), and `GET /leaderboard/stream` (public real-time SSE stream). Score submissions are authenticated via JWT bearer tokens (HS256) and authorized with a short-lived `action_proof` issued by a trusted action-verification component after the user actually completes the action. The server resolves the score delta from the supplied `action_type` against an internal action registry and updates the user's cumulative score atomically. PostgreSQL (or equivalent durable store) is the authoritative write-path ledger and projection source; Redis is the low-latency ranking/read projection. Connected SSE clients receive the full top-10 snapshot after each successful score update. Recommended stack: Node.js v22 LTS, Fastify v5, PostgreSQL 17, Redis 8, JWT (HS256).

---

## Data Storage Model

The module uses a dual-layer storage approach that separates durability from read performance.

**Write path (durable):** Every accepted `POST /scores` request persists a score event record to PostgreSQL and updates the user's durable score projection in the same database transaction. PostgreSQL is the authoritative source of truth — the full event history is retained for audit, fraud review, and projection rebuilds.

**Durable tables / records:**

- `score_events`: append-only event ledger with a durable unique constraint on `event_id`. Each row records `event_id`, `user_id`, `action_type`, awarded `delta`, proof identifier or proof hash, and accepted timestamp.
- `user_scores`: one row per user storing `user_id`, `display_name`, cumulative `score`, and `score_reached_at` (the timestamp used for deterministic tie-breaking when equal scores exist).

**Read/ranking layer (fast):** Redis holds a projection derived from PostgreSQL:

- `leaderboard:ranking`: sorted set keyed by `userId`, storing the ranking sort value used to retrieve the top 10.
- `leaderboard:user:<userId>`: hash storing `displayName`, canonical `score`, and `scoreReachedAt` for response rendering.

`GET /leaderboard` and SSE broadcasts read from Redis, not from PostgreSQL, keeping read latency low while still allowing Redis to be rebuilt from durable state.

**Score submission flow:**

```
POST /scores
  1. Validate JWT, request body, and action proof
  2. Insert score event into PostgreSQL with durable unique(event_id)
  3. Update durable user_scores projection in the same transaction
  4. Project the committed score state into Redis
  5. Read updated top-10 snapshot from Redis
  6. Return 201 to client
  7. Broadcast leaderboard_update SSE event to all connected clients
```

**Failure modes:**

| Failure | Behavior |
|---------|----------|
| PostgreSQL unavailable | Reject the request with `503`. The durable ledger is required before Redis is updated. |
| Redis unavailable before the request starts | Reject the request with `503` if synchronous projection is required for this deployment. |
| Redis projection update fails after the PostgreSQL transaction commits | Do not lose the accepted score event. Return success from the durable result, mark the Redis projection as stale, and enqueue immediate reconciliation before the next read/broadcast cycle. |
| Redis data loss (restart, eviction) | Rebuild the leaderboard projection by replaying `score_events` and `user_scores` from PostgreSQL. A scheduled reconciliation job can detect and repair drift. |

**Implementation note (non-normative):** The `displayName` field returned by `GET /leaderboard` and SSE events is denormalized into `user_scores` at write time (captured from the JWT payload or a user profile lookup at submission) and then projected into Redis. It MUST NOT be fetched from a separate user service at read time — denormalization eliminates read-path coupling to the user profile service and keeps leaderboard reads fast and self-contained. Display name update propagation (e.g., if a user changes their name) is out of scope for v1.

---

## Security Model

This security model defines the authentication and protection mechanisms for the scoreboard API's score submission endpoint. It establishes JWT bearer authentication requirements, anti-cheat and IDOR prevention constraints, transport security controls, rate limiting policy, and mandatory response headers. Together, these controls prevent malicious users from increasing scores without authorization.

**Non-goals:** This security model does not cover client-side XSS mitigations, CSRF protection on non-API routes, OAuth or social login flows, or anti-cheat heuristics beyond the proof-based authorization contract defined below. Those concerns are out of scope for this module.

### Authentication

**S-01:** The server SHALL accept only HS256 (HMAC-SHA256) as the JWT signing algorithm. The server SHALL reject any token whose `alg` header value is not exactly `HS256` — including `alg:none`, RS256, ES256, or any other value — with `401 Unauthorized`, regardless of signature validity or claim content. *(Prevents JWT algorithm confusion attacks and algorithm downgrade attacks. The outcome requirement is that no token using a non-HS256 algorithm is ever treated as valid; the specific verification order is an implementation detail left to the JWT library.)*

**S-02:** The server SHALL validate all six mandatory claims on every inbound request: `sub` (the user's identity — the score owner), `exp` (token expiry timestamp), `iat` (issued-at timestamp, used for clock skew validation), `nbf` (not-before timestamp — the token is invalid before this time; the server SHALL reject any token whose `nbf` value is in the future relative to the current server time), `iss` (issuer — must exactly match the server-configured issuer string), and `aud` (audience — must exactly match the server-configured audience string). A token that is missing any of these six claims, or that presents any claim value that does not pass validation, SHALL be rejected with `401 Unauthorized`. *(Prevents forged or partially constructed tokens from being accepted as legitimate credentials; `nbf` prevents pre-issued tokens from being used before their intended validity window — a missing `nbf` is treated as a validation failure, not silently skipped.)*

**S-03:** The server SHALL enforce a maximum JWT lifetime of 15 minutes via the `exp` claim. Specifically, `exp − iat` MUST be ≤ 900 seconds. Tokens for which this constraint is violated, or for which `exp` has already elapsed at the time of the request, SHALL be rejected with `401 Unauthorized` regardless of signature validity. *(Reduces the window of opportunity for token-theft replay attacks: a stolen token becomes useless within 15 minutes.)*

**S-04:** `POST /scores` SHALL require the JWT to be presented in the `Authorization: Bearer <token>` HTTP request header. Requests that omit this header, or that present it with a value that is not a well-formed Bearer token, SHALL be rejected with `401 Unauthorized`. `GET /leaderboard/stream` is a public endpoint and does not require JWT authentication; browser-origin abuse on the public stream is mitigated via Origin allowlist validation defined in S-13. *(Prevents unauthenticated score submission; the `EventSource` browser API does not support custom request headers, which is why the SSE stream uses Origin-based abuse mitigation rather than Bearer tokens.)*

### Anti-Cheat / IDOR Prevention

**S-05:** The server SHALL extract the acting user's identity exclusively from the JWT `sub` claim. The request body MUST NOT contain a writable `userId` or `user_id` field. If the request body supplies either field, the server SHALL ignore or reject it — the identity used for all score operations MUST be the `sub` value from the validated JWT. *(Prevents Insecure Direct Object Reference (IDOR): without this control, an authenticated user could claim to act as another user simply by supplying a different identifier in the request body.)*

**S-06:** The server SHALL enforce idempotency on `event_id` using a durable uniqueness constraint in the authoritative store (for example, `UNIQUE(event_id)` on `score_events`). A short-lived Redis nonce cache MAY be used as an optimisation, but it is not authoritative. Duplicate submissions presenting an `event_id` that has already been accepted SHALL be rejected with `409 Conflict` and error code `ERR_CONFLICT`, even if any cache entry has already expired. *(Prevents replay attacks without risking loss of legitimate events when an in-memory nonce cache expires or a retry happens after a transient failure.)*

**S-07:** The server SHALL require proof that the scored action was actually completed. Each `POST /scores` request MUST include an `action_proof` issued by a trusted action-verification component only after the action succeeds. The proof MUST be bound to the authenticated user (`sub`), `event_id`, `action_type`, and an expiry timestamp; the server SHALL reject the request with `403 Forbidden` and `ERR_FORBIDDEN` if the proof is missing, expired, invalid, already consumed, or does not match the JWT subject and request body. The server SHALL then look up and apply the authoritative score delta for that `action_type`. The client MUST NOT supply an absolute `score` value, a numeric `score_increment`, or any other numeric field that directly determines the awarded points. *(Prevents authenticated users from fabricating completed actions or directly injecting arbitrary point values.)*

### Transport Security

**S-08:** The server SHALL operate exclusively over HTTPS (TLS 1.2 minimum; TLS 1.3 recommended). Plaintext HTTP connections to any API endpoint SHALL be rejected or redirected with a permanent redirect (301); no API endpoint SHALL accept or process a request received over unencrypted HTTP. *(Prevents token interception and man-in-the-middle attacks: a JWT transmitted over plaintext HTTP can be captured and replayed by a network-level observer.)*

### Rate Limiting

**S-09:** The server SHALL enforce per-user rate limiting on `POST /scores`. The rate limit is applied per authenticated user (identified by the JWT `sub` claim). When the per-user submission rate is exceeded, the server SHALL return `429 Too Many Requests` with a `Retry-After` response header whose value is the number of seconds until the next allowed request from that user. *(Prevents score flooding: without this control, an attacker with a valid token could submit scores in rapid automated bursts that far exceed what human gameplay rates allow.)*

### Response Headers

**S-10:** All API responses SHALL include `Cache-Control: no-store`, with one explicit exception: the `GET /leaderboard/stream` SSE response SHALL use `Cache-Control: no-cache` instead, as required by the SSE specification for browser `EventSource` compatibility. All other endpoints — including error responses — use `no-store`. *(Prevents stale score data from being served by intermediary caches. The SSE carve-out is not a security relaxation — `no-cache` on a streaming `text/event-stream` response prevents proxy buffering and ensures each event frame is delivered immediately to the client.)*

**S-11:** All API responses SHALL include the header `Strict-Transport-Security: max-age=63072000; includeSubDomains` (a 2-year HSTS policy). *(Instructs compliant browsers to enforce HTTPS for all future connections to this origin, preventing SSL-stripping attacks in which an active network attacker downgrades HTTPS to HTTP before the first request.)*

**S-12:** All API responses SHALL include the header `X-Content-Type-Options: nosniff`. *(Prevents MIME-type sniffing attacks in which a browser ignores the declared `Content-Type` and executes a response body as a different content type, such as JavaScript.)*

**S-13:** The server SHALL validate the `Origin` header on all SSE (`GET /leaderboard/stream`) requests against a server-configured allowlist of permitted origins. Requests whose `Origin` value is absent from the allowlist SHALL be rejected with `403 Forbidden`. *(Provides browser-origin abuse mitigation for the public stream: without an Origin check, a malicious third-party page loaded in a user's browser can silently open an SSE connection to the scoreboard stream using the user's network identity, leaking live score data to the attacker's origin. Note: non-browser clients may not send an `Origin` header; this control is effective as a browser cross-site abuse restriction, not as a general authentication or authorization mechanism.)*

---

## Error Contract

All API error responses share a single, uniform structure. No endpoint-specific error formats exist. Stack traces, internal error messages, query details, and file paths are never exposed in API responses — all sensitive failure context is logged server-side only.

### Error Response Format

Every error response has exactly two fields:

```json
{
  "error": "<human-readable message describing what went wrong>",
  "code": "ERR_*"
}
```

Rules:

- No additional fields (`detail`, `requestId`, `trace`, `stack`, nested objects, or arrays) appear in error responses.
- `error` is a human-readable string intended for display in logs or user-facing error messages. Its value may change across releases and MUST NOT be used for programmatic error handling.
- `code` is a machine-readable constant from the vocabulary defined below. Clients SHOULD branch on `code` for programmatic error handling.
- Success responses (2xx status codes) do NOT include `error` or `code` fields.

### Error Code Vocabulary

| Code | HTTP Status | When Returned |
|------|-------------|---------------|
| `ERR_UNAUTHORIZED` | 401 | JWT is missing, expired, or invalid — covers any claim validation failure, algorithm mismatch, or `alg:none` rejection |
| `ERR_FORBIDDEN` | 403 | Token is valid and authentic, but the requesting user is not allowed to perform the requested operation; also returned for invalid or mismatched `action_proof` and for Origin allowlist rejection on SSE/WebSocket connections |
| `ERR_VALIDATION_FAILED` | 400 | Request body fails schema validation — missing required fields, wrong field types, values outside permitted ranges |
| `ERR_RATE_LIMITED` | 429 | Per-user submission rate limit exceeded; see `Retry-After` response header for retry guidance |
| `ERR_CONFLICT` | 409 | Duplicate `event_id` — the same event has already been durably accepted |
| `ERR_UNAVAILABLE` | 503 | Required infrastructure dependency is temporarily unavailable (for example PostgreSQL, Redis, or proof verification backend) |
| `ERR_INTERNAL` | 500 | Unexpected server-side error; details are logged server-side and never included in the response |

### HTTP Status Code Semantics

| Status | Meaning | Accompanies |
|--------|---------|-------------|
| `200 OK` | Request succeeded; response body contains the requested data | `GET /leaderboard` success |
| `201 Created` | Resource created successfully; response body contains the created resource | `POST /scores` success |
| `400 Bad Request` | Client error — request is malformed or contains invalid data | `ERR_VALIDATION_FAILED` |
| `401 Unauthorized` | Authentication is required or the provided authentication has failed | `ERR_UNAUTHORIZED` |
| `403 Forbidden` | Request is authenticated but the caller is not authorized for this operation; also used for Origin allowlist rejections | `ERR_FORBIDDEN` |
| `409 Conflict` | Duplicate submission — the idempotency constraint on `event_id` was violated | `ERR_CONFLICT` |
| `429 Too Many Requests` | Rate limit exceeded; `Retry-After` header indicates seconds until next permitted request | `ERR_RATE_LIMITED` |
| `503 Service Unavailable` | A required dependency is temporarily unavailable; client should retry with backoff | `ERR_UNAVAILABLE` |
| `500 Internal Server Error` | Unexpected server failure; client should retry with exponential backoff | `ERR_INTERNAL` |

### Examples

**Success — Score submitted (201):**

```http
HTTP/1.1 201 Created
Content-Type: application/json
Cache-Control: no-store

{
  "userId": "usr_abc123",
  "newScore": 1450,
  "rank": 3
}
```

**Error — Expired JWT (401):**

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json
Cache-Control: no-store

{
  "error": "Token has expired",
  "code": "ERR_UNAUTHORIZED"
}
```

**Error — Duplicate event_id (409):**

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
Cache-Control: no-store

{
  "error": "This event has already been processed",
  "code": "ERR_CONFLICT"
}
```

---

## Endpoints Overview

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/scores` | POST | JWT Bearer | Submit a completed action score increment |
| `/leaderboard` | GET | None | Retrieve the current top-10 ranked leaderboard |
| `/leaderboard/stream` | GET | None | Subscribe to live top-10 leaderboard updates via SSE |

---

## POST /scores

Submit a score increment for an authenticated user. The server resolves the score delta from the supplied `action_type` against an internal action registry, but it awards points only when the request also carries a valid `action_proof` from the trusted action-verification component. The client never supplies a numeric score value. User identity is derived exclusively from the JWT `sub` claim.

**Non-goals:** This section does not define the action registry schema or enumerate valid `action_type` values — those are implementation-specific and not part of this API contract. It also does not define the SSE broadcast triggered by a successful submission (see `GET /leaderboard/stream`).

### Request

**Method:** `POST`
**Path:** `/scores`
**Authentication:** `Authorization: Bearer <JWT>` (see Security Model § Authentication)

**Request Body** (`Content-Type: application/json`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_id` | string | Yes | Client-generated nonce uniquely identifying this action occurrence. Used for replay prevention. Must be a non-empty string. |
| `action_type` | string | Yes | Identifies the completed action. The server looks up the authoritative score delta in an internal action registry. Must be a non-empty string matching a known action. |
| `action_proof` | string | Yes | Short-lived proof issued by the trusted action-verification component after the action succeeds. The proof MUST be bound to `event_id`, `action_type`, and the authenticated user. |

No other fields are accepted. The request body MUST NOT include `score`, `score_increment`, `userId`, `user_id`, or any numeric score value. The server MUST treat any such field as absent or reject the request outright.

**Example:**

```http
POST /scores HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "event_id": "evt_7f3a9c2d-1b4e-4f8a-9d0c-2e5b7a1f3c6d",
  "action_type": "level_complete",
  "action_proof": "apt_eyJhbGciOiJIUzI1NiJ9..."
}
```

### Response

On success the server returns `201 Created` with the following response body:

```json
{
  "userId": "<JWT sub claim value>",
  "newScore": 1450,
  "rank": 3
}
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | The authenticated user's identity — the value of the JWT `sub` claim. |
| `newScore` | integer | The user's new cumulative score total after this increment. |
| `rank` | integer \| null | The user's position in the top-10 leaderboard at the moment of the write (1 = highest). `null` if the user is not in the top 10 after the update. |

**Example:**

```http
HTTP/1.1 201 Created
Content-Type: application/json
Cache-Control: no-store

{
  "userId": "usr_abc123",
  "newScore": 1450,
  "rank": 3
}
```

### Validation Rules

**E-01:** The server SHALL reject any request whose body is missing `event_id`, `action_type`, or `action_proof` with `400 Bad Request` and error code `ERR_VALIDATION_FAILED`. All three fields are required; any of them absent or empty string constitutes a validation failure. *(Ensures the endpoint accepts only the required schema for authenticated, proof-backed score submission.)*

**E-02:** The server SHALL reject any request whose `action_type` value does not match a known entry in the server-side action registry with `400 Bad Request` and error code `ERR_VALIDATION_FAILED`. The server SHALL reject any request whose `action_proof` is invalid, expired, already consumed, or not bound to the authenticated user, `event_id`, and `action_type` with `403 Forbidden` and error code `ERR_FORBIDDEN`. *(Unknown action types cannot produce score increments, and a valid login alone is not sufficient to claim that an action was completed.)*

**E-03:** The server SHALL extract the acting user's identity exclusively from the JWT `sub` claim. The request body MUST NOT contain a writable `userId` or `user_id` field; any such field in the body SHALL be ignored or rejected. This requirement works in conjunction with S-05 (see Security Model § Anti-Cheat / IDOR Prevention). *(Satisfies SCORE-03: prevents IDOR — a user cannot award points to another account by supplying a different identifier in the request body.)*

**E-04:** The server SHALL look up the score delta for the supplied `action_type` from an internal action registry and apply that server-authoritative value as the increment only after `action_proof` validation succeeds. The client MUST NOT supply a numeric score field; the server MUST NOT use any client-supplied value as the score increment. *(Server-side delta computation plus proof validation prevents clients from awarding themselves arbitrary point values or inventing successful actions.)*

**Error examples:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
Cache-Control: no-store

{
  "error": "action_type is not a recognised action",
  "code": "ERR_VALIDATION_FAILED"
}
```

### Replay Prevention

**E-05:** The server SHALL perform the duplicate check and durable acceptance of `event_id` as a single atomic database operation. The insert into `score_events` and the uniqueness enforcement on `event_id` MUST be indivisible — concurrent duplicate submissions MUST NOT both succeed. Acceptable implementations include `INSERT ... ON CONFLICT DO NOTHING` plus row-count inspection or an explicit unique-constraint violation check inside a transaction. The specific SQL shape is an implementation detail; the atomicity guarantee is a SHALL requirement. *(Prevents replay attacks under concurrent load without consuming a nonce before the score event is durably recorded.)*

**E-06:** A duplicate `event_id` received after a successful durable write SHALL still be rejected with `409 Conflict` and error code `ERR_CONFLICT`, regardless of the age of the original event. A TTL-based Redis cache MAY be used as a fast-path replay filter, but expiry of that cache entry MUST NOT make the same `event_id` acceptable again. *(Makes `event_id` true idempotency state rather than a short-lived replay hint.)*

**Example:**

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
Cache-Control: no-store

{
  "error": "This event has already been processed",
  "code": "ERR_CONFLICT"
}
```

### Atomic Score Increment

**E-07:** The server SHALL update the user's cumulative score and `score_reached_at` in the durable store within the same transaction that inserts `score_events`. Read-modify-write sequences (SELECT then UPDATE with a stale value) are explicitly prohibited. After the transaction commits, the server SHALL project the committed `score`, `display_name`, and `score_reached_at` values into Redis using atomic operations on `leaderboard:ranking` and `leaderboard:user:<userId>`. *(Prevents race conditions in the source of truth while keeping the read model consistent with the committed result.)*

### Error Responses

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Missing `event_id`, `action_type`, or `action_proof` | 400 | `ERR_VALIDATION_FAILED` |
| Unknown `action_type` | 400 | `ERR_VALIDATION_FAILED` |
| JWT missing or invalid | 401 | `ERR_UNAUTHORIZED` |
| Invalid, expired, replayed, or mismatched `action_proof` | 403 | `ERR_FORBIDDEN` |
| Duplicate `event_id` | 409 | `ERR_CONFLICT` |
| Rate limit exceeded | 429 | `ERR_RATE_LIMITED` |
| PostgreSQL, Redis, or proof-verification backend unavailable before acceptance | 503 | `ERR_UNAVAILABLE` |
| Unexpected server error | 500 | `ERR_INTERNAL` |

Error response structure is defined in the Security Model § Error Contract. Error codes above are referenced by name only and are not redefined here.

---

## GET /leaderboard

Retrieve the current top-10 ranked leaderboard. No authentication is required — the leaderboard is publicly readable. The response reflects the live state of the Redis leaderboard projection at the moment of the request.

### Request

**Method:** `GET`
**Path:** `/leaderboard`
**Authentication:** None required
**Query Parameters:** None
**Request Body:** None

**Example:**

```http
GET /leaderboard HTTP/1.1
```

### Response

On success the server returns `200 OK` with the following response body:

```json
{
  "leaderboard": [
    { "rank": 1, "userId": "usr_abc123", "displayName": "Alice", "score": 4200 },
    { "rank": 2, "userId": "usr_def456", "displayName": "Bob",   "score": 3850 }
  ]
}
```

**Response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `leaderboard` | array | Ranked entries ordered by `rank` ascending (rank 1 first, rank 10 last). |
| `rank` | integer | Position in the leaderboard (1–10). Rank 1 is the highest scorer. |
| `userId` | string | The user's unique identifier — the JWT `sub` claim value used at score submission time. |
| `displayName` | string | Denormalized display string captured in `user_scores` at score write time and projected into Redis. See § Data Storage Model for the denormalization rationale. |
| `score` | integer | The user's cumulative total score. |

**Example:**

```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: no-store

{
  "leaderboard": [
    { "rank": 1, "userId": "usr_abc123", "displayName": "Alice", "score": 4200 },
    { "rank": 2, "userId": "usr_def456", "displayName": "Bob",   "score": 3850 },
    { "rank": 3, "userId": "usr_ghi789", "displayName": "Carol", "score": 3200 }
  ]
}
```

### Leaderboard Content

**E-08:** The server SHALL return at most 10 entries in the `leaderboard` array, ordered by score descending (highest score first, rank 1). If fewer than 10 users have recorded scores, fewer entries SHALL be returned. The array MUST NOT be padded with placeholder entries. *(Satisfies LB-01: defines the top-10 ranked array with the correct field set — rank, userId, displayName, score.)*

### Tie-Breaking

**E-09:** When two or more users share identical scores, the user who reached that score value first SHALL hold the higher rank (lower rank number). The tiebreaker is the `score_reached_at` timestamp: the entry with the earlier timestamp wins the higher rank. `score_reached_at` records the moment the user's cumulative score was last increased — it is updated only when the score value changes, not by any other operation. This rule SHALL be applied consistently — it is a stable, deterministic ordering. *(Satisfies LB-02: eliminates non-deterministic rank assignment for equal-score users. Prevents gamification exploits where users deliberately match a target score to compete for rank via repeated submissions.)*

**Implementation note:** One Redis implementation pattern for this rule is to encode a composite sort key into `leaderboard:ranking`: `score_value * 10^13 + (epoch_max − score_reached_at_epoch_ms)`, while storing the canonical `score` and `score_reached_at` values in `leaderboard:user:<userId>`. Alternatively, a Lua script can perform a stable sort with `score_reached_at` as a secondary comparator. The specific implementation is left to the team; the observable behavior (earlier `score_reached_at` timestamp wins higher rank) is the SHALL requirement.

### Caching

**E-10:** Redis SHALL serve as the canonical live read model for leaderboard responses. Each `GET /leaderboard` request SHALL read the top 10 user IDs from `leaderboard:ranking` and then read `displayName`, canonical `score`, and `scoreReachedAt` from the corresponding `leaderboard:user:<userId>` hashes. No separate response cache layer is specified — freshness is maintained by the Redis projection's live update semantics. The `Cache-Control: no-store` response header (required by S-10 in the Security Model) prevents HTTP-layer caching by intermediaries. *(Defines a complete read model rather than relying on a sorted set alone to provide response fields it cannot store by itself.)*

> **Improvement suggestion:** Under burst read traffic, a short-TTL in-memory response cache (1–2 seconds) could reduce Redis read load without meaningfully degrading freshness. If implemented, the cache MUST be invalidated on every successful `POST /scores` response to prevent stale top-10 data from being served within the TTL window. This is an optional enhancement, not a normative requirement — it should be evaluated against observed Redis load in production.

**E-11:** The server SHALL respond to `GET /leaderboard` without requiring an `Authorization` header. The endpoint is publicly readable. *(Ensures the leaderboard is accessible to unauthenticated viewers, consistent with the scoreboard's public display use case.)*

### Error Responses

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Unexpected server error | 500 | `ERR_INTERNAL` |

`GET /leaderboard` does not return `400`, `401`, `403`, or `409` under normal operation. `429` rate limiting MAY be applied at the infrastructure level (reverse proxy / CDN) but is not a SHALL requirement for this endpoint.

---

## GET /leaderboard/stream

Delivers real-time leaderboard updates over Server-Sent Events (SSE). This endpoint is publicly readable — no authentication is required to establish a connection, consistent with `GET /leaderboard`. The server pushes the full current top-10 snapshot to all connected clients whenever a score change occurs.

**Non-goals:** This section does not specify SSE reconnect behavior, heartbeat keepalive interval, or `Last-Event-ID` handling. Those concerns are out of scope for v1.

### Request

**Method:** `GET`
**Path:** `/leaderboard/stream`
**Authentication:** None required (public endpoint — per D-01)
**Headers required:** None

**Example:**

```http
GET /leaderboard/stream HTTP/1.1
Accept: text/event-stream
```

### SSE Authentication & Access Control

This endpoint does not require an `Authorization` header or any form of token authentication. Browser-origin abuse mitigation is provided via Origin allowlist validation as defined in **S-13** (see Security Model § Response Headers). Requests from origins not present in the server-configured allowlist SHALL be rejected with `403 Forbidden` and error code `ERR_FORBIDDEN`.

### Event Schema

The server emits `leaderboard_update` events over the `text/event-stream` protocol. Each event carries the complete current top-10 leaderboard as a JSON payload.

**Wire format:**

```
event: leaderboard_update
data: {"leaderboard":[{"rank":1,"userId":"usr_abc123","displayName":"Alice","score":4200},{"rank":2,"userId":"usr_def456","displayName":"Bob","score":3850},...]}
```

The `data:` field is a JSON object matching the `GET /leaderboard` response schema exactly:

```json
{
  "leaderboard": [
    { "rank": 1, "userId": "usr_abc123", "displayName": "Alice", "score": 4200 },
    { "rank": 2, "userId": "usr_def456", "displayName": "Bob",   "score": 3850 }
  ]
}
```

**Field definitions:** `rank`, `userId`, `displayName`, and `score` carry the same semantics as defined in `GET /leaderboard` § Response. Raw score deltas are never sent — each event delivers the complete current state.

### Shall Requirements

**RT-01:** The server SHALL expose a `GET /leaderboard/stream` endpoint that delivers real-time leaderboard updates over Server-Sent Events (SSE) using the `text/event-stream` content type. The response MUST set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and `Connection: keep-alive` headers. *(Establishes the SSE transport contract; these headers are required by the SSE specification for browser `EventSource` compatibility.)*

**RT-02:** On each score change, the server SHALL emit an SSE event with `event: leaderboard_update` and a `data:` field containing the full current top-10 leaderboard as a JSON object matching the `GET /leaderboard` response schema: `{ "leaderboard": [ { "rank", "userId", "displayName", "score" }, ... ] }`. Raw score deltas SHALL NOT be sent — the client always receives the complete current state. *(Ensures clients maintain no partial state: each event is self-contained and sufficient to render the full leaderboard without local diffing.)*

**RT-03:** `GET /leaderboard/stream` SHALL NOT require an `Authorization` header or any form of token authentication — the stream is publicly readable, consistent with `GET /leaderboard`. The server SHALL apply Origin allowlist validation as defined in S-13 (see Security Model § Response Headers). Requests from origins not in the allowlist SHALL be rejected with `403 Forbidden` and error code `ERR_FORBIDDEN`. *(Origin allowlist validation is browser-origin abuse mitigation for the public stream — it prevents a malicious third-party page from silently subscribing to live score data on behalf of a visiting user. It is not an authentication mechanism.)*

**RT-04:** When a score change occurs (i.e., after a successful `POST /scores`), the server SHALL push a `leaderboard_update` event containing the complete top-10 snapshot to all active SSE clients. Individual score deltas SHALL NOT be broadcast — clients maintain no partial state and require no reconciliation logic. *(Full-snapshot broadcast eliminates client-side state management complexity and ensures every connected client converges to the same view after each update, even if events were missed.)*

**RT-05:** When a client establishes an SSE connection, the server SHALL immediately send a `leaderboard_update` event containing the current top-10 snapshot without waiting for the next score change. This eliminates the need for the client to make a separate `GET /leaderboard` call after connecting. *(Ensures clients see a populated leaderboard immediately on connect rather than waiting for the next score event, which may be arbitrarily delayed.)*

> **Implementation hint (non-normative):** In Fastify v5, SSE is implemented via `reply.raw` (the underlying Node.js `http.ServerResponse`). Set headers via `reply.raw.setHeader()`: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Write each event as `event: leaderboard_update\ndata: {...}\n\n` using `reply.raw.write()`. Do not use `reply.send()` — it closes the response stream immediately.

### Error Responses

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Origin not in allowlist | 403 | `ERR_FORBIDDEN` |
| Unexpected server error | 500 | `ERR_INTERNAL` |

Error response structure is defined in the Security Model § Error Contract. Error codes above are referenced by name only and are not redefined here.

---

## Execution Flow

The following sequence diagram shows the complete lifecycle of a score submission — from client action to durable acceptance to real-time broadcast.

```mermaid
sequenceDiagram
    participant Client
    participant API as API Server
    participant Verifier as Action Verifier
    participant DB as PostgreSQL
    participant Redis
    participant SSE as SSE Clients

    Client->>API: POST /scores<br/>{event_id, action_type, action_proof}<br/>Authorization: Bearer <JWT>
    API->>API: Validate JWT (S-01–S-04)<br/>alg=HS256, claims: sub/exp/iat/nbf/iss/aud

    alt JWT invalid or expired
        API-->>Client: 401 Unauthorized<br/>ERR_UNAUTHORIZED
    end

    API->>Verifier: Validate action_proof<br/>bound to sub, event_id, action_type

    alt Proof invalid, expired, replayed, or mismatched
        Verifier-->>API: reject
        API-->>Client: 403 Forbidden<br/>ERR_FORBIDDEN
    end

    API->>API: Check per-user rate limit (S-09)

    alt Rate limit exceeded
        API-->>Client: 429 Too Many Requests<br/>ERR_RATE_LIMITED
    end

    API->>DB: INSERT score_event UNIQUE(event_id)<br/>+ UPDATE user_scores in same transaction

    alt Duplicate event_id
        DB-->>API: unique violation
        API-->>Client: 409 Conflict<br/>ERR_CONFLICT
    end

    DB-->>API: committed {newScore, displayName, score_reached_at}
    API->>Redis: HSET leaderboard:user:<userId><br/>displayName, score, scoreReachedAt
    API->>Redis: ZADD leaderboard:ranking <rankKey> <userId>
    API->>Redis: ZREVRANGE leaderboard:ranking 0 9
    API->>Redis: HGETALL leaderboard:user:<top10 userIds>
    Redis-->>API: top-10 snapshot
    API-->>Client: 201 Created<br/>{userId, newScore, rank}
    API->>SSE: event: leaderboard_update<br/>data: {"leaderboard":[...top-10...]}
```

---

## Improvement Suggestions

The following are non-normative enhancement ideas for post-v1 consideration. None of these are SHALL requirements — they are engineering recommendations to improve security, scalability, and operational visibility over time.

### Security Enhancements

- **SSE connection lifetime policy:** The SSE stream is currently unauthenticated. For deployments where live score data should be restricted to active sessions, a future version could require a short-lived signed token (e.g., a query-string token issued by the API after successful login) and close the stream when that token expires, forcing reconnection with a fresh token.
- **Rate limiting enhancements:** Add per-IP rate limiting as a secondary control to complement per-user rate limiting (S-09). This limits damage from credential-stuffing attacks where many tokens are obtained by different means.
- **HMAC key rotation policy:** Define a scheduled key rotation policy for the HS256 signing secret. Implement a grace period during which both the old and new keys are accepted, then revoke the old key. Document the rotation procedure in an operations runbook.
- **Audit logging for rejections:** Log every rejected score submission with: userId (from JWT sub), event_id, rejection reason (ERR_* code), client IP (hashed for privacy), and timestamp. This audit trail enables post-incident analysis and anomaly detection.

### Scalability Considerations

- **Short-TTL in-memory response cache:** Under burst read traffic, a 1–2 second in-memory cache for `GET /leaderboard` responses reduces Redis read load without meaningfully degrading freshness. The cache MUST be invalidated on every successful `POST /scores` response. (Already noted inline at E-10.)
- **Redis cluster for write throughput:** For high-volume deployments, shard the leaderboard key across a Redis Cluster. Note that `ZINCRBY` and `ZREVRANGE` on a sharded key require hash tags to ensure the key lands on one slot.
- **Horizontal scaling with Redis pub/sub fan-out:** When running multiple API server instances, use Redis pub/sub to fan out `leaderboard_update` events. Each instance subscribes to a `leaderboard:updates` channel; on a successful `POST /scores`, the handling instance publishes to the channel, and all instances broadcast to their connected SSE clients. This eliminates sticky sessions as a requirement.

### Operational Recommendations

- **Health check endpoint:** Add `GET /health` (no authentication required) returning `200 OK` with `{ "status": "ok", "redis": "connected" }`. Use this for load balancer health checks and readiness probes in Kubernetes. (Maps to OPS-02.)
- **Structured logging format:** Emit all logs as JSON with fields: `timestamp`, `level`, `requestId`, `userId` (if authenticated), `endpoint`, `statusCode`, `durationMs`. Use a correlation ID (`requestId`) that is also returned in a `X-Request-ID` response header for client-side log correlation.
- **Metric counters:** Instrument the following counters: `scores.submitted.total`, `scores.rejected.validation`, `scores.rejected.replay`, `scores.rejected.ratelimit`, `leaderboard.reads.total`, `sse.connections.active`. Expose via a Prometheus `/metrics` endpoint or push to your observability platform.
- **Alerting thresholds:** Alert when: `scores.rejected.replay` rate exceeds 1% of total submissions (possible replay attack), `sse.connections.active` drops to 0 unexpectedly (possible broadcast failure), `scores.submitted.total` rate drops to 0 during active hours (possible ingestion outage).

### API Extensibility (v2 Ideas)

- **Personal score endpoint (`GET /scores/me`):** Returns the authenticated user's current rank and cumulative score. Requires JWT authentication. Response: `{ "userId", "rank", "score", "displayName" }`. (Maps to PERSONAL-01.)
- **Configurable leaderboard size (`GET /leaderboard?limit=N`):** Allow clients to request a smaller or larger top-N (e.g., top-5 for a widget, top-25 for an extended view). Default remains 10. Add `limit` as an optional query parameter with server-enforced maximum (e.g., 100). (Maps to PERSONAL-02.)
- **Ban/moderation endpoint:** `DELETE /scores/{userId}` (admin auth required) removes a user from the leaderboard and invalidates their active session tokens. Requires a separate admin role claim in the JWT.
