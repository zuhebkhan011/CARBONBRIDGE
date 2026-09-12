import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/env.js';
import { requestIdMiddleware } from './common/middleware/requestId.js';
import { errorHandler } from './common/middleware/errorHandler.js';
import { generalRateLimiter } from './common/middleware/rateLimiter.js';
import { apiRouter } from './routes/api.router.js';
import { prisma } from './database/prisma.js';
import { NotFoundError } from './common/errors/AppError.js';
import { swaggerDocument } from './docs/swagger.js';

export const app = express();

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI to render smoothly
  })
);
app.use(
  cors({
    origin: config.CORS_ORIGIN === '*' ? '*' : config.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'idempotency-key'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestIdMiddleware);

// Health Liveness Probe
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'carbonbridge-backend',
    version: '1.0.0',
  });
});

// Readiness Probe (checks database connection)
app.get('/ready', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1;`;
    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: error?.message || 'Database unavailable',
    });
  }
});

// Swagger / OpenAPI Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/api/docs.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

// Apply rate limiting & API v1 router
app.use('/api/v1', generalRateLimiter, apiRouter);

// Catch-all for unhandled routes
app.use('*', (req: Request) => {
  throw new NotFoundError(`Endpoint not found: ${req.method} ${req.originalUrl}`);
});

// Centralized error handling
app.use(errorHandler);
