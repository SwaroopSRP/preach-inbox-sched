import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`Operational error: ${err.message}`, { path: req.path });
    }
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Generic or unexpected error
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  logger.error(`Unhandled error: ${message}`, {
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' && err instanceof Error ? err.stack : undefined,
  });

  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
  });
}
