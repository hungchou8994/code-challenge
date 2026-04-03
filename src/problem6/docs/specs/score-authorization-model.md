# Score Authorization Model

**Version:** 1.0  
**Phase:** 1 — Secure Score Ingest Boundary  
**Status:** Implementation-ready specification

---

## Overview

This document defines the two trust patterns that authorize a score mutation at the `POST /v1/score-events` boundary, the canonical signed fields for the score grant format, and the ordered verification checks that must pass before the service forms a score command.

Score changes are permitted only when the caller can prove one of the two supported patterns. No other trust basis is accepted.

---

## Supported Trust Patterns

### Pattern A: Trusted Service-to-Service Caller

A trusted service-to-service caller is a backend service in the same deployment environment that authenticates its identity at the transport or application layer (e.g., mTLS with a service certificate, or a short-lived internal JWT with `aud: score-api`). The service identity must appear in the issuer allowlist maintained by the score API.

**When to use:** internal trusted callers are preferred when another backend service submits the score event as part of processing a completed user action (for example, a game completion worker, a challenge evaluation service, or an order fulfillment backend). The caller inherits the trust of its deployment credentials rather than needing to mint a per-action grant.

**Evidence required at the API boundary:**
- Valid `Authorization` header carrying a credential verifiable against the issuer allowlist
- Correct audience claim (`aud: score-api`)
- Non-expired credential
- `actionContext.subjectUserId` field in the request body (callers must name the subject user explicitly)

### Pattern B: Signed One-Time Score Grant

A signed one-time score grant is a short-lived JWT minted by a trusted backend after a completed user action. The grant is issued server-side and handed to the presenter (typically the website) as proof that the action occurred and the specified user earned the points.

**When to use:** signed grants are preferred when the website must present proof of a completed action directly to the score API — for example, when a browser-side completion event initiates the score submission and no separate internal service handles the handoff. The grant is the bridge between the untrusted browser and the authorized ingest boundary.

**Evidence required at the API boundary:**
- `grant.token` field in the request body containing the signed grant JWT
- `Authorization` header may carry the same token or a supporting service credential

---

## Canonical Signed Grant Fields

The following fields are required in every signed score grant. Any grant missing a required field is rejected at the signature-verification step, before any score command is formed.

| Field | Type | Description |
|-------|------|-------------|
| `issuer` | string | The authority that minted this grant. Must match an entry in the service's issuer allowlist. |
| `subject_user_id` | string | The user whose score this grant authorizes to increase. Must match `actionContext.subjectUserId` in the request body. |
| `action_id` | string | Unique, stable identifier for the specific action occurrence that earned the score. Used as the idempotency boundary for the score write. |
| `points` | integer | The authorized score increment. Must be a positive integer within the action-type policy bounds. Clients never choose this value. |
| `nonce` | string | A single-use random value that prevents grant replay. The service enforces nonce reuse detection. |
| `issued_at` | integer (Unix epoch) | Timestamp when the grant was minted. Used to derive the effective validity window. |
| `expires_at` | integer (Unix epoch) | Hard expiry timestamp. The service rejects any grant presented after this time, with no grace period. |
| `audience` | string | Must be exactly `score-api`. Prevents a grant issued for another service from being used at this endpoint. |

---

## Verification Checks

These checks are performed in order for every signed grant before a score command is formed. Failure at any check terminates the request with the appropriate rejection status (see [score-ingest-decision-matrix.md](./score-ingest-decision-matrix.md) for the complete rejection matrix):

1. **Issuer allowlist check** — `issuer` must appear in the configured allowlist. Unknown issuers are rejected immediately.
2. **Audience check** — `audience` must equal `score-api`. A grant issued to a different service audience is rejected.
3. **Signature verification** — the JWT signature must be valid under the public key registered for the issuer.
4. **Expiry check** — `expires_at` must be in the future at the moment the check runs. Expired grants are rejected.
5. **User binding check** — `subject_user_id` must match `actionContext.subjectUserId` in the request body. A grant bound to a different user than the request names is rejected.
6. **Action binding check** — `action_id` must be present and non-empty. The action identifier is later verified for uniqueness at the persistence layer (Phase 2).
7. **Points policy check** — `points` must be a positive integer within the maximum delta permitted for the `actionContext.actionType`. Points outside the policy range are rejected.
8. **Nonce reuse check** — `nonce` must not have been seen before within the grant's validity window. Nonce reuse detection prevents grant replay even when the action ID and signature are otherwise valid.

No score command is formed until all eight checks pass.

---

## Caller Pattern Decision Table

| Submission Scenario | Recommended Pattern | Reasoning |
|--------------------|---------------------|-----------|
| Another backend service (e.g., challenge worker, payment service) finalizes the action and submits the score event | Pattern A: trusted service-to-service caller | The submitting service already holds deployment credentials; a per-action grant would add unnecessary round-trips. |
| The website must present proof of a completed action directly to the score API after a browser-side event | Pattern B: signed one-time score grant | The website cannot carry long-lived service credentials safely; the grant provides bounded, verifiable proof without giving the browser inherent scoring authority. |
| A third-party integration must notify the platform of a score-bearing action | Pattern B: signed one-time score grant | External parties cannot be added to the internal service allowlist safely; signed grants provide a controlled, auditable delegation path. |

---

## Security Properties

- **No browser authority** — the browser can present a grant it received, but it cannot mint one. The grant-issuing service is always a trusted backend.
- **Bounded by action** — each grant authorizes exactly one action occurrence. After use, the nonce is retired and the `action_id` is idempotency-locked.
- **Time-bounded** — grants expire. A captured or leaked grant cannot be replayed after its `expires_at` timestamp.
- **Issuer-scoped** — grants are only accepted from registered issuers. A compromised issuer can be removed from the allowlist to revoke all grants it minted.

---

## Relationship to Other Specs

- **Ingest endpoint and request/response contract:** [score-ingest-contract.md](./score-ingest-contract.md)
- **Ordered pre-mutation validation pipeline:** [score-ingest-decision-matrix.md](./score-ingest-decision-matrix.md)
- **Layered throttling and kill-switch behavior:** [score-ingest-edge-protection.md](./score-ingest-edge-protection.md)

---

*Specification phase: Phase 1 — Secure Score Ingest Boundary*  
*Last updated: 2026-04-01*
