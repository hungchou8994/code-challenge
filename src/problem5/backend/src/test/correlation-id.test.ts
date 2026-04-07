import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

describe('correlationIdMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      setHeader: vi.fn(),
    };
    next = vi.fn();
  });

  const VALID_UUID = '123e4567-e89b-4d3c-a456-426614174000';

  it('uses X-Request-Id header when present and is a valid UUID v4', async () => {
    const { correlationIdMiddleware } = await import('../middleware/correlation-id.js');

    req.headers = { 'x-request-id': VALID_UUID };

    correlationIdMiddleware(req as Request, res as Response, next);

    expect(req.id).toBe(VALID_UUID);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', VALID_UUID);
    expect(next).toHaveBeenCalled();
  });

  it('generates a UUID when X-Request-Id header is absent', async () => {
    const { correlationIdMiddleware } = await import('../middleware/correlation-id.js');

    req.headers = {};

    correlationIdMiddleware(req as Request, res as Response, next);

    const id = req.id;
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    expect(next).toHaveBeenCalled();
  });

  it('generates a fresh UUID when X-Request-Id is not a valid UUID v4 (SEC-01 log poisoning protection)', async () => {
    const { correlationIdMiddleware } = await import('../middleware/correlation-id.js');

    req.headers = { 'x-request-id': 'not-a-valid-uuid' };

    correlationIdMiddleware(req as Request, res as Response, next);

    // Must NOT echo the attacker-controlled value
    expect(req.id).not.toBe('not-a-valid-uuid');
    // Must be a valid UUID v4 (freshly generated)
    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.id);
    expect(next).toHaveBeenCalled();
  });
});
