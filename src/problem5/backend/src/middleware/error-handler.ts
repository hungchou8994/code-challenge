import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(StatusCodes.NOT_FOUND, 'NOT_FOUND', `${resource} with id ${id} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(details: Array<{ field: string; message: string }>) {
    super(StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', details);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(StatusCodes.CONFLICT, code, message);
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2002') {
    const target = (err as any).meta?.target;
    const field = Array.isArray(target) ? target[0] : 'field';
    res.status(StatusCodes.CONFLICT).json({
      error: {
        code: `DUPLICATE_${field.toUpperCase()}`,
        message: `A record with this ${field} already exists`,
      },
    });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2003') {
    res.status(StatusCodes.CONFLICT).json({
      error: {
        code: 'FOREIGN_KEY_CONSTRAINT',
        message: 'Cannot delete this record because other records depend on it. Reassign or delete dependent records first.',
      },
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
