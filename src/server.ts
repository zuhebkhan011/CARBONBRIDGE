import { app } from './app.js';
import { config } from './config/env.js';
import { logger } from './common/logging/logger.js';
import { prisma } from './database/prisma.js';
import { BackgroundJobScheduler } from './jobs/scheduler.js';

const server = app.listen(config.PORT, () => {
  logger.info(`🚀 CarbonBridge Backend API running on port ${config.PORT} [${config.NODE_ENV}]`);
  logger.info(`📖 Interactive Swagger Documentation: http://localhost:${config.PORT}/api/docs`);
  logger.info(`🔍 Health Liveness Probe: http://localhost:${config.PORT}/health`);
  logger.info(`🔌 Database Readiness Probe: http://localhost:${config.PORT}/ready`);

  // Start background tasks
  BackgroundJobScheduler.start();
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  BackgroundJobScheduler.stop();

  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await prisma.$disconnect();
      logger.info('Database connection cleanly terminated.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during database disconnect.');
      process.exit(1);
    }
  });

  // Force shutdown after 10s if hanging
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
