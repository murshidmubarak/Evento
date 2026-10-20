import { Router } from 'express';
import { WorkRequirementController } from '../controller/work-requirement.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import {
  validateRequirementIdParam,
  validateUpdateWorkRequirement,
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

export default router;
