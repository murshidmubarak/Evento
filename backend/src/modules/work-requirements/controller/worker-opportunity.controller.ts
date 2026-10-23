import type { Request, Response, NextFunction } from 'express';
import { WorkerOpportunityService } from '../service/worker-opportunity.service.js';

export class WorkerOpportunityController {
  private opportunityService: WorkerOpportunityService;

  constructor() {
    this.opportunityService = new WorkerOpportunityService();
  }

  getOpportunities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workerId = req.user!.id;
      const opportunities = await this.opportunityService.getAvailableOpportunities(workerId);

      res.status(200).json({
        success: true,
        data: { opportunities },
      });
    } catch (error) {
      next(error);
    }
  };

  expressInterest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workerId = req.user!.id;
      const { requirementId } = req.params;
      const response = await this.opportunityService.expressInterest(workerId, requirementId);

      res.status(201).json({
        success: true,
        message: 'Interest expressed successfully',
        data: { response },
      });
    } catch (error) {
      next(error);
    }
  };

  getMyAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workerId = req.user!.id;
      const assignments = await this.opportunityService.getWorkerAssignments(workerId);

      res.status(200).json({
        success: true,
        data: { assignments },
      });
    } catch (error) {
      next(error);
    }
  };

  updateLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workerId = req.user!.id;
      const { lat, lng, address } = req.body;
      const updated = await this.opportunityService.updateWorkerLocation(workerId, { lat, lng, address });

      res.status(200).json({
        success: true,
        message: 'Location confirmed successfully',
        data: {
          location: updated.location,
          user: updated,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workerId = req.user!.id;
      const location = await this.opportunityService.getWorkerLocation(workerId);

      res.status(200).json({
        success: true,
        data: { location },
      });
    } catch (error) {
      next(error);
    }
  };
}
