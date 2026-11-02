import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'node:crypto';

export type PushSubscriptionStatus = 'active' | 'inactive' | 'invalid';
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface IDeviceMetadata {
  userAgent?: string;
  deviceType?: DeviceType;
  browser?: string;
  os?: string;
  label?: string;
}

export interface IPushKeys {
  p256dh: string;
  auth: string;
}

export interface IPushSubscription extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  endpointHash: string;
  keys: IPushKeys;
  device: IDeviceMetadata;
  status: PushSubscriptionStatus;
  lastUsedAt?: Date;
  lastSuccessAt?: Date;
  invalidatedAt?: Date;
  failureCount: number;
  lastFailureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPushSubscriptionModel extends Model<IPushSubscription> {
  hashEndpoint(endpoint: string): string;
}

export const hashEndpoint = (endpoint: string): string => {
  return crypto.createHash('sha256').update(endpoint.trim()).digest('hex');
};

const PushSubscriptionSchema = new Schema<IPushSubscription, IPushSubscriptionModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
    },
    endpointHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    keys: {
      p256dh: {
        type: String,
        required: true,
        trim: true,
        select: false, // Security: Do not expose encryption keys in ordinary query results
      },
      auth: {
        type: String,
        required: true,
        trim: true,
        select: false, // Security: Do not expose authentication secrets in ordinary query results
      },
    },
    device: {
      userAgent: {
        type: String,
        trim: true,
        maxlength: 500,
        default: '',
      },
      deviceType: {
        type: String,
        enum: ['desktop', 'mobile', 'tablet', 'unknown'],
        default: 'unknown',
      },
      browser: {
        type: String,
        trim: true,
        maxlength: 50,
        default: 'Unknown',
      },
      os: {
        type: String,
        trim: true,
        maxlength: 50,
        default: 'Unknown',
      },
      label: {
        type: String,
        trim: true,
        maxlength: 100,
        default: 'Browser Device',
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'invalid'],
      default: 'active',
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    lastSuccessAt: {
      type: Date,
      default: null,
    },
    invalidatedAt: {
      type: Date,
      default: null,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    lastFailureReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        // Strip sensitive fields even if selected
        if (ret.keys) {
          delete ret.keys.p256dh;
          delete ret.keys.auth;
        }
        delete ret.endpoint; // Hide raw push endpoints from JSON responses
        return ret;
      },
    },
  }
);

// Compound indexes for active subscription lookups & user ownership
PushSubscriptionSchema.index({ userId: 1, status: 1 });
PushSubscriptionSchema.index({ status: 1, updatedAt: -1 });

// Ensure endpointHash is always populated from endpoint
PushSubscriptionSchema.pre('validate', function (next) {
  if (this.endpoint && (!this.endpointHash || this.isModified('endpoint'))) {
    this.endpointHash = hashEndpoint(this.endpoint);
  }
  next();
});

PushSubscriptionSchema.statics.hashEndpoint = hashEndpoint;

export const PushSubscription = mongoose.model<IPushSubscription, IPushSubscriptionModel>(
  'PushSubscription',
  PushSubscriptionSchema
);

