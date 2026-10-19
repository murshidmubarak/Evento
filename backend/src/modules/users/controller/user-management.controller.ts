import type { Request, Response } from 'express';
import { UserService } from '../../auth/service/user.service.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { catchAsync } from '../../../utils/catchAsync.js';

export class UserManagementController {
  constructor(private readonly userService: UserService = new UserService()) {}

  /**
   * POST /api/users/event-managers
   * Admin creates an Event Manager.
   */
  createEventManager = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const safeUser = await this.userService.createEventManager(req.body);

    new ApiResponse(201, 'Event Manager created successfully', {
      user: safeUser,
    }).send(res);
  });

  /**
   * POST /api/users/workers
   * Admin or Event Manager creates a Worker.
   */
  createWorker = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const safeUser = await this.userService.createWorker(req.body, req.user);

    new ApiResponse(201, 'Worker created successfully', {
      user: safeUser,
    }).send(res);
  });

  /**
   * PATCH /api/users/:id/status
   * Admin updates a user's active status.
   */
  updateUserStatus = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const targetUserId = req.params.id;
    const { isActive } = req.body;
    const requestingAdminId = req.user!.id; // Ensure req.user is accessed safely, authenticate middleware guarantees it

    const safeUser = await this.userService.updateUserStatus(targetUserId, isActive, requestingAdminId);

    new ApiResponse(200, `User ${isActive ? 'activated' : 'deactivated'} successfully`, {
      user: safeUser,
    }).send(res);
  });

  /**
   * GET /api/users
   * Admin lists users with optional filtering.
   */
  getUsers = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { role, workerType, isActive } = req.query;
    const filters: { role?: string; workerType?: string; isActive?: boolean } = {};

    if (role && typeof role === 'string') {
      filters.role = role;
    }
    if (workerType && typeof workerType === 'string') {
      filters.workerType = workerType;
    }
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }

    const users = await this.userService.getUsers(filters);

    new ApiResponse(200, 'Users retrieved successfully', {
      users,
    }).send(res);
  });

  /**
   * GET /api/users/workers
   * Admin or Event Manager retrieves workers.
   */
  getWorkers = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { workerType, isActive } = req.query;
    const filters: { workerType?: string; isActive?: boolean } = {};

    if (workerType && typeof workerType === 'string') {
      filters.workerType = workerType;
    }
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }

    const workers = await this.userService.getWorkers(filters, req.user!);

    new ApiResponse(200, 'Workers retrieved successfully', {
      workers,
    }).send(res);
  });

  /**
   * POST /api/users/event-managers/:id/resend-invitation
   * Admin resends an invitation email to a pending Event Manager.
   */
  resendInvitation = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const managerId = req.params.id;
    const result = await this.userService.resendEventManagerInvitation(managerId);

    new ApiResponse(200, result.message, result).send(res);
  });

  /**
   * POST /api/users/workers/:id/resend-invitation
   * Admin or creating Event Manager resends an invitation email to a pending Worker.
   */
  resendWorkerInvitation = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const workerId = req.params.id;
    const result = await this.userService.resendWorkerInvitation(workerId, req.user!);

    new ApiResponse(200, result.message, result).send(res);
  });
}
