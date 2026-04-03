# Score Ingest Decision Matrix

**Version:** 1.0  
**Phase:** 1 — Secure Score Ingest Boundary  
**Status:** Implementation-ready specification

---

## Overview

This document defines the ordered pre-mutation validation pipeline for `POST /v1/score-events`. Every gate must pass before the request is handed off to the Phase 2 score command service for durable mutation.

**Rule:** no request reaches Phase 2 mutation logic until every Phase 1 gate passes.

---

## Ordered Validation Pipeline

Gates are evaluated in the order listed. A request failing any gate is rejected immediately; no subsequent gates are evaluated.

| # | Gate | Failure Reason | HTTP Status | Retryable | Security Counter |
|---|------|---------------|-------------|-----------|-----------------|
| 1 | **request schema validation** | Request body is missing required fields, fields are wrong types, or `actionContext` is malformed | `422 Unprocessable Entity` | No — fix the request | No |
| 2 | **caller authentication** | `Authorization` header is absent, token is unparseable, or signature is cryptographically invalid | `401 Unauthorized` | After obtaining valid credentials | Yes — increment `invalid_auth_total` |
| 3 | **issuer allowlist** | Token `issuer` claim is not in the configured allowlist, or the issuer has been kill-switched | `403 Forbidden` | No — issuer must be registered | Yes — increment `unknown_issuer_total` |
| 4 | **grant expiry** | Grant or token `expires_at` / `exp` is in the past at the moment of evaluation | `422 Unprocessable Entity` | No — a new grant is required | No |
| 5 | **user binding** | Grant `subject_user_id` does not match `actionContext.subjectUserId` in the request body | `422 Unprocessable Entity` | No — grant and request must name the same user | Yes — increment `user_binding_mismatch_total` |
| 6 | **points policy** | Grant `points` value is zero, negative, or exceeds the maximum delta permitted for the `actionContext.actionType` | `422 Unprocessable Entity` | No — a new grant within policy bounds is required | Yes — increment `points_policy_violation_total` |
| 7 | **nonce / idempotency pre-check** | Grant `nonce` has already been seen within the validity window, or `Idempotency-Key` was previously submitted with a different payload | `422 Unprocessable Entity` (nonce reuse) / `409 Conflict` (idempotency key conflict) | No | Yes — increment `nonce_reuse_total` or `idempotency_conflict_total` |
| 8 | **edge throttling** | Request rate exceeds the per IP, per issuer, per subject user, or invalid signature throttle threshold | `429 Too Many Requests` | Yes — after `Retry-After` interval | Yes — increment `throttle_rejected_total{dimension}` |
| — | **score-command handoff** | All gates pass | `202 Accepted` (returned after validated handoff to the Phase 2 mutation path) | Not applicable | No |

---

## Gate Details

### Gate 1: Request Schema Validation

**Purpose:** reject syntactically invalid requests before any crypto or database work is done.

**Checks:**
- Request `Content-Type` is `application/json`
- `actionContext` object is present and contains `actionId` (non-empty string), `actionType` (non-empty string), and `subjectUserId` (non-empty string)
- `Idempotency-Key` header is present and non-empty
- If `grant.token` is present, it must be a non-empty string (structural check only; cryptographic verification is Gate 2)

**Rejection:** `422 Unprocessable Entity` with `field` indicating the first failing constraint.

---

### Gate 2: Caller Authentication

**Purpose:** verify the caller's identity before any allowlist or grant claim is trusted.

**Checks for Pattern A (trusted service caller):**
- `Authorization` header carries a parseable credential
- Credential signature is valid under the expected verification key
- `aud` claim equals `score-api`

**Checks for Pattern B (signed grant caller):**
- `grant.token` is a parseable JWT
- JWT header identifies a supported algorithm (e.g., ES256, RS256 — HS256 symmetric algorithms are not accepted)
- JWT signature is cryptographically valid under the public key for the issuer named in the `iss` claim

**Rejection:** `401 Unauthorized`. Invalid signature events are counted by the invalid signature throttle dimension.

---

### Gate 3: Issuer Allowlist

**Purpose:** ensure only registered issuers can submit score events.

**Checks:**
- `iss` claim in the grant or service credential appears in the current allowlist
- The issuer has not been kill-switched (see [score-ingest-edge-protection.md](./score-ingest-edge-protection.md))

**Rejection:** `403 Forbidden`. Unknown issuers are a higher-severity signal than auth failures because they indicate either misconfiguration or an active probing attempt.

---

