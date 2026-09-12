import { Router } from 'express';
import { LogisticsController } from './logistics.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';

export const logisticsRouter = Router();

logisticsRouter.use(authenticate);

logisticsRouter.get(
  '/consolidation',
  requireRole(Role.SELLER),
  LogisticsController.analyzeRouteConsolidation
);
