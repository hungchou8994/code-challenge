# 08 — Hướng dẫn đọc source code

Đây là lộ trình đọc code theo thứ tự từ ngoài vào trong, từ đơn giản đến phức tạp. Mỗi bước có câu hỏi để bạn tự kiểm tra.

---

## Bước 1 — Hiểu contract chung (shared/)

**Đọc trước:** `shared/types/task.ts`, `shared/types/user.ts`, `shared/constants/scoring.ts`

```
shared/
├── types/
│   ├── task.ts       ← TaskStatus enum, TaskPriority enum, Task interface, VALID_TRANSITIONS
│   ├── user.ts       ← User interface, CreateUserInput
│   └── leaderboard.ts ← LeaderboardEntry interface
└── constants/
    └── scoring.ts    ← PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY
```

**Câu hỏi tự kiểm tra:**
- Task có thể ở những status nào?
- `VALID_TRANSITIONS['IN_PROGRESS']` trả về gì?
- Một task HIGH priority hoàn thành trễ được mấy điểm?

---

## Bước 2 — Database schema

**Đọc:** `backend/prisma/schema.prisma`

Vẽ sơ đồ quan hệ ra giấy:
```
User ──┬── Task (assignee)
       ├── ScoreEvent (user)
       └── ProductivityScore (1-1)
Task ─── ScoreEvent (task)
```

**Câu hỏi tự kiểm tra:**
- Khi User bị xóa, ScoreEvent có bị xóa không? (Xem `onDelete`)
- Tại sao `status` và `priority` trong Task là `String` chứ không phải enum của Postgres?
- `ProductivityScore` khác gì `ScoreEvent`?

---

## Bước 3 — Entry point + Middleware stack

**Đọc theo thứ tự:**
1. `backend/src/server.ts` — 8 dòng, đọc trong 1 phút
2. `backend/src/app.ts` — middleware stack
3. `backend/src/middleware/correlation-id.ts`
4. `backend/src/middleware/rate-limiter.ts`
5. `backend/src/middleware/error-handler.ts`
6. `backend/src/middleware/validation.ts`

**Câu hỏi tự kiểm tra:**
- Middleware nào chạy trước: `express.json()` hay `correlationIdMiddleware`?
- Tại sao `errorHandler` phải có đúng 4 tham số?
- `validate(schema)` là factory function — nó return gì?
- Khi Prisma throw P2002, response có status code mấy và code là gì?

---

## Bước 4 — Một route hoàn chỉnh (đơn giản)

**Đọc:** `backend/src/routes/user.routes.ts` + `backend/src/services/user.service.ts`

Theo dõi flow của request `POST /api/users`:

```
1. writeLimiter (rate check)
2. validate(createUserSchema) ← đọc schema trong user.schemas.ts
3. userService.create(req.body)
4. prisma.user.create({ data })
5. Nếu email duplicate → Prisma P2002 → errorHandler → 409
6. Nếu OK → res.status(201).json(user)
```

**Câu hỏi tự kiểm tra:**
- `createUserSchema` có fields gì? Fields nào là required?
- `userService.getAll()` dùng `Promise.all` để làm gì?
- `userService.delete()` xử lý DONE tasks như thế nào?

---

## Bước 5 — Core business logic (phức tạp)

**Đọc:** `backend/src/services/task.service.ts`

Tập trung vào `taskService.update()`. Đọc từng block và tự hỏi:

```typescript
// Block 1: Load existing task — tại sao cần?
const existing = await taskService.getById(id);

// Block 2: State machine validation — VALID_TRANSITIONS từ đâu?
if (data.status && data.status !== existing.status) { ... }

// Block 3: Guard assigneeId change on DONE — tại sao không cho phép?
if (data.assigneeId != null && existing.status === 'DONE') { ... }

// Block 4: Transaction với optimistic locking — tại sao updateMany thay vì update?
const result = await tx.task.updateMany({ where: { id, status: existing.status } });
if (result.count === 0) throw ConflictError('CONCURRENT_MODIFICATION');

// Block 5: scoreTask bên TRONG tx — tại sao không bên ngoài?
await leaderboardService.scoreTask({ ... }, tx);

// Block 6: Side effects BÊN NGOÀI tx — tại sao?
await redisClient.del(LEADERBOARD_CACHE_KEY);
sseManager.broadcast(rankings);
```

