import { Router } from 'express';
import { CoaController } from './coa.controller.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';

export const coaRouter = Router();

coaRouter.use(authenticate);

// Trigger AI analysis on a batch's uploaded CoA (Seller owner or Admin)
coaRouter.post('/extract/:batchId', requireRole(Role.SELLER, Role.ADMIN), CoaController.analyzeBatchCoA);
coaRouter.post('/:batchId/extract', requireRole(Role.SELLER, Role.ADMIN), CoaController.analyzeBatchCoA);

// Retrieve AI extraction and cross-check summary
coaRouter.get('/:batchId', CoaController.getBatchCoA);
