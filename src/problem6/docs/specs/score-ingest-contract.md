# Score Ingest Contract

**Version:** 1.0  
**Phase:** 1 — Secure Score Ingest Boundary  
**Status:** Implementation-ready specification

---

## Overview

`POST /v1/score-events` is the sole authenticated entry point for score mutations. The endpoint is intentionally narrow: it accepts score events only from trusted producers and rejects any request that lacks the correct trust evidence before any score mutation is attempted.

**Invariant:** client-authored `points`, `delta`, and `user_id` values are never authoritative for score mutation. The service derives the authoritative score increment from the verified grant or trusted service call, never from raw client fields.

---

## Endpoint

```
POST /v1/score-events
Content-Type: application/json
```

---

## Allowed Callers

Only two caller patterns may reach this endpoint:

1. **Trusted internal service** — another backend service authenticated via service-to-service auth (e.g., mTLS, internal JWT with `aud: score-api`). No browser or end-user token is accepted for score mutation.
2. **Caller presenting a server-issued signed grant** — a frontend or downstream caller that holds a single-use, time-bound score grant minted by a trusted backend after a completed user action. See [score-authorization-model.md](./score-authorization-model.md) for the full grant format and verification rules.

---

## Required Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Bearer token for service-to-service auth, or the signed grant JWT. Must be verifiable against the issuer allowlist. |
| `Idempotency-Key` | Yes | Client-generated unique key (UUID v4 recommended) scoped to this specific score event submission. Enables safe retries without duplicate score application. |
| `X-Request-Id` | Recommended | Caller-supplied correlation ID propagated to all downstream services and audit logs for end-to-end tracing. If absent, the service generates one. |
| `Content-Type` | Yes | Must be `application/json`. |

---

## Request Body

The request body is a JSON object with the following top-level sections:

### `grant` (required for signed-grant callers)

Contains the server-issued signed score grant. Internal trusted callers omit this field and rely solely on their service identity.

```json
{
  "grant": {
    "token": "<signed JWT string>"
  }
}
```

The grant token encodes `issuer`, `subject_user_id`, `action_id`, `points`, `nonce`, `issued_at`, `expires_at`, and `audience`. See [score-authorization-model.md](./score-authorization-model.md) for the canonical field list and verification requirements.

### `actionContext` (required)

Describes the score-bearing action that produced this event.

```json
{
  "actionContext": {
    "actionId": "act_01HV8ZQ3XRYNKBT4NP0SRZQM1A",
    "actionType": "challenge_completed",
    "subjectUserId": "usr_01HV8ZQ3XRYNKBT4NP0SRZQM1B"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `actionId` | string | Unique, stable identifier for this specific action occurrence. Used as the idempotency boundary for score writes. |
| `actionType` | string | Opaque action type identifier. The service maps this to an authorized points policy. |
| `subjectUserId` | string | The user whose score is being updated. Must match the `subject_user_id` in the grant when a grant is provided. |

### `clientContext` (optional)

Supplementary metadata for observability and audit. These fields are never used to derive the score delta.

```json
{
  "clientContext": {
    "sessionId": "sess_01HV8ZQ3XRYNKBT4NP0SRZQM1C",
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
  }
}
```

**Reminder:** client-authored `points`, `delta`, and `user_id` values are never authoritative for score mutation. Any such fields in the request body are ignored; the service derives the applied increment from the verified grant or trusted service call.

---

## Request / Response Matrix

| Scenario | HTTP Status | Response Body | Retryable |
|----------|-------------|---------------|-----------|
| Score event accepted and queued for commit | `202 Accepted` | `{ "eventId": "...", "status": "accepted" }` | Not applicable |
| Missing or invalid `Authorization` header | `401 Unauthorized` | `{ "error": "unauthorized", "message": "..." }` | After obtaining valid credentials |
| Caller authenticated but not in issuer allowlist, or grant audience mismatch | `403 Forbidden` | `{ "error": "forbidden", "message": "..." }` | No — caller must obtain a valid grant |
| Duplicate `Idempotency-Key` with identical payload (retry of an already-accepted event) | `409 Conflict` | `{ "error": "conflict", "message": "duplicate idempotency key", "originalEventId": "..." }` | No — original result is authoritative |
| Grant expired, nonce already used, `actionId` already processed, or schema validation failure | `422 Unprocessable Entity` | `{ "error": "unprocessable", "message": "...", "field": "..." }` | No — new grant required |
| Request rate exceeds ingest throttle limits | `429 Too Many Requests` | `{ "error": "rate_limited", "retryAfter": 5 }` | Yes — after `Retry-After` interval |

---

## Rejection Guarantee

Unauthorized, malformed, or out-of-policy requests are rejected before any score mutation is attempted. No partial writes occur. The endpoint is an all-or-nothing boundary: a `202 Accepted` response guarantees the event has been validated and handed off to the score command service for durable commit.

---

## Idempotency Semantics

- The `Idempotency-Key` header binds a specific submission attempt to its outcome.
- A repeated submission with the same `Idempotency-Key` and the same payload returns `409 Conflict` with the original event ID, never applies the score twice.
- A repeated submission with the same `Idempotency-Key` but a different payload is treated as a conflict and rejected.
- The `actionId` inside `actionContext` is the secondary deduplication boundary at the score-write level, enforced by a unique constraint in the persistence layer (Phase 2).

---

## Relationship to Other Specs

- **Authorization model and trust patterns:** [score-authorization-model.md](./score-authorization-model.md)
- **Layered throttling and abuse controls:** [score-ingest-edge-protection.md](./score-ingest-edge-protection.md)
- **Ordered pre-mutation validation gates:** [score-ingest-decision-matrix.md](./score-ingest-decision-matrix.md)
- **Persistence, idempotent mutation, and audit trail:** Phase 2 specifications (not in scope for Phase 1)

---

*Specification phase: Phase 1 — Secure Score Ingest Boundary*  
*Last updated: 2026-04-01*
