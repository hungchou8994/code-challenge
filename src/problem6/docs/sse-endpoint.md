## GET /leaderboard/stream

Delivers real-time leaderboard updates over Server-Sent Events (SSE). This endpoint is publicly readable — no authentication is required to establish a connection, consistent with `GET /leaderboard`. The server pushes the full current top-10 snapshot to all connected clients whenever a score change occurs.

**Non-goals:** This section does not specify SSE reconnect behavior, heartbeat keepalive interval, or `Last-Event-ID` handling. Those concerns are deferred and are not SHALL requirements for v1.

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

This endpoint does not require an `Authorization` header or any form of token authentication. Access control is limited to Origin allowlist validation as defined in **S-13** (see Security Model § Response Headers). Requests from origins not present in the server-configured allowlist SHALL be rejected with `403 Forbidden` and error code `ERR_FORBIDDEN`.

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

**RT-03:** `GET /leaderboard/stream` SHALL NOT require an `Authorization` header or any form of token authentication — the stream is publicly readable, consistent with `GET /leaderboard`. The server SHALL apply Origin allowlist validation as defined in S-13 (see Security Model § Response Headers). Requests from origins not in the allowlist SHALL be rejected with `403 Forbidden` and error code `ERR_FORBIDDEN`. *(Prevents Cross-Site WebSocket/SSE Hijacking: Origin validation is the sole access control mechanism on the public stream, preventing a malicious third-party page from silently subscribing to live score data.)*

**RT-04:** When a score change occurs (i.e., after a successful `POST /scores`), the server SHALL push a `leaderboard_update` event containing the complete top-10 snapshot to all active SSE clients. Individual score deltas SHALL NOT be broadcast — clients maintain no partial state and require no reconciliation logic. *(Full-snapshot broadcast eliminates client-side state management complexity and ensures every connected client converges to the same view after each update, even if events were missed.)*

**RT-05:** When a client establishes an SSE connection, the server SHALL immediately send a `leaderboard_update` event containing the current top-10 snapshot without waiting for the next score change. This eliminates the need for the client to make a separate `GET /leaderboard` call after connecting. *(Ensures clients see a populated leaderboard immediately on connect rather than waiting for the next score event, which may be arbitrarily delayed.)*

> **Implementation hint (non-normative):** In Fastify v5, SSE is implemented via `reply.raw` (the underlying Node.js `http.ServerResponse`). Set headers via `reply.raw.setHeader()`: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Write each event as `event: leaderboard_update\ndata: {...}\n\n` using `reply.raw.write()`. Do not use `reply.send()` — it closes the response stream immediately.

### Error Responses

| Scenario | HTTP Status | Error Code |
|----------|-------------|------------|
| Origin not in allowlist | 403 | `ERR_FORBIDDEN` |
| Unexpected server error | 500 | `ERR_INTERNAL` |

Error response structure is defined in the Security Model § Error Contract. Error codes above are referenced by name only and are not redefined here.
