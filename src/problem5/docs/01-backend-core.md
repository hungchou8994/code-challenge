# 01 — Backend Core: Express App, Middleware & Routing

## Entry points

### `backend/src/server.ts`
```typescript
import 'dotenv/config';       // Load .env file vào process.env
import { app } from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```
File này cực kỳ đơn giản — **chỉ** đọc PORT và gọi `listen()`. Toàn bộ logic cấu hình app nằm ở `app.ts`. Lý do tách ra: các test file import `app.ts` trực tiếp mà không cần start HTTP server thật.

### `backend/src/app.ts`
Đây là nơi "lắp ráp" toàn bộ Express app. Thứ tự middleware **rất quan trọng** — Express xử lý theo đúng thứ tự khai báo.

---

## Middleware stack (theo thứ tự)

```
Request đến
     │
     ▼
 1. helmet()                 — Gắn security headers
 2. cors()                   — Xử lý CORS
 3. correlationIdMiddleware  — Gán request ID
 4. pinoHttp()               — Log request/response
 5. express.json()           — Parse JSON body
 6. express.urlencoded()     — Parse form data
 7. writeLimiter             — Rate limiting
     │
     ├── Routes (xử lý request)
     │
 8. errorHandler             — Bắt lỗi từ routes/services
     │
     ▼
Response trả về
```

### 1. `helmet()`
**Package:** `helmet`
Tự động gắn hàng loạt HTTP security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`
- v.v.

Không cần cấu hình gì — dùng defaults là đủ tốt cho production.

### 2. `cors()`
**Package:** `cors`
```typescript
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || 'http://localhost:3001')
    : '*',
}));
```
- **Dev/Test**: `*` — cho phép mọi origin (tiện khi develop)
- **Production**: chỉ cho phép domain cụ thể từ env var

CORS middleware phải đặt **trước** routes, đặt biệt trước `express.json()` để các preflight `OPTIONS` request được xử lý đúng.

### 3. `correlationIdMiddleware`
**File:** `backend/src/middleware/correlation-id.ts`
```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correlationIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  // Chỉ tin tưởng header nếu đúng UUID v4 format
  const id = (incoming && UUID_REGEX.test(incoming)) ? incoming : randomUUID();
  req.id = id;               // Gán vào req object
  res.setHeader('X-Request-Id', id);  // Echo lại trong response
  next();
}
```
**Tại sao validate UUID?** Bảo vệ log poisoning (SEC-01): nếu không validate, attacker có thể gửi `X-Request-Id: ../../../etc/passwd` và nó sẽ xuất hiện trong logs.

**Type augmentation:** `req.id` không có sẵn trong Express types mặc định. Dự án tạo file `backend/src/@types/express/index.d.ts`:
```typescript
declare namespace Express {
  interface Request {
    id: string;
  }
}
```
Nhờ đó `req.id` được type an toàn, không cần cast.

### 4. `pinoHttp()`
**Package:** `pino-http`
```typescript
const httpLogger = pinoHttp({
  genReqId: (req) => req.id,  // Dùng correlation ID đã gắn ở bước 3
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```
- **Dev**: log đẹp, có màu sắc
- **Production**: log JSON (dễ parse bởi log aggregator như Datadog, Loki)

Pino là structured logger — log ra JSON thay vì plain text, cực nhanh (ít overhead hơn Winston/Morgan).

### 5-6. `express.json()` + `express.urlencoded()`
Parse body của request. Phải đặt **sau** correlationId/logger để chúng không bị ảnh hưởng bởi body parsing errors.

### 7. `writeLimiter`
**File:** `backend/src/middleware/rate-limiter.ts`
```typescript
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,   // Window 1 phút
  limit: 60,              // Tối đa 60 requests/phút/IP
  skip: (req) => !['POST', 'PATCH', 'DELETE'].includes(req.method),
  handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED' } }),
});
```
**Quan trọng:** `skip` chỉ áp dụng cho write methods — `GET` requests không bị limit. Đây là pattern hợp lý vì reads thường nhiều hơn writes và ít tốn kém hơn.

### 8. `errorHandler`
**File:** `backend/src/middleware/error-handler.ts`

Đây là **global error handler** — phải khai báo **cuối cùng** và có đúng 4 tham số `(err, req, res, next)`. Express nhận biết đây là error handler nhờ chữ ký 4 tham số.

```typescript
export function errorHandler(err, _req, res, _next): void {
  if (err instanceof AppError) {
    // Lỗi có kiểm soát: 404, 400, 409
    res.status(err.statusCode).json({ error: { code, message, details? } });
    return;
  }
  if (err.code === 'P2002') {
    // Prisma unique constraint violation → 409 DUPLICATE_field
    ...
  }
  if (err.code === 'P2003') {
    // Prisma foreign key constraint → 409 FOREIGN_KEY_CONSTRAINT
    ...
  }
  // Lỗi không biết trước → 500 INTERNAL_ERROR
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '...' } });
}
```

**Error class hierarchy:**
```
AppError (base: statusCode, code, message, details?)
├── NotFoundError(resource, id)    → 404 NOT_FOUND
├── ValidationError(details[])    → 400 VALIDATION_ERROR
└── ConflictError(code, message)  → 409 + custom code
    Ví dụ codes: INVALID_TRANSITION, USER_HAS_TASKS,
                 CONCURRENT_MODIFICATION, TASK_COMPLETED,
                 UNASSIGNED_COMPLETION, INVALID_OPERATION
