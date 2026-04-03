import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});

redisClient.on('error', (err: Error) => {
  // Log but don't crash — Redis unavailability is handled gracefully per CACHE-04
  console.error('[redis] connection error:', err.message);
});
