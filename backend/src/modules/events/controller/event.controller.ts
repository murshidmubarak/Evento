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

  getClientEventById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientId = req.user!.id;
      const { id } = req.params;
      const event = await this.eventService.getClientEventById(clientId, id);
      res.status(200).json({
        success: true,
        data: { event },
      });
    } catch (error) {
      next(error);
    }
  };
}
