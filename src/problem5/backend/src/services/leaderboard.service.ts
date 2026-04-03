import { prisma } from '../lib/prisma.js';
import { PRIORITY_POINTS, EARLY_BONUS, LATE_PENALTY } from '../../../shared/constants/scoring.js';
import type { TaskPriority } from '../../../shared/types/task.js';
import { redisClient } from '../lib/redis.js';

export const LEADERBOARD_CACHE_KEY = 'leaderboard:rankings';
const CACHE_TTL = 60; // seconds

export const leaderboardService = {
  /**
   * Calculate and persist score when a task transitions to DONE.
   * Per D-14: scoring happens synchronously in the same request.
   * Per D-16: LOW=5, MEDIUM=10, HIGH=20 base. Early +5, Late -3.
   */
  async scoreTask(task: {
    id: string;
    assigneeId: string;
    priority: string;
    dueDate: Date;
  }) {
    const now = new Date();
    const priority = task.priority as TaskPriority;
    const basePoints = PRIORITY_POINTS[priority];

    // Early = completed before dueDate, Late = completed after dueDate
    const isEarly = now < task.dueDate;
    const isLate = now > task.dueDate;

    const bonus = isEarly ? EARLY_BONUS : 0;
    const penalty = isLate ? Math.abs(LATE_PENALTY) : 0; // Store as positive in penalty field
    const totalAwarded = basePoints + (isEarly ? EARLY_BONUS : 0) + (isLate ? LATE_PENALTY : 0);

    // Create score event log entry
    await prisma.scoreEvent.create({
      data: {
        userId: task.assigneeId,
        taskId: task.id,
        points: basePoints,
        bonus,
        penalty,
        totalAwarded,
      },
    });

    // Upsert cached total score
    await prisma.productivityScore.upsert({
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
  },

  /**
   * Get leaderboard rankings sorted by totalScore descending.
   * Returns all users with their scores (users with no completed tasks get score 0).
   * Cache-aside: tries Redis first (60s TTL), falls back to DB on miss or Redis error.
   */
  async getRankings() {
    // 1. Try cache first
    try {
      const cached = await redisClient.get(LEADERBOARD_CACHE_KEY);
      if (cached !== null) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis unavailable — fall through to DB (CACHE-04 graceful degradation)
    }

    // 2. Cache miss — query DB
    const users = await prisma.user.findMany({
      include: {
        productivityScore: true,
      },
    });

    // Map to LeaderboardEntry format with rank
    // Users without a productivityScore get 0 score and 0 tasks
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

    // 3. Write to cache (ignore errors — Redis may be unavailable)
    try {
      await redisClient.set(LEADERBOARD_CACHE_KEY, JSON.stringify(rankings), 'EX', CACHE_TTL);
    } catch {
      // Redis unavailable — return fresh DB data (CACHE-04 graceful degradation)
    }

    return rankings;
  },
};
