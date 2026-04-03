## Security Model

This security model defines the authentication and protection mechanisms for the scoreboard API's score submission endpoint. It establishes JWT bearer authentication requirements, anti-cheat and IDOR prevention constraints, transport security controls, rate limiting policy, and mandatory response headers. Together, these controls prevent malicious users from increasing scores without authorization.

**Non-goals:** This security model does not cover client-side XSS mitigations, CSRF protection on non-API routes, OAuth or social login flows, or game-server-to-API trust verification. Those concerns are out of scope for this module.

### Authentication

**S-01:** The server SHALL accept only HS256 (HMAC-SHA256) as the JWT signing algorithm. The `alg` header field MUST be verified before any claim inspection. Tokens specifying `alg:none` or any algorithm other than `HS256` SHALL be rejected immediately with `401 Unauthorized`, regardless of signature validity. *(Prevents JWT algorithm confusion attacks and algorithm downgrade attacks in which an attacker strips the signature by setting `alg:none`.)*

**S-02:** The server SHALL validate all six mandatory claims on every inbound request: `sub` (the user's identity — the score owner), `exp` (token expiry timestamp), `iat` (issued-at timestamp, used for clock skew validation), `nbf` (not-before timestamp — token MUST NOT be accepted before this time; if `nbf` is present and the current time is before `nbf`, the token is rejected), `iss` (issuer — must exactly match the server-configured issuer string), and `aud` (audience — must exactly match the server-configured audience string). A token that is missing any of these claims, or that presents any claim value that does not pass validation, SHALL be rejected with `401 Unauthorized`. *(Prevents forged or partially constructed tokens from being accepted as legitimate credentials; `nbf` additionally prevents pre-issued tokens from being used before their intended validity window.)*

**S-03:** The server SHALL enforce a maximum JWT lifetime of 15 minutes via the `exp` claim. Specifically, `exp − iat` MUST be ≤ 900 seconds. Tokens for which this constraint is violated, or for which `exp` has already elapsed at the time of the request, SHALL be rejected with `401 Unauthorized` regardless of signature validity. *(Reduces the window of opportunity for token-theft replay attacks: a stolen token becomes useless within 15 minutes.)*

**S-04:** `POST /scores` SHALL require the JWT to be presented in the `Authorization: Bearer <token>` HTTP request header. Requests that omit this header, or that present it with a value that is not a well-formed Bearer token, SHALL be rejected with `401 Unauthorized`. *(Note: SSE connection authentication via `GET /leaderboard/stream` uses a different mechanism — the `EventSource` browser API does not support custom headers. That mechanism is specified in Phase 3.)*

### Anti-Cheat / IDOR Prevention

**S-05:** The server SHALL extract the acting user's identity exclusively from the JWT `sub` claim. The request body MUST NOT contain a writable `userId` or `user_id` field. If the request body supplies either field, the server SHALL ignore or reject it — the identity used for all score operations MUST be the `sub` value from the validated JWT. *(Prevents Insecure Direct Object Reference (IDOR): without this control, an authenticated user could claim to act as another user simply by supplying a different identifier in the request body.)*

**S-06:** The server SHALL store each processed `event_id` nonce with a time-to-live (TTL) at least equal to the maximum score-submission window defined by the JWT TTL (15 minutes). Duplicate submissions presenting an `event_id` that has already been processed within its TTL window SHALL be rejected with `409 Conflict` and error code `ERR_CONFLICT`. *(Prevents replay attacks: a captured valid request cannot be resubmitted to inflate scores, because the server recognises the nonce as already consumed.)*

**S-07:** The server SHALL validate score increments server-side. The client request body supplies only an `event_id` and an `action_type`; the server looks up and applies the authoritative score delta for that action type. The client MUST NOT supply an absolute `score` value, a numeric `score_increment`, or any other numeric field that directly determines the awarded points. *(Prevents score manipulation by direct value injection: a client cannot award itself an arbitrary number of points by crafting a large numeric value in the request.)*

### Transport Security

**S-08:** The server SHALL operate exclusively over HTTPS (TLS 1.2 minimum; TLS 1.3 recommended). Plaintext HTTP connections to any API endpoint SHALL be rejected or redirected with a permanent redirect (301); no API endpoint SHALL accept or process a request received over unencrypted HTTP. *(Prevents token interception and man-in-the-middle attacks: a JWT transmitted over plaintext HTTP can be captured and replayed by a network-level observer.)*

### Rate Limiting

**S-09:** The server SHALL enforce per-user rate limiting on `POST /scores`. The rate limit is applied per authenticated user (identified by the JWT `sub` claim). When the per-user submission rate is exceeded, the server SHALL return `429 Too Many Requests` with a `Retry-After` response header whose value is the number of seconds until the next allowed request from that user. *(Prevents score flooding: without this control, an attacker with a valid token could submit scores in rapid automated bursts that far exceed what human gameplay rates allow.)*

### Response Headers

**S-10:** All API responses SHALL include the header `Cache-Control: no-store`. This applies to both success and error responses across all endpoints. *(Prevents stale score data from being served by intermediary caches and prevents leaderboard snapshots from being stored in shared or private caches where they could be observed by other parties.)*

**S-11:** All API responses SHALL include the header `Strict-Transport-Security: max-age=63072000; includeSubDomains` (a 2-year HSTS policy). *(Instructs compliant browsers to enforce HTTPS for all future connections to this origin, preventing SSL-stripping attacks in which an active network attacker downgrades HTTPS to HTTP before the first request.)*

**S-12:** All API responses SHALL include the header `X-Content-Type-Options: nosniff`. *(Prevents MIME-type sniffing attacks in which a browser ignores the declared `Content-Type` and executes a response body as a different content type, such as JavaScript.)*

**S-13:** The server SHALL validate the `Origin` header on all SSE (`GET /leaderboard/stream`) and WebSocket upgrade requests against a server-configured allowlist of permitted origins. Requests whose `Origin` value is absent from the allowlist SHALL be rejected with `403 Forbidden`. *(Prevents Cross-Site WebSocket Hijacking (CSWSH): without an Origin check, a malicious third-party page loaded in a user's browser can silently open an SSE or WebSocket connection to the scoreboard stream using the user's credentials, leaking live score data to the attacker's origin.)*

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
| `ERR_FORBIDDEN` | 403 | Token is valid and authentic, but the requesting user lacks permission for the targeted resource; also returned for Origin allowlist rejection on SSE/WebSocket connections |
| `ERR_VALIDATION_FAILED` | 400 | Request body fails schema validation — missing required fields, wrong field types, values outside permitted ranges |
| `ERR_RATE_LIMITED` | 429 | Per-user submission rate limit exceeded; see `Retry-After` response header for retry guidance |
| `ERR_CONFLICT` | 409 | Duplicate `event_id` — the same nonce has already been processed within its TTL window |
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
