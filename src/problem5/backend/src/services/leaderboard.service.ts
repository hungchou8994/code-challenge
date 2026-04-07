import pino from 'pino';
import { prisma } from '../lib/prisma.js';
import { PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY } from '../../../shared/constants/scoring.js';
import type { TaskPriority } from '../../../shared/types/task.js';
import { redisClient } from '../lib/redis.js';

const logger = pino({ name: 'leaderboard-service' });

export const LEADERBOARD_CACHE_KEY = 'leaderboard:rankings';
const CACHE_TTL = 60;

type PrismaTxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export const leaderboardService = {
  async scoreTask(
    task: {
      id: string;
      assigneeId: string;
      priority: string;
      dueDate: Date;
    },
    tx?: PrismaTxClient
  ) {
    const now = new Date();
    const priority = task.priority as TaskPriority;
    const basePoints = PRIORITY_POINTS[priority];

    // Compare date parts only (strip time) so completing any time on the due date
    // counts as "on time" — not early, not late.
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(task.dueDate.getFullYear(), task.dueDate.getMonth(), task.dueDate.getDate());
    const isEarly = nowDay < dueDay;
    const isLate = nowDay > dueDay;

    const bonus = isEarly ? EARLY_BONUS : 0;
    const penalty = isLate ? Math.abs(LATE_PENALTY) : 0;
    const totalAwarded = basePoints + bonus - penalty;

    if (tx) {
      // Called from within an outer transaction — use tx directly
      await tx.scoreEvent.create({
        data: {
          userId: task.assigneeId,
          taskId: task.id,
          points: basePoints,
          bonus,
          penalty,
          totalAwarded,
        },
      });

      await tx.productivityScore.upsert({
        where: { userId: task.assigneeId },
        create: {
          userId: task.assigneeId,
          totalScore: totalAwarded,
          tasksCompleted: 1,
        },
        update: {
          totalScore: { increment: totalAwarded },
          tasksCompleted: { increment: 1 },
        },
      });
    } else {
      // Standalone call — wrap in own transaction (backward compatible)
      await prisma.$transaction(async (innerTx) => {
        await innerTx.scoreEvent.create({
          data: {
            userId: task.assigneeId,
            taskId: task.id,
            points: basePoints,
            bonus,
            penalty,
            totalAwarded,
          },
        });

        await innerTx.productivityScore.upsert({
          where: { userId: task.assigneeId },
          create: {
            userId: task.assigneeId,
            totalScore: totalAwarded,
            tasksCompleted: 1,
          },
          update: {
            totalScore: { increment: totalAwarded },
            tasksCompleted: { increment: 1 },
          },
        });
      });
    }
  },

  async getRankings() {
    try {
      const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
      if (cached !== null) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn({ err }, 'Redis cache read failed');
    }

    const users = await prisma.user.findMany({
      include: {
        productivityScore: true,
      },
    });

    const rankings = users
      .map((user) => ({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userDepartment: user.department,
        totalScore: user.productivityScore?.totalScore ?? 0,
        tasksCompleted: user.productivityScore?.tasksCompleted ?? 0,
      }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }));

    try {
      await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', CACHE_TTL);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write failed');
    }

    return rankings;
  },
};
