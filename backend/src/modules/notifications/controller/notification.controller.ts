import type { Request, Response, NextFunction } from 'express';
import { notificationService, NotificationService } from '../service/notification.service.js';
import { ApiError } from '../../../utils/ApiError.js';

export class NotificationController {
  private service: NotificationService;

  constructor(service?: NotificationService) {
    this.service = service || notificationService;
  }

  getMyNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.unauthorized('Authentication required');
      }

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';

      if (isNaN(page) || page < 1) {
        throw ApiError.badRequest('Invalid page number');
      }
      if (isNaN(limit) || limit < 1) {
        throw ApiError.badRequest('Invalid limit number');
      }

      const result = await this.service.getUserNotifications(req.user.id, {
        page,
        limit,
        unreadOnly,
      });

      res.status(200).json({
        success: true,
        message: 'Notifications fetched successfully',
        data: {
          notifications: result.notifications,
          unreadCount: result.unreadCount,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  };

  markAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.unauthorized('Authentication required');
      }

      const { id } = req.params;
      const updated = await this.service.markAsRead(id, req.user.id);

      res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  };

  markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.unauthorized('Authentication required');
      }

      const result = await this.service.markAllAsRead(req.user.id);

      res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };
}

export const notificationController = new NotificationController();
