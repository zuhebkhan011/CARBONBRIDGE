import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logging/logger.js';
import { config } from '../../config/env.js';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const requestId = req.id || 'unknown';

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId, path: req.path }, err.message);
    } else {
      logger.warn({ err: err.message, code: err.errorCode, requestId, path: req.path });
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.errorCode,
        message: err.message,
        details: err.details || null,
      },
      requestId,
    });
    return;
  }

  if (err instanceof ZodError) {
    const formatted = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    const message = formatted.map((f) => f.message).filter(Boolean).join('. ') || 'Request validation failed';

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message,
        details: formatted,
      },
      requestId,
    });
    return;
  }

  // Handle Prisma Concurrency / Serialization Write Conflicts (P2034)
  if ((err as any)?.code === 'P2034') {
    logger.warn({ err: err.message, code: 'CONCURRENCY_CONFLICT', requestId, path: req.path });
    res.status(409).json({
      success: false,
      error: {
        code: 'CONCURRENCY_CONFLICT',
        message: 'A concurrent update conflict occurred. Please refresh and try again.',
        details: null,
      },
      requestId,
    });
    return;
  }

  logger.error({ err, requestId, path: req.path }, 'Unhandled Internal Server Error');

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      details: config.NODE_ENV === 'development' ? err.message : null,
    },
    requestId,
  });
};
