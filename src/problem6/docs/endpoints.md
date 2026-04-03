## Endpoints Overview

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/scores` | POST | JWT Bearer | Submit a completed action score increment |
| `/leaderboard` | GET | None | Retrieve the current top-10 ranked leaderboard |

---

## POST /scores

Submit a score increment for an authenticated user. The server resolves the score delta from the supplied `action_type` against an internal action registry; the client never supplies a numeric score value. User identity is derived exclusively from the JWT `sub` claim.

**Non-goals:** This section does not define the action registry schema or enumerate valid `action_type` values — those are implementation-specific and not part of this API contract. It also does not define the SSE broadcast triggered by a successful submission (see Phase 3 / `GET /leaderboard/stream`).

### Request

**Method:** `POST`
**Path:** `/scores`
**Authentication:** `Authorization: Bearer <JWT>` (see Security Model § Authentication)

**Request Body** (`Content-Type: application/json`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_id` | string | Yes | Client-generated nonce uniquely identifying this action occurrence. Used for replay prevention. Must be a non-empty string. |
| `action_type` | string | Yes | Identifies the completed action. The server looks up the authoritative score delta in an internal action registry. Must be a non-empty string matching a known action. |

No other fields are accepted. The request body MUST NOT include `score`, `score_increment`, `userId`, `user_id`, or any numeric score value. The server MUST treat any such field as absent or reject the request outright.

**Example:**

