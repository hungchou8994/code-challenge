# 02 — Database: Prisma, Schema & Models

## Prisma là gì?

Prisma là một **ORM (Object-Relational Mapper)** cho Node.js/TypeScript. Thay vì viết SQL thủ công, bạn dùng Prisma Client — một TypeScript API fully typed được generate từ schema.

Điểm mạnh của Prisma so với các ORM khác (Sequelize, TypeORM):
- **Type-safe by design**: mọi query return đúng type, IDE autocomplete hoạt động
- **Schema-first**: source of truth là file `.prisma`, types và migration đều derive từ đó
- **Readable query API**: `prisma.user.findMany({ where: { ... }, include: { ... } })`

---

## Cấu hình Prisma

**File:** `backend/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma/client"  // Client được gen vào đây
}

datasource db {
  provider = "postgresql"
  // DATABASE_URL đọc từ env var
}
```

**File:** `backend/prisma.config.ts` — dùng `dotenv/config` để load `.env` trước khi Prisma CLI chạy.

**Prisma adapter:** Dự án dùng `@prisma/adapter-pg` thay vì Prisma built-in connection.
```typescript
// lib/prisma.ts
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```
`PrismaPg` là driver dựa trên `pg` package — cho phép dùng connection pooler như PgBouncer ở ngoài.

---

## 4 Models và quan hệ

### Sơ đồ quan hệ

```
User (1) ─────────────── (N) Task
  │                           │
  │ (1)                       │ (N)
  │                           │
  ├──── (N) ScoreEvent ────── ┘
  │
  └──── (1) ProductivityScore
```

### Model 1: `User`

```prisma
model User {
  id         String   @id @default(uuid())
  name       String
  email      String   @unique        ← Unique constraint
  department String
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt     @map("updated_at")

  tasks             Task[]            ← Relation: 1 user có nhiều tasks
  scoreEvents       ScoreEvent[]      ← Relation: 1 user có nhiều score events
  productivityScore ProductivityScore?  ← Relation: 1 user có 0 hoặc 1 score summary

  @@map("users")                     ← Tên bảng trong DB là "users" (lowercase)
}
```

**Lưu ý:**
- `@default(uuid())`: PK là UUID v4, không phải auto-increment integer. UUID tốt hơn cho distributed systems.
- `@updatedAt`: Prisma tự update field này mỗi khi record được update.
- `@@map("users")`: Prisma model tên PascalCase, nhưng bảng DB tên snake_case.

### Model 2: `Task`

```prisma
model Task {
  id          String   @id @default(uuid())
  title       String
  description String?                ← Optional (nullable)
  status      String   @default("TODO")
  priority    String
  assigneeId  String?  @map("assignee_id")   ← Optional FK
  dueDate     DateTime @map("due_date")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  assignee    User?    @relation(fields: [assigneeId], references: [id], onDelete: Restrict)
  scoreEvents ScoreEvent[]

  @@map("tasks")
}
```

**Quan trọng - `onDelete: Restrict`:**  
Nếu một User còn có Task đang active (TODO/IN_PROGRESS), **PostgreSQL từ chối xóa User** do FK constraint.  
Nhưng code trong `userService.delete()` đã kiểm tra trước (`activeTaskCount > 0 → throw ConflictError`), nên Prisma P2003 error chỉ là safety net thứ hai.

**`status` và `priority` là String, không phải Enum trong DB:**  
Prisma không dùng PostgreSQL native enum — validate ở application layer (Zod). Linh hoạt hơn khi thêm giá trị mới (không cần migration phức tạp).

### Model 3: `ScoreEvent`

```prisma
model ScoreEvent {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  taskId       String   @map("task_id")
  points       Int                    ← Base points (5/10/20)
  bonus        Int      @default(0)   ← Early bonus (+5 hoặc 0)
  penalty      Int      @default(0)   ← Late penalty (3 hoặc 0) — lưu absolute value
  totalAwarded Int      @map("total_awarded")  ← = points + bonus - penalty

  user User @relation(..., onDelete: Cascade)  ← Xóa user → xóa score events
  task Task @relation(..., onDelete: Cascade)  ← Xóa task → xóa score events

  @@map("score_events")
}
```

`ScoreEvent` là **audit log** của từng lần tính điểm:
- Khi task → DONE: tạo 1 ScoreEvent
- Khi xóa task (force): xóa ScoreEvent tương ứng, tính lại `ProductivityScore`
- `onDelete: Cascade` đảm bảo khi user/task bị xóa, ScoreEvent cũng tự xóa

### Model 4: `ProductivityScore`

```prisma
model ProductivityScore {
  id             String   @id @default(uuid())
  userId         String   @unique @map("user_id")  ← 1 user chỉ có 1 row
  totalScore     Int      @default(0) @map("total_score")
  tasksCompleted Int      @default(0) @map("tasks_completed")
  updatedAt      DateTime @updatedAt @map("updated_at")

  user User @relation(..., onDelete: Cascade)

  @@map("productivity_scores")
}
```

