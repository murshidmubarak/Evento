import { Router } from 'express';
import { WorkerOpportunityController } from '../controller/worker-opportunity.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import {
  validateRequirementIdParam,
  validateWorkerLocationPayload,
} from '../validation/work-requirement.validation.js';

const router = Router();
const opportunityController = new WorkerOpportunityController();

/**
 * @route   GET /api/worker/location
 * @desc    Get confirmed location of the authenticated worker
 * @access  Private (Worker only)
 */
router.get(
  '/location',
  authenticate,
  authorize('worker'),
  opportunityController.getLocation
);

/**
 * @route   PATCH /api/worker/location
 * @desc    Set or update current confirmed location of the authenticated worker
 * @access  Private (Worker only)
 */
router.patch(
  '/location',
  authenticate,
  authorize('worker'),
  validateWorkerLocationPayload,
  opportunityController.updateLocation
);

/**
 * @route   GET /api/worker/opportunities
 * @desc    View relevant open work opportunities matching worker's category
 * @access  Private (Worker only)
 */
router.get(
  '/opportunities',
  authenticate,
  authorize('worker'),
  opportunityController.getOpportunities
);

/**
 * @route   POST /api/worker/opportunities/:requirementId/interest
 * @desc    Express interest in a specific work requirement
 * @access  Private (Worker only)
 */
router.post(
  '/opportunities/:requirementId/interest',
  authenticate,
  authorize('worker'),
  (req, res, next) => {
    req.params.id = req.params.requirementId;
    validateRequirementIdParam(req, res, next);
  },
  opportunityController.expressInterest
);

/**
 * @route   GET /api/worker/assignments
 * @desc    View confirmed work assignments for the authenticated worker
 * @access  Private (Worker only)
 */
router.get(
  '/assignments',
  authenticate,
  authorize('worker'),
  opportunityController.getMyAssignments
);

export default router;
