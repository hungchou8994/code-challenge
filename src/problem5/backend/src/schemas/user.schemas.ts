import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  email: z.string().email('Invalid email format'),
  department: z.string().min(1, 'Department is required').max(100, 'Department must be 100 characters or less'),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
  email: z.string().email('Invalid email format').optional(),
  department: z.string().min(1, 'Department is required').max(100, 'Department must be 100 characters or less').optional(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
