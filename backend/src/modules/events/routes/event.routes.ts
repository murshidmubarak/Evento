import { Router } from 'express';
import { EventController } from '../controller/event.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { validateCreateEvent } from '../validation/event.validation.js';

const router = Router();
const eventController = new EventController();

/**
 * @route   POST /api/events
 * @desc    Create a new Event Request
 * @access  Private (Client only)
 */
router.post(
  '/',
  authenticate,
  authorize('client'),
  validateCreateEvent,
  eventController.createEvent
);

/**
 * @route   GET /api/events
 * @desc    Get all Events belonging to the authenticated Client
 * @access  Private (Client only)
 */
router.get(
  '/',
  authenticate,
  authorize('client'),
  eventController.getClientEvents
);

/**
 * @route   GET /api/events/:id
 * @desc    Get a single Event belonging to the authenticated Client
 * @access  Private (Client only)
 */
router.get(
  '/:id',
  authenticate,
  authorize('client'),
  eventController.getClientEventById
);

export default router;
