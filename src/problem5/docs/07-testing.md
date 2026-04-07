# 07 — Testing: Vitest, Mock Strategy & Test Patterns

---

## Setup

**Framework:** Vitest (tương thích Jest API, nhanh hơn nhờ Vite)  
**HTTP testing:** Supertest — gửi HTTP requests đến Express app mà không cần server thật  
**Config:** `backend/vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,                    // Không cần import describe/it/expect
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],  // Chạy trước mọi test file
    testTimeout: 10000,
    include: ['src/**/*.test.ts'],
  },
});
```

### Chạy tests

```bash
# Từ thư mục backend/:
node ../node_modules/vitest/vitest.mjs run

# Hoặc từ root (npm workspaces):
npm run test -w backend
```

---

## Mock strategy — không cần DB thật

### Global mock: Prisma

**File:** `backend/src/test/setup.ts`

```typescript
vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw:    vi.fn(),
    user: {
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
      count:      vi.fn(),
    },
    task: {
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
      delete:     vi.fn(),
      count:      vi.fn(),
    },
    scoreEvent: { create: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), deleteMany: vi.fn() },
    productivityScore: { upsert: vi.fn() },
  },
}));
```

`vi.mock()` trong `setupFiles` áp dụng cho **tất cả** test files. Prisma client thật (connect đến DB) không bao giờ được gọi trong tests.

### Per-file mock: Redis + SseManager

Một số test files cần mock thêm Redis và SSE:
```typescript
// Đầu file tasks.test.ts:
vi.mock('../lib/redis', () => ({
  redisClient: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock('../lib/sse-manager', () => ({
  sseManager: { broadcast: vi.fn() },
}));
```

**Tại sao không đặt trong setup.ts?**  
Không phải mọi test file đều cần Redis mock. `leaderboard.test.ts` và `tasks.test.ts` cần, nhưng `correlation-id.test.ts` hay `health.test.ts` thì không.

---

## Cách tests hoạt động

### Pattern cơ bản

```typescript
import request from 'supertest';
import { app } from '../app.js';   // Import Express app trực tiếp (không listen)
import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;  // Đây thực ra là mock object từ setup.ts

beforeEach(() => {
  vi.clearAllMocks();  // Reset tất cả mock counts và return values
});

it('returns 200 with task list', async () => {
  // Arrange: cấu hình mock return value
  mockPrisma.task.count.mockResolvedValue(1);
  mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

  // Act: gửi HTTP request
  const res = await request(app).get('/api/tasks');

  // Assert: kiểm tra response
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.total).toBe(1);
});
```

**`request(app)`**: Supertest tạo ephemeral HTTP server từ Express app, gửi request, đóng server. Không cần port, không conflict.

**`prisma as any`**: TypeScript type của mock không match PrismaClient type. Cast về `any` để gọi mock methods như `mockResolvedValue`.

---

## Test patterns theo từng loại

### 1. Happy path — 200/201

```typescript
it('creates a user and returns 201', async () => {
  mockPrisma.user.create.mockResolvedValue(sampleUser);

  const res = await request(app)
    .post('/api/users')
    .send({ name: 'Alice', email: 'alice@test.com', department: 'Eng' });

  expect(res.status).toBe(201);
  expect(res.body.name).toBe('Alice');
});
```

### 2. Validation error — 400

```typescript
it('returns 400 when title is missing', async () => {
  const res = await request(app)
    .post('/api/tasks')
    .send({ priority: 'MEDIUM', dueDate: futureDueDate });
  // Không cần mock prisma — validation middleware reject trước khi DB

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});
```

### 3. Not found — 404

```typescript
it('returns 404 when task not found', async () => {
  mockPrisma.task.findUnique.mockResolvedValue(null);  // Simulate không tìm thấy

  const res = await request(app).get('/api/tasks/nonexistent-id');

  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('NOT_FOUND');
});
```

### 4. Conflict / business rule — 409

```typescript
it('rejects TODO → DONE transition (invalid)', async () => {
  mockPrisma.task.findUnique.mockResolvedValue({ ...sampleTask, status: 'TODO' });

  const res = await request(app)
    .patch('/api/tasks/some-id')
    .send({ status: 'DONE' });

  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('INVALID_TRANSITION');
});
```

### 5. Transaction mock — phức tạp nhất

