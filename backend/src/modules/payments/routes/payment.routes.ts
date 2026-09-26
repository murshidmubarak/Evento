import { Router } from 'express';
import { createOrder, verifyOrder } from '../controller/payment.controller.js';
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

export default router;
