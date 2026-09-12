import { Router } from 'express';
import { LogisticsController } from './logistics.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';

export const logisticsRouter = Router();

logisticsRouter.use(authenticate);

// Backward-compatible route consolidation overview
logisticsRouter.get(
  '/consolidation',
  requireRole(Role.SELLER, Role.ADMIN),
  LogisticsController.analyzeRouteConsolidation
);

// Active shipments available for optimization
logisticsRouter.get(
  '/active-shipments',
  requireRole(Role.SELLER, Role.ADMIN),
  LogisticsController.getActiveShipments
);

// Smart route optimization
logisticsRouter.post(
  '/optimize-route',
  requireRole(Role.SELLER, Role.ADMIN),
  LogisticsController.optimizeRoute
);

// Route selection
logisticsRouter.post(
  '/select-route',
  requireRole(Role.SELLER, Role.ADMIN),
  LogisticsController.selectRoute
);
