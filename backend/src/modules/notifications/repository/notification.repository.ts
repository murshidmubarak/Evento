import mongoose from 'mongoose';
import { Notification, type INotification } from '../model/notification.model.js';

export interface PagedNotificationsResult {
  notifications: INotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class NotificationRepository {
  async create(data: Partial<INotification>): Promise<INotification> {
    if (data.deduplicationKey) {
      const existing = await Notification.findOne({ deduplicationKey: data.deduplicationKey });
      if (existing) return existing;
    }

    try {
      const doc = new Notification(data);
      return await doc.save();
    } catch (err: any) {
      // If duplicate key error on deduplicationKey (code 11000)
      if (err.code === 11000 && data.deduplicationKey) {
        const existing = await Notification.findOne({ deduplicationKey: data.deduplicationKey });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async createManySafe(records: Partial<INotification>[]): Promise<INotification[]> {
    if (!records || records.length === 0) return [];

    // Filter out duplicates within the batch
    const seenKeys = new Set<string>();
    const uniqueRecords: Partial<INotification>[] = [];

    for (const r of records) {
      if (r.deduplicationKey) {
        if (seenKeys.has(r.deduplicationKey)) continue;
        seenKeys.add(r.deduplicationKey);
      }
      uniqueRecords.push(r);
    }

    try {
      // ordered: false ensures that even if one violates a unique index, others still insert
      const inserted = await Notification.insertMany(uniqueRecords, { ordered: false });
      return inserted as unknown as INotification[];
    } catch (err: any) {
      // insertMany with ordered:false returns insertedDocs in err.insertedDocs
      if (err.code === 11000 && err.insertedDocs) {
        return err.insertedDocs as INotification[];
      }
      // If all failed or other error, fallback to one-by-one safe insertion
      const saved: INotification[] = [];
      for (const rec of uniqueRecords) {
        try {
          const doc = await this.create(rec);
          saved.push(doc);
        } catch {
          // Ignore duplicate failures
        }
      }
      return saved;
    }
  }

  async findPagedByRecipient(
    recipientId: string,
    options: { page: number; limit: number; unreadOnly?: boolean }
  ): Promise<PagedNotificationsResult> {
    const { page, limit, unreadOnly } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {
      recipientId: new mongoose.Types.ObjectId(recipientId),
    };

    if (unreadOnly) {
      filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        recipientId: new mongoose.Types.ObjectId(recipientId),
        isRead: false,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      notifications: notifications as unknown as INotification[],
      total,
      unreadCount,
      page,
      limit,
      totalPages,
    };
  }

  async countUnreadByRecipient(recipientId: string): Promise<number> {
    return Notification.countDocuments({
      recipientId: new mongoose.Types.ObjectId(recipientId),
      isRead: false,
    });
  }

  async findByIdAndRecipient(id: string, recipientId: string): Promise<INotification | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Notification.findOne({
      _id: new mongoose.Types.ObjectId(id),
      recipientId: new mongoose.Types.ObjectId(recipientId),
    });
  }

  async findByDeduplicationKey(deduplicationKey: string): Promise<INotification | null> {
    return Notification.findOne({ deduplicationKey });
  }

  async markAsRead(id: string, recipientId: string): Promise<INotification | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Notification.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(id),
        recipientId: new mongoose.Types.ObjectId(recipientId),
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { new: true }
    );
  }

  async markAllAsRead(recipientId: string): Promise<number> {
    const result = await Notification.updateMany(
      {
        recipientId: new mongoose.Types.ObjectId(recipientId),
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    return result.modifiedCount;
  }
}

export const notificationRepository = new NotificationRepository();
