import { Router } from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorize } from '../../../middlewares/role.middleware.js';
import { attendanceController } from '../controller/attendance.controller.js';
import { attendanceConcernController } from '../controller/attendance-concern.controller.js';
import {
  validateCheckInFinalization,
  validateCheckOutFinalization,
  validateAttendanceCorrection,
  validateAttendanceVerification,
  validateIndividualCheckIn,
  validateSubmitConcern,
  validateConcernMessage,
  validateResolveConcern,
} from '../validation/attendance.validation.js';

const router = Router();

// All attendance routes require authentication
router.use(authenticate);

// =============================================================================
// Worker-Specific Endpoints
// =============================================================================

// Worker retrieves their own attendance records with concern eligibility
router.get(
  '/worker/records',
  authorize('worker'),
  attendanceConcernController.getWorkerRecords
);

// Worker submits a concern for an eligible Late or Absent record
router.post(
  '/concerns',
  authorize('worker'),
  validateSubmitConcern,
  attendanceConcernController.submitConcern
);

// =============================================================================
// Concern Threads & Messaging (Worker, Event Manager, Admin)
// =============================================================================

// List concerns (workers see only their own; managers see their events; admins see all)
router.get(
  '/concerns',
  authorize('worker', 'event_manager', 'admin'),
  attendanceConcernController.getConcerns
);

// Get single concern detail with full conversation history
router.get(
  '/concerns/:concernId',
  authorize('worker', 'event_manager', 'admin'),
  attendanceConcernController.getConcernById
);

// Post a message in an open concern thread
router.post(
  '/concerns/:concernId/messages',
  authorize('worker', 'event_manager', 'admin'),
  validateConcernMessage,
  attendanceConcernController.addMessage
);

// =============================================================================
// Manager & Admin Endpoints
// =============================================================================

// Manager/Admin resolves a concern (Accept with status correction or Reject)
router.post(
  '/concerns/:concernId/resolve',
  authorize('admin', 'event_manager'),
  validateResolveConcern,
  attendanceConcernController.resolveConcern
);

// Session initialization & retrieval
router.get(
  '/events/:eventId/session',
  authorize('admin', 'event_manager'),
  attendanceController.getSession
);

// Worker attendance roster retrieval
router.get(
  '/events/:eventId/roster',
  authorize('admin', 'event_manager'),
  attendanceController.getRoster
);

// Individual worker check-in immediate confirmation & persistence
router.post(
  '/events/:eventId/workers/:workerId/checkin',
  authorize('admin', 'event_manager'),
  validateIndividualCheckIn,
  attendanceController.recordWorkerCheckIn
);

// Exception-based check-in finalization
router.post(
  '/events/:eventId/finalize-checkin',
  authorize('admin', 'event_manager'),
  validateCheckInFinalization,
  attendanceController.finalizeCheckIn
);

// Exception-based checkout finalization
router.post(
  '/events/:eventId/finalize-checkout',
  authorize('admin', 'event_manager'),
  validateCheckOutFinalization,
  attendanceController.finalizeCheckOut
);

// Attendance correction & absence reversal
router.patch(
  '/records/:attendanceId/correct',
  authorize('admin', 'event_manager'),
  validateAttendanceCorrection,
  attendanceController.correctAttendance
);

// Attendance verification (final manager approval / rejection)
router.post(
  '/events/:eventId/verify',
  authorize('admin', 'event_manager'),
  validateAttendanceVerification,
  attendanceController.verifyAttendance
);

export default router;
