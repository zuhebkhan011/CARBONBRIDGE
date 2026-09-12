import { Router } from 'express';
import { OrdersController } from './orders.controller.js';
import { validateRequest } from '../../common/validation/validate.js';
import { procureFixedPriceSchema, procureCompositeSchema } from './orders.dto.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';
import { mutationRateLimiter } from '../../common/middleware/rateLimiter.js';
import { idempotencyMiddleware } from '../../common/middleware/idempotency.js';

export const ordersRouter = Router();

ordersRouter.use(authenticate);

ordersRouter.post(
  '/procure-fixed',
  requireRole(Role.BUYER),
  mutationRateLimiter,
  idempotencyMiddleware,
  validateRequest({ body: procureFixedPriceSchema }),
  OrdersController.procureFixedPrice
);

ordersRouter.post(
  '/procure-composite',
  requireRole(Role.BUYER),
  mutationRateLimiter,
  idempotencyMiddleware,
  validateRequest({ body: procureCompositeSchema }),
  OrdersController.procureComposite
);

ordersRouter.get('/', OrdersController.getOrders);
ordersRouter.get('/:id', OrdersController.getOrderById);
