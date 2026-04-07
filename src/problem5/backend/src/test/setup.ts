import { vi } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    scoreEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      deleteMany: vi.fn(),
    },
    productivityScore: {
      upsert: vi.fn(),
    },
  },
}));