Đây là **denormalized summary** — pre-computed từ ScoreEvents để leaderboard query nhanh. Thay vì `SUM(score_events.total_awarded)` mỗi lần query leaderboard, chỉ cần đọc bảng này.

**Tại sao lại có cả 2 bảng?**
- `ScoreEvent`: source of truth, audit trail, có thể recalculate lại
- `ProductivityScore`: read-optimized, dùng cho leaderboard

**`upsert` pattern:**
```typescript
// Khi tính điểm:
await tx.productivityScore.upsert({
  where: { userId },
  create: { userId, totalScore: totalAwarded, tasksCompleted: 1 },
  update: {
    totalScore: { increment: totalAwarded },  // Atomic increment
    tasksCompleted: { increment: 1 },
  },
});
```
`upsert` = INSERT nếu chưa tồn tại, UPDATE nếu đã tồn tại. `{ increment: n }` là atomic SQL `UPDATE SET col = col + n`.

---

## Prisma Client API — các patterns thường dùng

### findUnique vs findFirst
```typescript
// findUnique: dùng khi filter theo PK hoặc unique field
prisma.user.findUnique({ where: { id } })          // → User | null
prisma.user.findUnique({ where: { email } })       // → User | null

// findFirst: dùng khi filter theo non-unique fields
prisma.scoreEvent.findFirst({ where: { taskId } }) // → ScoreEvent | null
```

### include — eager loading
```typescript
prisma.task.findMany({
  include: {
    assignee: { select: { id: true, name: true, email: true } }
    // select: chỉ lấy một số fields của related record
  }
})
```
`include` = SQL JOIN. `select` trong include = chỉ lấy các fields cần thiết (tránh leak data).

### where với filters
```typescript
const where: Prisma.TaskWhereInput = {};
if (query.status) where.status = query.status;
if (query.assigneeId) where.assigneeId = query.assigneeId;
// → Dynamic WHERE clause
```

### $transaction
```typescript
await prisma.$transaction(async (tx) => {
  await tx.task.updateMany({ ... });
  await tx.scoreEvent.create({ ... });
  await tx.productivityScore.upsert({ ... });
  // Nếu bất kỳ lệnh nào throw → toàn bộ rollback
});
```
`tx` là Prisma client bên trong transaction — dùng `tx.model.operation()` thay vì `prisma.model.operation()`.

### updateMany với optimistic locking
```typescript
const result = await tx.task.updateMany({
  where: { id, status: existing.status },  // ← Guard: chỉ update nếu status chưa đổi
  data: updateData,
});
if (result.count === 0) {
  throw new ConflictError('CONCURRENT_MODIFICATION', '...');
}
```
Pattern này ngăn **race condition**: 2 request đồng thời cùng chuyển task → DONE, chỉ cái nào chạy trước thắng, cái sau nhận 409.

### $queryRaw — raw SQL khi cần
```typescript
const tasks = await prisma.$queryRaw<Array<{...}>>`
  SELECT t.*, u.name AS assignee_name
  FROM "Task" t
  LEFT JOIN "User" u ON t."assigneeId" = u.id
  ORDER BY CASE t.priority
    WHEN 'HIGH' THEN 3
    WHEN 'MEDIUM' THEN 2
    WHEN 'LOW' THEN 1
  END DESC
  LIMIT ${limit} OFFSET ${skip}
`;
```
Dùng khi Prisma ORM API không đủ mạnh — ở đây là `CASE WHEN` cho semantic sort.  
Prisma template literals tự động **parameterize** inputs → safe khỏi SQL injection.

---

## Migrations

```
backend/prisma/migrations/
├── 20250101000000_init/
│   └── migration.sql
└── migration_lock.toml
```

**Quy trình:**
```bash
# Tạo migration mới từ schema changes:
npx prisma migrate dev --name add_score_events

# Apply migrations trong production (không interactive):
npx prisma migrate deploy

# Generate Prisma Client (phải chạy sau khi sửa schema):
npx prisma generate
```

Migration files là SQL thô — không bao giờ sửa tay sau khi đã commit.

---

## Shared types vs Prisma types

```
shared/types/task.ts          backend/src/generated/prisma/client/
    Task (interface)              Task (Prisma model type)
    TaskStatus (enum)             
    TaskPriority (enum)           
    VALID_TRANSITIONS             
```

Dự án có 2 loại Task type:
1. **`shared/types/task.ts`**: interface dùng chung giữa frontend và backend
2. **Prisma generated type**: type database-level, có thêm fields như quan hệ

Services trả về Prisma types, frontend nhận qua API (JSON) và cast về shared types.
