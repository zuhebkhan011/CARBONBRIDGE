import { Router } from 'express';
import { RequirementsController } from './requirements.controller.js';
import { validateRequest } from '../../common/validation/validate.js';
import { createRequirementSchema } from './requirements.dto.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';
import { mutationRateLimiter } from '../../common/middleware/rateLimiter.js';

export const requirementsRouter = Router();

requirementsRouter.use(authenticate);

requirementsRouter.post(
  '/',
  requireRole(Role.BUYER),
  mutationRateLimiter,
  validateRequest({ body: createRequirementSchema }),
  RequirementsController.createRequirement
);

requirementsRouter.get(
  '/',
  requireRole(Role.BUYER, Role.ADMIN),
  RequirementsController.getMyRequirements
);

requirementsRouter.get('/:id', RequirementsController.getRequirementById);

requirementsRouter.patch(
  '/:id/cancel',
  requireRole(Role.BUYER),
  mutationRateLimiter,
  RequirementsController.cancelRequirement
);
