# 01 — Backend Core: Express App, Middleware & Routing

## Entry points

### `backend/src/server.ts`
```typescript
import 'dotenv/config';       // Load .env file into process.env
import { app } from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```
This file is intentionally very simple — it **only** reads `PORT` and calls `listen()`. All app configuration logic lives in `app.ts`. The reason for separating it is that test files can import `app.ts` directly without starting a real HTTP server.

### `backend/src/app.ts`
This is where the entire Express app is assembled. Middleware order is **very important** — Express processes middleware exactly in declaration order.

---

## Middleware stack (in order)

```
Incoming request
     │
     ▼
 1. helmet()                 — Attach security headers
 2. cors()                   — Handle CORS
 3. correlationIdMiddleware  — Assign request ID
 4. pinoHttp()               — Log request/response
 5. express.json()           — Parse JSON body
 6. express.urlencoded()     — Parse form data
 7. writeLimiter             — Rate limiting
     │
     ├── Routes (handle request)
     │
 8. errorHandler             — Catch errors from routes/services
     │
     ▼
Outgoing response
```

### 1. `helmet()`
**Package:** `helmet`
Automatically attaches a set of HTTP security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`
- etc.

No special configuration is needed here — the defaults are already good enough for production.

### 2. `cors()`
**Package:** `cors`
```typescript
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || 'http://localhost:3001')
    : '*',
}));
```
- **Dev/Test**: `*` — allows all origins for convenience during development
- **Production**: only allows a specific domain from an environment variable

The CORS middleware must be placed **before** routes, especially before `express.json()`, so preflight `OPTIONS` requests are handled correctly.

### 3. `correlationIdMiddleware`
**File:** `backend/src/middleware/correlation-id.ts`
```typescript
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correlationIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  // Trust the header only if it matches UUID v4 format
  const id = (incoming && UUID_REGEX.test(incoming)) ? incoming : randomUUID();
  req.id = id;               // Attach to req object
  res.setHeader('X-Request-Id', id);  // Echo it back in the response
  next();
}
```
**Why validate UUID?** To protect against log poisoning (SEC-01). Without validation, an attacker could send `X-Request-Id: ../../../etc/passwd` and it would appear in logs.

**Type augmentation:** `req.id` does not exist in Express's default types. The project adds `backend/src/@types/express/index.d.ts`:
```typescript
declare namespace Express {
  interface Request {
    id: string;
  }
}
```
As a result, `req.id` is fully typed and does not require casting.

### 4. `pinoHttp()`
**Package:** `pino-http`
```typescript
const httpLogger = pinoHttp({
  genReqId: (req) => req.id,  // Use the correlation ID assigned in step 3
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```
- **Dev**: pretty, colored logs
- **Production**: JSON logs for log aggregators such as Datadog or Loki

Pino is a structured logger — it outputs JSON instead of plain text and is very fast, with lower overhead than Winston or Morgan.

### 5-6. `express.json()` + `express.urlencoded()`
These parse the request body. They should be placed **after** correlation ID and logger middleware so those pieces are not affected by body parsing errors.

### 7. `writeLimiter`
**File:** `backend/src/middleware/rate-limiter.ts`
```typescript
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1-minute window
  limit: 60,              // Max 60 requests/minute/IP
  skip: (req) => !['POST', 'PATCH', 'DELETE'].includes(req.method),
  handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMIT_EXCEEDED' } }),
});
```
**Important:** `skip` applies the limiter only to write methods — `GET` requests are not limited. This is a sensible pattern because reads are usually more frequent and less expensive than writes.

### 8. `errorHandler`
**File:** `backend/src/middleware/error-handler.ts`

This is the **global error handler** — it must be declared **last** and must have exactly four parameters `(err, req, res, next)`. Express recognizes it as an error handler because of that 4-argument signature.

```typescript
export function errorHandler(err, _req, res, _next): void {
  if (err instanceof AppError) {
    // Controlled errors: 404, 400, 409
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
  // Unknown error → 500 INTERNAL_ERROR
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '...' } });
}
```

**Error class hierarchy:**
```
AppError (base: statusCode, code, message, details?)
├── NotFoundError(resource, id)    → 404 NOT_FOUND
├── ValidationError(details[])    → 400 VALIDATION_ERROR
└── ConflictError(code, message)  → 409 + custom code
    Example codes: INVALID_TRANSITION, USER_HAS_TASKS,
                   CONCURRENT_MODIFICATION, TASK_COMPLETED,
                   UNASSIGNED_COMPLETION, INVALID_OPERATION
```

Services `throw new NotFoundError(...)`, and Express catches and forwards them to `errorHandler`.

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
Used as a middleware factory: `router.post('/', validate(createTaskSchema), handler)`.

After validation, `req.body` has already been **coerced** according to the schema — for example, string `"42"` becomes number `42` if the schema uses `z.coerce.number()`.

---

## Routing layer

**Pattern:** Route files are only a thin layer — receive the request, validate query params, call the service, return the response. They contain no business logic.

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

**Query params** use `safeParse` + early return instead of middleware, because query params are handled differently from request bodies.  
**Body** uses the `validate()` middleware factory.

**Export pattern:**
```typescript
const router = Router();
// ... declare routes
export { router as taskRouter };  // Named re-export
```

---

## Zod schemas

**File:** `backend/src/schemas/task.schemas.ts`, `user.schemas.ts`

Each entity has 3 schemas:
- `createXSchema` — validate POST body
- `updateXSchema` — validate PATCH/PUT body (all fields optional + `.refine()` ensures at least one field)
- `xQuerySchema` — validate GET list query params

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

**Type inference:** At the end of each file, a TypeScript type is exported from the schema:
```typescript
export type CreateTaskBody = z.infer<typeof createTaskSchema>;
```
→ Schema and type **can never drift apart** because the type is derived from the schema.

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
This pattern avoids creating multiple Prisma instances during hot reload. In a plain Express backend, the `process.env.NODE_ENV !== 'production'` guard ensures dev hot reload does not create a new connection pool each time.

### `backend/src/lib/redis.ts`
```typescript
export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,           // Do not connect immediately on import
  enableOfflineQueue: false,   // Do not queue commands while offline
  maxRetriesPerRequest: 1,     // Fail fast instead of retrying forever
});
```
`lazyConnect` + `enableOfflineQueue: false` means Redis commands fail quickly if Redis is unavailable, instead of blocking the app.
