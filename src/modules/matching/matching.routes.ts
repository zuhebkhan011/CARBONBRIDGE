import { Router } from 'express';
import { MatchingController } from './matching.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';

export const matchingRouter = Router();

matchingRouter.use(authenticate);

matchingRouter.get(
  '/:requirementId',
  requireRole(Role.BUYER, Role.ADMIN),
  MatchingController.getMatchesForRequirement
);
