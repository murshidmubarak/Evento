import { Router } from 'express';
import { ManagerEventController } from '../controller/manager-event.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';

const router = Router();
const managerEventController = new ManagerEventController();

import workRequirementRoutes from '../../work-requirements/routes/work-requirement.routes.js';
import workRequirementRootRoutes from '../../work-requirements/routes/work-requirement-root.routes.js';
import { UserManagementController } from '../../users/controller/user-management.controller.js';
import { validateWorkerCreation } from '../../auth/validation/user.validation.js';

const userManagementController = new UserManagementController();

router.use('/events/:eventId/work-requirements', workRequirementRoutes);
router.use('/work-requirements', workRequirementRootRoutes);

/**
 * @route   GET /api/manager/workers
 * @desc    Get workers created by the authenticated Event Manager
 * @access  Private (Event Manager only)
 */
router.get(
  '/workers',
  authenticate,
  authorize('event_manager'),
  userManagementController.getWorkers
);

/**
 * @route   POST /api/manager/workers
 * @desc    Event Manager creates a new Worker (generates invitation email)
 * @access  Private (Event Manager only)
 */
router.post(
  '/workers',
  authenticate,
  authorize('event_manager'),
  validateWorkerCreation,
  userManagementController.createWorker
);

/**
 * @route   POST /api/manager/workers/:id/resend-invitation
 * @desc    Event Manager resends invitation to a pending Worker they created
 * @access  Private (Event Manager only)
 */
router.post(
  '/workers/:id/resend-invitation',
  authenticate,
  authorize('event_manager'),
  userManagementController.resendWorkerInvitation
);

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
