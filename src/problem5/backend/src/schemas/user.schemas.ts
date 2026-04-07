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
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided to update' }
);

export const userQuerySchema = z.object({
  search: z.string().optional(),
  department: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const userSearchSchema = z.object({
  q: z.string().optional(),
});

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type UserQueryParams = z.infer<typeof userQuerySchema>;
export type UserSearchParams = z.infer<typeof userSearchSchema>;
