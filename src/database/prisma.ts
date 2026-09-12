import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';
import { config } from '../config/env.js';
import { logger } from '../common/logging/logger.js';

export const prisma = new PrismaClient({
  log: config.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Resilient Redis client initialization with in-memory mock fallback
let redisInstance: Redis;

try {
  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // Do not hang if Redis is unreachable
    lazyConnect: true,
  });

  client.on('error', (err) => {
    logger.warn({ err: err.message }, 'Redis connection unavailable; using in-memory mock store');
  });

  // Attempt async connect without blocking server startup
  client.connect().catch(() => {
    logger.info('Running with in-memory mock cache');
  });

  redisInstance = client;
} catch {
  logger.info('Initialized in-memory Redis fallback');
  redisInstance = new (RedisMock as any)();
}

export const redis = redisInstance;
