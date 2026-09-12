import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { batchesRouter } from '../modules/batches/batches.routes.js';
import { listingsRouter } from '../modules/listings/listings.routes.js';
import { requirementsRouter } from '../modules/requirements/requirements.routes.js';
import { matchingRouter } from '../modules/matching/matching.routes.js';
import { pricingRouter } from '../modules/pricing/pricing.routes.js';
import { ordersRouter } from '../modules/orders/orders.routes.js';
import { auctionsRouter } from '../modules/auctions/auctions.routes.js';
import { documentsRouter } from '../modules/documents/documents.routes.js';
import { shipmentsRouter } from '../modules/shipments/shipments.routes.js';
import { mapsRouter } from '../modules/maps/maps.routes.js';
import { logisticsRouter } from '../modules/logistics/logistics.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';
import { insightsRouter } from '../modules/insights/insights.routes.js';
import { InsightsController } from '../modules/insights/insights.controller.js';
import { authenticate, requireRole } from '../common/middleware/auth.js';
import { Role } from '@prisma/client';

import { AuthController } from '../modules/auth/auth.controller.js';
import { PricingController } from '../modules/pricing/pricing.controller.js';
import { validateRequest } from '../common/validation/validate.js';
import { updateProfileSchema } from '../modules/auth/auth.dto.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.get('/users/me', authenticate, AuthController.getMe);
apiRouter.patch('/users/me', authenticate, validateRequest({ body: updateProfileSchema }), AuthController.updateMe);
apiRouter.use('/batches', batchesRouter);
apiRouter.use('/listings', listingsRouter);
apiRouter.use('/requirements', requirementsRouter);
apiRouter.use('/matching', matchingRouter);
apiRouter.use('/pricing', pricingRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/auctions', auctionsRouter);
apiRouter.use('/documents', documentsRouter);
apiRouter.use('/shipments', shipmentsRouter);
apiRouter.use('/maps', mapsRouter);
apiRouter.use('/logistics', logisticsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/insights', insightsRouter);
apiRouter.get('/opportunities', authenticate, requireRole(Role.SELLER, Role.ADMIN), InsightsController.getSellerOpportunities);
apiRouter.get('/ai/pricing/ml/:listingId', authenticate, PricingController.getMlPriceForListing);

