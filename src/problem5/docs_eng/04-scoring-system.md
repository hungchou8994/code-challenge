# 04 — Scoring System

This is the project's core business logic — every completed task must award the correct score.

---

## Constants

**File:** `shared/constants/scoring.ts`

```typescript
import { TaskPriority } from '../types/task.js';

export const PRIORITY_POINTS: Record<TaskPriority, number> = {
  [TaskPriority.LOW]:    5,
  [TaskPriority.MEDIUM]: 10,
  [TaskPriority.HIGH]:   20,
};

export const EARLY_BONUS  =  5;
export const LATE_PENALTY = -3;  // Negative value, but code uses Math.abs() when applying it
```

These constants live in `shared/` so **both frontend and backend use the same source**. The frontend can display a score preview before submit.

---

## Scoring formula

```
totalAwarded = basePoints + bonus - penalty

Where:
  basePoints = PRIORITY_POINTS[task.priority]   → 5, 10, or 20
  bonus      = isEarly ? EARLY_BONUS : 0        → 5 or 0
  penalty    = isLate  ? |LATE_PENALTY| : 0     → 3 or 0
```

### Summary table

| Priority | Early | On time | Late |
|----------|---------|----------|---------|
| LOW      | 5+5 = **10** | 5 = **5** | 5-3 = **2** |
| MEDIUM   | 10+5 = **15** | 10 = **10** | 10-3 = **7** |
| HIGH     | 20+5 = **25** | 20 = **20** | 20-3 = **17** |

There is no negative score in the current setup — the lowest case is late LOW priority = **2 points**.

---

## Code implementation

**File:** `backend/src/services/leaderboard.service.ts` — function `scoreTask()`

```typescript
async scoreTask(task: { id, assigneeId, priority, dueDate }, tx?) {
  const now = new Date();
  const priority = task.priority as TaskPriority;
  const basePoints = PRIORITY_POINTS[priority];

  // Date-only comparison (ignore hour/minute/second)
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate());

  const isEarly = nowDay < dueDay;   // Today is before due date
  const isLate  = nowDay > dueDay;   // Today is after due date
  // isEarly === false && isLate === false → same day as deadline → no bonus, no penalty

  const bonus   = isEarly ? EARLY_BONUS : 0;
  const penalty = isLate  ? Math.abs(LATE_PENALTY) : 0;  // Math.abs(-3) = 3
  const totalAwarded = basePoints + bonus - penalty;

  // Create ScoreEvent (audit log)
  await client.scoreEvent.create({
    data: {
      userId:       task.assigneeId,
      taskId:       task.id,
      points:       basePoints,
      bonus,
      penalty,
      totalAwarded,
    },
  });

  // Update ProductivityScore (denormalized summary)
  await client.productivityScore.upsert({
    where:  { userId: task.assigneeId },
    create: { userId: task.assigneeId, totalScore: totalAwarded, tasksCompleted: 1 },
    update: {
      totalScore:     { increment: totalAwarded },
      tasksCompleted: { increment: 1 },
    },
  });
}
```

---

## Date comparison: why compare date-only?

### The problem with full timestamp comparison

```
dueDate stored in DB: 2026-04-15T23:59:59.000Z
User completes at:    2026-04-15T10:00:00.000Z

now < dueDate → true → isEarly!

But the user finished ON THE DEADLINE DAY → there should be no bonus
```

### Fix: compare date-only

```typescript
const nowDay = new Date(2026, 3, 15);  // April 15
const dueDay = new Date(2026, 3, 15);  // April 15

nowDay < dueDay  → false (not early)
nowDay > dueDay  → false (not late)
// → On time: no bonus, no penalty ✓
```

How to create a date-only object in JavaScript:
```typescript
// new Date(year, monthIndex, day) → time = 00:00:00 local timezone
const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
```
`monthIndex` is 0-based (0 = January, 3 = April). This is a well-known quirk of JavaScript's Date API.

---

## Atomicity — why do we need a transaction?

### The problem without a transaction

