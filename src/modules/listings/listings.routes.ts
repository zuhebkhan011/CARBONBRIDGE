import { Router } from 'express';
import { ListingsController } from './listings.controller.js';
import { validateRequest } from '../../common/validation/validate.js';
import { createListingSchema, queryListingsSchema } from './listings.dto.js';
import { authenticate, requireRole } from '../../common/middleware/auth.js';
import { Role } from '@prisma/client';
import { mutationRateLimiter } from '../../common/middleware/rateLimiter.js';

export const listingsRouter = Router();

listingsRouter.use(authenticate);

listingsRouter.post(
  '/',
  requireRole(Role.SELLER),
  mutationRateLimiter,
  validateRequest({ body: createListingSchema }),
  ListingsController.createListing
);

listingsRouter.get(
  '/',
  validateRequest({ query: queryListingsSchema }),
  ListingsController.browseListings
);

listingsRouter.get('/:id', ListingsController.getListingById);

listingsRouter.patch(
  '/:id/deactivate',
  requireRole(Role.SELLER),
  mutationRateLimiter,
  ListingsController.deactivateListing
);
