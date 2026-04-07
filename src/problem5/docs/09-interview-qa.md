# Interview Q&A — Backend Deep Dive

> File này tổng hợp các câu hỏi phỏng vấn BE thường gặp và trả lời chi tiết dựa trên codebase thực tế.
> Mỗi câu trả lời đều chỉ rõ **file:dòng** để tiện theo dõi.

---

## Mục lục

1. [N+1 Query Problem](#1-n1-query-problem)
2. [Validation — Zod & Middleware](#2-validation--zod--middleware)
3. [Tại sao BE vẫn cần validate dù FE đã validate](#3-tại-sao-be-vẫn-cần-validate-dù-fe-đã-validate)
4. [Cache — Redis, TTL, Cache Invalidation](#4-cache--redis-ttl-cache-invalidation)
5. [API Request Flow — từng bước qua middleware](#5-api-request-flow--từng-bước-qua-middleware)
6. [CORS — cấu hình và tại sao](#6-cors--cấu-hình-và-tại-sao)
7. [Logging — pino, correlation ID, structured logs](#7-logging--pino-correlation-id-structured-logs)
8. [Real-time Communication — SSE vs WebSocket](#8-real-time-communication--sse-vs-websocket)
9. [Rate Limiting](#9-rate-limiting)
10. [Error Handling — typed error hierarchy](#10-error-handling--typed-error-hierarchy)
11. [Concurrency & Race Condition Prevention](#11-concurrency--race-condition-prevention)
12. [Database Transaction & Atomicity](#12-database-transaction--atomicity)
13. [State Machine — task transitions](#13-state-machine--task-transitions)
14. [Security — Helmet, UUID validation](#14-security--helmet-uuid-validation)
15. [Scoring System — business logic](#15-scoring-system--business-logic)

---

## 1. N+1 Query Problem

### Câu hỏi: "Project này có bị N+1 query không? Xử lý ra sao?"

**Định nghĩa N+1:**
N+1 xảy ra khi bạn lấy 1 danh sách N record, rồi với **mỗi** record lại chạy thêm 1 query để lấy dữ liệu liên quan → tổng cộng N+1 queries thay vì 1.

**Ví dụ N+1 tệ (KHÔNG làm thế này):**
```ts
// ❌ Sẽ bị N+1: 1 query lấy tasks + N queries lấy assignee từng cái
const tasks = await prisma.task.findMany();
for (const task of tasks) {
  task.assignee = await prisma.user.findUnique({ where: { id: task.assigneeId } });
}
```

**Dự án này xử lý như thế nào — KHÔNG bị N+1:**

Prisma's `include` sinh ra một `LEFT JOIN` duy nhất:

```ts
// backend/src/services/task.service.ts:107-113
prisma.task.findMany({
  where,
  orderBy,
  skip,
  take: limit,
  include: { assignee: { select: { id: true, name: true, email: true } } },
  //       ^^^^^^^ Prisma tự sinh JOIN — không phải N query riêng
});
```

Một query SQL duy nhất được sinh ra:
```sql
SELECT t.*, u.id, u.name, u.email
FROM "Task" t
LEFT JOIN "User" u ON t."assigneeId" = u.id
LIMIT 20 OFFSET 0;
```

**Trường hợp `sortBy=priority` (raw SQL):**

Khi sort theo priority cần thứ tự ngữ nghĩa (HIGH > MEDIUM > LOW), Prisma ORM không hỗ trợ `CASE WHEN` trong `ORDER BY`, nên phải viết raw SQL. Query vẫn dùng `LEFT JOIN` — không bị N+1:

```ts
// backend/src/services/task.service.ts:37-67
prisma.$queryRaw`
  SELECT t.id, t.title, ...,
         u.id AS assignee_id, u.name AS assignee_name, u.email AS assignee_email
  FROM "Task" t
  LEFT JOIN "User" u ON t."assigneeId" = u.id
  ${whereClause}
  ORDER BY CASE t.priority WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ... END ${dir}
  LIMIT ${limit} OFFSET ${skip}
`
```

**Trường hợp `leaderboard.getRankings()`:**

```ts
// backend/src/services/leaderboard.service.ts:104-108
const users = await prisma.user.findMany({
  include: { productivityScore: true },
  //        ^^^^^^^^^^^^^^^^^ 1 JOIN, không phải N queries
});
```

**Kết luận:** Project KHÔNG bị N+1 vì dùng `include` (JOIN) thay vì lazy-load từng record.

---

## 2. Validation — Zod & Middleware

### Câu hỏi: "Validation được thực hiện như thế nào trong project?"

Có **2 loại input** cần validate và cách xử lý khác nhau:

### 2a. Request body — dùng `validate()` middleware

```ts
// backend/src/middleware/validation.ts:5-20
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);   // parse + coerce + strip unknown fields
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),          // e.g. "title", "assigneeId"
          message: e.message,
        }));
        throw new ValidationError(details); // → 400 với field-level details
      }
      throw err;
    }
  };
}
```

Middleware này gắn vào route như một guard:

```ts
// backend/src/routes/task.routes.ts:26
router.post('/', validate(createTaskSchema), async (req, res) => { ... });
// backend/src/routes/task.routes.ts:31
router.patch('/:id', validate(updateTaskSchema), async (req, res) => { ... });
```

### 2b. Query params — inline `safeParse`

Query params được validate **inline** trong route handler (không dùng middleware) vì chúng không đi qua `req.body`:

```ts
// backend/src/routes/task.routes.ts:9-18
router.get('/', async (req, res) => {
  const parsed = taskQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message },
    });
    return;
  }
  const result = await taskService.getAll(parsed.data);
  res.json(result);
});
```

**Tại sao dùng `safeParse` thay vì `parse`?** Vì `safeParse` không throw exception — nó trả về `{ success, data, error }`. Điều này cho phép handler tự kiểm soát response thay vì ném exception lên `errorHandler`.

### 2c. Ví dụ Schema — `createTaskSchema`

```ts
// backend/src/schemas/task.schemas.ts:6-13
export const createTaskSchema = z.object({
  title:       z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  status:      z.literal('TODO').optional().default('TODO'), // chỉ cho phép TODO khi tạo
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH']),
  assigneeId:  z.string().uuid('Invalid assignee ID').optional().nullable(),
  dueDate:     z.string().datetime({ message: 'Invalid date format. Use ISO 8601.' }),
});
```

`schema.parse()` vừa validate vừa **transform** (e.g. coerce số, strip field lạ, fill default). Sau `validate()`, `req.body` là object đã được typed và sạch.

### 2d. Response lỗi validation

```json
HTTP 400
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "title",    "message": "Title is required" },
      { "field": "dueDate",  "message": "Invalid date format. Use ISO 8601 format." }
    ]
  }
}
```

---

## 3. Tại sao BE vẫn cần validate dù FE đã validate

### Câu hỏi: "Frontend đã có validation rồi, sao BE còn cần validate nữa?"

Đây là câu hỏi rất phổ biến trong phỏng vấn. Câu trả lời ngắn gọn: **FE validation chỉ là UX, không phải security**.

### Lý do 1: API là public — không phải chỉ FE gọi

Bất kỳ ai cũng có thể gọi API trực tiếp bằng `curl`, Postman, script attack:

```bash
# Attacker bypass FE hoàn toàn
curl -X POST http://api.example.com/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "", "priority": "ULTRA_HIGH", "dueDate": "not-a-date"}'
```

Nếu BE không validate → dữ liệu rác vào DB.

### Lý do 2: FE có thể bị tamper

JavaScript chạy trên trình duyệt của người dùng. Ai cũng có thể:
- Mở DevTools → sửa JS hoặc intercept request
- Dùng Burp Suite để modify payload trước khi gửi
- Disable JS → form submit thẳng không qua FE validation

### Lý do 3: Defense in depth

Nguyên tắc bảo mật "defense in depth" — nhiều lớp bảo vệ. Nếu một lớp hỏng, lớp khác còn giữ.

```
FE validate → tốt cho UX (instant feedback, không cần roundtrip)
BE validate → tốt cho security (nguồn chân lý duy nhất)
```

### Lý do 4: BE có context mà FE không có

Ví dụ trong project này:

```ts
// backend/src/services/task.service.ts:135-137
// Chỉ BE mới biết user có tồn tại trong DB không
if (data.assigneeId) {
  const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
  if (!assignee) throw new NotFoundError('User', data.assigneeId);
}
```

FE không thể biết `assigneeId` có valid ở thời điểm submit không (user có thể đã bị xóa giữa chừng).

### Lý do 5: Concurrent modification

```ts
// backend/src/services/task.service.ts:156-163
// State machine validation — FE không thể ngăn concurrent requests
if (data.status && data.status !== existing.status) {
  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed.includes(data.status)) {
    throw new ConflictError('INVALID_TRANSITION', `Cannot transition...`);
  }
}
```

Hai người dùng cùng lúc có thể cố gắng thay đổi task — chỉ BE mới có thể enforce state machine với locking.

### Tóm tắt

| | FE Validation | BE Validation |
|---|---|---|
| Mục đích | UX, instant feedback | Security, data integrity |
| Ai có thể bypass | Mọi người | Không ai (server-side) |
| Biết DB state | Không | Có |
| Concurrent safety | Không | Có (transaction) |
| Bắt buộc | Không (optional) | Có (mandatory) |

---

## 4. Cache — Redis, TTL, Cache Invalidation

### Câu hỏi: "Cache được dùng như thế nào? Cache bao lâu? Khi nào reset?"

### 4a. Cache gì?

Chỉ **leaderboard rankings** được cache — đây là dữ liệu đắt nhất (full table scan + sort) và được đọc nhiều nhất (realtime stream).

```ts
// backend/src/services/leaderboard.service.ts:9-10
export const LEADERBOARD_CACHE_KEY = 'leaderboard:rankings';
const CACHE_TTL = 60; // giây
```

Các endpoint khác (tasks list, user list) **không cache** — chúng cần dữ liệu fresh.

### 4b. Pattern: Cache-Aside (Lazy Loading)

```
Request → Check Redis
           ├─ HIT  → trả ngay từ Redis (< 1ms)
           └─ MISS → query PostgreSQL → lưu vào Redis → trả về
```

Code thực tế:

```ts
// backend/src/services/leaderboard.service.ts:94-131
async getRankings() {
  // Bước 1: Try cache
  try {
    const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
    if (cached !== null) {
      return JSON.parse(cached);  // Cache HIT — return immediately
    }
  } catch (err) {
    logger.warn({ err }, 'Redis cache read failed'); // Redis down → graceful degrade
  }

  // Bước 2: Cache MISS — query DB
  const users = await prisma.user.findMany({
    include: { productivityScore: true },
  });
  const rankings = users
    .map(user => ({ ... }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  // Bước 3: Write to cache với TTL 60 giây
  try {
    await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', CACHE_TTL);
  } catch (err) {
    logger.warn({ err }, 'Redis cache write failed'); // Redis down → vẫn trả DB result
  }

  return rankings;
}
```

### 4c. TTL 60 giây — tại sao?

- Leaderboard không cần cực kỳ real-time (điểm thay đổi khi task DONE, không liên tục)
- 60s là cân bằng tốt: không stale quá lâu, không query DB quá thường
- Khi task DONE, cache bị **invalidate ngay lập tức** (xem 4d) nên TTL chỉ là safety net

### 4d. Cache Invalidation — khi nào reset?

Cache bị xóa trong **3 trường hợp**:

**Trường hợp 1: Task chuyển sang DONE**
```ts
// backend/src/services/task.service.ts:249-257
if (data.status === 'DONE' && existing.status !== 'DONE' && updated?.assigneeId) {
  try {
    await redisClient.del(LEADERBOARD_CACHE_KEY); // xóa cache cũ
  } catch (err) {
    logger.warn({ err }, 'Redis cache invalidation failed');
  }
  const updatedRankings = await leaderboardService.getRankings(); // query DB mới → tự populate lại cache
  sseManager.broadcast(updatedRankings); // push SSE đến tất cả clients
}
```

**Trường hợp 2: User bị xóa**
```ts
// backend/src/services/user.service.ts:111-117
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
const updatedRankings = await leaderboardService.getRankings();
sseManager.broadcast(updatedRankings);
```

**Trường hợp 3: User bị update (tên/email)**
```ts
// backend/src/services/user.service.ts:81-85
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
```
(Không cần SSE broadcast vì không thay đổi ranking thứ tự, chỉ thay đổi tên hiển thị)

**Trường hợp 4: Task DONE bị xóa (force delete)**
```ts
// backend/src/services/task.service.ts:311-318
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
const updatedRankings = await leaderboardService.getRankings();
sseManager.broadcast(updatedRankings);
```

### 4e. Graceful Degradation — Redis chết thì sao?

```ts
// backend/src/lib/redis.ts:5-8
export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false, // ← không queue request khi Redis down (không treo)
  maxRetriesPerRequest: 1,   // ← fail fast, không retry nhiều lần
});
```

Cả read lẫn write Redis đều được bọc `try/catch` và chỉ `logger.warn` — **không throw**. Ứng dụng vẫn hoạt động bình thường, chỉ là mỗi request query DB thay vì đọc cache.

### 4f. Cache Stampede (vấn đề tiềm ẩn)

Khi cache expire đúng lúc có 100 requests đồng thời → tất cả cùng query DB (thundering herd). Project hiện tại chưa xử lý vấn đề này (chấp nhận được ở scale nhỏ). Giải pháp nâng cấp: dùng **mutex lock** (ví dụ `redlock`) hoặc **stale-while-revalidate**.

---

## 5. API Request Flow — từng bước qua middleware

### Câu hỏi: "Khi một HTTP request đến BE, nó đi qua những bước nào?"

Lấy ví dụ: `PATCH /api/tasks/:id` với body `{ "status": "DONE" }`

```
HTTP Request
     │
     ▼
[1] helmet()               — Gắn security headers (X-Frame-Options, HSTS, ...)
     │
     ▼
[2] cors()                 — Kiểm tra Origin header, set CORS headers
     │                       Nếu preflight OPTIONS → return 204 ngay
     ▼
[3] correlationIdMiddleware — Đọc X-Request-Id header
     │                        Validate UUID format
     │                        Gắn req.id, set response header X-Request-Id
     ▼
[4] pinoHttp logger        — Log request start: { method, url, reqId, ... }
     │
     ▼
[5] express.json()         — Parse body "{ "status": "DONE" }" → req.body object
     │
     ▼
[6] writeLimiter           — Rate limit: nếu là PATCH/POST/DELETE
     │                        Kiểm tra 60 req/phút/IP
     │                        Nếu vượt → 429 RATE_LIMIT_EXCEEDED
     ▼
[7] Router matching        — app.use('/api/tasks', taskRouter)
     │                        taskRouter.patch('/:id', ...)
     ▼
[8] validate(updateTaskSchema) — Zod parse req.body
     │                           Nếu lỗi → throw ValidationError → skip [9,10]
     ▼
[9] Route handler          — taskService.update(id, body)
     │                        ├─ getById(id) → NotFoundError nếu không tìm thấy
     │                        ├─ Kiểm tra VALID_TRANSITIONS
     │                        ├─ prisma.$transaction(...)
     │                        │    ├─ task.updateMany (optimistic lock)
     │                        │    └─ leaderboardService.scoreTask(...)
     │                        ├─ redisClient.del(cache key)
     │                        ├─ leaderboardService.getRankings()
     │                        └─ sseManager.broadcast(rankings)
     ▼
[10] res.json(updatedTask) — Serialize response, pinoHttp log response: { statusCode, ms }
     │
     ▼
HTTP Response 200
```

**Nếu có lỗi xảy ra ở bất kỳ bước nào:**

```
throw NotFoundError / ConflictError / ValidationError
     │
     ▼
[errorHandler middleware]  — app.use(errorHandler) ở cuối cùng
     │                        instanceof AppError → serialize error JSON
     │                        Prisma P2002 → 409 DUPLICATE_*
     │                        Prisma P2003 → 409 FOREIGN_KEY_CONSTRAINT
     │                        Unknown → 500 INTERNAL_ERROR + console.error
     ▼
HTTP Response 4xx/5xx
```

Code tham chiếu:
```ts
// Thứ tự middleware — backend/src/app.ts:22-40
app.use(helmet());
app.use(cors({ ... }));
app.use(correlationIdMiddleware);
app.use(httpLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(writeLimiter);
// ... routes ...
app.use(errorHandler); // ← PHẢI cuối cùng để catch tất cả errors
```

---

## 6. CORS — cấu hình và tại sao

### Câu hỏi: "CORS được cấu hình thế nào? Tại sao cần CORS?"

### 6a. CORS là gì?

Browser thực thi **Same-Origin Policy** — script chạy trên `http://localhost:3001` (FE) **không được phép** gọi `http://localhost:3000` (BE) trừ khi BE cho phép thông qua CORS headers.

### 6b. Cấu hình trong project

```ts
// backend/src/app.ts:23-27
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || 'http://localhost:3001')
    : '*',
}));
```

| Environment | Allowed Origin | Lý do |
|---|---|---|
| `production` | `ALLOWED_ORIGIN` env var (ví dụ `https://myapp.com`) | Restrict chỉ domain đã biết |
| `development` / `test` | `*` (tất cả) | Tiện cho dev/test, không rủi ro |

### 6c. CORS Headers được set

Khi BE response có CORS, trình duyệt nhìn thấy:
```
Access-Control-Allow-Origin: https://myapp.com
```

Với `cors()` middleware mặc định còn set thêm:
```
Access-Control-Allow-Methods: GET, HEAD, PUT, PATCH, POST, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
```

### 6d. CORS không ngăn được server-to-server

CORS chỉ là browser enforcement. `curl`, Postman, backend-to-backend hoàn toàn không bị ảnh hưởng. Đây là lý do CORS không phải security layer — nó chỉ bảo vệ người dùng khỏi bị website độc hại lợi dụng session của họ (CSRF attack).

### 6e. Tại sao cần `ALLOWED_ORIGIN` env var?

Tránh hardcode domain. Khi deploy, chỉ cần set env var:
```
ALLOWED_ORIGIN=https://prod.myapp.com
```
Không cần sửa code hay build lại.

### 6f. Preflight request (OPTIONS)

Browser tự động gửi OPTIONS request trước PATCH/POST/DELETE:
```
OPTIONS /api/tasks/123
Origin: http://localhost:3001
Access-Control-Request-Method: PATCH
```

`cors()` middleware tự xử lý và trả 204, sau đó browser mới gửi request thật.

---

## 7. Logging — pino, correlation ID, structured logs

### Câu hỏi: "Logging được thực hiện như thế nào? Làm thế nào trace một request?"

### 7a. Structured Logging với Pino

Thay vì `console.log("Request received")` (plain text), project dùng **structured JSON logs**:

```json
{
  "level": 30,
  "time": "10:32:15.123",
  "reqId": "550e8400-e29b-41d4-a716-446655440000",
  "req": { "method": "PATCH", "url": "/api/tasks/abc", "remoteAddress": "127.0.0.1" },
  "msg": "request received"
}
```

Lợi ích: dễ query với log aggregation tools (Datadog, Loki, CloudWatch).

### 7b. HTTP Request Logging tự động

```ts
// backend/src/app.ts:15-20
const httpLogger = pinoHttp({
  genReqId: (req: Request) => req.id,  // dùng correlation ID làm reqId
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
    : undefined, // production: JSON thuần
});
```

`pino-http` tự động log:
- Request đến: method, url, remoteAddress
- Response ra: statusCode, response time (ms)

### 7c. Correlation ID (Request Tracing)

Mỗi request có một UUID duy nhất để trace toàn bộ lifecycle:

```ts
// backend/src/middleware/correlation-id.ts:7-13
export function correlationIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  // Chỉ chấp nhận UUID v4 hợp lệ (ngăn log injection — SEC-01)
  const id = (incoming && UUID_REGEX.test(incoming)) ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id); // trả lại cho client
  next();
}
```

**Dùng thế nào khi debug:**
1. FE gửi request → response header chứa `X-Request-Id: abc-123`
2. Nếu có lỗi, user gửi `X-Request-Id` đó cho dev
3. Dev search log: `grep '"reqId":"abc-123"'` → thấy toàn bộ chain của request đó

### 7d. Service-level logging

Mỗi service có logger riêng với `name` để phân biệt nguồn:

```ts
// backend/src/services/task.service.ts:11
const logger = pino({ name: 'task-service' });

// backend/src/services/leaderboard.service.ts:7
const logger = pino({ name: 'leaderboard-service' });
```

Dùng trong các trường hợp non-fatal (Redis fail):

```ts
// backend/src/services/task.service.ts:252-253
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
}
```

Log JSON output:
```json
{ "level": 40, "name": "task-service", "err": { "message": "ECONNREFUSED" }, "msg": "Redis cache invalidation failed" }
```

### 7e. Lỗi unhandled — `console.error`

```ts
// backend/src/middleware/error-handler.ts:68
console.error('Unhandled error:', err);
```

Chỉ dùng cho unexpected errors (500) — mọi lỗi business logic đều được log qua pino.

---

## 8. Real-time Communication — SSE vs WebSocket

### Câu hỏi: "Leaderboard realtime được implement thế nào? Tại sao dùng SSE mà không phải WebSocket?"

### 8a. Server-Sent Events (SSE) là gì?

SSE là giao thức HTTP đặc biệt: **một chiều** từ server → client. Connection HTTP giữ mở, server đẩy data bất cứ lúc nào.

Format chuẩn:
```
event: score-update\n
data: [{"rank":1,"userId":"abc","totalScore":45},...]\n
\n
```

### 8b. Server Side

```ts
// backend/src/routes/leaderboard.routes.ts:13-28
router.get('/stream', async (req, res) => {
  // Set headers SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // tắt nginx buffering
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // gửi headers ngay, giữ connection mở

  const clientId = randomUUID();
  sseManager.addClient(clientId, res); // đăng ký client

  // Push data hiện tại ngay lập tức (initial load)
  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  // Cleanup khi client disconnect
  req.on('close', () => { sseManager.removeClient(clientId); });
});
```

### 8c. SseManager — in-memory registry

```ts
// backend/src/lib/sse-manager.ts:3-32
class SseManager {
  private clients: Map<string, Response> = new Map();

  broadcast(data: unknown): void {
    const payload = `event: score-update\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [id, res] of this.clients.entries()) {
      // Evict closed connections trước khi write (tránh ghi vào dead connection)
      if (res.writableEnded || res.destroyed) {
        this.clients.delete(id);
        continue;
      }
      try {
        res.write(payload); // push đến từng client
      } catch {
        this.clients.delete(id); // client disconnect mid-write
      }
    }
  }
}
```

### 8d. Trigger broadcast

Khi có thay đổi điểm (task DONE hoặc user deleted), tự động broadcast:

```ts
// backend/src/services/task.service.ts:255-257
const updatedRankings = await leaderboardService.getRankings();
sseManager.broadcast(updatedRankings); // → tất cả tab đang mở leaderboard đều cập nhật
```

### 8e. Frontend — EventSource

```ts
// Leaderboard page sẽ dùng
const source = new EventSource('/api/leaderboard/stream');
source.addEventListener('score-update', (e) => {
  setRankings(JSON.parse(e.data));
});
source.onerror = () => { /* hiển thị error state */ };
```

### 8f. SSE vs WebSocket — khi nào dùng gì?

| | SSE | WebSocket |
|---|---|---|
| Chiều giao tiếp | Server → Client (1 chiều) | 2 chiều |
| Protocol | HTTP/1.1 (standard) | WS upgrade |
| Auto reconnect | Có (browser tự động) | Phải tự implement |
| Phù hợp | Live feed, notifications, leaderboard | Chat, game, collaborative editing |
| Proxy/Load balancer | Dễ (HTTP) | Khó hơn (WS support cần thiết) |

**Leaderboard chỉ cần server push (không cần client gửi data real-time)** → SSE là lựa chọn đơn giản hơn và đủ dùng.

---

## 9. Rate Limiting

### Câu hỏi: "Rate limiting được implement như thế nào?"

```ts
// backend/src/middleware/rate-limiter.ts:5-18
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,  // cửa sổ 1 phút
  limit: 60,            // max 60 write requests / phút / IP
  skip: (req) => !['POST', 'PATCH', 'DELETE'].includes(req.method), // chỉ áp dụng write ops
  standardHeaders: 'draft-7', // trả RateLimit headers theo chuẩn IETF
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMIT_EXCEEDED', message: '...' }
    });
  },
});
```

**Điểm đáng chú ý:**
- Chỉ limit **write operations** (POST/PATCH/DELETE) — GET requests không bị ảnh hưởng
- In-memory store (mặc định) → sẽ reset khi restart server. Production cần dùng Redis store để consistent across instances
- Response headers theo chuẩn `draft-7`:
  ```
  RateLimit-Limit: 60
  RateLimit-Remaining: 45
  RateLimit-Reset: 1700000060
  ```

---

## 10. Error Handling — typed error hierarchy

### Câu hỏi: "Errors được xử lý nhất quán như thế nào?"

### 10a. Error Class Hierarchy

```ts
// backend/src/middleware/error-handler.ts:4-32
AppError (base)
  ├── NotFoundError    → 404 NOT_FOUND
  ├── ValidationError  → 400 VALIDATION_ERROR + details array
  └── ConflictError    → 409 + custom code
        ├── INVALID_TRANSITION
        ├── CONCURRENT_MODIFICATION
        ├── UNASSIGNED_COMPLETION
        ├── USER_HAS_TASKS
        ├── TASK_COMPLETED
        └── INVALID_OPERATION
```

### 10b. Services throw, routes don't catch

Services throw typed errors:
```ts
// backend/src/services/task.service.ts:130
if (!task) throw new NotFoundError('Task', id);
// backend/src/services/task.service.ts:159-163
throw new ConflictError('INVALID_TRANSITION', `Cannot transition...`);
```

Routes KHÔNG bắt errors — Express 5 tự động forward async errors đến `errorHandler`:
```ts
// backend/src/routes/task.routes.ts:26-29
router.post('/', validate(createTaskSchema), async (req, res) => {
  const task = await taskService.create(req.body); // nếu throw → Express 5 tự catch
  res.status(201).json(task);
});
```

### 10c. Global errorHandler

```ts
// backend/src/middleware/error-handler.ts:34-74
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code, message, details? } });
    return;
  }
  // Prisma P2002 (unique constraint violated)
  if (err.code === 'P2002') {
    res.status(409).json({ error: { code: `DUPLICATE_${field}`, message: ... } });
    return;
  }
  // Prisma P2003 (foreign key constraint)
  if (err.code === 'P2003') {
    res.status(409).json({ error: { code: 'FOREIGN_KEY_CONSTRAINT', ... } });
    return;
  }
  // Unhandled → 500
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', ... } });
}
```

### 10d. Response format nhất quán

Mọi error đều theo format:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Task with id abc-123 not found",
    "details": [...] // chỉ có trong ValidationError
  }
}
```

FE chỉ cần kiểm tra `response.error.code` để xử lý từng loại lỗi.

---

## 11. Concurrency & Race Condition Prevention

### Câu hỏi: "Nếu 2 requests cùng lúc cố mark task là DONE thì sao?"

### 11a. Vấn đề

```
Request A: READ task { status: IN_PROGRESS }
Request B: READ task { status: IN_PROGRESS }
Request A: UPDATE task SET status=DONE  ✓  → score awarded
Request B: UPDATE task SET status=DONE  ✓  → score awarded AGAIN! (double scoring!)
```

### 11b. Giải pháp: Optimistic Locking với `updateMany`

Thay vì `update({ where: { id } })`, dùng `updateMany({ where: { id, status: existing.status } })`:

```ts
// backend/src/services/task.service.ts:204-214
await prisma.$transaction(async (tx) => {
  const result = await tx.task.updateMany({
    where: {
      id,
      status: existing.status, // ← điều kiện then chốt: chỉ update nếu status vẫn là giá trị đã đọc
    },
    data: updateData,
  });
  if (result.count === 0) {
    // Ai đó đã thay đổi task rồi — chúng ta thua race
    throw new ConflictError(
      'CONCURRENT_MODIFICATION',
      'Task was modified by a concurrent request. Please refresh and retry.'
    );
  }
  // Tiếp tục score bên trong cùng transaction
  await leaderboardService.scoreTask({ ... }, tx);
});
```

**Tại sao an toàn:**
- Database thực thi `WHERE id=X AND status='IN_PROGRESS'` là atomic
- Request B sẽ nhận `result.count === 0` (status đã là DONE) → throw 409
- Chỉ 1 trong 2 requests thắng race

### 11c. Scoring trong cùng transaction

```ts
// backend/src/services/task.service.ts:223-238
if (data.status === 'DONE' && existing.status !== 'DONE' && updatedInTx.assigneeId) {
  await leaderboardService.scoreTask({ ... }, tx); // tx được truyền vào
}
```

Nếu `scoreTask` fail → toàn bộ transaction rollback (task không được update, score không được ghi). Không có tình trạng task=DONE nhưng không có score.

---

## 12. Database Transaction & Atomicity

### Câu hỏi: "Transaction được dùng ở đâu và tại sao?"

### Transaction 1: Task update + scoring (atomicity)

```ts
// backend/src/services/task.service.ts:204-239
await prisma.$transaction(async (tx) => {
  await tx.task.updateMany(...)     // Bước 1: update task
  await tx.scoreEvent.create(...)   // Bước 2: ghi score event
  await tx.productivityScore.upsert(...) // Bước 3: update tổng score
  // Nếu bất kỳ bước nào fail → tất cả rollback
});
```

### Transaction 2: User deletion (null out completed tasks)

```ts
// backend/src/services/user.service.ts:103-109
await prisma.$transaction(async (tx) => {
  await tx.task.updateMany({
    where: { assigneeId: id, status: 'DONE' },
    data: { assigneeId: null }, // giữ lại historical records
  });
  await tx.user.delete({ where: { id } });
  // Nếu delete fail → task.updateMany cũng rollback
});
```

### Transaction 3: Force delete task DONE (score rollback)

```ts
// backend/src/services/task.service.ts:273-309
await prisma.$transaction(async (tx) => {
  const scoreEvent = await tx.scoreEvent.findFirst({ where: { taskId: id } });
  await tx.scoreEvent.deleteMany({ where: { taskId: id } });
  await tx.task.delete({ where: { id } });
  // Recalculate score từ đầu (source of truth)
  const agg = await tx.scoreEvent.aggregate({
    where: { userId: scoredUserId },
    _sum: { totalAwarded: true },
  });
  await tx.productivityScore.upsert({ ... });
});
```

**Nguyên tắc:** Side effects ngoài DB (Redis del, SSE broadcast) nằm **ngoài** transaction vì chúng không thể rollback:

```ts
// backend/src/services/task.service.ts:248
// Side effects OUTSIDE the transaction (D-04): cache invalidation + SSE broadcast
if (data.status === 'DONE' ...) {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
  sseManager.broadcast(updatedRankings);
}
```

---

## 13. State Machine — task transitions

### Câu hỏi: "Task status transitions được enforce như thế nào?"

### 13a. Valid transitions

```ts
// shared/types/task.ts:44-48
export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]:        [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.DONE],
  [TaskStatus.DONE]:        [],  // terminal state — không thể chuyển đi đâu
};
```

```
TODO → IN_PROGRESS → DONE
 ↑         ↑
không thể quay lại
```

### 13b. Enforcement trong service

```ts
// backend/src/services/task.service.ts:156-163
if (data.status && data.status !== existing.status) {
  const allowed = VALID_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(data.status)) {
    throw new ConflictError(
      'INVALID_TRANSITION',
      `Cannot transition from ${existing.status} to ${data.status}. Allowed: ${allowed.join(', ') || 'none'}`
    );
  }
}
```

### 13c. Tại sao định nghĩa ở `shared/`?

```ts
// shared/types/task.ts — được import cả ở BE lẫn FE
```

- **BE** dùng để validate và enforce (source of truth)
- **FE** dùng để disable nút không hợp lệ trong UI (UX only)

Single source of truth — không bao giờ bị out of sync.

---

## 14. Security — Helmet, UUID validation

### Câu hỏi: "Các biện pháp security nào được áp dụng?"

### 14a. Helmet — HTTP security headers

```ts
// backend/src/app.ts:22
app.use(helmet());
```

Helmet tự động set các headers:
```
X-Frame-Options: SAMEORIGIN          — chống clickjacking
X-Content-Type-Options: nosniff      — chống MIME type sniffing
Strict-Transport-Security: max-age=... — HSTS (HTTPS only)
X-XSS-Protection: 0                  — disable browser XSS filter (dùng CSP thay)
Content-Security-Policy: ...         — whitelist scripts, styles
```

### 14b. UUID validation trên X-Request-Id (Log Injection prevention)

```ts
// backend/src/middleware/correlation-id.ts:4-10
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const id = (incoming && UUID_REGEX.test(incoming)) ? incoming : randomUUID();
```

**Tại sao cần?** Nếu không validate, attacker có thể gửi:
```
X-Request-Id: \n{"level":50,"msg":"FAKE_CRITICAL_ERROR"}\n
```
→ inject fake log entries vào log stream (log poisoning). UUID regex ngăn chặn điều này.

### 14c. CORS restriction trong production

```ts
// backend/src/app.ts:24-26
origin: process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGIN || 'http://localhost:3001')
  : '*',
```

### 14d. Rate limiting

60 write requests/phút/IP — ngăn brute force và spam.

### 14e. Prisma parameterized queries

Mọi query qua Prisma ORM đều dùng parameterized queries → không bị SQL injection. Cả raw SQL cũng dùng `Prisma.sql` template literal (safe):

```ts
// backend/src/services/task.service.ts:28
if (query.status) conditions.push(Prisma.sql`t.status = ${query.status}`);
//                                                         ↑ safely parameterized
```

---

## 15. Scoring System — business logic

### Câu hỏi: "Điểm được tính như thế nào? Có edge cases nào không?"

### 15a. Công thức

```
score = PRIORITY_POINTS[priority] + bonus - penalty
```

```ts
// shared/constants/scoring.ts
PRIORITY_POINTS = { LOW: 5, MEDIUM: 10, HIGH: 20 }
EARLY_BONUS  = +5   (hoàn thành trước due date)
LATE_PENALTY = -3   (hoàn thành sau due date)
```

### 15b. Date-only comparison (Edge case)

```ts
// backend/src/services/leaderboard.service.ts:30-36
const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dueDay = new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate());
const isEarly = nowDay < dueDay;
const isLate  = nowDay > dueDay;
```

**Tại sao strip time?** Nếu dùng `now < dueDate` thẳng: task due `2025-01-15 00:00:00` nhưng hoàn thành lúc `2025-01-15 23:59:59` sẽ bị tính là late (vì timestamp sau). Nhưng semantically, hoàn thành trong ngày = đúng hạn.

### 15c. Score event immutability

Mỗi lần task DONE → ghi `ScoreEvent` riêng. `ProductivityScore` là aggregate được tính từ `ScoreEvent`:

```ts
// backend/src/services/task.service.ts:286-293 (khi force delete task DONE)
// Recalculate từ ScoreEvents (source of truth), không trust ProductivityScore
const agg = await tx.scoreEvent.aggregate({
  where: { userId: scoredUserId },
  _sum: { totalAwarded: true },
});
```

→ Dù có bug trong aggregation, luôn có thể rebuild từ `ScoreEvent` audit log.

### 15d. Điểm âm có thể xảy ra không?

Có. Ví dụ: `LOW` priority + late = `5 - 3 = 2`. Nhưng nếu penalty lớn hơn base points trong tương lai thì có thể âm. Code không clamp về 0 — đây là business decision.

### 15e. Bảng điểm ví dụ

| Priority | Hoàn thành | Score |
|---|---|---|
| HIGH | Early | 20 + 5 = 25 |
| HIGH | On time | 20 + 0 = 20 |
| HIGH | Late | 20 - 3 = 17 |
| LOW | Early | 5 + 5 = 10 |
| LOW | Late | 5 - 3 = 2 |

---

## Quick Reference — Code Locations

| Topic | File | Dòng |
|---|---|---|
| Middleware stack order | `backend/src/app.ts` | 22-40 |
| CORS config | `backend/src/app.ts` | 23-27 |
| Correlation ID middleware | `backend/src/middleware/correlation-id.ts` | 7-13 |
| Rate limiter | `backend/src/middleware/rate-limiter.ts` | 5-18 |
| Zod validate middleware | `backend/src/middleware/validation.ts` | 5-20 |
| Error handler global | `backend/src/middleware/error-handler.ts` | 34-74 |
| Error class hierarchy | `backend/src/middleware/error-handler.ts` | 4-32 |
| Task schemas | `backend/src/schemas/task.schemas.ts` | 1-38 |
| User schemas | `backend/src/schemas/user.schemas.ts` | 1-32 |
| N+1 prevention (include) | `backend/src/services/task.service.ts` | 107-113 |
| N+1 prevention (raw SQL) | `backend/src/services/task.service.ts` | 37-67 |
| State machine enforcement | `backend/src/services/task.service.ts` | 156-163 |
| Optimistic locking | `backend/src/services/task.service.ts` | 204-214 |
| Scoring transaction | `backend/src/services/task.service.ts` | 204-239 |
| Cache invalidation (task) | `backend/src/services/task.service.ts` | 249-257 |
| Cache invalidation (user) | `backend/src/services/user.service.ts` | 111-117 |
| Cache-aside pattern | `backend/src/services/leaderboard.service.ts` | 94-131 |
| Date-only comparison | `backend/src/services/leaderboard.service.ts` | 30-36 |
| Cache TTL const | `backend/src/services/leaderboard.service.ts` | 10 |
| SSE server setup | `backend/src/routes/leaderboard.routes.ts` | 13-28 |
| SSE manager broadcast | `backend/src/lib/sse-manager.ts` | 14-29 |
| Redis graceful degrade | `backend/src/lib/redis.ts` | 5-8 |
| Valid transitions | `shared/types/task.ts` | 44-48 |
| Scoring constants | `shared/constants/scoring.ts` | 1-10 |
