import { Router } from 'express';
import { AiController } from './ai.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';

import { coaRouter } from './coa.routes.js';
import { assistantRouter } from './assistant/assistant.routes.js';

export const aiRouter = Router();

aiRouter.use(authenticate);

// AI Onboarding & Guidance Assistant (All Authenticated Users)
aiRouter.use('/assistant', assistantRouter);

// Buyer & Admin AI Matchmaker endpoints
aiRouter.post('/match', requireRole(Role.BUYER, Role.ADMIN), AiController.getMatches);
aiRouter.get('/match/:requirementId', requireRole(Role.BUYER, Role.ADMIN), AiController.getMatches);

// Buyer Natural Language Requirement Parsing
aiRouter.post('/parse-requirement', requireRole(Role.BUYER, Role.ADMIN), AiController.parseRequirement);

// CoA Intelligence Endpoints (Seller & Buyer)
aiRouter.use('/coa', coaRouter);

