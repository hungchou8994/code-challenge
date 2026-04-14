# 02 — Database: Prisma, Schema & Models

## What is Prisma?

Prisma is an **ORM (Object-Relational Mapper)** for Node.js/TypeScript. Instead of writing SQL manually, you use Prisma Client — a fully typed TypeScript API generated from the schema.

Prisma's strengths compared to other ORMs such as Sequelize or TypeORM:
- **Type-safe by design**: every query returns the correct type, and IDE autocomplete works well
- **Schema-first**: the source of truth is the `.prisma` file; types and migrations are derived from it
- **Readable query API**: `prisma.user.findMany({ where: { ... }, include: { ... } })`

---

## Prisma configuration

**File:** `backend/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma/client"  // Generated client goes here
}

datasource db {
  provider = "postgresql"
  // DATABASE_URL is read from env var
}
```

**File:** `backend/prisma.config.ts` — uses `dotenv/config` to load `.env` before the Prisma CLI runs.

**Prisma adapter:** The project uses `@prisma/adapter-pg` instead of Prisma's built-in connection.
```typescript
// lib/prisma.ts
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```
`PrismaPg` is a driver based on the `pg` package, which makes it easier to work with external connection poolers such as PgBouncer.

---

## 4 models and relationships

### Relationship diagram

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

  tasks             Task[]            ← Relation: 1 user has many tasks
  scoreEvents       ScoreEvent[]      ← Relation: 1 user has many score events
  productivityScore ProductivityScore?  ← Relation: 1 user has 0 or 1 score summary

  @@map("users")                     ← DB table name is "users" (lowercase)
}
```

**Notes:**
- `@default(uuid())`: the primary key is UUID v4, not auto-increment integer. UUIDs are better for distributed systems.
- `@updatedAt`: Prisma automatically updates this field whenever the record is updated.
- `@@map("users")`: Prisma model names use PascalCase, but DB tables use snake_case/lowercase.

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

**Important — `onDelete: Restrict`:**  
If a User still has active Tasks (`TODO`/`IN_PROGRESS`), **PostgreSQL refuses to delete the User** because of the foreign key constraint.  
However, `userService.delete()` checks this first in application code (`activeTaskCount > 0 → throw ConflictError`), so Prisma P2003 is only the second safety net.

**`status` and `priority` are `String`, not DB enums:**  
Prisma does not use native PostgreSQL enums here — validation is done at the application layer with Zod. This is more flexible when adding new values later, because it avoids more complex enum migrations.

### Model 3: `ScoreEvent`

```prisma
model ScoreEvent {
  id           String   @id @default(uuid())
  userId       String   @map("user_id")
  taskId       String   @map("task_id")
  points       Int                    ← Base points (5/10/20)
  bonus        Int      @default(0)   ← Early bonus (+5 or 0)
  penalty      Int      @default(0)   ← Late penalty (3 or 0) — stored as absolute value
  totalAwarded Int      @map("total_awarded")  ← = points + bonus - penalty

  user User @relation(..., onDelete: Cascade)  ← Delete user → delete score events
  task Task @relation(..., onDelete: Cascade)  ← Delete task → delete score events

  @@map("score_events")
}
```

`ScoreEvent` is the **audit log** for each scoring action:
- When a task becomes `DONE`: create 1 `ScoreEvent`
- When a task is force-deleted: delete the matching `ScoreEvent`, then recalculate `ProductivityScore`
- `onDelete: Cascade` ensures that when a user or task is deleted, `ScoreEvent` rows are automatically removed too

### Model 4: `ProductivityScore`

```prisma
model ProductivityScore {
  id             String   @id @default(uuid())
  userId         String   @unique @map("user_id")  ← 1 user can only have 1 row
  totalScore     Int      @default(0) @map("total_score")
  tasksCompleted Int      @default(0) @map("tasks_completed")
  updatedAt      DateTime @updatedAt @map("updated_at")

  user User @relation(..., onDelete: Cascade)

  @@map("productivity_scores")
}
```

This is a **denormalized summary** — precomputed from `ScoreEvent` so leaderboard queries are fast. Instead of doing `SUM(score_events.total_awarded)` every time the leaderboard is requested, the app can just read this table.

**Why keep both tables?**
- `ScoreEvent`: source of truth, audit trail, can be used to recalculate everything
- `ProductivityScore`: read-optimized, used for the leaderboard

**`upsert` pattern:**
```typescript
// When scoring:
await tx.productivityScore.upsert({
  where: { userId },
  create: { userId, totalScore: totalAwarded, tasksCompleted: 1 },
  update: {
    totalScore: { increment: totalAwarded },  // Atomic increment
    tasksCompleted: { increment: 1 },
  },
});
```
`upsert` means INSERT if it does not exist, UPDATE if it already exists. `{ increment: n }` maps to an atomic SQL `UPDATE SET col = col + n`.

---

## Prisma Client API — common patterns

### findUnique vs findFirst
```typescript
// findUnique: use when filtering by PK or unique field
prisma.user.findUnique({ where: { id } })          // → User | null
prisma.user.findUnique({ where: { email } })       // → User | null

// findFirst: use when filtering by non-unique fields
prisma.scoreEvent.findFirst({ where: { taskId } }) // → ScoreEvent | null
```

### include — eager loading
```typescript
prisma.task.findMany({
  include: {
    assignee: { select: { id: true, name: true, email: true } }
    // select: only pick some fields from the related record
  }
})
```
`include` = SQL JOIN. `select` inside `include` means only fetch the fields you actually need and avoid leaking extra data.

### where with filters
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
  // If any statement throws → full rollback
});
```
`tx` is the Prisma client inside the transaction — use `tx.model.operation()` instead of `prisma.model.operation()`.

### updateMany with optimistic locking
```typescript
const result = await tx.task.updateMany({
  where: { id, status: existing.status },  // ← Guard: update only if status has not changed
  data: updateData,
});
if (result.count === 0) {
  throw new ConflictError('CONCURRENT_MODIFICATION', '...');
}
```
This pattern prevents a **race condition**: if 2 concurrent requests both try to move the same task to `DONE`, only the first one wins; the second gets 409.

### $queryRaw — raw SQL when needed
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
Use this when Prisma's ORM API is not expressive enough — here, to implement semantic `CASE WHEN` sorting.  
Prisma template literals automatically **parameterize** inputs, so they are safe from SQL injection.

---

## Migrations

```
backend/prisma/migrations/
├── 20250101000000_init/
│   └── migration.sql
└── migration_lock.toml
```

**Workflow:**
```bash
# Create a new migration from schema changes:
npx prisma migrate dev --name add_score_events

# Apply migrations in production (non-interactive):
npx prisma migrate deploy

# Generate Prisma Client (must run after editing schema):
npx prisma generate
```

Migration files are raw SQL — once committed, they should never be edited by hand.

---

## Shared types vs Prisma types

```
shared/types/task.ts          backend/src/generated/prisma/client/
    Task (interface)              Task (Prisma model type)
    TaskStatus (enum)             
    TaskPriority (enum)           
    VALID_TRANSITIONS             
```

The project has 2 kinds of `Task` type:
1. **`shared/types/task.ts`**: interface shared between frontend and backend
2. **Prisma generated type**: DB-level type, including relation fields

Services return Prisma types, and the frontend receives them over the API as JSON and treats them as shared types.
