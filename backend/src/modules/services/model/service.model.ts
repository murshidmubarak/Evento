import mongoose, { Schema, type Document } from 'mongoose';

export type PricingType = 'per_guest' | 'per_event' | 'package';

export interface IService extends Document {
  name: string;
  description: string;
  pricingType: PricingType;
  basePrice: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const serviceSchema = new Schema<IService>(
  {
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      required: [true, 'Service description is required'],
      trim: true,
    },
    pricingType: {
      type: String,
      enum: {
        values: ['per_guest', 'per_event', 'package'],
        message: '{VALUE} is not a valid pricing type',
      },
      required: [true, 'Pricing type is required'],
    },
    basePrice: {
      type: Number,
      required: [true, 'Base price is required'],
      min: [0, 'Base price cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add index on name for quick lookups and uniqueness enforcement
serviceSchema.index({ name: 1 }, { unique: true });

export const Service = mongoose.model<IService>('Service', serviceSchema);
