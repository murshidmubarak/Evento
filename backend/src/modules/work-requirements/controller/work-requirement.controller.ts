import type { Request, Response, NextFunction } from 'express';
import { WorkRequirementService } from '../service/work-requirement.service.js';

export class WorkRequirementController {
  private requirementService: WorkRequirementService;

  constructor() {
    this.requirementService = new WorkRequirementService();
  }

  createRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { eventId } = req.params;
      const requirement = await this.requirementService.createRequirement(managerId, eventId, req.body);

      // Return requested shape with filled/pending placeholders per the prompt requirements
      res.status(201).json({
        success: true,
        message: 'Work requirement created successfully',
        data: {
          requirement: {
            ...requirement.toJSON(),
            filled: 0,
            pending: requirement.requiredCount
          }
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getRequirementsByEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { eventId } = req.params;
      const requirements = await this.requirementService.getRequirementsByEvent(managerId, eventId);

      const formatted = requirements.map(r => ({
        ...r.toJSON(),
        filled: 0,
        pending: r.requiredCount
      }));

      res.status(200).json({
        success: true,
        data: { requirements: formatted },
      });
    } catch (error) {
      next(error);
    }
  };

  getRequirementById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { id } = req.params;
      const requirement = await this.requirementService.getRequirementById(managerId, id);

      res.status(200).json({
        success: true,
        data: {
          requirement: {
            ...requirement.toJSON(),
            filled: 0,
            pending: requirement.requiredCount
          }
        },
      });
    } catch (error) {
      next(error);
    }
  };

  updateRequirement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { id } = req.params;
      const updated = await this.requirementService.updateRequirement(managerId, id, req.body);

      res.status(200).json({
        success: true,
        message: 'Work requirement updated successfully',
        data: {
          requirement: {
            ...updated.toJSON(),
            filled: 0,
            pending: updated.requiredCount
          }
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
