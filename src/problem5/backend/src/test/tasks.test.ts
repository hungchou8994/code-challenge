import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

vi.mock('../lib/redis', () => ({
  redisClient: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock('../lib/sse-manager', () => ({
  sseManager: { broadcast: vi.fn() },
}))

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

const futureDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
const pastDueDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString();

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
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.task.count.mockResolvedValue(0);
  mockRedis.get.mockResolvedValue(null);
});

describe('GET /api/tasks', () => {
  it('returns paginated list of tasks', async () => {
    mockPrisma.task.count.mockResolvedValue(1);
    mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

    const res = await request(app).get('/api/tasks');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Build feature');
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it('returns 400 for invalid status query param', async () => {
    const res = await request(app).get('/api/tasks?status=INVALID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('filters tasks by status', async () => {
    mockPrisma.task.count.mockResolvedValue(1);
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
    mockPrisma.task.count.mockResolvedValue(1);
    mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

    const res = await request(app).get(`/api/tasks?assigneeId=${sampleTask.assigneeId}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigneeId: sampleTask.assigneeId }),
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
    mockPrisma.task.findUnique
      .mockResolvedValueOnce(sampleTask)       // getById
      .mockResolvedValueOnce(inProgressTask);  // re-fetch inside tx after updateMany
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

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

  it('returns 409 when task was concurrently modified', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);
    mockPrisma.task.updateMany.mockResolvedValue({ count: 0 }); // concurrent write won the race
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONCURRENT_MODIFICATION');
  });

  it('scores task when transitioning to DONE', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique
      .mockResolvedValueOnce(inProgressTask)  // getById
      .mockResolvedValueOnce(doneTask);        // after updateMany
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
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
    mockPrisma.task.findUnique
      .mockResolvedValueOnce(inProgressTask)
      .mockResolvedValueOnce(doneTask);
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    const scoreCall = mockPrisma.scoreEvent.create.mock.calls[0][0];
    expect(scoreCall.data.points).toBe(10);
    expect(scoreCall.data.bonus).toBe(5);
    expect(scoreCall.data.totalAwarded).toBe(15);
  });

  it('awards HIGH base points (20) for high priority task', async () => {
    const inProgressHighTask = { ...sampleTask, status: 'IN_PROGRESS', priority: 'HIGH' };
    const doneHighTask = { ...inProgressHighTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique
      .mockResolvedValueOnce(inProgressHighTask)
      .mockResolvedValueOnce(doneHighTask);
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    const scoreCall = mockPrisma.scoreEvent.create.mock.calls[0][0];
    expect(scoreCall.data.points).toBe(20);
  });

  it('applies late penalty (-3) for overdue task completion', async () => {
    const inProgressLateTask = {
      ...sampleTask,
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueDate: new Date(pastDueDate),
    };
    const doneLateTask = { ...inProgressLateTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique
      .mockResolvedValueOnce(inProgressLateTask)
      .mockResolvedValueOnce(doneLateTask);
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    const scoreCall = mockPrisma.scoreEvent.create.mock.calls[0][0];
    expect(scoreCall.data.points).toBe(10);
    expect(scoreCall.data.bonus).toBe(0);
    expect(scoreCall.data.penalty).toBe(3);
    expect(scoreCall.data.totalAwarded).toBe(7);
  });
});

describe('PATCH /api/tasks/:id — assignee validation', () => {
  it('returns 404 when assigneeId does not exist on update', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(sampleTask);
    mockPrisma.user.findUnique.mockResolvedValue(null); // assignee not found

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ assigneeId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
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

  it('returns 409 when trying to delete a DONE task', async () => {
    const doneTask = { ...sampleTask, status: 'DONE' };
    mockPrisma.task.findUnique.mockResolvedValue(doneTask);

    const res = await request(app).delete('/api/tasks/task-1');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_COMPLETED');
  });
});

describe('PATCH /api/tasks/:id — cache invalidation', () => {
  it('Test E (task→DONE): calls redisClient.del with leaderboard:rankings', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);
    mockPrisma.task.update.mockResolvedValue(doneTask);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.scoreEvent.create.mockResolvedValue({});
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockRedis.del.mockResolvedValue(1);

    await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

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

    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/:id — cache invalidation', () => {
  it('Test G (delete DONE task without force): returns 409, does NOT call redisClient.del', async () => {
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(doneTask);

    const res = await request(app).delete('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

    expect(res.status).toBe(409);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('Test G2 (force delete DONE task): calls redisClient.del with leaderboard:rankings', async () => {
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(doneTask);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.scoreEvent.findFirst.mockResolvedValue({ userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    mockPrisma.scoreEvent.deleteMany.mockResolvedValue({});
    mockPrisma.task.delete.mockResolvedValue(doneTask);
    mockPrisma.scoreEvent.aggregate.mockResolvedValue({ _sum: { totalAwarded: 0 }, _count: { id: 0 } });
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).delete('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11?force=true');

    expect(res.status).toBe(204);
    expect(mockRedis.del).toHaveBeenCalledWith('leaderboard:rankings');
  });

  it('Test H (delete TODO task): does NOT call redisClient.del', async () => {
    const todoTask = { ...sampleTask, status: 'TODO' };
    mockPrisma.task.findUnique.mockResolvedValue(todoTask);
    mockPrisma.task.delete.mockResolvedValue(todoTask);

    await request(app).delete('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/:id — force delete DONE task', () => {
  it('returns 204 and deletes ScoreEvent + recalculates score', async () => {
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(doneTask);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.scoreEvent.findFirst.mockResolvedValue({ userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    mockPrisma.scoreEvent.deleteMany.mockResolvedValue({});
    mockPrisma.task.delete.mockResolvedValue(doneTask);
    mockPrisma.scoreEvent.aggregate.mockResolvedValue({ _sum: { totalAwarded: 20 }, _count: { id: 2 } });
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).delete('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11?force=true');

    expect(res.status).toBe(204);
    expect(mockPrisma.scoreEvent.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } })
    );
    expect(mockPrisma.task.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' } })
    );
    expect(mockPrisma.productivityScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ totalScore: 20, tasksCompleted: 2 }),
      })
    );
  });

  it('recalculates to zero score when no remaining ScoreEvents', async () => {
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };
    mockPrisma.task.findUnique.mockResolvedValue(doneTask);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
    mockPrisma.scoreEvent.findFirst.mockResolvedValue({ userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' });
    mockPrisma.scoreEvent.deleteMany.mockResolvedValue({});
    mockPrisma.task.delete.mockResolvedValue(doneTask);
    mockPrisma.scoreEvent.aggregate.mockResolvedValue({ _sum: { totalAwarded: null }, _count: { id: 0 } });
    mockPrisma.productivityScore.upsert.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).delete('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11?force=true');

    expect(res.status).toBe(204);
    expect(mockPrisma.productivityScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ totalScore: 0, tasksCompleted: 0 }),
      })
    );
  });

  it('returns 404 when task does not exist', async () => {
    mockPrisma.task.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/tasks/nonexistent?force=true');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/tasks — priority sort (TEST-01)', () => {
  // The sortBy=priority code path uses prisma.$queryRaw with a CASE WHEN expression,
  // NOT prisma.task.findMany. We mock $queryRaw and verify it was called (meaning raw SQL
  // was used), and check that the response is correctly shaped.
  it('uses CASE WHEN semantic ordering for sortBy=priority (not lexicographic)', async () => {
    const rawTaskHigh = {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      title: 'Build feature',
      description: null,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      dueDate: new Date(futureDueDate),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      assignee_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      assignee_name: 'Alice Smith',
      assignee_email: 'alice@example.com',
    };
    const rawTaskLow = {
      ...rawTaskHigh,
      id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      priority: 'LOW',
    };

    mockPrisma.task.count.mockResolvedValue(2);
    mockPrisma.$queryRaw.mockResolvedValue([rawTaskHigh, rawTaskLow]);

    const res = await request(app).get('/api/tasks?sortBy=priority&sortOrder=desc');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);

    // Assert $queryRaw was invoked (proving raw SQL CASE WHEN path was used)
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);

    // Assert task.findMany was NOT called for the priority sort path
    expect(mockPrisma.task.findMany).not.toHaveBeenCalled();

    // Assert the raw SQL template literal contains CASE WHEN (checks the actual SQL sent)
    const queryRawCall = mockPrisma.$queryRaw.mock.calls[0][0];
    const sqlString = JSON.stringify(queryRawCall);
    expect(sqlString).toMatch(/CASE|case/i);
  });

  it('uses CASE WHEN semantic ordering for sortBy=priority ascending', async () => {
    const rawTask = {
      id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      title: 'Build feature',
      description: null,
      status: 'IN_PROGRESS',
      priority: 'LOW',
      assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      dueDate: new Date(futureDueDate),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      assignee_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      assignee_name: 'Alice Smith',
      assignee_email: 'alice@example.com',
    };

    mockPrisma.task.count.mockResolvedValue(1);
    mockPrisma.$queryRaw.mockResolvedValue([rawTask]);

    const res = await request(app).get('/api/tasks?sortBy=priority&sortOrder=asc');

    expect(res.status).toBe(200);

    // $queryRaw called → raw SQL CASE WHEN path used
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mockPrisma.task.findMany).not.toHaveBeenCalled();

    // The SQL template contains CASE (semantic ordering)
    const queryRawCall = mockPrisma.$queryRaw.mock.calls[0][0];
    const sqlString = JSON.stringify(queryRawCall);
    expect(sqlString).toMatch(/CASE|case/i);
  });
});

describe('PATCH /api/tasks/:id — scoring atomicity (TEST-02)', () => {
  it('returns 500 and does not expose DONE status when scoreTask throws inside transaction', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    const doneTask = { ...sampleTask, status: 'DONE', assigneeId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' };

    mockPrisma.task.findUnique
      .mockResolvedValueOnce(inProgressTask)  // initial getById
      .mockResolvedValueOnce(doneTask);        // findUnique inside tx after updateMany
    mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

    // Simulate scoreTask failure: scoreEvent.create throws
    mockPrisma.scoreEvent.create.mockRejectedValue(new Error('DB write failed during scoring'));

    // Transaction mock executes fn() eagerly — error bubbles up as unhandled
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    // The transaction threw — response must NOT be 200
    expect(res.status).not.toBe(200);
    // Task must NOT appear as DONE in any 200 response body
    if (res.body?.status) {
      expect(res.body.status).not.toBe('DONE');
    }
    // scoreEvent.create was attempted (inside tx) but caused the error
    expect(mockPrisma.scoreEvent.create).toHaveBeenCalledTimes(1);
    // productivityScore.upsert must NOT have been called (thrown before reaching it)
    expect(mockPrisma.productivityScore.upsert).not.toHaveBeenCalled();
  });

  it('does not persist ScoreEvent when concurrent modification is detected inside transaction', async () => {
    const inProgressTask = { ...sampleTask, status: 'IN_PROGRESS' };
    mockPrisma.task.findUnique.mockResolvedValue(inProgressTask);
    // updateMany returns count=0 → ConflictError → transaction rolls back
    mockPrisma.task.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

    const res = await request(app)
      .patch('/api/tasks/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      .send({ status: 'DONE' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONCURRENT_MODIFICATION');
    // ScoreEvent must never have been created
    expect(mockPrisma.scoreEvent.create).not.toHaveBeenCalled();
    expect(mockPrisma.productivityScore.upsert).not.toHaveBeenCalled();
  });
});

describe('GET /api/tasks — pagination and sort edge cases (TEST-03)', () => {
  it('returns 400 when page=0 (below minimum)', async () => {
    const res = await request(app).get('/api/tasks?page=0');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty data array when page exceeds totalPages', async () => {
    // 2 total tasks, limit=20 → totalPages=1; requesting page=5 → skip=80 → findMany returns []
    mockPrisma.task.count.mockResolvedValue(2);
    mockPrisma.task.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/tasks?page=5');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(5);
  });

  it('uses dueDate orderBy for sortBy=date', async () => {
    mockPrisma.task.count.mockResolvedValue(1);
    mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

    await request(app).get('/api/tasks?sortBy=date&sortOrder=asc');

    const findManyCall = mockPrisma.task.findMany.mock.calls[0][0];
    expect(findManyCall.orderBy).toEqual({ dueDate: 'asc' });
  });

  it('uses assignee name orderBy for sortBy=assignee', async () => {
    mockPrisma.task.count.mockResolvedValue(1);
    mockPrisma.task.findMany.mockResolvedValue([sampleTask]);

    await request(app).get('/api/tasks?sortBy=assignee&sortOrder=desc');

    const findManyCall = mockPrisma.task.findMany.mock.calls[0][0];
    expect(findManyCall.orderBy).toEqual({ assignee: { name: 'desc' } });
  });
});

