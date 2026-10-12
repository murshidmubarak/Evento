import { Router } from 'express';
import { createOrder, verifyOrder, getAdvanceSummary, getAdminPayments } from '../controller/payment.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { validateCreateOrder, validateVerifyOrder } from '../validation/payment.validation.js';

const router = Router();

/**
 * @route   POST /api/payments/create-order
 * @desc    Create a payment order for an event
 * @access  Private (Client)
 */
router.post(
  '/create-order',
  authenticate,
  authorize('client'), // Only clients can create their orders
  validateCreateOrder,
  createOrder
);

/**
 * @route   POST /api/payments/verify
 * @desc    Verify a payment signature and confirm event
 * @access  Private (Client)
 */
router.post(
  '/verify',
  authenticate,
  authorize('client'),
  validateVerifyOrder,
  verifyOrder
);

/**
 * @route   GET /api/payments/advance-summary/:eventId
 * @desc    Get authoritative advance payment summary for an event
 * @access  Private (Client, Admin, Event Manager)
 */
router.get(
  '/advance-summary/:eventId',
  authenticate,
  authorize('client', 'admin', 'event_manager'),
  getAdvanceSummary
);

/**
 * @route   GET /api/payments/admin
 * @desc    List all payments or payments for an event
 * @access  Private (Admin, Event Manager)
 */
router.get(
  '/admin',
  authenticate,
  authorize('admin', 'event_manager'),
  getAdminPayments
);

export default router;

