import { Router } from 'express';
import { leaderboardService } from '../services/leaderboard.service.js';
import { sseManager } from '../lib/sse-manager.js';
import { randomUUID } from 'node:crypto';

const router = Router();

router.get('/', async (_req, res) => {
  const rankings = await leaderboardService.getRankings();
  res.json(rankings);
});

router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = randomUUID();
  sseManager.addClient(clientId, res);

  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  req.on('close', () => {
    sseManager.removeClient(clientId);
  });
});

export { router as leaderboardRouter };
