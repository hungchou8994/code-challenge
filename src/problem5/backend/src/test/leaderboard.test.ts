import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

// Mock redis BEFORE other imports to ensure module isolation
vi.mock('../lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import { prisma } from '../lib/prisma.js';
import { redisClient } from '../lib/redis.js';

const mockPrisma = prisma as any;
const mockRedis = redisClient as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/leaderboard', () => {
  it('returns ranked leaderboard entries sorted by score', async () => {
    mockRedis.get.mockResolvedValue(null); // cache miss
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        department: 'Engineering',
        productivityScore: { totalScore: 30, tasksCompleted: 2 },
      },
      {
        id: 'user-2',
        name: 'Bob',
        email: 'bob@example.com',
        department: 'Product',
        productivityScore: { totalScore: 50, tasksCompleted: 3 },
      },
      {
        id: 'user-3',
        name: 'Charlie',
        email: 'charlie@example.com',
        department: 'Design',
        productivityScore: null, // no completed tasks
      },
    ]);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);

    // Should be sorted by score desc
    expect(res.body[0].userName).toBe('Bob');
    expect(res.body[0].totalScore).toBe(50);
    expect(res.body[0].rank).toBe(1);

    expect(res.body[1].userName).toBe('Alice');
    expect(res.body[1].totalScore).toBe(30);
    expect(res.body[1].rank).toBe(2);

    expect(res.body[2].userName).toBe('Charlie');
    expect(res.body[2].totalScore).toBe(0);
    expect(res.body[2].rank).toBe(3);
  });

  it('returns empty array when no users', async () => {
    mockRedis.get.mockResolvedValue(null); // cache miss
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns correct shape for each entry', async () => {
    mockRedis.get.mockResolvedValue(null); // cache miss
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        department: 'Engineering',
        productivityScore: { totalScore: 15, tasksCompleted: 1 },
      },
    ]);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);
    const entry = res.body[0];
    expect(entry).toHaveProperty('rank');
    expect(entry).toHaveProperty('userId');
    expect(entry).toHaveProperty('userName');
    expect(entry).toHaveProperty('userEmail');
    expect(entry).toHaveProperty('userDepartment');
    expect(entry).toHaveProperty('totalScore');
    expect(entry).toHaveProperty('tasksCompleted');
    expect(entry.tasksCompleted).toBe(1);
  });
});

// Health check tests are in health.test.ts — this file focuses on leaderboard endpoints

describe('GET /api/leaderboard — cache behavior', () => {
  const cachedRankings = [
    {
      rank: 1,
      userId: 'user-2',
      userName: 'Bob',
      userEmail: 'bob@example.com',
      userDepartment: 'Product',
      totalScore: 50,
      tasksCompleted: 3,
    },
    {
      rank: 2,
      userId: 'user-1',
      userName: 'Alice',
      userEmail: 'alice@example.com',
      userDepartment: 'Engineering',
      totalScore: 30,
      tasksCompleted: 2,
    },
  ];

  it('Test A (cache HIT): returns cached data without querying DB', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedRankings));

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedRankings);
    // DB should NOT be called on cache hit
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('Test B (cache MISS): queries DB and writes to cache with TTL 60', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        department: 'Engineering',
        productivityScore: { totalScore: 30, tasksCompleted: 2 },
      },
    ]);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(200);
    // DB should be called on cache miss
    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
    // Redis set should be called with correct key, serialized value, and TTL of 60
    expect(mockRedis.set).toHaveBeenCalledWith(
      'leaderboard:rankings',
      expect.any(String),
      'EX',
      60
    );
    // Verify the stored value is valid JSON
    const storedValue = mockRedis.set.mock.calls[0][1];
    expect(() => JSON.parse(storedValue)).not.toThrow();
  });

  it('Test C (Redis DOWN on get): falls back to DB, returns correct data (no error)', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        department: 'Engineering',
        productivityScore: { totalScore: 30, tasksCompleted: 2 },
      },
    ]);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).get('/api/leaderboard');

    // Should still return 200 — graceful degradation
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userName).toBe('Alice');
    // DB should be called since Redis was unavailable
    expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('Test D (Redis DOWN on set): returns DB data without error even if cache write fails', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        department: 'Engineering',
        productivityScore: { totalScore: 30, tasksCompleted: 2 },
      },
    ]);
    mockRedis.set.mockRejectedValue(new Error('Redis connection refused'));

    const res = await request(app).get('/api/leaderboard');

    // Should still return 200 — graceful degradation
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userName).toBe('Alice');
  });
});
