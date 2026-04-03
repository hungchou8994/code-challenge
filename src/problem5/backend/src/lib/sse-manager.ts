import type { Response } from 'express';

class SseManager {
  private clients: Map<string, Response> = new Map();

  addClient(id: string, res: Response): void {
    this.clients.set(id, res);
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(data: unknown): void {
    const payload = `event: score-update\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients.values()) {
      res.write(payload);
    }
  }
}

export const sseManager = new SseManager();
