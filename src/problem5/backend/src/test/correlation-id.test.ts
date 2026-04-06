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

  it('uses X-Request-Id header when present', async () => {
    const { correlationIdMiddleware } = await import('../middleware/correlation-id.js');

    req.headers = { 'x-request-id': 'my-custom-id' };

    correlationIdMiddleware(req as Request, res as Response, next);

    expect((req as any).id).toBe('my-custom-id');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'my-custom-id');
    expect(next).toHaveBeenCalled();
  });

  it('generates a UUID when X-Request-Id header is absent', async () => {
    const { correlationIdMiddleware } = await import('../middleware/correlation-id.js');

    req.headers = {};

    correlationIdMiddleware(req as Request, res as Response, next);

    const id = (req as any).id;
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    expect(next).toHaveBeenCalled();
  });

  it('echoes X-Request-Id in response header', async () => {
    const { correlationIdMiddleware } = await import('../middleware/correlation-id.js');

    req.headers = { 'x-request-id': 'echo-this' };

    correlationIdMiddleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'echo-this');
  });
});
