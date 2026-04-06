import { prisma } from '../lib/prisma.js';
import { NotFoundError, ConflictError } from '../middleware/error-handler.js';
import type { CreateUserBody, UpdateUserBody } from '../schemas/user.schemas.js';

export const userService = {
  async getAll() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async getById(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User', id);
    return user;
  },

  async create(data: CreateUserBody) {
    return prisma.user.create({ data });
  },

  async update(id: string, data: UpdateUserBody) {
    await userService.getById(id);
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    await userService.getById(id);

    const taskCount = await prisma.task.count({
      where: { assigneeId: id },
    });
    if (taskCount > 0) {
      throw new ConflictError(
        'USER_HAS_TASKS',
        `Cannot delete user: ${taskCount} task(s) are still assigned. Reassign or delete tasks first.`
      );
    }

    return prisma.user.delete({ where: { id } });
  },
};