### Gate 4: Grant Expiry

**Purpose:** enforce time-bounded use of signed grants to limit the replay window.

**Checks:**
- `expires_at` (or JWT `exp`) is strictly after the current server time
- No grace period is applied

**Rejection:** `422 Unprocessable Entity` with reason `grant_expired`. A new grant must be minted.

---

### Gate 5: User Binding

**Purpose:** prevent a grant issued for one user from being used to update a different user's score.

**Checks:**
- `subject_user_id` in the grant matches `actionContext.subjectUserId` in the request body (exact string comparison)

**Rejection:** `422 Unprocessable Entity` with reason `user_binding_mismatch`. This is treated as a potential tampering signal.

---

### Gate 6: Points Policy

**Purpose:** enforce that the authorized score increment is within sanctioned bounds for the action type.

**Checks:**
- `points` is a positive integer (> 0)
- `points` does not exceed the maximum delta configured for `actionContext.actionType`
- If the `actionType` is unknown, the request is rejected (unknown action types are not allowed through)

**Rejection:** `422 Unprocessable Entity` with reason `points_policy_violation`.

---

### Gate 7: Nonce / Idempotency Pre-Check

**Purpose:** early rejection of replay attempts and idempotency key conflicts before touching the write path.

**Checks:**
- Grant `nonce` has not been recorded in the nonce store within the grant's validity window
- `Idempotency-Key` has not been previously submitted, OR was submitted with the same payload (safe retry) — conflicting payloads are rejected

**Note:** this gate is a pre-check using a fast cache (e.g., Redis). The authoritative idempotency enforcement occurs in the Phase 2 persistence layer via unique database constraints. A cache miss does not bypass the database constraint; it only means the fast path did not catch it early.

**Rejection:**
- Nonce reuse: `422 Unprocessable Entity` with reason `nonce_already_used`
- Idempotency key conflict: `409 Conflict` with `originalEventId` from the prior submission

---

### Gate 8: Edge Throttling

**Purpose:** protect the service from rate abuse after identity is confirmed but before the request is admitted to the write queue.

**Checks:** per the throttle dimensions in [score-ingest-edge-protection.md](./score-ingest-edge-protection.md):
- per issuer request rate is within threshold
- per subject user request rate is within threshold

(per IP and invalid signature throttle checks occur earlier in the request lifecycle, before Gate 1.)

**Rejection:** `429 Too Many Requests` with `Retry-After` header.

---

### Score-Command Handoff

After all eight gates pass, the validated request parameters are assembled into a score command and handed off to the Phase 2 score command service:

```
score-command handoff
  issuer:          <verified issuer from grant/credential>
  subjectUserId:   <from actionContext.subjectUserId>
  actionId:        <from actionContext.actionId>
  actionType:      <from actionContext.actionType>
  points:          <from verified grant>
  idempotencyKey:  <from Idempotency-Key header>
  requestId:       <from X-Request-Id header or generated>
```

The handoff payload contains only verified fields. Client-supplied points, delta, or userId values are never included. At this boundary the API returns `202 Accepted`, indicating the request passed Phase 1 validation and was handed off to the Phase 2 mutation path; durable commit semantics are defined in Phase 2.

---

## Constraint: No Phase 2 Bypass

No request reaches Phase 2 mutation logic until every Phase 1 gate passes. This constraint is enforced structurally: the score-command handoff only occurs at the end of the pipeline, after gate 8. There is no conditional bypass, early exit to Phase 2, or alternative path that skips any gate.

---

## Rejection Summary

| HTTP Status | Gates That Produce It | Meaning |
|-------------|----------------------|---------|
| `401 Unauthorized` | Gate 2 | Missing or invalid authentication |
| `403 Forbidden` | Gate 3 | Issuer not allowed |
| `409 Conflict` | Gate 7 | Idempotency key reuse with different payload |
| `422 Unprocessable Entity` | Gates 1, 4, 5, 6, 7 | Invalid request content |
| `429 Too Many Requests` | Gate 8 | Rate limit exceeded |

---

## Relationship to Other Specs

- **Ingest endpoint contract:** [score-ingest-contract.md](./score-ingest-contract.md)
- **Authorization model and grant fields:** [score-authorization-model.md](./score-authorization-model.md)
- **Throttle dimensions and kill-switch behavior:** [score-ingest-edge-protection.md](./score-ingest-edge-protection.md)

---

*Specification phase: Phase 1 — Secure Score Ingest Boundary*  
*Last updated: 2026-04-01*
