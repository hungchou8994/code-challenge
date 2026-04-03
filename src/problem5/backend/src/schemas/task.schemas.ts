import { z } from 'zod';

const taskStatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);
const taskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional().nullable(),
  status: taskStatusEnum.optional().default('TODO'),
  priority: taskPriorityEnum,
  assigneeId: z.string().uuid('Invalid assignee ID').optional().nullable(),
  dueDate: z.string().datetime({ message: 'Invalid date format. Use ISO 8601 format.' }),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less').optional(),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional().nullable(),
  status: taskStatusEnum.optional(),
  priority: taskPriorityEnum.optional(),
  assigneeId: z.string().uuid('Invalid assignee ID').optional().nullable(),
  dueDate: z.string().datetime({ message: 'Invalid date format. Use ISO 8601 format.' }).optional(),
});

export type CreateTaskBody = z.infer<typeof createTaskSchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;
