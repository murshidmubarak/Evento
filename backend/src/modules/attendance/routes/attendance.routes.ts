import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { attendanceController } from '../controller/attendance.controller.js';
import {
  validateCheckInFinalization,
  validateCheckOutFinalization,
  validateAttendanceCorrection,
  validateAttendanceVerification,
  validateIndividualCheckIn,
} from '../validation/attendance.validation.js';

const router = Router();

// Strict RBAC: All attendance endpoints require authentication and either admin or event_manager role
router.use(authenticate);
router.use(authorize('admin', 'event_manager'));

// Session initialization & retrieval
router.get('/events/:eventId/session', attendanceController.getSession);

// Worker attendance roster retrieval
router.get('/events/:eventId/roster', attendanceController.getRoster);

// Individual worker check-in immediate confirmation & persistence
router.post(
  '/events/:eventId/workers/:workerId/checkin',
  validateIndividualCheckIn,
  attendanceController.recordWorkerCheckIn
);

// Exception-based check-in finalization
router.post(
  '/events/:eventId/finalize-checkin',
  validateCheckInFinalization,
  attendanceController.finalizeCheckIn
);

// Exception-based checkout finalization
router.post(
  '/events/:eventId/finalize-checkout',
  validateCheckOutFinalization,
  attendanceController.finalizeCheckOut
);

// Attendance correction & absence reversal
router.patch(
  '/records/:attendanceId/correct',
  validateAttendanceCorrection,
  attendanceController.correctAttendance
);

// Attendance verification (final manager approval / rejection)
router.post(
  '/events/:eventId/verify',
  validateAttendanceVerification,
  attendanceController.verifyAttendance
);

export default router;

