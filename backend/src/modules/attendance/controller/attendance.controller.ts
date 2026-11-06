import type { Request, Response } from 'express';
import { catchAsync } from '../../../utils/catchAsync.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { ApiError } from '../../../utils/ApiError.js';
import { attendanceService } from '../service/attendance.service.js';

export class AttendanceController {
  /**
   * GET /api/attendance/events/:eventId/session
   * Retrieves or initializes the event attendance session.
   */
  getSession = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { eventId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const session = await attendanceService.getSession(userId, userRole, eventId);
    new ApiResponse(200, 'Attendance session retrieved successfully', session).send(res);
  });

  /**
   * GET /api/attendance/events/:eventId/roster
   * Retrieves the assigned worker attendance roster with current status and timing guard state.
   */
  getRoster = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { eventId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const roster = await attendanceService.getRoster(userId, userRole, eventId);
    new ApiResponse(200, 'Attendance roster retrieved successfully', roster).send(res);
  });

  /**
   * POST /api/attendance/events/:eventId/finalize-checkin
   * Executes manager exception-based check-in finalization with idempotency.
   */
  finalizeCheckIn = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const { eventId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw ApiError.badRequest('Idempotency-Key header is required');
    }

    const result = await attendanceService.finalizeCheckIn(
      userId,
      userRole,
      eventId,
      idempotencyKey.trim(),
      req.body
    );

    new ApiResponse(200, 'Check-in finalized successfully', result).send(res);
  });
}

export const attendanceController = new AttendanceController();
