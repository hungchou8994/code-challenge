import { Router } from 'express';
import { leaderboardService } from '../services/leaderboard.service.js';
import { sseManager } from '../lib/sse-manager.js';
import { randomUUID } from 'node:crypto';

const router = Router();

// GET /api/leaderboard — get rankings sorted by score (LEAD-01, LEAD-02, LEAD-03)
router.get('/', async (_req, res) => {
  const rankings = await leaderboardService.getRankings();
  res.json(rankings);
});

// GET /api/leaderboard/stream — SSE endpoint (SSE-01, SSE-02)
router.get('/stream', async (req, res) => {
  // SSE-01: Set correct SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // flush immediately so client establishes the stream

  const clientId = randomUUID();
  sseManager.addClient(clientId, res);

  // SSE-02: Send current rankings immediately on connect
  const initial = await leaderboardService.getRankings();
  res.write(`event: score-update\ndata: ${JSON.stringify(initial)}\n\n`);

  // SSE-04 criteria: clean disconnect — no crash, no error logs
  req.on('close', () => {
    sseManager.removeClient(clientId);
  });
});

export { router as leaderboardRouter };
