import type { Request, Response, NextFunction } from 'express';
import { ServiceService } from '../service/service.service.js';

export class ServiceController {
  private serviceService: ServiceService;

  constructor() {
    this.serviceService = new ServiceService();
  }

  createService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const service = await this.serviceService.createService(req.body);
      res.status(201).json({
        success: true,
        data: { service },
      });
    } catch (error) {
      next(error);
    }
  };

  updateService = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const service = await this.serviceService.updateService(id, req.body);
      res.status(200).json({
        success: true,
        data: { service },
      });
    } catch (error) {
      next(error);
    }
  };

  updateServiceStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      const service = await this.serviceService.updateServiceStatus(id, isActive);
      res.status(200).json({
        success: true,
        data: { service },
      });
    } catch (error) {
      next(error);
    }
  };

  getServices = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filter: any = {};
      
      // If user is not admin, only return active services
      if (req.user?.role !== 'admin') {
        filter.isActive = true;
      }

      const services = await this.serviceService.getServices(filter);
      res.status(200).json({
        success: true,
        data: { services },
      });
    } catch (error) {
      next(error);
    }
  };

  getServiceById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const service = await this.serviceService.getServiceById(id);
      
      // If user is not admin, they should not see inactive services. 
      // But for getById, just returning it is fine, or we can restrict it. Let's restrict if not active and not admin.
      if (req.user?.role !== 'admin' && !service.isActive) {
        res.status(404).json({ success: false, message: 'Service not found' });
        return;
      }

      res.status(200).json({
        success: true,
        data: { service },
      });
    } catch (error) {
      next(error);
    }
  };
}
