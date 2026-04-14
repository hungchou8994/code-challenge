# 07 — Testing: Vitest, Mock Strategy & Test Patterns

---

## Setup

**Framework:** Vitest (Jest-compatible API, faster thanks to Vite)  
**HTTP testing:** Supertest — sends HTTP requests to the Express app without a real server  
**Config:** `backend/vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,                    // No need to import describe/it/expect
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],  // Run before every test file
    testTimeout: 10000,
    include: ['src/**/*.test.ts'],
  },
});
```

### Running tests

```bash
# From backend/:
node ../node_modules/vitest/vitest.mjs run

# Or from repo root (npm workspaces):
npm run test -w backend
```

---

## Mock strategy — no real DB needed

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

`vi.mock()` inside `setupFiles` applies to **all** test files. The real Prisma client never connects to the database in tests.

### Per-file mock: Redis + SseManager

Some test files also need Redis and SSE mocks:
```typescript
// At the top of tasks.test.ts:
vi.mock('../lib/redis', () => ({
  redisClient: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock('../lib/sse-manager', () => ({
  sseManager: { broadcast: vi.fn() },
}));
```

**Why not put them in `setup.ts`?**  
Not every test file needs them. `leaderboard.test.ts` and `tasks.test.ts` do, but `correlation-id.test.ts` or `health.test.ts` do not.

---

## How the tests work

### Basic pattern

```typescript
import request from 'supertest';
import { app } from '../app.js';   // Import Express app directly (no listen)
import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;  // This is actually the mock object from setup.ts

beforeEach(() => {
  vi.clearAllMocks();  // Reset all mock counts and return values
});

it('returns 200 with task list', async () => {
  // Arrange: configure mock return values
  mockPrisma.task.count.mockResolvedValue(1);
  mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

  // Act: send HTTP request
  const res = await request(app).get('/api/tasks');

  // Assert: check response
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.total).toBe(1);
});
```

**`request(app)`**: Supertest creates a temporary HTTP server from the Express app, sends the request, then closes it. No port is needed, so there is no port conflict.

**`prisma as any`**: the TypeScript type of the mock does not match `PrismaClient`. Casting to `any` makes it possible to call mock helpers such as `mockResolvedValue`.

---

## Test patterns by type

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
  // No Prisma mock needed — validation middleware rejects before DB access

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
});
```

### 3. Not found — 404

```typescript
it('returns 404 when task is not found', async () => {
  mockPrisma.task.findUnique.mockResolvedValue(null);  // Simulate missing record

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

### 5. Transaction mock — the most complex pattern

```typescript
it('allows TODO → IN_PROGRESS transition', async () => {
  const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };

  mockPrisma.task.findUnique
    .mockResolvedValueOnce(sampleTask)        // 1st call: getById (current task = TODO)
    .mockResolvedValueOnce(inProgressTask);   // 2nd call: re-fetch inside transaction

  mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

  // Mock $transaction: execute callback with prisma mock (simulating tx)
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

  const res = await request(app)
    .patch('/api/tasks/some-id')
    .send({ status: 'IN_PROGRESS' });

  expect(res.status).toBe(200);
  expect(res.body.status).toBe('IN_PROGRESS');
});
```

**`mockImplementation`**: instead of mocking a return value, this mocks the function implementation itself. `fn(mockPrisma)` runs the transaction callback with the mocked Prisma client.

**`mockResolvedValueOnce`**: mocks the return value only for the next call. First call → `sampleTask`, second call → `inProgressTask`. This matters when the same method is called multiple times with different expected results.

### 6. Cache behavior tests

```typescript
describe('cache behavior', () => {
  it('Test A (cache HIT): returns cached data without querying DB', async () => {
    const cachedRankings = JSON.stringify([{ rank: 1, userName: 'Alice', totalScore: 50 }]);
    mockRedis.get.mockResolvedValue(cachedRankings);  // Cache HIT

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body[0].userName).toBe('Alice');
    // DB must not be queried
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('Test B (cache MISS): queries DB and writes to cache', async () => {
    mockRedis.get.mockResolvedValue(null);  // Cache MISS
    mockPrisma.user.findMany.mockResolvedValue([...]);
    mockRedis.set.mockResolvedValue('OK');

    await request(app).get('/api/leaderboard');

    // Verify cache write
    expect(mockRedis.set).toHaveBeenCalledWith(
      'leaderboard:rankings',
      expect.any(String),
      'EX',
      60
    );
  });

  it('Test C (Redis DOWN on get): falls back to DB', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));  // Redis failure

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);  // Still 200 — graceful degradation
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

    // Ensure raw SQL is used (not findMany)
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
    // Task remains IN_PROGRESS (transaction rollback)
  });
});
```

---

## Important `expect` matchers

```typescript
// Exact match:
expect(res.status).toBe(200);
expect(res.body.data).toHaveLength(1);

// Partial match (important):
expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({ status: 'TODO' }),
  })
);
// expect.objectContaining: checks only specified fields, ignores others

// Negative:
expect(mockPrisma.user.findMany).not.toHaveBeenCalled();

// Type check:
expect(res.body.uptime).toEqual(expect.any(Number));

// Mock call count:
expect(mockRedis.del).toHaveBeenCalledTimes(1);
expect(mockRedis.del).toHaveBeenCalledWith('leaderboard:rankings');
```

---

## Why not test the frontend?

This project only tests the backend. Full frontend coverage would require:
- **Unit tests**: Testing Library + jsdom (mock DOM)
- **E2E tests**: Playwright or Cypress (real browser)

In the context of a 24-hour code challenge, backend tests provide more value because they cover the business logic: scoring, transitions, and cache behavior.

---

## Checklist for writing a new test

1. **Arrange**: set up mock return values with `mockResolvedValue` / `mockRejectedValue`
2. **Act**: send a request with `request(app).method('/path').send(body)`
3. **Assert**: check `res.status`, `res.body`, and mock call counts
4. `beforeEach(() => vi.clearAllMocks())` — ensure tests stay isolated
5. Use `mockResolvedValueOnce` if the same method is called multiple times with different results
6. `mockPrisma.$transaction.mockImplementation(fn => fn(mockPrisma))` when testing transaction paths
