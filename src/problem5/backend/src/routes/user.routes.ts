import { Router } from 'express';
import { StatusCodes } from 'http-status-codes';
import { userService } from '../services/user.service.js';
import { validate } from '../middleware/validation.js';
import { createUserSchema, updateUserSchema, userQuerySchema, userSearchSchema } from '../schemas/user.schemas.js';

const router = Router();

router.get('/', async (req, res) => {
  const parsed = userQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid query parameters' },
    });
    return;
  }
  const result = await userService.getAll(parsed.data);
  res.json(result);
});

// PERF-01: Typeahead search endpoint — returns slim {id, name, email} array, max 20 results
router.get('/search', async (req, res) => {
  const parsed = userSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(StatusCodes.BAD_REQUEST).json({
      error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid query parameters' },
    });
    return;
  }
  const results = await userService.search(parsed.data.q);
  res.json(results);
});

router.get('/:id', async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json(user);
});

router.post('/', validate(createUserSchema), async (req, res) => {
  const user = await userService.create(req.body);
  res.status(StatusCodes.CREATED).json(user);
});

router.put('/:id', validate(updateUserSchema), async (req, res) => {
  const user = await userService.update(req.params['id'] as string, req.body);
  res.json(user);
});

router.delete('/:id', async (req, res) => {
  await userService.delete(req.params.id);
  res.status(StatusCodes.NO_CONTENT).send();
});

export { router as userRouter };
