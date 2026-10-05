import type { Request, Response, NextFunction } from 'express';
import { EventService } from '../service/event.service.js';

export class EventController {
  private eventService: EventService;

  constructor() {
    this.eventService = new EventService();
  }

  createEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientId = req.user!.id;
      const event = await this.eventService.createEvent(clientId, req.body);
      res.status(201).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  };

  getClientEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientId = req.user!.id;
      const events = await this.eventService.getClientEvents(clientId);
      res.status(200).json({
        success: true,
        data: { events },
      });
    } catch (error) {
      next(error);
    }
  };

  getAllEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const role = req.user!.role;
      const filters = req.query; // Allow passing status, type, etc via query params
      const events = await this.eventService.getAllEvents(role, filters);
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
      const userId = req.user!.id;
      const role = req.user!.role;
      const { id } = req.params;
      const event = await this.eventService.getEventById(userId, role, id);
      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  };

  uploadReferenceImages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const { serviceId } = req.body;
      const files = req.files as Express.Multer.File[];

      const EventMediaService = (await import('../service/event-media.service.js')).EventMediaService;
      const eventMediaService = new EventMediaService();

      const uploadedImages = await eventMediaService.uploadReferenceImages(userId, id, serviceId, files);

      res.status(200).json({
        success: true,
        data: { 
          eventId: id,
          serviceId,
          referenceImages: uploadedImages 
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
