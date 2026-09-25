import { Router } from 'express';
import { ServiceController } from '../controller/service.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { validateCreateService, validateUpdateService, validateServiceStatusUpdate } from '../validation/service.validation.js';

const router = Router();
const serviceController = new ServiceController();

/**
 * @route   POST /api/services
 * @desc    Create a new Service
 * @access  Private (Admin only)
 */
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validateCreateService,
  serviceController.createService
);

/**
 * @route   PATCH /api/services/:id
 * @desc    Update a Service's catalog details
 * @access  Private (Admin only)
 */
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validateUpdateService,
  serviceController.updateService
);

/**
 * @route   PATCH /api/services/:id/status
 * @desc    Activate or deactivate a Service
 * @access  Private (Admin only)
 */
router.patch(
  '/:id/status',
  authenticate,
  authorize('admin'),
  validateServiceStatusUpdate,
  serviceController.updateServiceStatus
);

/**
 * @route   GET /api/services
 * @desc    Get all Services
 * @access  Private (Authenticated users - Admin sees all, others see active only)
 */
router.get(
  '/',
  authenticate,
  serviceController.getServices
);

/**
 * @route   GET /api/services/:id
 * @desc    Get a single Service
 * @access  Private (Authenticated users)
 */
router.get(
  '/:id',
  authenticate,
  serviceController.getServiceById
);



export default router;
