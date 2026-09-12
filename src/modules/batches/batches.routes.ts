import { Router } from 'express';
import { BatchesController } from './batches.controller.js';
import { validateRequest } from '../../common/validation/validate.js';
import { createBatchSchema } from './batches.dto.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';
import { mutationRateLimiter } from '../../common/middleware/rateLimiter.js';

export const batchesRouter = Router();

batchesRouter.use(authenticate);

batchesRouter.post(
  '/',
  requireRole(Role.SELLER),
  mutationRateLimiter,
  validateRequest({ body: createBatchSchema }),
  BatchesController.createBatch
);

batchesRouter.get('/', requireRole(Role.SELLER, Role.ADMIN), BatchesController.getMyBatches);
batchesRouter.get('/:id', BatchesController.getBatchById);
