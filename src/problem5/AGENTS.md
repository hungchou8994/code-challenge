<!-- GSD:project-start source:PROJECT.md -->
## Project

**Productivity Tracker**

A brownfield REST API + Next.js web application for tracking tasks and scoring user productivity. Users are assigned tasks with priorities and due dates; completing tasks awards points based on timeliness (early bonus, late penalty). A real-time leaderboard ranks users by total score via Server-Sent Events.

This is a recruitment code challenge submission targeting a **Backend Developer (2 YOE)** role. The evaluators score on clean code & architecture, feature completeness, performance/scalability, and API design.

**Core Value:** A reliable, well-architected task tracker with a correct scoring system — every completed task must award the right score, with no data inconsistency.

### Constraints

- **Timeline**: Submission within 24 hours — fix & polish, no new features
- **Tech stack**: Must keep Node.js/TypeScript/Express/Prisma/PostgreSQL/Redis/Next.js stack as-is
- **Scope**: Fix existing bugs + improve code quality + polish API design; no new feature categories
- **Git**: Per-task atomic commits; planning docs committed to git
- **Tests**: Backend tests must pass after each fix; extend coverage but do not require real DB
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.9.x - Used across all packages (backend, frontend, shared)
- SQL - Prisma migration files in `backend/prisma/migrations/`, seed file at `seed.sql`
## Runtime
- Node.js 22 (Alpine) - Specified in both Dockerfiles (`FROM node:22-alpine`)
- npm workspaces (monorepo)
- Lockfile: `package-lock.json` present at root
## Workspace Structure
| Package | Path | Type |
|---------|------|------|
| `backend` | `backend/` | Node.js REST API |
| `frontend` | `frontend/` | Next.js web app |
| `shared` | `shared/` | Shared types/constants (no build step) |
## Frameworks
- Express 5.x (`^5.2.1`) - HTTP server framework
- Next.js 15.5.14 - React framework with App Router
- React 19.x (`^19.2.0`) - UI library
- Vitest 4.x (`^4.1.2`) - Backend test runner
- Supertest 7.x (`^7.2.2`) - HTTP integration testing
## Key Dependencies
- `prisma` `^7.6.0` - ORM + migration tooling (devDep)
- `@prisma/client` `^7.6.0` - Database client (generated at `backend/src/generated/prisma/client/`)
- `@prisma/adapter-pg` `^7.6.0` - PostgreSQL adapter for Prisma (`PrismaPg` driver)
- `ioredis` `^5.10.1` - Redis client
- `zod` `3.25.76` - Runtime schema validation (pinned exact version)
- `express-rate-limit` `^8.3.2` - Rate limiting middleware
- `helmet` `^8.1.0` - Security HTTP headers
- `cors` `^2.8.6` - CORS middleware
- `pino-http` `^11.0.0` - HTTP request logging
- `http-status-codes` `^2.3.0` - HTTP status constants
- `dotenv` `^17.3.1` - Environment variable loading
- `tsx` `^4.21.0` - TypeScript execution for dev (`tsx watch src/server.ts`)
- `pino-pretty` `^13.1.3` - Pretty logging in dev
- `@tanstack/react-query` `^5.96.0` - Server state management
- `tailwindcss` `^4` - CSS framework
- `@base-ui/react` `^1.3.0` - Headless UI component primitives
- `shadcn` `^4.1.2` - Component library scaffolding tool
- `lucide-react` `^0.468.0` - Icon library
- `next-themes` `^0.4.6` - Theme switching
- `date-fns` `^4.0.0` - Date manipulation
- `clsx` `^2.1.1` + `tailwind-merge` `^3.5.0` + `class-variance-authority` `^0.7.1` - CSS class utilities
- `sonner` `^2.0.7` - Toast notifications
- `cmdk` `^1.1.1` - Command menu component
- `eslint` `^9` with `eslint-config-next` 15.5.14 - Linting
- `@tailwindcss/postcss` `^4` - PostCSS integration
- No external dependencies — pure TypeScript types and constants
## Configuration
- Root base: `tsconfig.base.json` (target ES2022, module Node16, strict, sourceMap, declaration)
- Backend: `backend/tsconfig.json` — extends base, outDir `./dist`, rootDir `..`
- Frontend: `frontend/tsconfig.json` — standalone config, target ES2017, bundler module resolution, path alias `@/*` → `./src/*`
- Prisma config: `backend/prisma.config.ts` (uses `dotenv/config`, reads `DATABASE_URL`)
- Schema: `backend/prisma/schema.prisma` (PostgreSQL provider, 4 models)
- Migrations: `backend/prisma/migrations/`
- ESLint v9 flat config: `frontend/eslint.config.mjs`
- Extends `next/core-web-vitals` and `next/typescript`
- No backend ESLint config detected
- Backend env vars loaded via `dotenv` in `backend/src/server.ts`
- Root `.env.example` defines: `DATABASE_URL`, `PORT`, `NODE_ENV`
- Frontend env vars: `NEXT_PUBLIC_API_URL` (public, injected at build)
- Backend: `tsc` → `dist/` directory
- Frontend: `next build` → `.next/` directory
- Both use multi-stage Docker builds (base build + runtime image)
- Prisma client generated at build time (`npx prisma generate` in Dockerfile)
- Migrations run at container start: `npx prisma migrate deploy && node dist/backend/src/server.js`
## Platform Requirements
- Node.js 22
- npm (workspace support)
- PostgreSQL 16 (via Docker or local)
- Redis 7 (via Docker or local)
- `concurrently` for running both workspaces: `npm run dev`
- `tsx` for backend hot-reload
- Docker + Docker Compose (`docker-compose.yml`)
- Containers: `db` (postgres:16), `redis` (redis:7-alpine), `backend` (node:22-alpine), `frontend` (node:22-alpine)
- Backend on port 3000, Frontend on port 3001, PostgreSQL on 5432, Redis on 6379
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Backend source files: `kebab-case` with role suffix — `user.service.ts`, `task.routes.ts`, `error-handler.ts`, `correlation-id.ts`
- Backend test files: `kebab-case.test.ts` — `users.test.ts`, `tasks.test.ts`, `leaderboard.test.ts`
- Backend schema files: `entity.schemas.ts` — `user.schemas.ts`, `task.schemas.ts`
- Frontend pages: `page.tsx` inside route directories — `app/tasks/page.tsx`, `app/users/page.tsx`
- Frontend components: `kebab-case.tsx` — `task-form.tsx`, `user-form.tsx`, `status-badge.tsx`, `filter-bar.tsx`
- UI primitives: `frontend/src/components/ui/` — `button.tsx`, `dialog.tsx`, `table.tsx`
- Shared types: `entity.ts` — `user.ts`, `task.ts`, `leaderboard.ts`
- `camelCase` for all functions, variables, and method names
- `PascalCase` for classes, interfaces, types, and React components
- `SCREAMING_SNAKE_CASE` for module-level constants and enums: `VALID_TRANSITIONS`, `LEADERBOARD_CACHE_KEY`, `PRIORITY_POINTS`, `CACHE_TTL`, `PAGE_SIZE`
- Named exports for routers use re-export alias pattern: `export { router as userRouter }`
- Service objects exported as named `const` objects: `export const userService = { ... }`
- Interfaces use `PascalCase` with descriptive names: `User`, `Task`, `LeaderboardEntry`, `CreateUserInput`
- Zod-inferred types: `export type CreateUserBody = z.infer<typeof createUserSchema>` — placed at bottom of schema file
- Enum values use `SCREAMING_SNAKE_CASE`: `TaskStatus.IN_PROGRESS`, `TaskPriority.HIGH`
## Code Style
- No `.prettierrc` detected; formatting appears consistent via editor defaults
- 2-space indentation throughout
- Single quotes for strings in backend TypeScript
- Double quotes for strings in frontend/shared TypeScript (shadcn-generated files)
- Trailing commas present in multiline object/array literals
- Arrow functions for callbacks and inline handlers
- Frontend: ESLint with `next/core-web-vitals` + `next/typescript` flat config at `frontend/eslint.config.mjs`
- Backend: No ESLint config found; TypeScript strict mode enforces type safety
- TypeScript `strict: true` applied globally via `tsconfig.base.json`
- `target: ES2022`, `module: Node16`, `moduleResolution: Node16`
- `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`
- `forceConsistentCasingInFileNames: true`
## Import Organization
- Backend: No path aliases; uses relative imports with explicit `.js` extension (Node16 ESM)
- Frontend: `@/` alias maps to `frontend/src/` (configured in Next.js); e.g., `import { Button } from '@/components/ui/button'`
- Frontend shared types: `import type { User } from 'shared/types/user'` (workspace package)
## Validation Pattern
- Schema per entity with three schema variants: `createXSchema`, `updateXSchema`, `xQuerySchema`
- `validate()` middleware in `backend/src/middleware/validation.ts` wraps Zod parse and throws `ValidationError`
- Query parameters parsed inline in routes using `schema.safeParse(req.query)` with early return on failure:
- Body validation uses middleware: `router.post('/', validate(createUserSchema), async (req, res) => { ... })`
- Schema types inferred and exported: `export type CreateUserBody = z.infer<typeof createUserSchema>`
## Error Handling
## Logging
- Development: pretty-printed with `pino-pretty` via transport, colorized
- Production: JSON logs (no pretty transport)
- Correlation ID (`X-Request-Id`) attached to each log via `genReqId`
- Unhandled errors additionally logged with `console.error('Unhandled error:', err)`
## Service Object Pattern
## Module Design
- Route files export a single named router: `export { router as userRouter }`
- Service files export a single service object: `export const userService = { ... }`
- Middleware files export named functions: `export function validate(...)`
- Error classes exported as named: `export class NotFoundError extends AppError`
- Lib files export singleton instances: `export const prisma = ...`, `export const redisClient = ...`
- Page components use `export default function PageName()`
- Shared components use named exports: `export function TaskForm(...)`, `export function StatusBadge(...)`
- UI primitives follow shadcn patterns — named exports with `forwardRef` where applicable
- All types re-exported through `shared/types/index.ts`
- Constants in `shared/constants/scoring.ts` — exported individually and re-exported through index
## React Component Patterns
- Server components: `layout.tsx` (no directive)
- Client components: all pages, forms, providers
- Query keys use arrays: `['tasks', filters, page]`, `['users', 'all']`, `['leaderboard']`
- Mutations invalidate related queries on success: `queryClient.invalidateQueries({ queryKey: ['tasks'] })`
## Comments
- Inline comments explain non-obvious business logic: `// Null-out assigneeId on completed tasks so they remain as historical records`
- Concurrency/race condition reasoning documented: `// Use a conditional updateMany to prevent double-scoring when two concurrent requests...`
- Test IDs included in test names for traceability: `'Test A (cache HIT): ...'`, `'Test E (task→DONE): ...'`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Clean separation between HTTP routing (routes), business logic (services), and infrastructure (lib)
- Shared types and scoring constants eliminate duplication between frontend and backend
- Real-time leaderboard push via Server-Sent Events (SSE) rather than polling
- Redis used for leaderboard caching with in-memory SSE fan-out for live updates
- All pages are client-side rendered (`'use client'`) via React Query; no Next.js server components used for data fetching
## Layers
- Purpose: Accept HTTP requests, attach correlation IDs, apply rate limiting, parse JSON, log requests, handle errors globally
- Location: `backend/src/app.ts`, `backend/src/middleware/`
- Contains: `correlationIdMiddleware`, `writeLimiter`, `pinoHttp` logger, `errorHandler`, Zod-based `validate()` factory
- Depends on: Express, pino-http, express-rate-limit
- Used by: All routes
- Purpose: Map HTTP verbs + paths to service calls; perform inline query-param validation
- Location: `backend/src/routes/`
- Contains: `user.routes.ts`, `task.routes.ts`, `leaderboard.routes.ts`, `health.routes.ts`
- Depends on: Services, validation middleware, schemas
- Used by: `app.ts` (mounted at `/api/*`)
- Purpose: Implement all business logic — pagination, state machine transitions, scoring, cache invalidation, SSE broadcast
- Location: `backend/src/services/`
- Contains: `user.service.ts`, `task.service.ts`, `leaderboard.service.ts`
- Depends on: `lib/prisma.ts`, `lib/redis.ts`, `lib/sse-manager.ts`, `shared/constants/scoring.ts`
- Used by: Routes
- Purpose: Singleton clients and cross-cutting utilities
- Location: `backend/src/lib/`
- Contains:
- Depends on: External databases (PostgreSQL, Redis)
- Used by: Services, routes (health check, leaderboard stream)
- Purpose: Zod schemas for request bodies and query parameters; export inferred TypeScript types
- Location: `backend/src/schemas/`
- Contains: `user.schemas.ts`, `task.schemas.ts`
- Depends on: Zod
- Used by: Routes (query parsing), middleware `validate()` factory (body parsing)
- Purpose: Contracts shared by frontend and backend — TypeScript interfaces, enums, and scoring constants
- Location: `shared/types/`, `shared/constants/`
- Contains: `user.ts`, `task.ts`, `leaderboard.ts`, `index.ts`, `constants/scoring.ts`
- Depended on by: `frontend/src/lib/api-client.ts`, `backend/src/services/leaderboard.service.ts`
- Purpose: Single module exporting `api.*` namespaced functions; abstracts all `fetch` calls
- Location: `frontend/src/lib/api-client.ts`
- Contains: `api.users`, `api.tasks`, `api.leaderboard`, `api.dashboard` namespaces
- Depends on: `shared/types/*`
- Used by: All page components
- Purpose: UI pages; own their data fetching via React Query, mutations, and local UI state
- Location: `frontend/src/app/`
- Contains: `page.tsx` (dashboard), `users/page.tsx`, `tasks/page.tsx`, `leaderboard/page.tsx`
- Depends on: `api-client`, `@tanstack/react-query`, `shared/types`, component library
- Used by: `layout.tsx` via Next.js file-based routing
- Purpose: Reusable UI; forms, tables, navigation, filter bars
- Location: `frontend/src/components/`
- Contains: Feature components (`task-form.tsx`, `user-form.tsx`, `leaderboard-table.tsx`, etc.) and shadcn/ui primitives in `ui/`
## Data Flow
- React Query manages all server data (caching, refetching, stale-time = 60s, no refetch on window focus)
- Local `useState` for UI state (filters, pagination, selected user)
- Leaderboard uses raw `EventSource` + `useState` (not React Query) due to streaming nature
## Key Abstractions
- Purpose: Typed error hierarchy enabling the global `errorHandler` middleware to render consistent JSON error shapes
- File: `backend/src/middleware/error-handler.ts`
- Pattern: Services throw typed errors; `errorHandler` catches and serializes them; Prisma constraint errors (P2002, P2003) also handled
- Purpose: In-process registry of active SSE response objects; fan-out broadcaster
- File: `backend/src/lib/sse-manager.ts`
- Pattern: `SseManager` class with `Map<id, Response>`, auto-evicts closed connections on write or before write
- Purpose: Cache-aside pattern — reads from Redis if cached, writes to Redis after DB fetch
- File: `backend/src/services/leaderboard.service.ts`
- Pattern: TTL = 60s; cache invalidated on task completion or user deletion; Redis errors are silently swallowed
- Purpose: Enforces `TODO → IN_PROGRESS → DONE` transitions; `DONE` is terminal
- File: `backend/src/services/task.service.ts` (inline `VALID_TRANSITIONS` map)
- Also mirrored in: `shared/types/task.ts` (`VALID_TRANSITIONS` exported for frontend)
- Purpose: Typed, namespaced HTTP client; centralizes all API calls, error extraction, and query-string building
- File: `frontend/src/lib/api-client.ts`
- Pattern: Single `request<T>()` base function; namespaced methods (`api.users.list`, `api.tasks.update`, etc.)
## Entry Points
- Location: `backend/src/server.ts`
- Triggers: Node.js process start (`node dist/server.js` or `tsx src/server.ts`)
- Responsibilities: Reads `PORT` env var, calls `app.listen()`
- Location: `backend/src/app.ts`
- Triggers: Imported by `server.ts` and tests
- Responsibilities: Assembles middleware stack and mounts all routers
- Location: `frontend/src/app/layout.tsx`
- Triggers: Next.js App Router
- Responsibilities: Wraps all pages in `Providers` (React Query), renders `Nav` and `Toaster`
## Error Handling
- `NotFoundError` → 404 with `{ error: { code: 'NOT_FOUND', message: '...' } }`
- `ValidationError` → 400 with field-level `details` array
- `ConflictError` → 409 with domain-specific `code` (e.g., `USER_HAS_TASKS`, `INVALID_TRANSITION`, `CONCURRENT_MODIFICATION`)
- Prisma P2002 (unique constraint) → 409 `DUPLICATE_{FIELD}`
- Prisma P2003 (FK constraint) → 409 `FOREIGN_KEY_CONSTRAINT`
- Unhandled → 500 `INTERNAL_ERROR`
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
