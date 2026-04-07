# 05 — Realtime: Redis Cache-Aside + Server-Sent Events

---

## Phần 1: Redis — Cache-Aside Pattern

### Tại sao cần cache leaderboard?

Leaderboard query phải:
1. Load tất cả users + productivityScore
2. Sort theo totalScore
3. Gán rank

Nếu có 1000 users và 100 request/giây → 100 lần full table scan. **Cache giải quyết điều này.**

### Cache-aside (lazy loading) là gì?

```
Không bao giờ write cache trực tiếp khi DB thay đổi
→ Cache được populate lazily khi có READ request
→ Cache bị invalidate khi data thay đổi
→ Request tiếp theo sẽ miss cache và rebuild từ DB
```

So với **write-through** (update cache khi update DB):
- Write-through: cache luôn fresh, nhưng phức tạp hơn
- Cache-aside: đơn giản hơn, OK cho data như leaderboard (60s stale chấp nhận được)

### Flow trong code

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
        │   CACHE MISS (hoặc Redis DOWN)
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
  [TTL = 60 giây]
        │
        ▼
  return rankings
```

### Redis key và TTL

```typescript
export const LEADERBOARD_CACHE_KEY = 'leaderboard:rankings';
const CACHE_TTL = 60;  // 60 seconds
```

- **Key**: namespace `leaderboard:` là convention Redis để dễ quản lý
- **TTL 60s**: leaderboard có thể stale tối đa 1 phút — chấp nhận được
- Nếu không set TTL, key tồn tại mãi mãi → stale data sau restart

### Cache invalidation

Cache bị xóa khi data thay đổi:

```typescript
// Khi task → DONE:
await redisClient.del(LEADERBOARD_CACHE_KEY);

// Khi update user (đổi tên):
await redisClient.del(LEADERBOARD_CACHE_KEY);

// Khi delete user:
await redisClient.del(LEADERBOARD_CACHE_KEY);
```

Sau khi xóa, request leaderboard tiếp theo sẽ MISS → rebuild từ DB → cache lại.

### Graceful degradation

Redis failure không crash app — đây là design decision quan trọng:

```typescript
// Read failure → fallback to DB (không throw):
try {
  const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
  if (cached !== null) return JSON.parse(cached);
} catch (err) {
  logger.warn({ err }, 'Redis cache read failed');
  // Tiếp tục xuống DB
}

// Write failure → chấp nhận (data đúng, chỉ không được cache):
try {
  await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', 60);
} catch (err) {
  logger.warn({ err }, 'Redis cache write failed');
  // Không re-throw
}
```

**Redis client config đảm bảo fail-fast:**
```typescript
new Redis(REDIS_URL, {
  lazyConnect: true,         // Không connect ngay khi import
  enableOfflineQueue: false, // Không queue commands → fail ngay nếu offline
  maxRetriesPerRequest: 1,   // Chỉ retry 1 lần → không block lâu
});
```

---

## Phần 2: Server-Sent Events (SSE)

### SSE là gì? So sánh với WebSocket

| | SSE | WebSocket |
|---|---|---|
| Hướng | Server → Client (one-way) | Bidirectional |
| Protocol | HTTP | WS protocol |
| Reconnect | Browser tự reconnect | Phải code thủ công |
| Firewall/Proxy | Qua được (HTTP) | Có thể bị chặn |
| Use case | Notifications, feeds | Chat, game, realtime collab |

**Leaderboard chỉ cần server push → SSE là lựa chọn đúng.**

### SSE protocol

SSE dùng HTTP response stream với `Content-Type: text/event-stream`. Format của message:

```
event: score-update\n
data: [{"rank":1,"userName":"Alice","totalScore":50},...]\n
\n
```
- `event:` — tên event (client listen theo tên này)
- `data:` — payload (string, thường là JSON)
- Hai `\n\n` cuối báo hiệu kết thúc message

### Backend: SSE endpoint

**File:** `backend/src/routes/leaderboard.routes.ts`

```typescript
router.get('/stream', async (req, res) => {
  // 1. Set headers để browser hiểu đây là SSE stream
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');    // Tắt nginx buffering
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();                            // Gửi headers ngay, không buffer

  // 2. Đăng ký client vào SseManager
  const clientId = randomUUID();
  sseManager.addClient(clientId, res);

  // 3. Gửi initial data ngay khi connect (client không phải chờ event đầu tiên)
  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  // 4. Cleanup khi client disconnect
  req.on('close', () => {
    sseManager.removeClient(clientId);
  });
  // Không gọi res.end() — giữ connection mở
});
```

**Lưu ý `X-Accel-Buffering: no`:** Nếu đứng sau nginx, nginx mặc định buffer response trước khi gửi cho client. Với SSE, cần tắt buffering để messages đến client ngay lập tức.

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
      // Kiểm tra connection còn sống không (proactive eviction)
      if (res.writableEnded || res.destroyed) {
        this.clients.delete(id);
        continue;
      }
      try {
        res.write(payload);  // Ghi vào HTTP response stream
      } catch {
        // Client disconnect mid-write → evict
        this.clients.delete(id);
      }
    }
  }
}

export const sseManager = new SseManager();  // Singleton
```

**In-memory registry:** `SseManager` lưu Response objects trong RAM của Node.js process. Điều này có nghĩa:
- Chỉ hoạt động với **single Node.js instance**
- Nếu scale horizontally (multiple instances), cần pub/sub như Redis Pub/Sub hoặc Kafka

### Frontend: consuming SSE

**File:** `frontend/src/app/leaderboard/page.tsx`

```typescript
useEffect(() => {
  // Web API built-in — không cần thư viện
  const es = new EventSource(`${API_BASE}/api/leaderboard/stream`);

  // Listen cho event có tên 'score-update'
  es.addEventListener('score-update', (e: MessageEvent) => {
    const data = JSON.parse(e.data) as LeaderboardEntry[];
    setEntries(data);           // Update state → re-render
    setLastUpdated(new Date());
    setIsLoading(false);
  });

  es.onerror = () => {
    setIsLoading(false);
    setIsError(true);  // Show error message thay vì crash
  };

  // Cleanup: đóng connection khi component unmount
  return () => {
    es.close();
  };
}, []);  // Empty deps → chỉ chạy 1 lần khi mount
```

**Browser tự reconnect:** `EventSource` tự động reconnect nếu connection bị đứt (với exponential backoff). Không cần code thêm.

### Full flow khi task → DONE

```
taskService.update() xong transaction
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
                  └── Client 3 (đã disconnect):   writableEnded=true → evict
```

---

## Tổng kết: tại sao design này hoạt động

### Cache flow
```
Write path: DB ← direct write (không write cache)
                   ↓ invalidate
Read path:  Redis (HIT) ──→ return cached
                  (MISS)
                   ↓
                  DB → cache → return
```

### SSE flow
```
Task DONE → broadcast() → push đến mọi connected browser
         ↑
(ngoài DB transaction — side effect sau khi commit)
```

### Combination
- Leaderboard cache (Redis) cho REST polling clients
- SSE broadcast cho realtime clients
- Cả hai đều được trigger từ 1 chỗ: `taskService.update()` khi `status === 'DONE'`