```typescript
it('allows TODO → IN_PROGRESS transition', async () => {
  const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };

  mockPrisma.task.findUnique
    .mockResolvedValueOnce(sampleTask)        // Lần 1: getById (task hiện tại = TODO)
    .mockResolvedValueOnce(inProgressTask);   // Lần 2: re-fetch trong transaction

  mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

  // Mock $transaction: thực thi callback với prisma mock (simulating tx)
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

  const res = await request(app)
    .patch('/api/tasks/some-id')
    .send({ status: 'IN_PROGRESS' });

  expect(res.status).toBe(200);
  expect(res.body.status).toBe('IN_PROGRESS');
});
```

**`mockImplementation`**: Thay vì mock return value, mock implementation function. `fn(mockPrisma)` chạy callback với mock prisma, simulating transaction context.

**`mockResolvedValueOnce`**: Mock return value chỉ cho lần gọi tiếp theo. Lần 1 → sampleTask, lần 2 → inProgressTask. Quan trọng khi cùng method được gọi nhiều lần với kết quả khác nhau.

### 6. Cache behavior tests

```typescript
describe('cache behavior', () => {
  it('Test A (cache HIT): returns cached data without querying DB', async () => {
    const cachedRankings = JSON.stringify([{ rank: 1, userName: 'Alice', totalScore: 50 }]);
    mockRedis.get.mockResolvedValue(cachedRankings);  // Cache HIT

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].userName).toBe('Alice');
    // DB không được gọi
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('Test B (cache MISS): queries DB and writes to cache', async () => {
    mockRedis.get.mockResolvedValue(null);  // Cache MISS
    mockPrisma.user.findMany.mockResolvedValue([...]);
    mockRedis.set.mockResolvedValue('OK');

    await request(app).get('/api/leaderboard');

    // Kiểm tra đã ghi cache
    expect(mockRedis.set).toHaveBeenCalledWith(
      'leaderboard:rankings',
      expect.any(String),
      'EX',
      60
    );
  });

  it('Test C (Redis DOWN on get): falls back to DB', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));  // Redis lỗi

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);  // Vẫn 200 — graceful degradation
    expect(mockPrisma.user.findMany).toHaveBeenCalled();
  });
});
```

### 7. Regression tests — TEST-01, TEST-02, TEST-03

```typescript
describe('GET /api/tasks — priority sort (TEST-01)', () => {
  it('uses CASE WHEN semantic ordering for sortBy=priority', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);  // Raw SQL path
    mockPrisma.task.count.mockResolvedValue(0);

    await request(app).get('/api/tasks?sortBy=priority');

    // Đảm bảo raw SQL được dùng (không phải findMany)
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    expect(mockPrisma.task.findMany).not.toHaveBeenCalled();
  });
});

describe('scoring atomicity (TEST-02)', () => {
  it('returns 500 and does not expose DONE status when scoreTask throws inside tx', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      await fn({
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue(inProgressTask),
        },
        scoreEvent: {
          create: vi.fn().mockRejectedValue(new Error('DB write failed during scoring')),
        },
      });
    });

    const res = await request(app).patch('/api/tasks/some-id').send({ status: 'DONE' });

    expect(res.status).toBe(500);
    // Task vẫn là IN_PROGRESS (transaction rollback)
  });
});
```

---

## `expect` matchers quan trọng

```typescript
// Exact match:
expect(res.status).toBe(200);
expect(res.body.data).toHaveLength(1);

// Partial match (quan trọng):
expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({ status: 'TODO' }),
  })
);
// expect.objectContaining: chỉ kiểm tra các fields được chỉ định, bỏ qua fields khác

// Negative:
expect(mockPrisma.user.findMany).not.toHaveBeenCalled();

// Type check:
expect(res.body.uptime).toEqual(expect.any(Number));

// Mock call count:
expect(mockRedis.del).toHaveBeenCalledTimes(1);
expect(mockRedis.del).toHaveBeenCalledWith('leaderboard:rankings');
```

---

## Tại sao không test frontend?

Dự án này chỉ test backend. Để test frontend đầy đủ cần:
- **Unit tests**: Testing Library + jsdom (mock DOM)
- **E2E tests**: Playwright hoặc Cypress (browser thật)

Trong context code challenge 24h, backend tests có value cao hơn vì cover business logic (scoring, transitions, cache behavior).

---

## Checklist viết test mới

1. **Arrange**: Setup mock return values với `mockResolvedValue`/`mockRejectedValue`
2. **Act**: Gửi request với `request(app).method('/path').send(body)`
3. **Assert**: Kiểm tra `res.status`, `res.body`, mock call counts
4. `beforeEach(() => vi.clearAllMocks())` — đảm bảo tests độc lập
5. Dùng `mockResolvedValueOnce` nếu cùng method gọi nhiều lần với kết quả khác nhau
6. `mockPrisma.$transaction.mockImplementation(fn => fn(mockPrisma))` khi test transaction paths
