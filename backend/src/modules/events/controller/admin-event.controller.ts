import type { Request, Response, NextFunction } from 'express';
import { AdminEventService } from '../service/admin-event.service.js';

export class AdminEventController {
  private adminEventService: AdminEventService;

  constructor() {
    this.adminEventService = new AdminEventService();
  }

  getAvailableManagers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const managers = await this.adminEventService.getAvailableManagers(id);
      res.status(200).json({
        success: true,
        data: { managers },
      });
    } catch (error) {
      next(error);
    }
  };

  assignManager = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { eventManagerId } = req.body;
      const event = await this.adminEventService.assignManager(id, eventManagerId);
      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  };
}