**Câu hỏi tự kiểm tra:**
- Nếu bỏ `result.count === 0` check, race condition gì có thể xảy ra?
- Tại sao `scoreTask` được pass `tx`?
- Nếu Redis `del` fail, app có crash không? Hệ quả là gì?

---

## Bước 6 — Scoring & Leaderboard

**Đọc:** `backend/src/services/leaderboard.service.ts`

Đọc `scoreTask()` và trả lời:
- `nowDay < dueDay` nghĩa là gì về mặt thời gian?
- Tại sao dùng `new Date(year, month, day)` thay vì `now < task.dueDate`?
- `upsert` làm gì khi `ProductivityScore` chưa tồn tại? Khi đã tồn tại?

Đọc `getRankings()` và trace flow:
```
redisClient.get() → HIT → parse JSON → return
                 → MISS (hoặc error)
                         → prisma.user.findMany()
                         → .map().sort().map()
                         → redisClient.set('EX', 60)
                         → return
```

---

## Bước 7 — Lib singletons

**Đọc:** `backend/src/lib/sse-manager.ts`, `backend/src/lib/redis.ts`, `backend/src/lib/prisma.ts`

**`sse-manager.ts`** — ngắn nhất, dễ đọc nhất trong 3 file. Focus vào:
- Tại sao dùng `Map<string, Response>` thay vì `Array<Response>`?
- `writableEnded || destroyed` check để làm gì?
- Tại sao `broadcast()` bên trong `try/catch`?

**`redis.ts`** — chú ý 3 options:
- `lazyConnect: true` — kết nối khi nào?
- `enableOfflineQueue: false` — nếu offline, command bị gì?
- `maxRetriesPerRequest: 1` — ảnh hưởng latency như thế nào?

---

## Bước 8 — SSE endpoint

**Đọc:** `backend/src/routes/leaderboard.routes.ts`

```typescript
router.get('/stream', async (req, res) => {
  // Tại sao set những headers này?
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();  // ← Tại sao gọi flushHeaders() ngay?

  sseManager.addClient(clientId, res);

  // Gửi initial data — tại sao cần?
  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  req.on('close', () => sseManager.removeClient(clientId));
  // ← Tại sao không gọi res.end()?
});
```

---

## Bước 9 — Frontend: api-client

**Đọc:** `frontend/src/lib/api-client.ts`

```typescript
// Base function:
async function request<T>(path, init?): Promise<T>

// Trace qua:
// 1. fetch() — URL, headers
// 2. !res.ok → parse error body → throw Error
// 3. res.status === 204 → return undefined (No Content)
// 4. res.json() → parse + return
```

**Câu hỏi:**
- `NEXT_PUBLIC_API_URL` được inject lúc nào (build time hay runtime)?
- `api.dashboard.getStats()` gọi mấy API endpoints? Song song hay tuần tự?
- `api.tasks.forceDelete(id)` gọi URL gì?

---

## Bước 10 — Frontend: một page đầy đủ

**Đọc:** `frontend/src/app/tasks/page.tsx`

Đây là page phức tạp nhất — tất cả các patterns đều có ở đây.

Trace flow từ khi user click "Complete" button:
```
1. Button onClick → handleTransition(task)
2. handleTransition → updateMutation.mutate({ id, data: { status: 'DONE' } })
3. mutationFn → api.tasks.update(id, { status: 'DONE' })
4. fetch PATCH /api/tasks/:id { status: 'DONE' }
5. Backend: taskService.update() → transaction → score → SSE broadcast
6. 200 OK → onSuccess callback
7. queryClient.invalidateQueries(['tasks']) → re-render task list
8. queryClient.invalidateQueries(['leaderboard']) → nếu leaderboard page mở, refetch
9. toast.success('Task updated')
```

---

## Bước 11 — Tests

**Đọc theo thứ tự:**
1. `backend/src/test/setup.ts` — global mock setup
2. `backend/src/test/users.test.ts` — test đơn giản nhất, học pattern
3. `backend/src/test/leaderboard.test.ts` — test cache behavior (Test A/B/C/D)
4. `backend/src/test/tasks.test.ts` — test phức tạp nhất (transaction, scoring atomicity)