```http
POST /scores HTTP/1.1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "event_id": "evt_7f3a9c2d-1b4e-4f8a-9d0c-2e5b7a1f3c6d",
  "action_type": "level_complete"
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

**E-01:** The server SHALL reject any request whose body is missing `event_id` or `action_type` with `400 Bad Request` and error code `ERR_VALIDATION_FAILED`. Both fields are required; either field absent or empty string constitutes a validation failure. *(Satisfies SCORE-01: ensures the endpoint only accepts the correct two-field schema.)*

**E-02:** The server SHALL reject any request whose `action_type` value does not match a known entry in the server-side action registry with `400 Bad Request` and error code `ERR_VALIDATION_FAILED`. *(Satisfies SCORE-02 and D-07: unknown action types cannot produce score increments — all awarded point values are server-authoritative.)*

**E-03:** The server SHALL extract the acting user's identity exclusively from the JWT `sub` claim. The request body MUST NOT contain a writable `userId` or `user_id` field; any such field in the body SHALL be ignored or rejected. This requirement works in conjunction with S-05 (see Security Model § Anti-Cheat / IDOR Prevention). *(Satisfies SCORE-03: prevents IDOR — a user cannot award points to another account by supplying a different identifier in the request body.)*

**E-04:** The server SHALL look up the score delta for the supplied `action_type` from an internal action registry and apply that server-authoritative value as the increment. The client MUST NOT supply a numeric score field; the server MUST NOT use any client-supplied value as the score increment. *(Satisfies SCORE-02 and D-02: server-side delta computation prevents clients from awarding themselves arbitrary point values.)*

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

**E-05:** The server SHALL perform the `event_id` nonce check-and-store as a single atomic operation. The check (does this `event_id` already exist?) and the store (record it as consumed) MUST be indivisible — concurrent duplicate submissions MUST NOT both succeed. Acceptable implementations include Redis `SET key NX EX <ttl>`, a Lua script wrapping `EXISTS`+`SET`, or a database-level unique constraint within a transaction. The specific mechanism is an implementation detail; the atomicity guarantee is a SHALL requirement. *(Prevents replay attacks under concurrent load: without atomicity, two simultaneous requests with the same `event_id` can both pass the existence check before either stores the nonce, allowing double-scoring.)*

**E-06:** The server SHALL store consumed `event_id` nonces with a TTL of at least the maximum JWT lifetime (15 minutes, per S-03). A duplicate `event_id` received within the TTL window SHALL be rejected with `409 Conflict` and error code `ERR_CONFLICT`. *(Satisfies SCORE-06 and D-10: nonces outlive the tokens that generated them, closing the window for delayed replay after token expiry.)*

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

**E-07:** The server SHALL increment the user's cumulative score using an atomic increment operation. For Redis implementations: use `ZINCRBY <leaderboard_key> <delta> <userId>`. For SQL implementations: use a single `UPDATE scores SET score = score + $delta WHERE user_id = $userId` statement. Read-modify-write sequences (SELECT then UPDATE) are explicitly prohibited. *(Satisfies SCORE-05 and D-18: prevents race conditions in which two concurrent submissions from the same user read the same stale total and each overwrite it with the same incremented value, losing one increment.)*

### Error Responses

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Missing `event_id` or `action_type` | 400 | `ERR_VALIDATION_FAILED` |
| Unknown `action_type` | 400 | `ERR_VALIDATION_FAILED` |
| JWT missing or invalid | 401 | `ERR_UNAUTHORIZED` |
| Duplicate `event_id` (within TTL) | 409 | `ERR_CONFLICT` |
| Rate limit exceeded | 429 | `ERR_RATE_LIMITED` |
| Unexpected server error | 500 | `ERR_INTERNAL` |

Error response structure is defined in the Security Model § Error Contract. Error codes above are referenced by name only and are not redefined here.

---

## GET /leaderboard

Retrieve the current top-10 ranked leaderboard. No authentication is required — the leaderboard is publicly readable. The response reflects the live state of the Redis sorted set at the moment of the request.

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
| `displayName` | string | Denormalized display string stored alongside the score record at write time. **Implementation note:** `displayName` MUST be populated at score write time (e.g., from the JWT payload or a user profile lookup at submission). It MUST NOT be fetched from a separate user service at read time, as that would add latency and introduce a dependency on the user profile service to the read path. |
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

**E-09:** When two or more users share identical scores, the user who reached that score value first SHALL hold the higher rank (lower rank number). The tiebreaker is the `last_score_updated` timestamp: the entry with the earlier timestamp wins the higher rank. This rule SHALL be applied consistently — it is a stable, deterministic ordering. *(Satisfies LB-02: eliminates non-deterministic rank assignment for equal-score users. Prevents gamification exploits where users deliberately match a target score to compete for rank via repeated submissions.)*

**Implementation note:** One Redis implementation pattern for this rule is to encode a composite sort key: `score_value * 10^13 + (epoch_max − last_updated_epoch_ms)`, storing the composite as the sorted set score so that equal point values naturally sort older entries above newer ones. Alternatively, a Lua script can perform a stable sort with `last_score_updated` as a secondary comparator. The specific implementation is left to the team; the observable behavior (earlier `last_score_updated` timestamp wins higher rank) is the SHALL requirement.

### Caching

**E-10:** The Redis sorted set SHALL serve as the canonical, always-fresh leaderboard store. Each `GET /leaderboard` request SHALL read directly from Redis (e.g., `ZREVRANGE leaderboard 0 9 WITHSCORES`). No separate response cache layer is specified — freshness is maintained by the sorted set's live update semantics. The `Cache-Control: no-store` response header (required by S-10 in the Security Model) prevents HTTP-layer caching by intermediaries. *(Satisfies LB-03: caching strategy defined with explicit non-reliance on an HTTP response cache; Redis sorted set is the authoritative data source.)*

> **Improvement suggestion:** Under burst read traffic, a short-TTL in-memory response cache (1–2 seconds) could reduce Redis read load without meaningfully degrading freshness. If implemented, the cache MUST be invalidated on every successful `POST /scores` response to prevent stale top-10 data from being served within the TTL window. This is an optional enhancement, not a normative requirement — it should be evaluated against observed Redis load in production.

**E-11:** The server SHALL respond to `GET /leaderboard` without requiring an `Authorization` header. The endpoint is publicly readable. *(Ensures the leaderboard is accessible to unauthenticated viewers, consistent with the scoreboard's public display use case.)*

### Error Responses

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Unexpected server error | 500 | `ERR_INTERNAL` |

`GET /leaderboard` does not return `400`, `401`, `403`, or `409` under normal operation. `429` rate limiting MAY be applied at the infrastructure level (reverse proxy / CDN) but is not a SHALL requirement for this endpoint.
