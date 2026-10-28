import mongoose from 'mongoose';
import { NotificationRepository, type PagedNotificationsResult } from '../repository/notification.repository.js';
import { notificationTransport } from '../../../sockets/notification-transport.js';
import type { INotification } from '../model/notification.model.js';
import { ApiError } from '../../../utils/ApiError.js';

export interface CreateNotificationInput {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
  destinationRoute?: string;
  deduplicationKey?: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private repository: NotificationRepository;

  constructor(repository?: NotificationRepository) {
    this.repository = repository || new NotificationRepository();
  }

  /**
   * Validates internal application route to prevent open redirect vulnerabilities.
   */
  private sanitizeDestinationRoute(route?: string): string | undefined {
    if (!route) return undefined;
    const trimmed = route.trim();
    // Must start with a single slash and avoid protocol/external URLs
    if (/^\/[a-zA-Z0-9_\-\/?&=#%]*$/.test(trimmed) && !trimmed.startsWith('//')) {
      return trimmed;
    }
    return undefined;
  }

  /**
   * Internal trusted method to create and persist a notification, followed by real-time dispatch.
   */
  async createNotification(input: CreateNotificationInput): Promise<INotification | null> {
    if (!input.recipientId || !mongoose.Types.ObjectId.isValid(input.recipientId)) {
      console.warn('⚠️ [NotificationService] Invalid recipientId format:', input.recipientId);
      return null;
    }

    if (!input.title || !input.title.trim()) {
      console.warn('⚠️ [NotificationService] Missing notification title');
      return null;
    }

    if (!input.message || !input.message.trim()) {
      console.warn('⚠️ [NotificationService] Missing notification message');
      return null;
    }

    const docData: Partial<INotification> = {
      recipientId: new mongoose.Types.ObjectId(input.recipientId),
      type: input.type || 'general',
      title: input.title.trim(),
      message: input.message.trim(),
      resourceType: input.resourceType?.trim(),
      resourceId: input.resourceId?.trim(),
      destinationRoute: this.sanitizeDestinationRoute(input.destinationRoute),
      deduplicationKey: input.deduplicationKey?.trim(),
      metadata: input.metadata || {},
      isRead: false,
    };

    try {
      // 1. Persist to MongoDB (source of truth)
      const persisted = await this.repository.create(docData);

      // 2. Attempt real-time delivery (transport errors are caught internally)
      await notificationTransport.sendNotification(input.recipientId, {
        _id: persisted._id,
        recipientId: persisted.recipientId,
        type: persisted.type,
        title: persisted.title,
        message: persisted.message,
        isRead: persisted.isRead,
        resourceType: persisted.resourceType,
        resourceId: persisted.resourceId,
        destinationRoute: persisted.destinationRoute,
        createdAt: persisted.createdAt,
      });

      return persisted;
    } catch (err: any) {
      console.error('❌ [NotificationService] Failed to persist notification:', err.message);
      return null;
    }
  }

  /**
   * Creates notifications in bounded batches for broadcasting to multiple recipients (e.g. Work Requirement announcements).
   */
  async createNotificationsBatch(inputs: CreateNotificationInput[], batchSize = 50): Promise<INotification[]> {
    if (!inputs || inputs.length === 0) return [];

    const validRecords: Partial<INotification>[] = [];
    for (const input of inputs) {
      if (!input.recipientId || !mongoose.Types.ObjectId.isValid(input.recipientId)) continue;
      if (!input.title?.trim() || !input.message?.trim()) continue;

      validRecords.push({
        recipientId: new mongoose.Types.ObjectId(input.recipientId),
        type: input.type || 'general',
        title: input.title.trim(),
        message: input.message.trim(),
        resourceType: input.resourceType?.trim(),
        resourceId: input.resourceId?.trim(),
        destinationRoute: this.sanitizeDestinationRoute(input.destinationRoute),
        deduplicationKey: input.deduplicationKey?.trim(),
        metadata: input.metadata || {},
        isRead: false,
      });
    }

    const allSaved: INotification[] = [];

    // Chunk into bounded batches
    for (let i = 0; i < validRecords.length; i += batchSize) {
      const chunk = validRecords.slice(i, i + batchSize);
      try {
        const savedBatch = await this.repository.createManySafe(chunk);
        allSaved.push(...savedBatch);

        // Dispatch real-time events for this batch
        for (const doc of savedBatch) {
          notificationTransport.sendNotification(doc.recipientId.toString(), {
            _id: doc._id,
            recipientId: doc.recipientId,
            type: doc.type,
            title: doc.title,
            message: doc.message,
            isRead: doc.isRead,
            resourceType: doc.resourceType,
            resourceId: doc.resourceId,
            destinationRoute: doc.destinationRoute,
            createdAt: doc.createdAt,
          }).catch(() => {});
        }
      } catch (batchErr: any) {
        console.error('❌ [NotificationService] Error in batch notification insertion:', batchErr.message);
      }
    }

    return allSaved;
  }

  /**
   * Retrieves paginated notifications strictly scoped to the authenticated recipient.
   */
  async getUserNotifications(
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean }
  ): Promise<PagedNotificationsResult> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw ApiError.badRequest('Invalid user ID format');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 20));

    return this.repository.findPagedByRecipient(userId, {
      page,
      limit,
      unreadOnly: query.unreadOnly === true,
    });
  }

  /**
   * Marks a specific notification as read, enforcing user ownership.
   */
  async markAsRead(id: string, userId: string): Promise<INotification> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest('Invalid notification ID format');
    }
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw ApiError.badRequest('Invalid user ID format');
    }

    const updated = await this.repository.markAsRead(id, userId);
    if (!updated) {
      throw ApiError.notFound('Notification not found');
    }

    return updated;
  }

  /**
   * Marks all unread notifications belonging to the user as read.
   */
  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw ApiError.badRequest('Invalid user ID format');
    }

    const modifiedCount = await this.repository.markAllAsRead(userId);
    return { modifiedCount };
  }

  /**
   * Returns unread notifications count for the authenticated user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return 0;
    }
    return this.repository.countUnreadByRecipient(userId);
  }
}

export const notificationService = new NotificationService();
