import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';

const mockPrisma = prisma as any;

const sampleUser = {
  id: 'user-1',
  name: 'Alice Smith',
  email: 'alice@example.com',
  department: 'Engineering',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/users', () => {
  it('returns list of users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([sampleUser]);

    const res = await request(app).get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Alice Smith');
  });

  it('returns empty array when no users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/users');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/users/:id', () => {
  it('returns user by id', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(sampleUser);

    const res = await request(app).get('/api/users/user-1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
    expect(res.body.email).toBe('alice@example.com');
  });

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/users/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/users', () => {
  it('creates a user and returns 201', async () => {
    mockPrisma.user.create.mockResolvedValue(sampleUser);

    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice Smith', email: 'alice@example.com', department: 'Engineering' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('alice@example.com');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'alice@example.com', department: 'Engineering' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'not-an-email', department: 'Engineering' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when email already exists', async () => {
    const prismaError = new Error('Unique constraint failed on the fields: (`email`)') as any;
    prismaError.code = 'P2002';
    prismaError.meta = { modelName: 'User', target: ['email'] };
    mockPrisma.user.create.mockRejectedValue(prismaError);

    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Alice', email: 'alice@example.com', department: 'Engineering' });

    expect(res.status).toBe(409);
  });
});

describe('PUT /api/users/:id', () => {
  it('updates user fields', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(sampleUser);
    mockPrisma.user.update.mockResolvedValue({ ...sampleUser, department: 'Product' });

    const res = await request(app)
      .put('/api/users/user-1')
      .send({ department: 'Product' });

    expect(res.status).toBe(200);
    expect(res.body.department).toBe('Product');
  });

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/users/nonexistent')
      .send({ department: 'Product' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/users/:id', () => {
  it('deletes user and returns 204', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(sampleUser);
    mockPrisma.task.count.mockResolvedValue(0);
    mockPrisma.user.delete.mockResolvedValue(sampleUser);

    const res = await request(app).delete('/api/users/user-1');

    expect(res.status).toBe(204);
  });

  it('returns 404 when user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/users/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 409 when user has tasks', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(sampleUser);
    mockPrisma.task.count.mockResolvedValue(3);

    const res = await request(app).delete('/api/users/user-1');

    expect(res.status).toBe(409);
  });
});
