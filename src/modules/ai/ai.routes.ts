import { Router } from 'express';
import { AiController } from './ai.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';

import { coaRouter } from './coa.routes.js';

export const aiRouter = Router();

aiRouter.use(authenticate);

// Buyer & Admin AI Matchmaker endpoints
aiRouter.post('/match', requireRole(Role.BUYER, Role.ADMIN), AiController.getMatches);
aiRouter.get('/match/:requirementId', requireRole(Role.BUYER, Role.ADMIN), AiController.getMatches);

// Buyer Natural Language Requirement Parsing
aiRouter.post('/parse-requirement', requireRole(Role.BUYER, Role.ADMIN), AiController.parseRequirement);

// CoA Intelligence Endpoints (Seller & Buyer)
aiRouter.use('/coa', coaRouter);
