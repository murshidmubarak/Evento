import { Router } from 'express';
import { handleRazorpayWebhook } from '../controller/payment.controller.js';

const router = Router();

/**
 * @route   POST /api/webhooks/razorpay
 * @desc    Public webhook endpoint for Razorpay payment link events (paid, partially_paid, expired, cancelled)
 * @access  Public (Authenticated via HMAC-SHA256 signature on raw request body)
 */
router.post('/razorpay', handleRazorpayWebhook);

export default router;
