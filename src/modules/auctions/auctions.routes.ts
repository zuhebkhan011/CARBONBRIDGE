import { Router } from 'express';
import { AuctionsController } from './auctions.controller.js';
import { validateRequest } from '../../common/validation/validate.js';
import { createAuctionSchema, placeBidSchema, finalizeAuctionSchema } from './auctions.dto.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';
import { mutationRateLimiter } from '../../common/middleware/rateLimiter.js';
import { idempotencyMiddleware } from '../../common/middleware/idempotency.js';

export const auctionsRouter = Router();

auctionsRouter.use(authenticate);

auctionsRouter.post(
  '/',
  requireRole(Role.SELLER),
  mutationRateLimiter,
  validateRequest({ body: createAuctionSchema }),
  AuctionsController.createAuction
);

auctionsRouter.get('/', AuctionsController.listActiveAuctions);
auctionsRouter.get('/:id', AuctionsController.getAuctionById);
auctionsRouter.get('/:id/insights', AuctionsController.getAuctionInsights);

auctionsRouter.post(
  '/:id/bid',
  requireRole(Role.BUYER),
  mutationRateLimiter,
  validateRequest({ body: placeBidSchema }),
  AuctionsController.placeBid
);

auctionsRouter.post(
  '/:id/bids',
  requireRole(Role.BUYER),
  mutationRateLimiter,
  validateRequest({ body: placeBidSchema }),
  AuctionsController.placeBid
);

auctionsRouter.post(
  '/:id/finalize',
  requireRole(Role.SELLER),
  mutationRateLimiter,
  idempotencyMiddleware,
  validateRequest({ body: finalizeAuctionSchema }),
  AuctionsController.finalizeAuction
);
