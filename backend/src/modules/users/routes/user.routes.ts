import { Router } from 'express';
import { UserManagementController } from '../controller/user-management.controller.js';
import { validateEventManagerCreation, validateWorkerCreation, validateUserStatusUpdate } from '../../auth/validation/user.validation.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';

const router = Router();
const userManagementController = new UserManagementController();

/**
 * @route   POST /api/users/event-managers
 * @desc    Admin creates a new Event Manager (generates invitation)
 * @access  Private (Admin only)
 */
router.post(
  '/event-managers',
  authenticate,
  authorize('admin'),
  validateEventManagerCreation,
  userManagementController.createEventManager
);

/**
 * @route   POST /api/users/event-managers/:id/resend-invitation
 * @desc    Admin resends invitation to an Event Manager
 * @access  Private (Admin only)
 */
router.post(
  '/event-managers/:id/resend-invitation',
  authenticate,
  authorize('admin'),
  userManagementController.resendInvitation
);

/**
 * @route   POST /api/users/workers
 * @desc    Admin or Event Manager creates a new Worker
 * @access  Private (Admin, Event Manager)
 */
router.post(
  '/workers',
  authenticate,
  authorize('admin', 'event_manager'),
  validateWorkerCreation,
  userManagementController.createWorker
);

/**
 * @route   PATCH /api/users/:id/status
 * @desc    Admin updates a user's active status
 * @access  Private (Admin only)
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('admin'),
  validateUserStatusUpdate,
  userManagementController.updateUserStatus
);

/**
 * @route   GET /api/users
 * @desc    Admin retrieves users with optional filtering
 * @access  Private (Admin only)
 */
router.get(
  '/',
  authenticate,
  authorize('admin'),
  userManagementController.getUsers
);

export default router;
