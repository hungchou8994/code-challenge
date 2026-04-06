import { z } from 'zod';

const taskStatusEnum = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);
const taskPriorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional().nullable(),
  status: z.literal('TODO').optional().default('TODO'),
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
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided to update' }
);

export const taskQuerySchema = z.object({
  status: taskStatusEnum.optional(),
  assigneeId: z.string().uuid('Invalid assigneeId').optional(),
  sortBy: z.enum(['priority', 'dueDate', 'date', 'assignee', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export type CreateTaskBody = z.infer<typeof createTaskSchema>;
export type UpdateTaskBody = z.infer<typeof updateTaskSchema>;
export type TaskQueryParams = z.infer<typeof taskQuerySchema>;
