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
    const safeUser = await this.userService.createWorker(req.body);

    new ApiResponse(201, 'Worker created successfully', {
      user: safeUser,
    }).send(res);
  });
}
