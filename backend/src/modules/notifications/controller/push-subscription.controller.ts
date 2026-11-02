import type { Request, Response, NextFunction } from 'express';
import {
  PushSubscriptionService,
  pushSubscriptionService,
} from '../service/push-subscription.service.js';
import { ApiError } from '../../../utils/ApiError.js';

export class PushSubscriptionController {
  private service: PushSubscriptionService;

  constructor(service?: PushSubscriptionService) {
    this.service = service || pushSubscriptionService;
  }

  /**
   * GET /api/notifications/push/config
   * Safe public configuration containing VAPID public key.
   */
  getPushConfig = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = this.service.getPublicConfig();
      res.status(200).json({
        success: true,
        message: 'Push configuration retrieved successfully',
        data: config,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/notifications/push/subscriptions
   * Registers or updates a browser device push subscription for the authenticated user.
   */
  registerSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.unauthorized('Authentication required');
      }

      const { endpoint, keys, device } = req.body;
      const result = await this.service.registerSubscription(req.user.id, {
        endpoint,
        keys,
        device,
      });

      res.status(201).json({
        success: true,
        message: 'Push subscription registered successfully',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/notifications/push/subscriptions
   * Lists safe device metadata for all active subscriptions owned by the user.
   */
  getSubscriptions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.unauthorized('Authentication required');
      }

      const subscriptions = await this.service.getUserSubscriptions(req.user.id);

      res.status(200).json({
        success: true,
        message: 'Device subscriptions retrieved successfully',
        data: {
          subscriptions,
          count: subscriptions.length,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/notifications/push/subscriptions/:id
   * Removes a specific device subscription owned by the user.
   */
  deleteSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.unauthorized('Authentication required');
      }

      const { id } = req.params;
      await this.service.deleteSubscription(req.user.id, id);

      res.status(200).json({
        success: true,
        message: 'Push subscription removed successfully',
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/notifications/push/subscriptions/current
   * Removes current browser device subscription by endpoint.
   */
  deleteCurrentSubscription = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id) {
        throw ApiError.unauthorized('Authentication required');
      }

      const endpoint = req.body?.endpoint || (req.query?.endpoint as string);
      if (!endpoint) {
        throw ApiError.badRequest('Subscription endpoint is required to unsubscribe current device');
      }

      await this.service.deleteCurrentSubscription(req.user.id, endpoint);

      res.status(200).json({
        success: true,
        message: 'Current device subscription removed successfully',
      });
    } catch (err) {
      next(err);
    }
  };
}

export const pushSubscriptionController = new PushSubscriptionController();

