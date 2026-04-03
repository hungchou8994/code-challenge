import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { correlationIdMiddleware } from './middleware/correlation-id.js';
import { writeLimiter } from './middleware/rate-limiter.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { userRouter } from './routes/user.routes.js';
import { taskRouter } from './routes/task.routes.js';
import { leaderboardRouter } from './routes/leaderboard.routes.js';

const app = express();

// Configure pino-http logger (pretty in dev, raw JSON in production)
const httpLogger = pinoHttp({
  // Use req.id (set by correlationIdMiddleware) as the request ID
  genReqId: (req: any) => req.id,
  // Pretty-print in dev, raw JSON in production (per OBS-01)
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
    : undefined,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(correlationIdMiddleware); // must come before pino-http so req.id is set
app.use(httpLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (write methods only — GET is skipped)
app.use(writeLimiter);

// Routes
app.use('/api/health', healthRouter);
app.use('/api/users', userRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/leaderboard', leaderboardRouter);

// Error handler (must be last)
app.use(errorHandler);

export { app };
