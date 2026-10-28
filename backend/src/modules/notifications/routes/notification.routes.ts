import { Router } from 'express';
import { notificationController } from '../controller/notification.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// Get my notifications (paginated, newest first)
router.get('/', notificationController.getMyNotifications);

// Mark all notifications as read (declared before :id to prevent matching as param)
router.patch('/read-all', notificationController.markAllAsRead);

// Mark single notification as read
router.patch('/:id/read', notificationController.markAsRead);

export default router;
