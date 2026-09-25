import { Router } from 'express';
import { createQuotation, getQuotations, getQuotation } from '../controller/quotation.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { validateCreateQuotation } from '../validation/quotation.validation.js';

const router = Router();

/**
 * @route   POST /api/quotations
 * @desc    Create a new Quotation
 * @access  Private (Admin, Event Manager)
 */
router.post(
  '/',
  authenticate,
  authorize('admin', 'event_manager'),
  validateCreateQuotation,
  createQuotation
);

/**
 * @route   GET /api/quotations
 * @desc    Get quotations
 * @access  Private (Admin, Client, Event Manager)
 */
router.get(
  '/',
  authenticate,
  authorize('admin', 'client', 'event_manager'),
  getQuotations
);

/**
 * @route   GET /api/quotations/:id
 * @desc    Get a specific quotation by ID
 * @access  Private (Admin, Client, Event Manager)
 */
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'client', 'event_manager'),
  getQuotation
);

export default router;
