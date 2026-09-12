import { Router } from 'express';
import { ShipmentsController } from './shipments.controller.js';
import { validateRequest } from '../../common/validation/validate.js';
import { updateShipmentStatusSchema } from './shipments.dto.js';
import { authenticate } from '../../common/middleware/auth.js';
import { mutationRateLimiter } from '../../common/middleware/rateLimiter.js';
import { idempotencyMiddleware } from '../../common/middleware/idempotency.js';

export const shipmentsRouter = Router();

shipmentsRouter.use(authenticate);

shipmentsRouter.get('/', ShipmentsController.listShipments);
shipmentsRouter.get('/:id', ShipmentsController.getShipmentById);

shipmentsRouter.patch(
  '/:id/status',
  mutationRateLimiter,
  idempotencyMiddleware,
  validateRequest({ body: updateShipmentStatusSchema }),
  ShipmentsController.updateShipmentStatus
);
