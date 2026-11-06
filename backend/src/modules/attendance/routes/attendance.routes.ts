import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { attendanceController } from '../controller/attendance.controller.js';
import { validateCheckInFinalization } from '../validation/attendance.validation.js';

const router = Router();

// Strict RBAC: All attendance endpoints require authentication and either admin or event_manager role
router.use(authenticate);
router.use(authorize('admin', 'event_manager'));

// Session initialization & retrieval
router.get('/events/:eventId/session', attendanceController.getSession);

// Worker attendance roster retrieval
router.get('/events/:eventId/roster', attendanceController.getRoster);

// Exception-based check-in finalization
router.post(
  '/events/:eventId/finalize-checkin',
  validateCheckInFinalization,
  attendanceController.finalizeCheckIn
);

export default router;

