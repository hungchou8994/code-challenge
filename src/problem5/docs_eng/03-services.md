# 03 — Services: Business Logic Layer

Services are the heart of the backend. Each service is an exported **object** with methods — not a class, not a complex singleton pattern, just a plain object with async functions.

```typescript
export const taskService = {
  async getAll(query) { ... },
  async getById(id)   { ... },
  async create(data)  { ... },
  async update(id, data) { ... },
  async delete(id, force) { ... },
};
```

---

## `userService`
**File:** `backend/src/services/user.service.ts`

### `getAll(query)`
```typescript
async getAll(query: UserQueryParams = {}) {
  const where: Prisma.UserWhereInput = {};
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };  // ILIKE search
  }
  if (query.department) {
    where.department = query.department;
  }
  // Pagination
  const skip = (page - 1) * limit;
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
  ]);
  return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
}
```
**`Promise.all`**: runs `count` and `findMany` in parallel — better than executing two queries sequentially.  
**`mode: 'insensitive'`**: PostgreSQL `ILIKE` — case-insensitive search.

### `search(q?)`
```typescript
async search(q?: string): Promise<Array<{ id, name, email }>> {
  const where = q ? {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ]
  } : {};
  return prisma.user.findMany({
    where,
    orderBy: { name: 'asc' },
    take: 20,                       // Limit to 20 results for typeahead
    select: { id: true, name: true, email: true },  // Only fetch required fields
  });
}
```
This is a typeahead endpoint used by the “Assignee” combobox in the UI. `take: 20` keeps the response small and fast.

### `create(data)`
```typescript
async create(data: CreateUserBody) {
  return prisma.user.create({ data });
}
```
The simplest case — no special logic. If the email already exists, Prisma throws P2002 and `errorHandler` returns 409 `DUPLICATE_EMAIL`.

### `update(id, data)`
```typescript
async update(id, data) {
  await userService.getById(id);   // Throw 404 if not found
  const updated = await prisma.user.update({ where: { id }, data });
  // Side effect: invalidate leaderboard cache
  try {
    await redisClient.del(LEADERBOARD_CACHE_KEY);
  } catch (err) {
    logger.warn({ err }, 'Redis cache invalidation failed');
  }
  return updated;
}
```
After updating a user, for example changing the name, the leaderboard cache must be cleared because it contains `userName`. Redis failures are swallowed instead of crashing the app — this is **graceful degradation**.

### `delete(id)`
```typescript
async delete(id) {
  await userService.getById(id);  // 404 check

  // Check active tasks (TODO/IN_PROGRESS)
  const activeTaskCount = await prisma.task.count({
    where: { assigneeId: id, status: { in: ['TODO', 'IN_PROGRESS'] } },
  });
  if (activeTaskCount > 0) {
    throw new ConflictError('USER_HAS_TASKS', `${activeTaskCount} active task(s)...`);
  }

  // Transaction: null out assigneeId for DONE tasks, then delete user
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { assigneeId: id, status: 'DONE' },
      data: { assigneeId: null },  // Keep DONE tasks as historical records
    });
    await tx.user.delete({ where: { id } });
  });
  // ... invalidate cache + SSE broadcast
}
```
**Important design decision:** DONE tasks are not deleted when a user is deleted — they are preserved with `assigneeId = null` to keep history intact. The user's `ScoreEvent` and `ProductivityScore` rows are deleted through `onDelete: Cascade`.

---

## `taskService`
**File:** `backend/src/services/task.service.ts`

### `getAll(query)` — most of the complexity is in sorting

**Case 1: `sortBy !== 'priority'`** (normal case)
```typescript
const orderBy = query.sortBy === 'date'
  ? { dueDate: order }
  : query.sortBy === 'assignee'
    ? { assignee: { name: order } }   // Sort by related field
    : { createdAt: 'desc' };          // Default
```
Prisma ORM can handle these cases directly.

**Case 2: `sortBy === 'priority'`** (must use raw SQL)
```typescript
// Prisma sorts strings lexicographically: HIGH < LOW < MEDIUM (wrong!)
// Raw SQL uses CASE WHEN to define the correct semantic order:
ORDER BY CASE t.priority
  WHEN 'HIGH' THEN 3
  WHEN 'MEDIUM' THEN 2
  WHEN 'LOW' THEN 1
  ELSE 0
END DESC
```
This is **BUG-01** after the fix. If Prisma's `orderBy: { priority: 'desc' }` were used, HIGH/LOW/MEDIUM would be ordered alphabetically rather than semantically.

### `getById(id)`
```typescript
async getById(id) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: { assignee: { select: { id, name, email } } },
  });
  if (!task) throw new NotFoundError('Task', id);
  return task;
}
```
Reusable pattern: both `update()` and `delete()` call `getById()` first to verify existence.

### `update(id, data)` — the most complex method

This is the most important method in the whole project.

**Step 1: Load the current task**
```typescript
const existing = await taskService.getById(id);
```

**Step 2: Validate the state machine transition**
```typescript
if (data.status && data.status !== existing.status) {
  const allowed = VALID_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(data.status)) {
    throw new ConflictError('INVALID_TRANSITION', `Cannot transition from ${existing.status} to ${data.status}`);
  }
  // If moving to DONE: must have an assignee
  if (data.status === 'DONE') {
    const currentAssigneeId = data.assigneeId !== undefined ? data.assigneeId : existing.assigneeId;
    if (!currentAssigneeId) {
      throw new ConflictError('UNASSIGNED_COMPLETION', 'Task must be assigned to mark DONE');
    }
  }
}
```

