import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
});

export const mutationRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 writes per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Write request rate limit exceeded. Please slow down.',
    },
  },
});

export const generalRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'API rate limit exceeded.',
    },
  },
});

export const aiAssistantRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 queries per minute per user/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'AI Assistant rate limit reached. Please wait a moment before asking another question.',
    },
  },
});

