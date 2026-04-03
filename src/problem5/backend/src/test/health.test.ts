import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// Mock prisma and redis for health check tests
vi.mock('../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('../lib/redis', () => ({
  redisClient: {
    ping: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma.js';
import { redisClient } from '../lib/redis.js';

const mockPrisma = prisma as any;
const mockRedis = redisClient as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/health', () => {
  it('returns 200 with status ok when db and redis are healthy', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    mockRedis.ping.mockResolvedValue('PONG');

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.checks.redis).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns 200 with status degraded when redis is down', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    mockRedis.ping.mockRejectedValue(new Error('Redis connection refused'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200); // always 200
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.checks.redis).toBe('error');
  });

  it('returns 200 with status degraded when database is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB connection failed'));
    mockRedis.ping.mockResolvedValue('PONG');

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200); // always 200
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('error');
    expect(res.body.checks.redis).toBe('ok');
  });

  it('returns 200 with status degraded when both are down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB connection failed'));
    mockRedis.ping.mockRejectedValue(new Error('Redis connection refused'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200); // always 200
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('error');
    expect(res.body.checks.redis).toBe('error');
  });

  it('response body has uptime as a number', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    mockRedis.ping.mockResolvedValue('PONG');

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});
