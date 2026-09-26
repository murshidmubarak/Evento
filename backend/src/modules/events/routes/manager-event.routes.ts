import { Router } from 'express';
import { ManagerEventController } from '../controller/manager-event.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';

const router = Router();
const managerEventController = new ManagerEventController();

/**
 * @route   GET /api/manager/dashboard
 * @desc    Get dashboard stats for the authenticated Event Manager
 * @access  Private (Event Manager only)
 */
router.get(
  '/dashboard',
  authenticate,
  authorize('event_manager'),
  managerEventController.getDashboardStats
);

/**
 * @route   GET /api/manager/events
 * @desc    Get all Events assigned to the authenticated Event Manager
 * @access  Private (Event Manager only)
 */
router.get(
  '/events',
  authenticate,
  authorize('event_manager'),
  managerEventController.getManagerEvents
);

/**
 * @route   GET /api/manager/events/:id
 * @desc    Get detailed Event information for the Event Control Center
 * @access  Private (Event Manager only)
 */
router.get(
  '/events/:id',
  authenticate,
  authorize('event_manager'),
  managerEventController.getEventById
);

export default router;
