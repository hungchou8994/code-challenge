import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { taskService } from '../services/task.service.js';
import { validate } from '../middleware/validation.js';
import { createTaskSchema, updateTaskSchema } from '../schemas/task.schemas.js';

const router = Router();

router.get('/', async (req, res) => {
  const { status, assigneeId, sortBy, sortOrder } = req.query as {
    status?: string;
    assigneeId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };
  const tasks = await taskService.getAll({ status, assigneeId, sortBy, sortOrder });
  res.json(tasks);
});

router.get('/:id', async (req, res) => {
  const task = await taskService.getById(req.params.id);
  res.json(task);
});

router.post('/', validate(createTaskSchema), async (req, res) => {
  const task = await taskService.create(req.body);
  res.status(StatusCodes.CREATED).json(task);
});

router.patch('/:id', validate(updateTaskSchema), async (req, res) => {
  const task = await taskService.update(req.params['id'] as string, req.body);
  res.json(task);
});

router.delete('/:id', async (req, res) => {
  await taskService.delete(req.params.id);
  res.status(StatusCodes.NO_CONTENT).send();
});

export { router as taskRouter };
