import { Router } from 'express';
import { notificationController } from '../controller/notification.controller.js';
import { pushSubscriptionController } from '../controller/push-subscription.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';

const router = Router();

// Safe public/authenticated configuration endpoint (exposes public VAPID key only)
router.get('/push/config', pushSubscriptionController.getPushConfig);

// All other notification routes require authentication
router.use(authenticate);

// Push subscription device endpoints
router.post('/push/subscriptions', pushSubscriptionController.registerSubscription);
router.get('/push/subscriptions', pushSubscriptionController.getSubscriptions);
router.delete('/push/subscriptions/current', pushSubscriptionController.deleteCurrentSubscription);
router.delete('/push/subscriptions/:id', pushSubscriptionController.deleteSubscription);

// Persistent in-app notifications
router.get('/', notificationController.getMyNotifications);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

export default router;
