# Score Ingest Edge Protection

**Version:** 1.0  
**Phase:** 1 — Secure Score Ingest Boundary  
**Status:** Implementation-ready specification

---

## Overview

This document defines the layered protection model for `POST /v1/score-events`. Protection is applied in depth: a coarse edge limit runs before signature verification to contain unauthenticated traffic at low cost, then stricter issuer and user-level limits apply once the caller identity is known.

The protection model is independent of the validation gate ordering; for the ordered validation pipeline, see [score-ingest-decision-matrix.md](./score-ingest-decision-matrix.md).

---

## Throttle Dimensions

Four independent throttle dimensions apply in the following enforcement order:

### 1. per IP (pre-auth coarse limit)

Applied before signature verification to protect the verification compute path itself.

| Metric | Starter Threshold |
|--------|------------------|
| Requests per second | 20 req/s per IP |
| Burst allowance | 40 req in a 2-second window |
| Rejection status | `429 Too Many Requests` |
| Retry-After guidance | 5 seconds |

**Purpose:** prevents unauthenticated flood traffic from exhausting signature verification resources. This limit is intentionally loose — it blocks runaway clients without obstructing normal users who may share an IP via a corporate NAT or proxy.

### 2. invalid signature (pre-auth penalty limit)

Tracked separately from the coarse per IP limit to tighten controls on callers that repeatedly fail verification.

| Metric | Starter Threshold |
|--------|------------------|
| Invalid signature events per 60 seconds | 10 per IP |
| Lockout duration after threshold | 300 seconds |
| Rejection status | `429 Too Many Requests` |

**Purpose:** raises the cost of brute-force or probe attacks against the signature verification path without penalizing IPs that submit legitimate traffic alongside occasional invalid grants.

### 3. per issuer (post-auth issuer limit)

Applied after the caller identity and issuer are confirmed. Protects against a single compromised or runaway issuer overwhelming the ingest path.

| Metric | Starter Threshold |
|--------|------------------|
| Accepted events per minute | 500 per issuer |
| Burst allowance | 800 events in any 2-minute window |
| Rejection status | `429 Too Many Requests` |
| Retry-After guidance | 60 seconds |

**Purpose:** the issuer limit is the primary throughput boundary for legitimate producers. The starter threshold is generous for normal scoring patterns and should be tuned per-issuer based on observed event rates.

### 4. per subject user (post-auth user limit)

Applied after the subject user is extracted from the grant or request body. Prevents a single user's score from being targeted for flooding.

| Metric | Starter Threshold |
|--------|------------------|
| Accepted events per minute | 30 per subject user |
| Burst allowance | 50 events in any 2-minute window |
| Rejection status | `429 Too Many Requests` |

**Purpose:** limits the rate at which any single user's score can be incremented. This protects the scoring path against targeted per-user abuse without constraining normal play patterns.

---

## Enforcement Order

Throttle checks are applied in this order to minimize compute cost on rejected traffic:

1. **per IP** — checked first (before any parsing or verification)
2. **invalid signature** — checked when a signature verification failure occurs
3. **per issuer** — checked after issuer identity is confirmed
4. **per subject user** — checked after subject user is extracted from the grant or request body

A request failing any throttle check is rejected immediately with `429 Too Many Requests`. No further validation gates are evaluated on a throttle-rejected request.

---

## Load-Shedding Behavior

When the score API detects degraded downstream conditions (e.g., PostgreSQL write latency exceeds acceptable thresholds, or the score command service reports backpressure), the ingest API enters load-shedding mode:

- Requests from issuers with low priority or elevated anomaly signals are rejected with `429 Too Many Requests` and a `Retry-After` header
- Requests from trusted high-priority issuers continue to be processed
- Load-shedding mode acts as a temporary admission throttle before queue admission; it does not introduce a new public status code beyond the contract defined in `score-ingest-contract.md`
- The API returns to normal mode automatically when downstream health signals recover

---

## Kill-Switch Behavior

The service maintains a kill-switch mechanism for two scenarios that require immediate traffic cutoff without changing the contract for legitimate traffic:

### Compromised Issuer

If a registered issuer's signing key is compromised or the issuer is found to be minting fraudulent grants:

1. The issuer is removed from the allowlist (in-memory update propagated within one configuration reload cycle, target < 30 seconds)
2. All subsequent requests presenting grants from the removed issuer are rejected with `403 Forbidden`
3. Existing in-flight requests that completed verification before the removal are not affected
4. Legitimate traffic from other issuers continues without disruption

**kill-switch activation:** operator action via configuration update or admin API call; no deployment required.

### Runaway Client

If a specific client (identified by IP, client ID, or issuer+user combination) exhibits anomalous scoring patterns:

1. The client is added to a block list (in-memory, propagated within one configuration reload cycle)
2. All subsequent requests from the blocked client are rejected with `429 Too Many Requests`
3. The block list is separate from the normal throttle counters and persists until explicitly cleared
4. Other clients using the same issuer continue without disruption

**kill-switch activation:** operator action; automatic revert is not applied (manual clear required).

---

## Monitoring Signals

The following counters should be exposed as metrics to detect abuse and calibrate threshold tuning:

| Counter | Description |
|---------|-------------|
| `score_ingest_throttle_total{dimension}` | Count of requests rejected per throttle dimension (per_ip, invalid_signature, per_issuer, per_subject_user) |
| `score_ingest_invalid_signature_total` | Total invalid signature events, useful for alerting on probe activity |
| `score_ingest_load_shed_total` | Requests rejected during load-shedding mode |
| `score_ingest_kill_switch_active{type}` | Binary gauge indicating whether a kill-switch is active (compromised_issuer, runaway_client) |

---

## Relationship to Other Specs

- **Ingest endpoint and request/response contract:** [score-ingest-contract.md](./score-ingest-contract.md)
- **Authorization model:** [score-authorization-model.md](./score-authorization-model.md)
- **Ordered validation pipeline (where throttles are positioned):** [score-ingest-decision-matrix.md](./score-ingest-decision-matrix.md)

---

*Specification phase: Phase 1 — Secure Score Ingest Boundary*  
*Last updated: 2026-04-01*
