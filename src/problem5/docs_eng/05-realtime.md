# 05 — Realtime: Redis Cache-Aside + Server-Sent Events

---

## Part 1: Redis — Cache-Aside Pattern

### Why cache the leaderboard?

The leaderboard query has to:
1. Load all users + `productivityScore`
2. Sort by `totalScore`
3. Assign ranks

If there are 1000 users and 100 requests/second, that means 100 full table scans. **Caching solves this.**

### What is cache-aside (lazy loading)?

```
Never write directly to the cache when DB data changes
→ Cache is populated lazily on READ requests
→ Cache is invalidated when data changes
→ The next request will miss the cache and rebuild it from DB
```

Compared with **write-through** (update cache whenever DB changes):
- Write-through: cache is always fresh, but more complex
- Cache-aside: simpler, and good enough for data like a leaderboard (60s staleness is acceptable)

### Flow in the code

**File:** `backend/src/services/leaderboard.service.ts`

```
GET /api/leaderboard
        │
        ▼
  leaderboardService.getRankings()
        │
        ├─ redisClient.get('leaderboard:rankings')
        │         │
        │   CACHE HIT ──────────────────────────────→ return JSON.parse(cached)
        │         │
        │   CACHE MISS (or Redis DOWN)
        │         │
        ▼         ▼
  prisma.user.findMany({ include: { productivityScore: true } })
        │
        ├─ .map() → build rankings array
        ├─ .sort() → sort by totalScore DESC
        └─ .map() → add rank (index + 1)
        │
        ▼
  redisClient.set('leaderboard:rankings', JSON.stringify(rankings), 'EX', 60)
  [TTL = 60 seconds]
        │
        ▼
  return rankings
```

### Redis key and TTL

```typescript
export const LEADERBOARD_CACHE_KEY = 'leaderboard:rankings';
const CACHE_TTL = 60;  // 60 seconds
```

- **Key**: the `leaderboard:` namespace is a standard Redis convention that makes keys easier to manage
- **TTL 60s**: the leaderboard can be stale for up to 1 minute — acceptable here
- Without a TTL, the key could live forever and become stale after restarts or data changes

### Cache invalidation

The cache is cleared when data changes:

```typescript
// When task → DONE:
await redisClient.del(LEADERBOARD_CACHE_KEY);

// When updating a user (name change):
await redisClient.del(LEADERBOARD_CACHE_KEY);

// When deleting a user:
await redisClient.del(LEADERBOARD_CACHE_KEY);
```

After deletion, the next leaderboard request will MISS → rebuild from DB → cache again.

### Graceful degradation

Redis failure does not crash the app — this is an important design decision:

```typescript
// Read failure → fallback to DB (do not throw):
try {
  const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
  if (cached !== null) return JSON.parse(cached);
} catch (err) {
  logger.warn({ err }, 'Redis cache read failed');
  // Continue down to DB
}

// Write failure → acceptable (data is correct, it just is not cached):
try {
  await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', 60);
} catch (err) {
  logger.warn({ err }, 'Redis cache write failed');
  // Do not re-throw
}
```

**Redis client config ensures fail-fast behavior:**
```typescript
new Redis(REDIS_URL, {
  lazyConnect: true,         // Do not connect immediately on import
  enableOfflineQueue: false, // Do not queue commands → fail immediately if offline
  maxRetriesPerRequest: 1,   // Retry only once → avoids long blocking
});
```

---

## Part 2: Server-Sent Events (SSE)

### What is SSE? Compared with WebSocket

| | SSE | WebSocket |
|---|---|---|
| Direction | Server → Client (one-way) | Bidirectional |
| Protocol | HTTP | WS protocol |
| Reconnect | Browser reconnects automatically | Must be coded manually |
| Firewall/Proxy | Usually passes through (HTTP) | Can be blocked |
| Use case | Notifications, feeds | Chat, games, realtime collaboration |

**The leaderboard only needs server push → SSE is the right choice.**

### SSE protocol

SSE uses an HTTP response stream with `Content-Type: text/event-stream`. Message format:

