import express, { Request } from 'express';
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

const httpLogger = pinoHttp({
  genReqId: (req: Request) => req.id,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
    : undefined,
});

app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.ALLOWED_ORIGIN || 'http://localhost:3001')
    : '*',
}));
app.use(correlationIdMiddleware);
app.use(httpLogger);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(writeLimiter);

app.use('/api/health', healthRouter);
app.use('/api/users', userRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/leaderboard', leaderboardRouter);

app.use(errorHandler);

export { app };
