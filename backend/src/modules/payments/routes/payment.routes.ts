import { Router } from 'express';
import { createOrder } from '../controller/payment.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { validateCreateOrder } from '../validation/payment.validation.js';

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

export default router;
