import { Router } from 'express';
import { createQuotation, getQuotations, getQuotation, sendQuotation, acceptQuotation, rejectQuotation, requestChangesQuotation } from '../controller/quotation.controller.js';
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

/**
 * @route   PATCH /api/quotations/:id/send
 * @desc    Send a quotation to the client
 * @access  Private (Admin, Event Manager)
 */
router.patch(
  '/:id/send',
  authenticate,
  authorize('admin', 'event_manager'),
  sendQuotation
);

/**
 * @route   PATCH /api/quotations/:id/accept
 * @desc    Client accepts a quotation
 * @access  Private (Client)
 */
router.patch(
  '/:id/accept',
  authenticate,
  authorize('client'),
  acceptQuotation
);

/**
 * @route   PATCH /api/quotations/:id/reject
 * @desc    Client rejects a quotation
 * @access  Private (Client)
 */
router.patch(
  '/:id/reject',
  authenticate,
  authorize('client'),
  rejectQuotation
);

/**
 * @route   PATCH /api/quotations/:id/request-changes
 * @desc    Client requests changes to a quotation
 * @access  Private (Client)
 */
router.patch(
  '/:id/request-changes',
  authenticate,
  authorize('client'),
  requestChangesQuotation
);

export default router;
