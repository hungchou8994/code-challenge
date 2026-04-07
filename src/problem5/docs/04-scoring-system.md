# 04 — Scoring System

Đây là business logic cốt lõi của dự án — mỗi task completed phải award đúng điểm.

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
export const LATE_PENALTY = -3;  // Giá trị âm, nhưng code lấy Math.abs() khi dùng
```

Constants này nằm trong `shared/` để **cả frontend và backend đều dùng cùng 1 nguồn**. Frontend có thể hiển thị preview điểm trước khi submit.

---

## Công thức tính điểm

```
totalAwarded = basePoints + bonus - penalty

Trong đó:
  basePoints = PRIORITY_POINTS[task.priority]   → 5, 10, hoặc 20
  bonus      = isEarly ? EARLY_BONUS : 0        → 5 hoặc 0
  penalty    = isLate  ? |LATE_PENALTY| : 0     → 3 hoặc 0
```

### Bảng tóm tắt

| Priority | Sớm hạn | Đúng hạn | Trễ hạn |
|----------|---------|----------|---------|
| LOW      | 5+5 = **10** | 5 = **5** | 5-3 = **2** |
| MEDIUM   | 10+5 = **15** | 10 = **10** | 10-3 = **7** |
| HIGH     | 20+5 = **25** | 20 = **20** | 20-3 = **17** |

Không có điểm âm — trường hợp thấp nhất là LOW trễ = **2 điểm**.

---

## Code implementation

**File:** `backend/src/services/leaderboard.service.ts` — hàm `scoreTask()`

```typescript
async scoreTask(task: { id, assigneeId, priority, dueDate }, tx?) {
  const now = new Date();
  const priority = task.priority as TaskPriority;
  const basePoints = PRIORITY_POINTS[priority];

  // So sánh date-only (bỏ qua giờ/phút/giây)
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate());

  const isEarly = nowDay < dueDay;   // Hôm nay trước ngày deadline
  const isLate  = nowDay > dueDay;   // Hôm nay sau ngày deadline
  // isEarly === false && isLate === false → đúng ngày deadline → không bonus, không penalty

  const bonus   = isEarly ? EARLY_BONUS : 0;
  const penalty = isLate  ? Math.abs(LATE_PENALTY) : 0;  // Math.abs(-3) = 3
  const totalAwarded = basePoints + bonus - penalty;

  // Tạo ScoreEvent (audit log)
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

## Date comparison: tại sao so sánh date-only?

### Vấn đề nếu so sánh timestamp đầy đủ

```
dueDate được lưu trong DB: 2026-04-15T23:59:59.000Z
Người dùng hoàn thành lúc: 2026-04-15T10:00:00.000Z

now < dueDate → true → isEarly!

Nhưng người dùng hoàn thành ĐÚNG NGÀY deadline → đáng lẽ không có bonus
```

### Fix: so sánh date-only

```typescript
const nowDay = new Date(2026, 3, 15);  // April 15
const dueDay = new Date(2026, 3, 15);  // April 15

nowDay < dueDay  → false (không sớm)
nowDay > dueDay  → false (không trễ)
// → Đúng hạn: không bonus, không penalty ✓
```

Cách tạo date-only object trong JavaScript:
```typescript
// new Date(year, monthIndex, day) → time = 00:00:00 local timezone
const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
```
`monthIndex` là 0-based (0 = January, 3 = April). Đây là quirk nổi tiếng của JavaScript Date API.

---

## Atomicity — tại sao cần transaction?

### Vấn đề nếu không có transaction

```
Request 1: task → DONE
  1. UPDATE task SET status='DONE'  ✓
  2. Server crash hoặc DB timeout
  3. INSERT score_event             ✗ → Task là DONE nhưng không có điểm!
```

### Fix: transaction

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update task status (với optimistic lock)
  await tx.task.updateMany({ where: { id, status: existing.status }, data: { status: 'DONE' } });

  // 2. Tính điểm (trong cùng transaction)
  await leaderboardService.scoreTask({ ... }, tx);
  //   ↑ Gọi tx.scoreEvent.create() và tx.productivityScore.upsert()
});
// Nếu bất kỳ bước nào fail → toàn bộ rollback
// Task vẫn là IN_PROGRESS, không có score event
```

---

## Concurrency control — race condition

### Tình huống

```
Client A và Client B đồng thời PATCH /api/tasks/123 { status: 'DONE' }

Cả hai cùng load task (status = IN_PROGRESS)
Cả hai vào transaction...

Nếu không có guard:
  A: INSERT score_event(+20 điểm)  ✓
  B: INSERT score_event(+20 điểm)  ✓ ← User nhận 40 điểm thay vì 20!
```

### Fix: optimistic locking với `updateMany`

```typescript
// Trong transaction, chỉ update nếu status CHƯA đổi
const result = await tx.task.updateMany({
  where: { id, status: existing.status },   // ← "status vẫn còn là IN_PROGRESS"
  data: { status: 'DONE' },
});

if (result.count === 0) {
  // count === 0 nghĩa là WHERE không match
  // → Task đã được update bởi request khác rồi
  throw new ConflictError('CONCURRENT_MODIFICATION', '...');  // → 409
}
```

**Tại sao không dùng `update` (singular)?**  
`prisma.task.update()` throw error nếu record không tìm thấy (404), nhưng không phân biệt được "không tìm thấy" vs "status đã đổi". `updateMany` trả về `{ count: number }` — nếu `count === 0` là biết guard failed.

---

## Score rollback khi force delete

Khi xóa một DONE task (với `?force=true`):

```typescript
// 1. Tìm ScoreEvent để biết user nào được tính điểm
const scoreEvent = await tx.scoreEvent.findFirst({ where: { taskId: id } });
const scoredUserId = scoreEvent?.userId;

// 2. Xóa ScoreEvent
await tx.scoreEvent.deleteMany({ where: { taskId: id } });

// 3. Xóa task
await tx.task.delete({ where: { id } });

// 4. Tính lại ProductivityScore từ các ScoreEvents còn lại
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

**Tại sao aggregate lại thay vì decrement?**  
Giả sử user có `totalScore = 35` (từ 2 tasks: +20 và +15). Nếu xóa task +20:
- `35 - 20 = 15` — đúng trong điều kiện bình thường
- Nhưng nếu có race condition → `35 - 20 - 20 = -5` (sai)
- Aggregate `SUM(remaining ScoreEvents)` luôn đúng, idempotent

---

## Flow hoàn chỉnh khi task → DONE

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
    │     → result.count === 1 → tiếp tục
    │
    ├── task.findUnique() (re-fetch với assignee)
    │
    └── leaderboardService.scoreTask(task, tx)
          ├── Tính basePoints, bonus, penalty
          ├── scoreEvent.create()
          └── productivityScore.upsert({ increment })
          │
  ← Transaction commit ←
          │
  (Ngoài transaction)
    ├── redisClient.del(LEADERBOARD_CACHE_KEY)
    ├── leaderboardService.getRankings()  ← Query DB để có fresh data
    └── sseManager.broadcast(rankings)   ← Push đến tất cả SSE clients
          │
          ▼
  return updated task (200 OK)
```
