import pino from 'pino';
import { config } from '../../config/env.js';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
  transport:
    config.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  base: {
    service: 'carbonbridge-api',
  },
  redact: ['req.headers.authorization', 'password', 'passwordHash', 'token', 'refreshToken'],
});
