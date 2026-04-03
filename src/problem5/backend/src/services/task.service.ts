import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { leaderboardService, LEADERBOARD_CACHE_KEY } from './leaderboard.service.js';
import { redisClient } from '../lib/redis.js';
import { sseManager } from '../lib/sse-manager.js';
import type { CreateTaskBody, UpdateTaskBody } from '../schemas/task.schemas.js';

// Valid transitions per D-13: TODO -> IN_PROGRESS -> DONE only
const VALID_TRANSITIONS: Record<string, string[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
};

interface TaskQueryParams {
  status?: string;
  assigneeId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const taskService = {
  async getAll(query: TaskQueryParams) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.assigneeId) where.assigneeId = query.assigneeId;

    // Build orderBy based on sortBy parameter
    let orderBy: any = { createdAt: 'desc' }; // default sort
    if (query.sortBy) {
      const order = query.sortOrder || 'asc';
      switch (query.sortBy) {
        case 'priority':
          // Custom priority ordering handled after query
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

    const tasks = await prisma.task.findMany({
      where,
      orderBy,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });

    // For priority sorting, apply correct order (HIGH > MEDIUM > LOW)
    if (query.sortBy === 'priority') {
      const priorityOrder: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const sortDir = query.sortOrder === 'asc' ? 1 : -1;
      tasks.sort((a, b) => ((priorityOrder[a.priority] || 0) - (priorityOrder[b.priority] || 0)) * sortDir);
    }

    return tasks;
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
    // Verify assignee exists if provided
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

    // Handle status transition validation per D-13
    if (data.status && data.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(data.status)) {
        throw new ConflictError(
          'INVALID_TRANSITION',
          `Cannot transition from ${existing.status} to ${data.status}. Allowed transitions: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}`
        );
      }

      // Per D-15: unassigned tasks cannot transition to DONE
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

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate);

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });

    // Per D-14: Trigger scoring synchronously if task just moved to DONE
    if (data.status === 'DONE' && existing.status !== 'DONE' && updated.assigneeId) {
      await leaderboardService.scoreTask({
        id: updated.id,
        assigneeId: updated.assigneeId,
        priority: updated.priority,
        dueDate: updated.dueDate,
      });
      // Invalidate leaderboard cache after score update (CACHE-03)
      try { await redisClient.del(LEADERBOARD_CACHE_KEY); } catch { /* Redis unavailable */ }
      // SSE-03: broadcast updated rankings to all connected clients
      const updatedRankings = await leaderboardService.getRankings();
      sseManager.broadcast(updatedRankings);
    }

    return updated;
  },

  async delete(id: string) {
    const task = await taskService.getById(id);

    // If task is DONE it has score_events attached.
    // CASCADE will remove them, so we must recalculate the assignee's
    // productivity_score afterwards to keep the leaderboard consistent.
    const affectedUserId = task.status === 'DONE' ? task.assigneeId : null;

    await prisma.task.delete({ where: { id } });

    if (affectedUserId) {
      // Sum remaining score_events for that user after the cascade delete
      const agg = await prisma.scoreEvent.aggregate({
        where: { userId: affectedUserId },
        _sum: { totalAwarded: true },
        _count: { id: true },
      });

      const newTotal = agg._sum.totalAwarded ?? 0;
      const newCount = agg._count.id ?? 0;

      await prisma.productivityScore.upsert({
        where: { userId: affectedUserId },
        create: {
          userId: affectedUserId,
          totalScore: newTotal,
          tasksCompleted: newCount,
        },
        update: {
          totalScore: newTotal,
          tasksCompleted: newCount,
        },
      });
      // Invalidate leaderboard cache after score recalculation (CACHE-03)
      try { await redisClient.del(LEADERBOARD_CACHE_KEY); } catch { /* Redis unavailable */ }
    }
  },
};
