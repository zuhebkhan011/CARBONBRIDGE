import { Router } from 'express';
import { NotificationsController } from './notifications.controller.js';
import { authenticate } from '../../common/middleware/auth.js';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get('/', NotificationsController.getMyNotifications);
notificationsRouter.get('/unread-count', NotificationsController.getUnreadCount);
notificationsRouter.patch('/read-all', NotificationsController.markAllAsRead);
notificationsRouter.patch('/:id/read', NotificationsController.markAsRead);
