# 00 — Tổng quan dự án

## Dự án này là gì?

**Team Productivity Tracker** là một REST API + web app để quản lý tasks và tính điểm năng suất cho từng thành viên. Khi một người hoàn thành task, hệ thống tự động tính điểm dựa trên độ ưu tiên và thời hạn. Bảng xếp hạng (leaderboard) cập nhật realtime qua **Server-Sent Events (SSE)**.

Đây là code challenge submission cho vị trí **Backend Developer (2 YOE)** — tiêu chí đánh giá gồm: clean code, feature completeness, performance/scalability, và API design.

---

## Stack công nghệ

| Lớp | Công nghệ | Vai trò |
|-----|-----------|---------|
| Backend | Node.js 22 + TypeScript | Runtime |
| HTTP framework | Express 5 | REST API |
| ORM | Prisma 7 + `@prisma/adapter-pg` | Database access |
| Database | PostgreSQL 16 | Lưu trữ dữ liệu |
| Cache | Redis 7 + ioredis | Leaderboard cache |
| Validation | Zod | Runtime schema validation |
| Frontend | Next.js 15 (App Router) | Web UI |
| State mgmt | TanStack React Query | Server state + caching trên client |
| Testing | Vitest + Supertest | Backend unit/integration tests |
| Container | Docker + Docker Compose | Môi trường chạy |

---

## Cấu trúc monorepo

```
problem5/
├── shared/          # Types và constants dùng chung (không build riêng)
│   ├── types/       # User, Task, Leaderboard interfaces + enums
│   └── constants/   # PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY
├── backend/         # Express REST API
│   ├── prisma/      # Schema.prisma, migrations, seed
│   └── src/
│       ├── app.ts          # Khởi tạo Express app + middleware stack
│       ├── server.ts       # Entry point (dotenv + app.listen)
│       ├── routes/         # HTTP routing (thin layer)
│       ├── services/       # Business logic (fat layer)
│       ├── middleware/      # correlationId, validation, errorHandler, rateLimiter
│       ├── schemas/         # Zod schemas cho request body + query
│       ├── lib/            # Singleton clients: prisma, redis, sse-manager
│       └── test/           # Vitest + Supertest tests
└── frontend/        # Next.js 15 App Router
    └── src/
        ├── app/            # Pages: /, /users, /tasks, /leaderboard
        ├── components/     # UI components
        └── lib/
            └── api-client.ts  # Typed HTTP client
```

---

## Luồng request điển hình

```
Browser
  │
  │  HTTP request
  ▼
Express app.ts
  ├── helmet()             — Security headers
  ├── cors()               — CORS policy
  ├── correlationIdMiddleware — Gán X-Request-Id
  ├── pinoHttp()           — Log request
  ├── express.json()       — Parse body
  ├── writeLimiter         — Rate limit (POST/PATCH/DELETE)
  │
  ├── /api/health  → healthRouter
  ├── /api/users   → userRouter   → userService   → prisma (PostgreSQL)
  ├── /api/tasks   → taskRouter   → taskService   → prisma + redis + sseManager
  └── /api/leaderboard → leaderboardRouter → leaderboardService → redis + prisma
  │
  └── errorHandler()  — Bắt mọi lỗi, trả JSON chuẩn
```

---

## Các concept chính cần nắm

### 1. Layered architecture
- **Routes**: chỉ nhận request, validate query params, gọi service, trả response
- **Services**: toàn bộ business logic — transactions, scoring, cache invalidation
- **Lib**: singleton clients — không có logic nghiệp vụ

### 2. State machine của Task
```
TODO  →  IN_PROGRESS  →  DONE
                          ↑
                       Terminal (không thể quay lui)
```
Khi chuyển sang `DONE`: tính điểm + invalidate Redis cache + broadcast SSE.

### 3. Scoring
```
score = PRIORITY_POINTS[priority] + (isEarly ? +5 : 0) - (isLate ? 3 : 0)
```
So sánh theo **date only** (bỏ qua giờ). Hoàn thành đúng ngày deadline = đúng hạn (không cộng, không trừ).

### 4. Cache-aside pattern
```
GET /leaderboard:
  1. Thử đọc Redis → nếu HIT: return ngay
  2. Nếu MISS: query PostgreSQL
  3. Ghi kết quả vào Redis (TTL 60s)
  4. Return
```
Redis lỗi → fallback về DB, không crash.

### 5. SSE (Server-Sent Events)
- Client mở connection đến `GET /api/leaderboard/stream`
- Server giữ connection, push event mỗi khi có task → DONE hoặc user bị xóa
- `SseManager` là in-memory registry của tất cả connection đang mở

### 6. Error hierarchy
```
AppError (base)
├── NotFoundError      → 404 NOT_FOUND
├── ValidationError    → 400 VALIDATION_ERROR
└── ConflictError      → 409 (nhiều code: INVALID_TRANSITION, USER_HAS_TASKS, ...)
```

---

## Thứ tự đọc tài liệu

| File | Học gì |
|------|--------|
| `01-backend-core.md` | Express app, middleware stack, routing pattern |
| `02-database.md` | Prisma schema, 4 models, quan hệ dữ liệu |
| `03-services.md` | Business logic: user, task, leaderboard service |
| `04-scoring-system.md` | Cơ chế tính điểm chi tiết |
| `05-realtime.md` | Redis cache + SSE leaderboard |
| `06-frontend.md` | Next.js, React Query, api-client |
| `07-testing.md` | Vitest, mock strategy, test patterns |
| `08-reading-guide.md` | Hướng dẫn đọc source code theo thứ tự |