**Cho mỗi test, tự hỏi:**
- Arrange: mock nào được setup?
- Act: HTTP request gì được gửi?
- Assert: kiểm tra điều gì?

---

## Checklist self-study

Sau khi đọc xong, bạn nên có thể trả lời:

**Backend:**
- [ ] Thứ tự middleware trong Express app là gì? Tại sao thứ tự quan trọng?
- [ ] Khi `POST /api/tasks` với body sai, lỗi được xử lý ở đâu (middleware nào)?
- [ ] `task.update()` dùng `updateMany` thay vì `update` — tại sao?
- [ ] Tại sao `scoreTask` chạy trong cùng transaction với status update?
- [ ] Redis lỗi → app có down không? Hệ quả là gì?
- [ ] `onDelete: Restrict` vs `onDelete: Cascade` — mỗi cái dùng ở đâu, tại sao?

**Scoring:**
- [ ] Hoàn thành lúc 10:00 AM đúng ngày deadline → điểm như thế nào?
- [ ] Tại sao dùng `updateMany` với `where: { status: existing.status }` để chống double-scoring?
- [ ] Force delete DONE task → tại sao phải `aggregate(SUM)` thay vì decrement?

**Realtime:**
- [ ] Cache được invalidate khi nào? Được rebuild khi nào?
- [ ] Nếu có 5 browser tab mở leaderboard, server cần bao nhiêu SSE connection?
- [ ] Tại sao SSE side effects phải chạy NGOÀI Prisma transaction?

**Testing:**
- [ ] Prisma được mock ở đâu? Khi nào mock được reset?
- [ ] `mockResolvedValueOnce` khác `mockResolvedValue` như thế nào?
- [ ] `$transaction.mockImplementation(fn => fn(mockPrisma))` làm gì?

**Frontend:**
- [ ] `useQuery` với cùng `queryKey` trong 2 component khác nhau → có 2 network requests không?
- [ ] `invalidateQueries(['tasks'])` có invalidate `['tasks', filters, page]` không?
- [ ] Tại sao leaderboard page không dùng `useQuery` mà dùng `useEffect + EventSource`?

---

## Tips đọc code hiệu quả

1. **Trace một request end-to-end** — chọn 1 API endpoint, đọc từ route → service → DB → response
2. **Đọc types trước** — hiểu shape của data trước khi đọc logic
3. **Grep cho constants** — tìm nơi dùng `VALID_TRANSITIONS` để hiểu nó được dùng ở đâu
4. **Đọc tests song song với source** — tests giải thích behavior expected, dễ hiểu hơn đọc code thuần
5. **Tự hỏi "tại sao"** — không chỉ hiểu "code làm gì" mà "tại sao code làm vậy"

---

## Thứ tự file đọc quick reference

```
shared/types/task.ts                        (5 min)
shared/constants/scoring.ts                 (2 min)
backend/prisma/schema.prisma               (10 min)
backend/src/server.ts                       (1 min)
backend/src/app.ts                          (5 min)
backend/src/middleware/error-handler.ts    (10 min)
backend/src/middleware/validation.ts        (3 min)
backend/src/middleware/correlation-id.ts    (3 min)
backend/src/middleware/rate-limiter.ts      (3 min)
backend/src/schemas/task.schemas.ts         (5 min)
backend/src/routes/task.routes.ts           (5 min)
backend/src/lib/prisma.ts                   (3 min)
backend/src/lib/redis.ts                    (3 min)
backend/src/lib/sse-manager.ts              (5 min)
backend/src/services/user.service.ts       (15 min)
backend/src/services/leaderboard.service.ts (15 min)
backend/src/services/task.service.ts       (30 min)  ← Đây là file quan trọng nhất
backend/src/routes/leaderboard.routes.ts    (5 min)
backend/src/test/setup.ts                   (3 min)
backend/src/test/users.test.ts             (15 min)
backend/src/test/leaderboard.test.ts       (20 min)
backend/src/test/tasks.test.ts             (45 min)  ← Nhiều test nhất
frontend/src/lib/api-client.ts             (10 min)
frontend/src/app/tasks/page.tsx            (20 min)
frontend/src/app/leaderboard/page.tsx       (5 min)
frontend/src/components/task-form.tsx      (10 min)
                                          ─────────
                                          ~275 min (~4.5 giờ đọc kỹ)
```
