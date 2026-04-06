import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { taskService } from '../services/task.service.js';
import { validate } from '../middleware/validation.js';
import { createTaskSchema, updateTaskSchema, taskQuerySchema } from '../schemas/task.schemas.js';

const router = Router();

router.get('/', async (req, res) => {
  const parsed = taskQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid query parameters' },
    });
    return;
  }
  const result = await taskService.getAll(parsed.data);
  res.json(result);
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
  const force = req.query['force'] === 'true';
  await taskService.delete(req.params.id, force);
  res.status(StatusCodes.NO_CONTENT).send();
});

export { router as taskRouter };
