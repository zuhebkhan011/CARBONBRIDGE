import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/prisma.js';
import { logger } from '../logging/logger.js';

export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const idempotencyKey = req.header('idempotency-key');

  if (!idempotencyKey) {
    next();
    return;
  }

  try {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (existing) {
      if (existing.expiresAt > new Date()) {
        logger.info({ idempotencyKey, path: req.path }, 'Serving cached idempotent response');
        res.status(existing.responseCode).json(JSON.parse(existing.responsePayload));
        return;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Idempotency lookup failed; proceeding with request');
  }

  // Intercept response to store on success
  const originalJson = res.json.bind(res);

  res.json = (body: any): Response => {
    // Only cache successful or expected business responses
    if (res.statusCode >= 200 && res.statusCode < 500) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      prisma.idempotencyKey
        .upsert({
          where: { key: idempotencyKey },
          create: {
            key: idempotencyKey,
            requestPath: req.path,
            responseCode: res.statusCode,
            responsePayload: JSON.stringify(body),
            expiresAt,
          },
          update: {
            responseCode: res.statusCode,
            responsePayload: JSON.stringify(body),
            expiresAt,
          },
        })
        .catch((err) => {
          logger.warn({ err, idempotencyKey }, 'Failed to persist idempotency key');
        });
    }

    return originalJson(body);
  };

  next();
};
