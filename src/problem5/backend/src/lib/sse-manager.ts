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
    for (const [id, res] of this.clients.entries()) {
      // Proactively evict already-closed connections before attempting to write
      if (res.writableEnded || res.destroyed) {
        this.clients.delete(id);
        continue;
      }
      try {
        res.write(payload);
      } catch {
        // Client disconnected mid-write — evict it from the registry
        this.clients.delete(id);
      }
    }
  }
}

export const sseManager = new SseManager();
