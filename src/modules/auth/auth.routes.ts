import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateRequest } from '../../common/validation/validate.js';
import { registerSchema, loginSchema, refreshTokenSchema, updateProfileSchema } from './auth.dto.js';
import { authenticate } from '../../common/middleware/auth.js';
import { authRateLimiter } from '../../common/middleware/rateLimiter.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validateRequest({ body: registerSchema }),
  AuthController.register
);

authRouter.post(
  '/login',
  authRateLimiter,
  validateRequest({ body: loginSchema }),
  AuthController.login
);

authRouter.post(
  '/refresh',
  authRateLimiter,
  validateRequest({ body: refreshTokenSchema }),
  AuthController.refreshToken
);

authRouter.get('/me', authenticate, AuthController.getMe);
authRouter.patch('/me', authenticate, validateRequest({ body: updateProfileSchema }), AuthController.updateMe);
