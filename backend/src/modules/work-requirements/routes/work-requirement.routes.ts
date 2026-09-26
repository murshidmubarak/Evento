import { Router } from 'express';
import { WorkRequirementController } from '../controller/work-requirement.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';

const router = Router({ mergeParams: true });
const requirementController = new WorkRequirementController();

/**
 * @route   POST /api/manager/events/:eventId/work-requirements
 * @desc    Create a new Work Requirement for an Event
 * @access  Private (Event Manager only)
 */
router.post(
  '/',
  authenticate,
  authorize('event_manager'),
  requirementController.createRequirement
);

/**
 * @route   GET /api/manager/events/:eventId/work-requirements
 * @desc    List all Work Requirements for an Event
 * @access  Private (Event Manager only)
 */
router.get(
  '/',
  authenticate,
  authorize('event_manager'),
  requirementController.getRequirementsByEvent
);

export default router;
