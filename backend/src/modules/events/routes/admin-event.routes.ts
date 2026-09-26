import { Router } from 'express';
import { AdminEventController } from '../controller/admin-event.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';

const router = Router();
const adminEventController = new AdminEventController();

/**
 * @route   GET /api/admin/events/:id/available-managers
 * @desc    Get eligible Event Managers for an event
 * @access  Private (Admin only)
 */
router.get(
  '/:id/available-managers',
  authenticate,
  authorize('admin'),
  adminEventController.getAvailableManagers
);

/**
 * @route   PATCH /api/admin/events/:id/manager
 * @desc    Assign an Event Manager to a confirmed Event
 * @access  Private (Admin only)
 */
router.patch(
  '/:id/manager',
  authenticate,
  authorize('admin'),
  adminEventController.assignManager
);

export default router;
