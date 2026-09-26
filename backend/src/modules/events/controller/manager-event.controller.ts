import type { Request, Response, NextFunction } from 'express';
import { ManagerEventService } from '../service/manager-event.service.js';

export class ManagerEventController {
  private managerEventService: ManagerEventService;

  constructor() {
    this.managerEventService = new ManagerEventService();
  }

  getDashboardStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const stats = await this.managerEventService.getManagerDashboardStats(managerId);
      res.status(200).json({
        success: true,
        data: { stats },
      });
    } catch (error) {
      next(error);
    }
  };

  getManagerEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const events = await this.managerEventService.getManagerEvents(managerId, req.query);
      res.status(200).json({
        success: true,
        data: { events },
      });
    } catch (error) {
      next(error);
    }
  };

  getEventById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { id } = req.params;
      const event = await this.managerEventService.getManagerEventById(managerId, id);
      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  };
}
