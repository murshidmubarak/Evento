import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

/**
 * Centralized error handling middleware.
 *
 * Error response format:
 * {
 *   "success": false,
 *   "message": "...",
 *   "error": {}
 * }
 */
export const errorMiddleware: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // Operational error — thrown intentionally via ApiError
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        statusCode: err.statusCode,
        errors: err.errors,
        ...(env.isDevelopment && { stack: err.stack }),
      },
    });
    return;
  }

  // Mongoose validation errors
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'ValidationError'
  ) {
    const mongooseErr = err as unknown as { message: string; errors: Record<string, { message: string }> };
    const errors = Object.values(mongooseErr.errors).map((e) => e.message);
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: { errors },
    });
    return;
  }

  // Mongoose duplicate key error (E11000)
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: number }).code === 11000
  ) {
    res.status(409).json({
      success: false,
      message: 'Duplicate key error',
      error: {},
    });
    return;
  }

  // Mongoose CastError (invalid ObjectId, etc.)
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'CastError'
  ) {
    res.status(400).json({
      success: false,
      message: 'Invalid data format',
      error: {},
    });
    return;
  }

  // Unknown / unhandled error — do not leak internals in production
  const message =
    env.isDevelopment && err instanceof Error ? err.message : 'Internal server error';

  res.status(500).json({
    success: false,
    message,
    error: {
      ...(env.isDevelopment && err instanceof Error && { stack: err.stack }),
    },
  });
};