```

Services `throw new NotFoundError(...)`, Express bắt và forward đến `errorHandler`.

---

## Validation middleware

**File:** `backend/src/middleware/validation.ts`
```typescript
export function validate(schema: ZodSchema) {
  return (req, _res, next): void => {
    try {
      req.body = schema.parse(req.body);  // Parse + coerce + validate
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw new ValidationError(err.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
      }
      throw err;
    }
  };
}
```
Dùng như middleware factory: `router.post('/', validate(createTaskSchema), handler)`.

Sau khi validate, `req.body` đã được **coerce** (ép kiểu) theo schema — ví dụ string `"42"` thành number `42` nếu schema khai báo `z.coerce.number()`.

---

## Routing layer

**Pattern:** Route files chỉ là thin layer — nhận request, validate query params, gọi service, trả response. Không có logic nghiệp vụ.

```typescript
// task.routes.ts
router.get('/', async (req, res) => {
  const parsed = taskQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { ... } });
    return;
  }
  const result = await taskService.getAll(parsed.data);
  res.json(result);
});

router.post('/', validate(createTaskSchema), async (req, res) => {
  const task = await taskService.create(req.body);
  res.status(201).json(task);
});
```

**Query params** dùng `safeParse` + early return thay vì middleware (vì query params cần xử lý khác body).  
**Body** dùng `validate()` middleware factory.

**Export pattern:**
```typescript
const router = Router();
// ... khai báo routes
export { router as taskRouter };  // Named re-export
```

---

## Zod schemas

**File:** `backend/src/schemas/task.schemas.ts`, `user.schemas.ts`

Mỗi entity có 3 schema:
- `createXSchema` — validate body của POST
- `updateXSchema` — validate body của PATCH/PUT (tất cả fields optional + `.refine()` đảm bảo ít nhất 1 field)
- `xQuerySchema` — validate query params của GET list

```typescript
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: taskStatusEnum.optional(),
  // ...
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided to update' }
);
```

**Type inference:** Cuối mỗi file export TypeScript type từ schema:
```typescript
export type CreateTaskBody = z.infer<typeof createTaskSchema>;
```
→ Schema và type **không bao giờ lệch nhau** vì type được derive từ schema.

---

## Lib singletons

### `backend/src/lib/prisma.ts`
```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```
Pattern này tránh tạo nhiều Prisma instances khi Next.js hot-reload (relevant nếu dùng trong Next.js API routes). Trong backend Express thuần, `process.env.NODE_ENV !== 'production'` guard đảm bảo dev hot-reload không tạo connection pool mới mỗi lần.

### `backend/src/lib/redis.ts`
```typescript
export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,           // Không kết nối ngay khi import
  enableOfflineQueue: false,   // Không queue commands khi offline
  maxRetriesPerRequest: 1,     // Fail fast thay vì retry mãi
});
```
`lazyConnect` + `enableOfflineQueue: false` = Redis lỗi thì lệnh fail nhanh, không block app.
