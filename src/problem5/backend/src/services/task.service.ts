import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { leaderboardService, LEADERBOARD_CACHE_KEY } from './leaderboard.service.js';
import { redisClient } from '../lib/redis.js';
import { sseManager } from '../lib/sse-manager.js';
import type { CreateTaskBody, UpdateTaskBody, TaskQueryParams } from '../schemas/task.schemas.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
};

export const taskService = {
  async getAll(query: TaskQueryParams) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    let orderBy: any = { createdAt: 'desc' };
    if (query.sortBy) {
      const order = query.sortOrder || 'asc';
      switch (query.sortBy) {
        case 'priority':
          orderBy = { priority: order };
          break;
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

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

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

    if (query.sortBy === 'priority') {
      const priorityOrder: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const sortDir = query.sortOrder === 'asc' ? 1 : -1;
      tasks.sort((a, b) => ((priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0)) * sortDir);
    }

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
      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(data.status)) {
        throw new ConflictError(
          'INVALID_TRANSITION',
          `Cannot transition from ${existing.status} to ${data.status}. Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}`
        );
      }

      if (data.status === 'DONE') {
        const currentAssigneeId = data.assigneeId !== undefined ? data.assigneeId : existing.assigneeId;
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

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);

    let updated: any;

    if (data.status && data.status !== existing.status) {
      // Use a conditional updateMany to prevent double-scoring when two concurrent
      // requests both try to transition the same task (e.g. both mark IN_PROGRESS → DONE).
      // The WHERE { status: existing.status } guard means only the first writer wins.
      const result = await prisma.task.updateMany({
        where: { id, status: existing.status },
        data: updateData,
      });
      if (result.count === 0) {
        throw new ConflictError(
          'CONCURRENT_MODIFICATION',
          'Task was modified by a concurrent request. Please refresh and retry.'
        );
      }
      updated = await prisma.task.findUnique({
        where: { id },
        include: { assignee: { select: { id: true, name: true, email: true } } },
      });
    } else {
      updated = await prisma.task.update({
        where: { id },
        data: updateData,
        include: { assignee: { select: { id: true, name: true, email: true } } },
      });
    }

    if (data.status === 'DONE' && existing.status !== 'DONE' && updated.assigneeId) {
      await leaderboardService.scoreTask({
        id: updated.id,
        assigneeId: updated.assigneeId,
        priority: updated.priority,
        dueDate: updated.dueDate,
      });
      try { await redisClient.del(LEADERBOARD_CACHE_KEY); } catch {}
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

      // 4. Invalidate leaderboard cache and broadcast fresh rankings
      try { await redisClient.del(LEADERBOARD_CACHE_KEY); } catch {}
      const updatedRankings = await leaderboardService.getRankings();
      sseManager.broadcast(updatedRankings);

      return;
    }

    await prisma.task.delete({ where: { id } });
  },
};