```
event: score-update\n
data: [{"rank":1,"userName":"Alice","totalScore":50},...]\n
\n
```
- `event:` — event name (the client listens by name)
- `data:` — payload string, usually JSON
- The final `\n\n` marks the end of the message

### Backend: SSE endpoint

**File:** `backend/src/routes/leaderboard.routes.ts`

```typescript
router.get('/stream', async (req, res) => {
  // 1. Set headers so the browser knows this is an SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');    // Disable nginx buffering
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();                            // Send headers immediately, do not buffer

  // 2. Register client in SseManager
  const clientId = randomUUID();
  sseManager.addClient(clientId, res);

  // 3. Send initial data immediately on connect (client does not wait for first event)
  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  // 4. Cleanup when the client disconnects
  req.on('close', () => {
    sseManager.removeClient(clientId);
  });
  // Do not call res.end() — keep the connection open
});
```

**Note on `X-Accel-Buffering: no`:** If running behind nginx, nginx buffers responses by default before sending them to the client. SSE requires buffering to be disabled so messages arrive immediately.

### Backend: SseManager

**File:** `backend/src/lib/sse-manager.ts`

```typescript
class SseManager {
  private clients: Map<string, Response> = new Map();
  //                ↑ clientId → Express Response object

  addClient(id: string, res: Response): void {
    this.clients.set(id, res);
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(data: unknown): void {
    const payload = `event: score-update\ndata: ${JSON.stringify(data)}\n\n`;

    for (const [id, res] of this.clients.entries()) {
      // Check whether the connection is still alive (proactive eviction)
      if (res.writableEnded || res.destroyed) {
        this.clients.delete(id);
        continue;
      }
      try {
        res.write(payload);  // Write to the HTTP response stream
      } catch {
        // Client disconnected mid-write → evict
        this.clients.delete(id);
      }
    }
  }
}

export const sseManager = new SseManager();  // Singleton
```

**In-memory registry:** `SseManager` stores Response objects in Node.js memory. This means:
- It works only with a **single Node.js instance**
- If you scale horizontally, you need pub/sub such as Redis Pub/Sub or Kafka

### Frontend: consuming SSE

**File:** `frontend/src/app/leaderboard/page.tsx`

```typescript
useEffect(() => {
  // Built-in Web API — no library needed
  const es = new EventSource(`${API_BASE}/api/leaderboard/stream`);

  // Listen for the event named 'score-update'
  es.addEventListener('score-update', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as LeaderboardEntry[];
    setEntries(data);           // Update state → re-render
    setLastUpdated(new Date());
    setIsLoading(false);
  });

  es.onerror = () => {
    setIsLoading(false);
    setIsError(true);  // Show an error state instead of crashing
  };

  // Cleanup: close connection when component unmounts
  return () => {
    es.close();
  };
}, []);  // Empty deps → run only once on mount
```

**The browser reconnects automatically:** `EventSource` automatically reconnects if the connection drops. No extra code is needed.

### Full flow when task → DONE

```
taskService.update() finishes transaction
        │
        ├── redisClient.del('leaderboard:rankings')
        │
        ├── leaderboardService.getRankings()
        │     └── Redis miss → query DB → build fresh rankings
        │
        └── sseManager.broadcast(freshRankings)
                  │
                  ├── Client 1 (Alice's browser): res.write(payload) ✓
                  ├── Client 2 (Bob's browser):   res.write(payload) ✓
                  └── Client 3 (already disconnected): writableEnded=true → evict
```

---

## Summary: why this design works

### Cache flow
```
Write path: DB ← direct write (do not write cache)
                   ↓ invalidate
Read path:  Redis (HIT) ──→ return cached
                  (MISS)
                   ↓
                  DB → cache → return
```

### SSE flow
```
Task DONE → broadcast() → push to every connected browser
         ↑
(outside DB transaction — side effect after commit)
```

### Combination
- Leaderboard cache (Redis) for REST polling clients
- SSE broadcast for realtime clients
- Both are triggered from one place: `taskService.update()` when `status === 'DONE'`
