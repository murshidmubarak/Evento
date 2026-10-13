import { Router } from 'express';
import {
  createOrder,
  verifyOrder,
  previewAllocation,
  getAdvanceSummary,
  getPaymentScheduleSummary,
  renewPaymentLink,
  getAdminPayments,
  reconcilePaymentLink,
} from '../controller/payment.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import {
  validateCreateOrder,
  validateVerifyOrder,
  validatePreviewAllocation,
  validateRenewPaymentLink,
  validateReconcilePaymentLink,
} from '../validation/payment.validation.js';

const router = Router();

/**
 * @route   POST /api/payments/create-order
 * @desc    Create a payment order for an advance or installment
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
 * @route   POST /api/payments/preview-allocation
 * @desc    Preview multi-installment allocation and resulting balances before checkout
 * @access  Private (Client)
 */
router.post(
  '/preview-allocation',
  authenticate,
  authorize('client'),
  validatePreviewAllocation,
  previewAllocation
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
 * @route   GET /api/payments/schedule/:eventId
 * @desc    Get complete payment schedule summary, installments, link history, and status
 * @access  Private (Client, Admin, Event Manager)
 */
router.get(
  '/schedule/:eventId',
  authenticate,
  authorize('client', 'admin', 'event_manager'),
  getPaymentScheduleSummary
);

/**
 * @route   POST /api/payments/renew-link
 * @desc    Authorized Admin renewal of an expired payment link for outstanding balance
 * @access  Private (Admin)
 */
router.post(
  '/renew-link',
  authenticate,
  authorize('admin'),
  validateRenewPaymentLink,
  renewPaymentLink
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

/**
 * @route   POST /api/payments/reconcile-link
 * @desc    Client callback reconciliation endpoint for external Razorpay payment links
 * @access  Private (Client)
 */
router.post(
  '/reconcile-link',
  authenticate,
  authorize('client'),
  validateReconcilePaymentLink,
  reconcilePaymentLink
);

export default router;

