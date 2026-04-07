import pino from 'pino';
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client/client.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import { leaderboardService, LEADERBOARD_CACHE_KEY } from './leaderboard.service.js';
import { redisClient } from '../lib/redis.js';
import { sseManager } from '../lib/sse-manager.js';
import type { CreateUserBody, UpdateUserBody, UserQueryParams } from '../schemas/user.schemas.js';

const logger = pino({ name: 'user-service' });

export const userService = {
  async getAll(query: UserQueryParams = {}) {
    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }
    if (query.department) {
      where.department = query.department;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async search(q?: string): Promise<Array<{ id: string; name: string; email: string }>> {
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true, email: true },
    });

    return users;
  },

  async getById(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User', id);
    return user;
  },

  async create(data: CreateUserBody) {
    return prisma.user.create({ data });
  },

  async update(id: string, data: UpdateUserBody) {
    await userService.getById(id);
    const updated = await prisma.user.update({
      where: { id },
      data,
    });
    try {
      await redisClient.del(LEADERBOARD_CACHE_KEY);
    } catch (err) {
      logger.warn({ err }, 'Redis cache invalidation failed');
    }
    return updated;
  },

  async delete(id: string) {
    await userService.getById(id);

    const activeTaskCount = await prisma.task.count({
      where: { assigneeId: id, status: { in: ['TODO', 'IN_PROGRESS'] } },
    });
    if (activeTaskCount > 0) {
      throw new ConflictError(
        'USER_HAS_TASKS',
        `Cannot delete user: ${activeTaskCount} active task(s) are still assigned. Reassign or delete tasks first.`
      );
    }

    // Null-out assigneeId on completed tasks so they remain as historical records
    await prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { assigneeId: id, status: 'DONE' },
        data: { assigneeId: null },
      });
      await tx.user.delete({ where: { id } });
    });

    try {
      await redisClient.del(LEADERBOARD_CACHE_KEY);
    } catch (err) {
      logger.warn({ err }, 'Redis cache invalidation failed');
    }
    const updatedRankings = await leaderboardService.getRankings();
    sseManager.broadcast(updatedRankings);
  },
};
