# 03 — Services: Business Logic Layer

Services là trái tim của backend. Mỗi service là một **object** export với các methods — không phải class, không phải singleton pattern phức tạp, chỉ là plain object với async functions.

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
**`Promise.all`**: Chạy `count` và `findMany` song song — tốt hơn chạy tuần tự 2 queries.
**`mode: 'insensitive'`**: PostgreSQL `ILIKE` — không phân biệt hoa/thường.

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
    take: 20,                       // Giới hạn 20 kết quả cho typeahead
    select: { id: true, name: true, email: true },  // Chỉ lấy fields cần thiết
  });
}
```
Endpoint typeahead — dùng cho combobox "Assignee" trong UI. `take: 20` đảm bảo response nhỏ, nhanh.

### `create(data)`
```typescript
async create(data: CreateUserBody) {
  return prisma.user.create({ data });
}
```
Đơn giản nhất — không có logic đặc biệt. Nếu email đã tồn tại, Prisma throw P2002, `errorHandler` bắt và trả 409 `DUPLICATE_EMAIL`.

### `update(id, data)`
```typescript
async update(id, data) {
  await userService.getById(id);   // Throw 404 nếu không tồn tại
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
Sau khi cập nhật user (ví dụ đổi tên), leaderboard cache cần được xóa vì nó chứa `userName`. Redis lỗi được swallow (không crash app) — đây là **graceful degradation**.

### `delete(id)`
```typescript
async delete(id) {
  await userService.getById(id);  // 404 check

  // Kiểm tra active tasks (TODO/IN_PROGRESS)
  const activeTaskCount = await prisma.task.count({
    where: { assigneeId: id, status: { in: ['TODO', 'IN_PROGRESS'] } },
  });
  if (activeTaskCount > 0) {
    throw new ConflictError('USER_HAS_TASKS', `${activeTaskCount} active task(s)...`);
  }

  // Transaction: null-out assigneeId của DONE tasks, rồi xóa user
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { assigneeId: id, status: 'DONE' },
      data: { assigneeId: null },  // Giữ lại DONE tasks như historical record
    });
    await tx.user.delete({ where: { id } });
  });
  // ... invalidate cache + SSE broadcast
}
```
**Design decision quan trọng:** DONE tasks không bị xóa khi user bị xóa — chúng được giữ lại với `assigneeId = null` để bảo toàn lịch sử. ScoreEvents và ProductivityScore của user bị xóa theo `onDelete: Cascade`.

---

## `taskService`
**File:** `backend/src/services/task.service.ts`

### `getAll(query)` — complexity nằm ở sort

**Case 1: `sortBy !== 'priority'`** (thông thường)
```typescript
const orderBy = query.sortBy === 'date'
  ? { dueDate: order }
  : query.sortBy === 'assignee'
    ? { assignee: { name: order } }   // Sort theo related field
    : { createdAt: 'desc' };          // Default
```
Prisma ORM xử lý được các case này.

**Case 2: `sortBy === 'priority'`** (phải dùng raw SQL)
```typescript
// Prisma sắp xếp String lexicographically: HIGH < LOW < MEDIUM (sai!)
// Raw SQL dùng CASE WHEN để đặt đúng thứ tự semantic:
ORDER BY CASE t.priority
  WHEN 'HIGH' THEN 3
  WHEN 'MEDIUM' THEN 2
  WHEN 'LOW' THEN 1
  ELSE 0
END DESC
```
Đây là **BUG-01** đã được fix. Nếu dùng `orderBy: { priority: 'desc' }` của Prisma, HIGH/LOW/MEDIUM sẽ sắp xếp theo alphabet: LOW > HIGH > (space) thay vì HIGH > MEDIUM > LOW.

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
Pattern tái sử dụng: `update()` và `delete()` đều gọi `getById()` trước để check tồn tại.

### `update(id, data)` — method phức tạp nhất

Đây là method quan trọng nhất trong cả project. Đọc từng bước:

**Bước 1: Load task hiện tại**
```typescript
const existing = await taskService.getById(id);
```

**Bước 2: Validate state machine transition**
```typescript
if (data.status && data.status !== existing.status) {
  const allowed = VALID_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(data.status)) {
    throw new ConflictError('INVALID_TRANSITION', `Cannot transition from ${existing.status} to ${data.status}`);
  }
  // Nếu chuyển sang DONE: phải có assignee
  if (data.status === 'DONE') {
    const currentAssigneeId = data.assigneeId !== undefined ? data.assigneeId : existing.assigneeId;
    if (!currentAssigneeId) {
      throw new ConflictError('UNASSIGNED_COMPLETION', 'Task must be assigned to mark DONE');
    }
  }
}
```

**Bước 3: Validate assignee change không được phép trên DONE tasks**
```typescript
if (data.assigneeId != null) {
  if (existing.status === 'DONE') {
    throw new ConflictError('INVALID_OPERATION', 'Cannot change assignee of a completed task');
  }
  const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
  if (!assignee) throw new NotFoundError('User', data.assigneeId);
}
```

**Bước 4: Nếu có status change → dùng transaction với optimistic locking**
```typescript
await prisma.$transaction(async (tx) => {
  // Optimistic locking: chỉ update nếu status chưa thay đổi
  const result = await tx.task.updateMany({
    where: { id, status: existing.status },   // ← guard
    data: updateData,
  });
  if (result.count === 0) {
    throw new ConflictError('CONCURRENT_MODIFICATION', '...');
  }
  // Re-fetch để lấy updated record
  updated = await tx.task.findUnique({ where: { id }, include: { ... } });

  // Nếu → DONE: tính điểm trong cùng transaction
  if (data.status === 'DONE' && updatedTask.assigneeId) {
    await leaderboardService.scoreTask({ ... }, tx);  // tx được pass vào
  }
});
```

**Bước 5: Side effects NGOÀI transaction**
```typescript
if (data.status === 'DONE') {
  await redisClient.del(LEADERBOARD_CACHE_KEY);       // Xóa cache
  const updatedRankings = await leaderboardService.getRankings();
  sseManager.broadcast(updatedRankings);               // Push SSE
}
```

**Tại sao side effects phải ngoài transaction?**  
Redis và SSE không tham gia ACID transaction của PostgreSQL. Nếu đặt bên trong `$transaction`, và Redis lỗi → PostgreSQL cũng rollback (sai). Side effects nên chạy sau khi DB commit thành công.

### `delete(id, force)` — hai chế độ

**Thường (force=false):**
```typescript
if (task.status === 'DONE' && !force) {
  throw new ConflictError('TASK_COMPLETED', 'Use force=true to override');
}
await prisma.task.delete({ where: { id } });
```

**Force delete DONE task:**
```typescript
await prisma.$transaction(async (tx) => {
  const scoreEvent = await tx.scoreEvent.findFirst({ where: { taskId: id } });
  const scoredUserId = scoreEvent?.userId ?? null;

  await tx.scoreEvent.deleteMany({ where: { taskId: id } });  // Xóa score event
  await tx.task.delete({ where: { id } });                     // Xóa task

  if (scoredUserId) {
    // Recalculate từ remaining ScoreEvents — đây là source of truth
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
**Lý do recalculate từ ScoreEvents thay vì chỉ decrement:**  
Nếu chỉ `totalScore -= oldScore`, có thể gây race condition với concurrent requests. Tính lại từ `SUM(ScoreEvents)` là **idempotent** và luôn đúng.

---

## `leaderboardService`
**File:** `backend/src/services/leaderboard.service.ts`

### `scoreTask(task, tx?)`

Method này có thể được gọi theo 2 cách:

**Cách 1: Bên trong transaction (từ taskService)**
```typescript
await leaderboardService.scoreTask({ id, assigneeId, priority, dueDate }, tx);
// tx được truyền vào → dùng tx.scoreEvent.create() thay vì prisma.scoreEvent.create()
```

**Cách 2: Standalone (backward compatible)**
```typescript
await leaderboardService.scoreTask({ ... });
// tx = undefined → tự tạo transaction mới
```

Pattern truyền `tx` cho phép tái sử dụng method trong nhiều context khác nhau.

### `getRankings()`
```typescript
async getRankings() {
  // 1. Check cache
  try {
    const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
    if (cached !== null) return JSON.parse(cached);
  } catch (err) {
    logger.warn({ err }, 'Redis cache read failed');
    // Tiếp tục → fallback to DB
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
      totalScore: user.productivityScore?.totalScore ?? 0,  // null-safe: 0 nếu chưa có score
    }))
    .sort((a, b) => b.totalScore - a.totalScore)  // Sort descending
    .map((entry, index) => ({ rank: index + 1, ...entry }));  // Gán rank

  // 4. Write to cache
  try {
    await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', 60);
  } catch (err) {
    logger.warn({ err }, 'Redis cache write failed');
    // Không crash — trả data DB cho client
  }

  return rankings;
}
```

---

## Patterns đáng học

### 1. Service method tái sử dụng
```typescript
async update(id, data) {
  const existing = await taskService.getById(id);  // Gọi method khác trong service
  // ...
}
```

### 2. Graceful degradation với Redis
```typescript
try {
  await redisClient.del(LEADERBOARD_CACHE_KEY);
} catch (err) {
  logger.warn({ err }, 'Redis cache invalidation failed');
  // Không re-throw — app vẫn hoạt động, chỉ cache không được xóa
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
`PrismaTxClient` là type của Prisma transaction client — loại bỏ các methods không available trong transaction (`$transaction` lồng nhau, v.v.).

### 4. Dynamic WHERE clause
```typescript
const where: Prisma.TaskWhereInput = {};
if (query.status) where.status = query.status;
if (query.assigneeId) where.assigneeId = query.assigneeId;
// → Không cần if-else phức tạp, Prisma type kiểm tra keys hợp lệ
```
