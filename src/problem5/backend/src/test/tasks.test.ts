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

// Mock sseManager to prevent actual SSE writes during task update tests (SSE-03)
vi.mock('../lib/sse-manager', () => ({
  sseManager: { broadcast: vi.fn() },
}));

import { prisma } from '../lib/prisma.js';
import { redisClient } from '../lib/redis.js';

const mockPrisma = prisma as any;
const mockRedis = redisClient as any;

const sampleUser = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Alice Smith',
  email: 'alice@example.com',
  department: 'Engineering',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const futureDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days from now
const pastDueDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days ago

const sampleTask = {
  id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  title: 'Build feature',
  description: 'Implement the new feature',
  status: 'TODO',
  priority: 'MEDIUM',
  assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  dueDate: new Date(futureDueDate),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  assignee: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', name: 'Alice Smith', email: 'alice@example.com' },
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock for leaderboard getRankings() called after DONE transition (SSE-03)
  // Prevents "Cannot read properties of undefined (reading 'map')" in task.service
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockRedis.get.mockResolvedValue(null); // cache miss so it falls through to DB
});

describe('GET /api/tasks', () => {
  it('returns list of tasks', async () => {
    mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Build feature');
  });

  it('filters tasks by status', async () => {
    mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

    const res = await request(app).get('/api/tasks?status=TODO');

    expect(res.status).toBe(200);
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'TODO' }),
      })
    );
  });

  it('filters tasks by assigneeId', async () => {
    mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

    const res = await request(app).get('/api/tasks?assigneeId=user-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeId: 'user-1' }),
      })
    );
  });
});

describe('GET /api/tasks/:id', () => {
  it('returns task by id', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(sampleTask);

    const res = await request(app).get('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('returns 404 when task not found', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/tasks/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/tasks', () => {
  it('creates a task and returns 201', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(sampleUser);
    mockPrisma.task.create.mockResolvedValue(sampleTask);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Build feature',
        priority: 'MEDIUM',
        assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        dueDate: futureDueDate,
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Build feature');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ priority: 'MEDIUM', dueDate: futureDueDate });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when priority is invalid', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', priority: 'URGENT', dueDate: futureDueDate });

    expect(res.status).toBe(400);
  });

  it('returns 404 when assignee does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Build feature',
        priority: 'MEDIUM',
        assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        dueDate: futureDueDate,
      });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/tasks/:id — status transitions', () => {
  it('allows TODO → IN_PROGRESS transition', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    mockPrisma.task.findUnique.mockResolvedValue(sampleTask);
    mockPrisma.task.update.mockResolvedValue(inProgressTask);

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('rejects TODO → DONE transition (invalid)', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(sampleTask);

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects backward transitions IN_PROGRESS → TODO', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'TODO' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects DONE → any transition (terminal state)', async () => {
    const doneTask = { ...sampleTask, status: 'DONE' };
    mockPrisma.task.findUnique.mockResolvedValue(doneTask);

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(409);
  });

  it('rejects DONE transition for unassigned task', async () => {
    const unassignedInProgressTask = { ...sampleTask, status: 'IN_PROGRESS', assigneeId: null, assignee: null };
    mockPrisma.task.findUnique.mockResolvedValue(unassignedInProgressTask);

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNASSIGNED_COMPLETION');
  });

  it('scores task when transitioning to DONE', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);
    mockPrisma.task.update.mockResolvedValue(doneTask);
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    expect(res.status).toBe(200);
    expect(mockPrisma.scoreEvent.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.productivityScore.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/tasks/:id — scoring logic', () => {
  it('awards MEDIUM base points (10) for on-time completion', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS', priority: 'MEDIUM' };
    const doneTask = { ...inProgressTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);
    mockPrisma.task.update.mockResolvedValue(doneTask);
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    // Due date is future so it's EARLY — should add EARLY_BONUS (+5) to MEDIUM base (10) = 15
    const scoreCall = mockPrisma.scoreEvent.create.mock.calls[0][0];
    expect(scoreCall.data.points).toBe(10); // MEDIUM base
    expect(scoreCall.data.bonus).toBe(5);   // early bonus
    expect(scoreCall.data.totalAwarded).toBe(15); // 10 + 5
  });

  it('awards HIGH base points (20) for high priority task', async () => {
    const inProgressHighTask = { ...sampleTask, status: 'IN_PROGRESS', priority: 'HIGH' };
    const doneHighTask = { ...inProgressHighTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressHighTask);
    mockPrisma.task.update.mockResolvedValue(doneHighTask);
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    const scoreCall = mockPrisma.scoreEvent.create.mock.calls[0][0];
    expect(scoreCall.data.points).toBe(20); // HIGH base
  });

  it('applies late penalty (-3) for overdue task completion', async () => {
    const inProgressLateTask = {
      ...sampleTask,
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueDate: new Date(pastDueDate), // past due date
    };
    const doneLateTask = { ...inProgressLateTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressLateTask);
    mockPrisma.task.update.mockResolvedValue(doneLateTask);
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    const scoreCall = mockPrisma.scoreEvent.create.mock.calls[0][0];
    expect(scoreCall.data.points).toBe(10);   // MEDIUM base
    expect(scoreCall.data.bonus).toBe(0);     // no early bonus
    expect(scoreCall.data.penalty).toBe(3);   // late penalty stored as positive
    expect(scoreCall.data.totalAwarded).toBe(7); // 10 - 3
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('deletes task and returns 204', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(sampleTask);
    mockPrisma.task.delete.mockResolvedValue(sampleTask);

    const res = await request(app).delete('/api/tasks/task-1');

    expect(res.status).toBe(204);
  });

  it('returns 404 when task not found', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/tasks/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/tasks/:id — cache invalidation', () => {
  it('Test E (task→DONE): calls redisClient.del with leaderboard:rankings', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);
    mockPrisma.task.update.mockResolvedValue(doneTask);
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    // Cache must be invalidated on DONE transition
    expect(mockRedis.del).toHaveBeenCalledWith('leaderboard:rankings');
  });

  it('Test F (task→IN_PROGRESS): does NOT call redisClient.del', async () => {
    const todoTask = { ...sampleTask, status: 'TODO' };
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    mockPrisma.task.findUnique.mockResolvedValue(todoTask);
    mockPrisma.task.update.mockResolvedValue(inProgressTask);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'IN_PROGRESS' });

    // Cache should NOT be invalidated for non-DONE transitions
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/:id — cache invalidation', () => {
  it('Test G (delete DONE task): calls redisClient.del with leaderboard:rankings', async () => {
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(doneTask);
    mockPrisma.task.delete.mockResolvedValue(doneTask);
    mockPrisma.scoreEvent.aggregate.mockResolvedValue({ _sum: { totalAwarded: 20 }, _count: { id: 1 } });
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app).delete('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

    // Cache must be invalidated after deleting a DONE task
    expect(mockRedis.del).toHaveBeenCalledWith('leaderboard:rankings');
  });

  it('Test H (delete TODO task): does NOT call redisClient.del', async () => {
    const todoTask = { ...sampleTask, status: 'TODO' };
    mockPrisma.task.findUnique.mockResolvedValue(todoTask);
    mockPrisma.task.delete.mockResolvedValue(todoTask);

    await request(app).delete('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

    // Cache should NOT be invalidated for non-DONE task deletion
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});
