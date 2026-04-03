import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { userService } from '../services/user.service.js';
import { validate } from '../middleware/validation.js';
import { createUserSchema, updateUserSchema } from '../schemas/user.schemas.js';

const router = Router();

// GET /api/users — list all users (USER-02)
router.get('/', async (_req, res) => {
  const users = await userService.getAll();
  res.json(users);
});

// GET /api/users/:id — get single user (USER-03)
router.get('/:id', async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json(user);
});

// POST /api/users — create user (USER-01)
router.post('/', validate(createUserSchema), async (req, res) => {
  const user = await userService.create(req.body);
  res.status(StatusCodes.CREATED).json(user);
});

// PUT /api/users/:id — update user (USER-04)
router.put('/:id', validate(updateUserSchema), async (req, res) => {
  const user = await userService.update(req.params['id'] as string, req.body);
  res.json(user);
});

// DELETE /api/users/:id — delete user (USER-05)
router.delete('/:id', async (req, res) => {
  await userService.delete(req.params.id);
  res.status(StatusCodes.NO_CONTENT).send();
});

export { router as userRouter };
