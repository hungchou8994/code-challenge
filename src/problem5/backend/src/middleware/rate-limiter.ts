import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

// Rate limit only write methods: POST, PATCH, DELETE (OBS-03)
// GET requests must NOT be rate limited
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 60,           // 60 requests per window
  // Only apply to write methods — skip all other methods
  skip: (req: Request) => !['POST', 'PATCH', 'DELETE'].includes(req.method),
  standardHeaders: 'draft-7', // RateLimit headers (RFC compliant)
  legacyHeaders: false,
  // Return 429 with the existing API error shape
  handler: (_req: Request, res: Response) => {
    res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down and try again in a moment.',
      },
    });
  },
});
