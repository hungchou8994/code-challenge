import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { taskService } from '../services/task.service.js';
import { validate } from '../middleware/validation.js';
import { createTaskSchema, updateTaskSchema } from '../schemas/task.schemas.js';

const router = Router();

// GET /api/tasks — list tasks with optional filtering and sorting (TASK-02, TASK-07, TASK-08, TASK-09)
// Query params: ?status=TODO&assigneeId=xxx&sortBy=priority&sortOrder=desc
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

// GET /api/tasks/:id — get single task (TASK-03)
router.get('/:id', async (req, res) => {
  const task = await taskService.getById(req.params.id);
  res.json(task);
});

// POST /api/tasks — create task (TASK-01)
router.post('/', validate(createTaskSchema), async (req, res) => {
  const task = await taskService.create(req.body);
  res.status(StatusCodes.CREATED).json(task);
});

// PATCH /api/tasks/:id — update task fields and/or status (TASK-04, TASK-06)
// Per D-04: status changes happen via this same endpoint
router.patch('/:id', validate(updateTaskSchema), async (req, res) => {
  const task = await taskService.update(req.params['id'] as string, req.body);
  res.json(task);
});

// DELETE /api/tasks/:id — delete task (TASK-05)
router.delete('/:id', async (req, res) => {
  await taskService.delete(req.params.id);
  res.status(StatusCodes.NO_CONTENT).send();
});

export { router as taskRouter };
