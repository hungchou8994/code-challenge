import pino from 'pino';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/client/client.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { leaderboardService, LEADERBOARD_CACHE_KEY } from './leaderboard.service.js';
import { redisClient } from '../lib/redis.js';
import { sseManager } from '../lib/sse-manager.js';
import { VALID_TRANSITIONS } from '../../../shared/types/task.js';
import type { CreateTaskBody, UpdateTaskBody, TaskQueryParams } from '../schemas/task.schemas.js';

const logger = pino({ name: 'task-service' });

export const taskService = {
  async getAll(query: TaskQueryParams) {
    const where: Prisma.TaskWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    if (query.sortBy === 'priority') {
      // Use raw SQL for semantic priority ordering: HIGH(3) > MEDIUM(2) > LOW(1)
      // This avoids cross-page lexicographic sort bug (BUG-01)
      const dir = Prisma.raw(query.sortOrder === 'asc' ? 'ASC' : 'DESC');
      const conditions: Prisma.Sql[] = [];
      if (query.status) conditions.push(Prisma.sql`t.status = ${query.status}`);
      if (query.assigneeId) conditions.push(Prisma.sql`t."assigneeId" = ${query.assigneeId}`);
      const whereClause =
        conditions.length > 0
          ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
          : Prisma.sql``;

      const [total, tasks] = await Promise.all([
        prisma.task.count({ where }),
        prisma.$queryRaw<
          Array<{
            id: string;
            title: string;
            description: string | null;
            status: string;
            priority: string;
            assigneeId: string | null;
            dueDate: Date;
            createdAt: Date;
            updatedAt: Date;
            assignee_id: string | null;
            assignee_name: string | null;
            assignee_email: string | null;
          }>
        >`
          SELECT t.id, t.title, t.description, t.status, t.priority,
                 t."assigneeId", t."dueDate", t."createdAt", t."updatedAt",
                 u.id AS assignee_id, u.name AS assignee_name, u.email AS assignee_email
          FROM "Task" t
          LEFT JOIN "User" u ON t."assigneeId" = u.id
          ${whereClause}
          ORDER BY CASE t.priority
            WHEN 'HIGH' THEN 3
            WHEN 'MEDIUM' THEN 2
            WHEN 'LOW' THEN 1
            ELSE 0
          END ${dir}
          LIMIT ${limit} OFFSET ${skip}
        `,
      ]);

      const mappedTasks = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status as Prisma.TaskWhereInput['status'],
        priority: t.priority as Prisma.TaskWhereInput['priority'],
        assigneeId: t.assigneeId,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        assignee: t.assignee_id
          ? { id: t.assignee_id, name: t.assignee_name!, email: t.assignee_email! }
          : null,
      }));

      return { data: mappedTasks, total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    let orderBy: Prisma.TaskOrderByWithRelationInput | Prisma.TaskOrderByWithRelationInput[] = {
      createdAt: 'desc',
    };
    if (query.sortBy) {
      const order = query.sortOrder || 'asc';
      switch (query.sortBy) {
        case 'dueDate':
        case 'date':
          orderBy = { dueDate: order };
          break;
        case 'assignee':
          orderBy = { assignee: { name: order } };
          break;
        default:
          orderBy = { createdAt: order };
      }
    }

    const [total, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: { assignee: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    return {
      data: tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async getById(id: string) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
    if (!task) throw new NotFoundError('Task', id);
    return task;
  },

  async create(data: CreateTaskBody) {
    if (data.assigneeId) {
      const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
      if (!assignee) throw new NotFoundError('User', data.assigneeId);
    }

    return prisma.task.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        status: data.status || 'TODO',
        priority: data.priority,
        assigneeId: data.assigneeId ?? null,
        dueDate: new Date(data.dueDate),
      },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
  },

  async update(id: string, data: UpdateTaskBody) {
    const existing = await taskService.getById(id);

    if (data.status && data.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status as keyof typeof VALID_TRANSITIONS] || [];
      if (!allowed.includes(data.status as (typeof allowed)[number])) {
        throw new ConflictError(
          'INVALID_TRANSITION',
          `Cannot transition from ${existing.status} to ${data.status}. Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}`
        );
      }

      if (data.status === 'DONE') {
        const currentAssigneeId =
          data.assigneeId !== undefined ? data.assigneeId : existing.assigneeId;
        if (!currentAssigneeId) {
          throw new ConflictError(
            'UNASSIGNED_COMPLETION',
            'Cannot mark task as DONE: task must be assigned to a user first'
          );
        }
      }
    }

    // Validate that the new assigneeId (if provided) refers to an existing user
    if (data.assigneeId != null) {
      const assignee = await prisma.user.findUnique({ where: { id: data.assigneeId } });
      if (!assignee) throw new NotFoundError('User', data.assigneeId);
    }

    const updateData: Prisma.TaskUncheckedUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);

    let updated: Awaited<ReturnType<typeof prisma.task.findUnique>> = null;

    if (data.status && data.status !== existing.status) {
      // Use a conditional updateMany to prevent double-scoring when two concurrent
      // requests both try to transition the same task (e.g. both mark IN_PROGRESS → DONE).
      // The WHERE { status: existing.status } guard means only the first writer wins.
      // BUG-02: wrap updateMany + scoreTask in a single outer transaction for atomicity.
      await prisma.$transaction(async (tx) => {
        const result = await tx.task.updateMany({
          where: { id, status: existing.status },
          data: updateData,
        });
        if (result.count === 0) {
          throw new ConflictError(
            'CONCURRENT_MODIFICATION',
            'Task was modified by a concurrent request. Please refresh and retry.'
          );
        }
        // Re-fetch inside tx to get the latest state with assignee relation
        const updatedInTx = await tx.task.findUnique({
          where: { id },
          include: { assignee: { select: { id: true, name: true, email: true } } },
        });
        if (!updatedInTx) throw new NotFoundError('Task', id);
        updated = updatedInTx;

        // Score the task inside the same transaction when transitioning to DONE (D-04)
        if (
          data.status === 'DONE' &&
          existing.status !== 'DONE' &&
          updatedInTx.assigneeId
        ) {
          await leaderboardService.scoreTask(
            {
              id: updatedInTx.id,
              assigneeId: updatedInTx.assigneeId,
              priority: updatedInTx.priority,
              dueDate: updatedInTx.dueDate,
            },
            tx
          );
        }
      });
    } else {
      updated = await prisma.task.update({
        where: { id },
        data: updateData,
        include: { assignee: { select: { id: true, name: true, email: true } } },
      });
    }

    // Side effects OUTSIDE the transaction (D-04): cache invalidation + SSE broadcast
    if (data.status === 'DONE' && existing.status !== 'DONE' && updated?.assigneeId) {
      try {
        await redisClient.del(LEADERBOARD_CACHE_KEY);
      } catch (err) {
        logger.warn({ err }, 'Redis cache invalidation failed');
      }
      const updatedRankings = await leaderboardService.getRankings();
      sseManager.broadcast(updatedRankings);
    }

    return updated;
  },

  async delete(id: string, force = false) {
    const task = await taskService.getById(id);

    if (task.status === 'DONE' && !force) {
      throw new ConflictError(
        'TASK_COMPLETED',
        'Cannot delete a completed task. Completed tasks are part of the score history. Use force=true to override.'
      );
    }

    if (task.status === 'DONE' && force) {
      await prisma.$transaction(async (tx) => {
        // 1. Find the ScoreEvent to determine which user was actually scored
        //    (task may have been reassigned after completion, so task.assigneeId may differ)
        const scoreEvent = await tx.scoreEvent.findFirst({ where: { taskId: id } });
        const scoredUserId = scoreEvent?.userId ?? null;

        // 2. Delete the ScoreEvent for this task
        await tx.scoreEvent.deleteMany({ where: { taskId: id } });

        // 3. Delete the task itself
        await tx.task.delete({ where: { id } });

        // 4. Recalculate ProductivityScore from remaining ScoreEvents (source of truth)
        if (scoredUserId) {
          const agg = await tx.scoreEvent.aggregate({
            where: { userId: scoredUserId },
            _sum: { totalAwarded: true },
            _count: { id: true },
          });

          const newTotal = agg._sum.totalAwarded ?? 0;
          const newCount = agg._count.id ?? 0;

          await tx.productivityScore.upsert({
            where: { userId: scoredUserId },
            create: {
              userId: scoredUserId,
              totalScore: newTotal,
              tasksCompleted: newCount,
            },
            update: {
              totalScore: newTotal,
              tasksCompleted: newCount,
            },
          });
        }
      });

      // Invalidate leaderboard cache and broadcast fresh rankings
      try {
        await redisClient.del(LEADERBOARD_CACHE_KEY);
      } catch (err) {
        logger.warn({ err }, 'Redis cache invalidation failed');
      }
      const updatedRankings = await leaderboardService.getRankings();
      sseManager.broadcast(updatedRankings);

      return;
    }

    await prisma.task.delete({ where: { id } });
  },
};
