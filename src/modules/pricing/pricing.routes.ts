import { Router } from 'express';
import { PricingController } from './pricing.controller.js';
import { authenticate } from '../../common/middleware/auth.js';

export const pricingRouter = Router();

pricingRouter.use(authenticate);

pricingRouter.get('/recommendation', PricingController.getAdvisoryPrice);
pricingRouter.post('/recommendation', PricingController.getAdvisoryPrice);
pricingRouter.get('/advisory', PricingController.getAdvisoryPrice);
pricingRouter.post('/advisory', PricingController.getAdvisoryPrice);
