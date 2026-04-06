import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  skip: (req: Request) => !['POST', 'PATCH', 'DELETE'].includes(req.method),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down and try again in a moment.',
      },
    });
  },
});