```
Request 1: task → DONE
  1. UPDATE task SET status='DONE'  ✓
  2. Server crash or DB timeout
  3. INSERT score_event             ✗ → Task is DONE but no score exists!
```

### Fix: transaction

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update task status (with optimistic lock)
  await tx.task.updateMany({ where: { id, status: existing.status }, data: { status: 'DONE' } });

  // 2. Score inside the same transaction
  await leaderboardService.scoreTask({ ... }, tx);
  //   ↑ Calls tx.scoreEvent.create() and tx.productivityScore.upsert()
});
// If any step fails → full rollback
// Task stays IN_PROGRESS, and no score event is created
```

---

## Concurrency control — race condition

### Scenario

```
Client A and Client B simultaneously PATCH /api/tasks/123 { status: 'DONE' }

Both load the task (status = IN_PROGRESS)
Both enter a transaction...

Without a guard:
  A: INSERT score_event(+20 points)  ✓
  B: INSERT score_event(+20 points)  ✓ ← User gets 40 points instead of 20!
```

### Fix: optimistic locking with `updateMany`

```typescript
// Inside transaction, only update if status has NOT changed yet
const result = await tx.task.updateMany({
  where: { id, status: existing.status },   // ← “status is still IN_PROGRESS”
  data: { status: 'DONE' },
});

if (result.count === 0) {
  // count === 0 means WHERE did not match
  // → another request already updated the task
  throw new ConflictError('CONCURRENT_MODIFICATION', '...');  // → 409
}
```

**Why not use `update` (singular)?**  
`prisma.task.update()` throws if the record is not found, but it cannot distinguish “not found” from “status already changed.” `updateMany` returns `{ count: number }`, so `count === 0` clearly means the guard failed.

---

## Score rollback on force delete

When deleting a DONE task with `?force=true`:

```typescript
// 1. Find the ScoreEvent to know which user got the score
const scoreEvent = await tx.scoreEvent.findFirst({ where: { taskId: id } });
const scoredUserId = scoreEvent?.userId;

// 2. Delete ScoreEvent
await tx.scoreEvent.deleteMany({ where: { taskId: id } });

// 3. Delete task
await tx.task.delete({ where: { id } });

// 4. Recalculate ProductivityScore from remaining ScoreEvents
const agg = await tx.scoreEvent.aggregate({
  where: { userId: scoredUserId },
  _sum: { totalAwarded: true },
  _count: { id: true },
});
await tx.productivityScore.upsert({
  update: {
    totalScore: agg._sum.totalAwarded ?? 0,
    tasksCompleted: agg._count.id ?? 0,
  },
  ...
});
```

**Why aggregate instead of decrement?**  
Assume the user has `totalScore = 35` from 2 tasks: +20 and +15. If the +20 task is deleted:
- `35 - 20 = 15` — correct under normal conditions
- But with race conditions → `35 - 20 - 20 = -5` (wrong)
- `SUM(remaining ScoreEvents)` is always correct and idempotent

---

## Full flow when task → DONE

```
PATCH /api/tasks/:id { status: 'DONE' }
          │
          ▼
  taskService.update()
          │
    Validate transition (IN_PROGRESS → DONE ✓)
    Validate assigneeId exists
          │
          ▼
  prisma.$transaction()
    ├── task.updateMany({ where: { id, status: 'IN_PROGRESS' } })
    │     → result.count === 0 → throw 409 CONCURRENT_MODIFICATION
    │     → result.count === 1 → continue
    │
    ├── task.findUnique() (re-fetch with assignee)
    │
    └── leaderboardService.scoreTask(task, tx)
          ├── Calculate basePoints, bonus, penalty
          ├── scoreEvent.create()
          └── productivityScore.upsert({ increment })
          │
  ← Transaction commit ←
          │
  (Outside transaction)
    ├── redisClient.del(LEADERBOARD_CACHE_KEY)
    ├── leaderboardService.getRankings()  ← Query DB for fresh data
    └── sseManager.broadcast(rankings)   ← Push to all SSE clients
          │
          ▼
  return updated task (200 OK)
```
