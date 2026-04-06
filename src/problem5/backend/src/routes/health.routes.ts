import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { redisClient } from '../lib/redis.js';

const router = Router();

router.get('/', async (_req, res) => {
  const [dbResult, redisResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    redisClient.ping(),
  ]);

  const checks = {
    database: dbResult.status === 'fulfilled' ? 'ok' : 'error',
    redis: redisResult.status === 'fulfilled' ? 'ok' : 'error',
  } as const;

  const status = checks.database === 'ok' && checks.redis === 'ok' ? 'ok' : 'degraded';

  res.status(200).json({
    status,
    checks,
    uptime: process.uptime(),
  });
});

export { router as healthRouter };
