import { Router } from 'express';
import { InsightsController } from './insights.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';

export const insightsRouter = Router();

insightsRouter.use(authenticate);

// Marketplace overall supply-demand intelligence
insightsRouter.get('/marketplace', InsightsController.getMarketplaceInsights);

// Seller-specific matching opportunities against active requirements
insightsRouter.get(
  '/seller',
  requireRole(Role.SELLER, Role.ADMIN),
  InsightsController.getSellerOpportunities
);

// Buyer demand-side intelligence for a specific requirement
insightsRouter.get(
  '/buyer/:requirementId',
  requireRole(Role.BUYER, Role.ADMIN),
  InsightsController.getBuyerRequirementInsights
);