**Step 3: Validate that assignee changes are not allowed on DONE tasks**
```typescript
if (data.assigneeId != null) {
  if (existing.status === 'DONE') {
    throw new ConflictError('INVALID_OPERATION', 'Cannot change assignee of a completed task');
  }
  const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
  if (!assignee) throw new NotFoundError('User', data.assigneeId);
}
```

**Step 4: If status changes → use transaction with optimistic locking**
```typescript
await prisma.$transaction(async (tx) => {
  // Optimistic locking: only update if status has not changed yet
  const result = await tx.task.updateMany({
    where: { id, status: existing.status },   // ← guard
    data: updateData,
  });
  if (result.count === 0) {
    throw new ConflictError('CONCURRENT_MODIFICATION', '...');
  }
  // Re-fetch to get the updated record
  updated = await tx.task.findUnique({ where: { id }, include: { ... } });

  // If → DONE: score inside the same transaction
  if (data.status === 'DONE' && updatedTask.assigneeId) {
    await leaderboardService.scoreTask({ ... }, tx);  // tx is passed in
  }
});
```

**Step 5: Side effects OUTSIDE the transaction**
```typescript
if (data.status === 'DONE') {
  await redisClient.del(LEADERBOARD_CACHE_KEY);       // Clear cache
  const updatedRankings = await leaderboardService.getRankings();
  sseManager.broadcast(updatedRankings);               // Push SSE
}
```

**Why must side effects be outside the transaction?**  
Redis and SSE do not participate in PostgreSQL's ACID transaction. If they were placed inside `$transaction` and Redis failed, PostgreSQL would also roll back, which would be wrong. Side effects should run only after the DB commit succeeds.

### `delete(id, force)` — two modes

**Normal mode (`force=false`):**
```typescript
if (task.status === 'DONE' && !force) {
  throw new ConflictError('TASK_COMPLETED', 'Use force=true to override');
}
await prisma.task.delete({ where: { id } });
```

**Force delete a DONE task:**
```typescript
await prisma.$transaction(async (tx) => {
  const scoreEvent = await tx.scoreEvent.findFirst({ where: { taskId: id } });
  const scoredUserId = scoreEvent?.userId ?? null;

  await tx.scoreEvent.deleteMany({ where: { taskId: id } });  // Delete score event
  await tx.task.delete({ where: { id } });                     // Delete task

  if (scoredUserId) {
    // Recalculate from remaining ScoreEvents — this is the source of truth
    const agg = await tx.scoreEvent.aggregate({
      where: { userId: scoredUserId },
      _sum: { totalAwarded: true },
      _count: { id: true },
    });
    await tx.productivityScore.upsert({
      where: { userId: scoredUserId },
      update: { totalScore: agg._sum.totalAwarded ?? 0, tasksCompleted: agg._count.id ?? 0 },
      create: { ... },
    });
  }
});
```
**Why recalculate from `ScoreEvent` instead of just decrementing?**  
If the code only did `totalScore -= oldScore`, concurrent requests could cause race conditions. Recomputing from `SUM(ScoreEvents)` is **idempotent** and always correct.

---

## `leaderboardService`
**File:** `backend/src/services/leaderboard.service.ts`

### `scoreTask(task, tx?)`

This method can be called in 2 ways:

**Way 1: Inside a transaction (from `taskService`)**
```typescript
await leaderboardService.scoreTask({ id, assigneeId, priority, dueDate }, tx);
// tx is passed in → use tx.scoreEvent.create() instead of prisma.scoreEvent.create()
```

**Way 2: Standalone (backward compatible)**
```typescript
await leaderboardService.scoreTask({ ... });
// tx = undefined → create a new transaction internally
```

Passing `tx` allows the method to be reused in multiple contexts.

### `getRankings()`
```typescript
async getRankings() {
  // 1. Check cache
  try {
    const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
    if (cached !== null) return JSON.parse(cached);
  } catch (err) {
    logger.warn({ err }, 'Redis cache read failed');
    // Continue → fallback to DB
  }

  // 2. Query DB
  const users = await prisma.user.findMany({
    include: { productivityScore: true },
  });

  // 3. Build rankings
  const rankings = users
    .map(user => ({
      userId: user.id,
      userName: user.name,
      // ... other fields
      totalScore: user.productivityScore?.totalScore ?? 0,  // null-safe: 0 if no score yet
    }))
    .sort((a, b) => b.totalScore - a.totalScore)  // Sort descending
    .map((entry, index) => ({ rank: index + 1, ...entry }));  // Assign rank

  // 4. Write to cache
  try {
    await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', 60);
  } catch (err) {
    logger.warn({ err }, 'Redis cache write failed');
    // Do not crash — return DB data to client
  }

  return rankings;
}
```

---

## Patterns worth learning

### 1. Reusing service methods
```typescript
async update(id, data) {
  const existing = await taskService.getById(id);  // Call another method in the same service
  // ...
}
```

### 2. Graceful degradation with Redis
```typescript
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
  // Do not re-throw — the app still works, only the cache is not cleared
}
```

### 3. Type-safe transaction client
```typescript
type PrismaTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

async scoreTask(task: ..., tx?: PrismaTxClient) {
  const client = tx ?? prisma;
  await client.scoreEvent.create({ ... });
}
```
`PrismaTxClient` is the type of Prisma's transaction client — it removes methods that are not available inside a transaction.

### 4. Dynamic WHERE clause
```typescript
const where: Prisma.TaskWhereInput = {};
if (query.status) where.status = query.status;
if (query.assigneeId) where.assigneeId = query.assigneeId;
// → No need for complex if-else chains, and Prisma type-checks valid keys
```
