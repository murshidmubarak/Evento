import type { Request, Response, NextFunction } from 'express';
import { WorkRequirementService } from '../service/work-requirement.service.js';
import { workerSelectionService } from '../../worker-selection/service/worker-selection.service.js';

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

      const assignedCount = requirement.assignedWorkers?.length || 0;
      res.status(201).json({
        success: true,
        message: 'Work requirement created successfully',
        data: {
          requirement: {
            ...requirement.toJSON(),
            filled: assignedCount,
            pending: Math.max(0, requirement.requiredCount - assignedCount),
          },
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

      const formatted = requirements.map((r) => {
        const assignedCount = r.assignedWorkers?.length || 0;
        return {
          ...r.toJSON(),
          filled: assignedCount,
          pending: Math.max(0, r.requiredCount - assignedCount),
        };
      });

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

      const assignedCount = requirement.assignedWorkers?.length || 0;
      res.status(200).json({
        success: true,
        data: {
          requirement: {
            ...requirement.toJSON(),
            filled: assignedCount,
            pending: Math.max(0, requirement.requiredCount - assignedCount),
          },
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

      const assignedCount = updated.assignedWorkers?.length || 0;
      res.status(200).json({
        success: true,
        message: 'Work requirement updated successfully',
        data: {
          requirement: {
            ...updated.toJSON(),
            filled: assignedCount,
            pending: Math.max(0, updated.requiredCount - assignedCount),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  extendDeadline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { id } = req.params;
      const { interestDeadlineAt } = req.body;
      const updated = await this.requirementService.extendDeadline(managerId, id, interestDeadlineAt);

      const assignedCount = updated.assignedWorkers?.length || 0;
      res.status(200).json({
        success: true,
        message: 'Interest deadline extended successfully. Existing worker assignments are preserved.',
        data: {
          requirement: {
            ...updated.toJSON(),
            filled: assignedCount,
            pending: Math.max(0, updated.requiredCount - assignedCount),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  getSelectionResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { id } = req.params;
      const results = await this.requirementService.getSelectionResults(managerId, id);

      res.status(200).json({
        success: true,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  };

  triggerSelection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const managerId = req.user!.id;
      const { id } = req.params;
      // Ownership check first
      await this.requirementService.getRequirementById(managerId, id);

      const result = await workerSelectionService.executeSelection(id);

      res.status(200).json({
        success: true,
        message: 'Worker selection executed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
