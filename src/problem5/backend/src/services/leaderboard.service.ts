import { prisma } from '../lib/prisma.js';
import { PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY } from '../../../shared/constants/scoring.js';
import type { TaskPriority } from '../../../shared/types/task.js';
import { redisClient } from '../lib/redis.js';

export const LEADERBOARD_CACHE_KEY = 'leaderboard:rankings';
const CACHE_TTL = 60;

export const leaderboardService = {
  async scoreTask(task: {
    id: string;
    assigneeId: string;
    priority: string;
    dueDate: Date;
  }) {
    const now = new Date();
    const priority = task.priority as TaskPriority;
    const basePoints = PRIORITY_POINTS[priority];

    const isEarly = now < task.dueDate;
    const isLate = now > task.dueDate;

    const bonus = isEarly ? EARLY_BONUS : 0;
    const penalty = isLate ? Math.abs(LATE_PENALTY) : 0;
    const totalAwarded = basePoints + bonus - penalty;

    await prisma.$transaction(async (tx) => {
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
    });
  },

  async getRankings() {
    try {
      const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
      if (cached !== null) {
        return JSON.parse(cached);
      }
    } catch {
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
    } catch {
    }

    return rankings;
  },
};
