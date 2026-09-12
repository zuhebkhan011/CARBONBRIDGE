import { Router } from 'express';
import { MapsController } from './maps.controller.js';
import { authenticate } from '../../common/middleware/auth.js';

export const mapsRouter = Router();

mapsRouter.use(authenticate);

mapsRouter.get('/active', MapsController.getActiveTransactionMap);
