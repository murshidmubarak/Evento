import type { Request, Response } from 'express';
import { catchAsync } from '../../../utils/catchAsync.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { ApiError } from '../../../utils/ApiError.js';
import { attendanceConcernService } from '../service/attendance-concern.service.js';

export class AttendanceConcernController {
  /**
   * POST /api/attendance/concerns
   * Worker raises a concern for a Late or Absent attendance record.
   */
  submitConcern = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const concern = await attendanceConcernService.submitConcern(req.user.id, req.body);
    new ApiResponse(201, 'Attendance concern submitted successfully', concern).send(res);
  });

  /**
   * GET /api/attendance/concerns
   * Lists concerns for worker, manager, or admin.
   */
  getConcerns = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const filter = {
      eventId: req.query.eventId as string | undefined,
      status: req.query.status as any,
    };
    const concerns = await attendanceConcernService.getConcerns(
      req.user.id,
      req.user.role,
      filter
    );
    new ApiResponse(200, 'Attendance concerns retrieved', concerns).send(res);
  });

  /**
   * GET /api/attendance/concerns/:concernId
   * Retrieves single concern detail and conversation thread.
   */
  getConcernById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const concern = await attendanceConcernService.getConcernById(
      req.user.id,
      req.user.role,
      req.params.concernId
    );
    new ApiResponse(200, 'Concern details retrieved', concern).send(res);
  });

  /**
   * POST /api/attendance/concerns/:concernId/messages
   * Adds a reply message to an open concern conversation thread.
   */
  addMessage = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const updatedConcern = await attendanceConcernService.addMessage(
      req.user.id,
      req.user.role,
      req.params.concernId,
      req.body.message
    );
    new ApiResponse(200, 'Message sent successfully', updatedConcern).send(res);
  });

  /**
   * POST /api/attendance/concerns/:concernId/resolve
   * Resolves concern (Accept / Reject) with permanent attendance locking.
   */
  resolveConcern = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const resolvedConcern = await attendanceConcernService.resolveConcern(
      req.user.id,
      req.user.role,
      req.params.concernId,
      req.body
    );
    new ApiResponse(200, 'Concern resolved successfully', resolvedConcern).send(res);
  });

  /**
   * GET /api/attendance/worker/records
   * Returns worker's attendance records with concern eligibility metadata.
   */
  getWorkerRecords = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('Authentication required');
    const records = await attendanceConcernService.getWorkerAttendanceRecords(req.user.id);
    new ApiResponse(200, 'Worker attendance records retrieved', records).send(res);
  });
}

export const attendanceConcernController = new AttendanceConcernController();
