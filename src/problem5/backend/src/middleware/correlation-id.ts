import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// UUID v4 format validation — reject non-UUID values to prevent log poisoning (SEC-01)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'] as string | undefined;
  // Only trust the incoming header if it's a valid UUID v4; otherwise generate a fresh one
  const id = (incoming && UUID_REGEX.test(incoming)) ? incoming : randomUUID();
  req.id = id;  // typed via Express namespace augmentation — no cast needed
  res.setHeader('X-Request-Id', id);
  next();
}
