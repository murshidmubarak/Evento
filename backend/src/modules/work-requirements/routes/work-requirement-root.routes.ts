import { Router } from 'express';
import { WorkRequirementController } from '../controller/work-requirement.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import {
  validateRequirementIdParam,
  validateUpdateWorkRequirement,
  validateExtendDeadline,
} from '../validation/work-requirement.validation.js';

const router = Router();
const requirementController = new WorkRequirementController();

/**
 * @route   GET /api/manager/work-requirements/:id
 * @desc    Get detailed Work Requirement
 * @access  Private (Event Manager only)
 */
router.get(
  '/:id',
  authenticate,
  authorize('event_manager'),
  validateRequirementIdParam,
  requirementController.getRequirementById
);

/**
 * @route   PATCH /api/manager/work-requirements/:id
 * @desc    Update a Work Requirement
 * @access  Private (Event Manager only)
 */
router.patch(
  '/:id',
  authenticate,
  authorize('event_manager'),
  validateUpdateWorkRequirement,
  requirementController.updateRequirement
);

/**
 * @route   POST /api/manager/work-requirements/:id/extend-deadline
 * @desc    Extend the interest deadline for an unfilled work requirement
 * @access  Private (Event Manager only)
 */
router.post(
  '/:id/extend-deadline',
  authenticate,
  authorize('event_manager'),
  validateExtendDeadline,
  requirementController.extendDeadline
);

/**
 * @route   GET /api/manager/work-requirements/:id/selection-results
 * @desc    Get deterministic selection results and evaluated candidates
 * @access  Private (Event Manager only)
 */
router.get(
  '/:id/selection-results',
  authenticate,
  authorize('event_manager'),
  validateRequirementIdParam,
  requirementController.getSelectionResults
);

/**
 * @route   POST /api/manager/work-requirements/:id/trigger-selection
 * @desc    Manually trigger worker selection for an expired window (Manager / Admin / Testing)
 * @access  Private (Event Manager only)
 */
router.post(
  '/:id/trigger-selection',
  authenticate,
  authorize('event_manager'),
  validateRequirementIdParam,
  requirementController.triggerSelection
);

export default router;
