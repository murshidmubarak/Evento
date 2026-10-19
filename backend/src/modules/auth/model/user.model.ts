import { Schema, model, type Document, type Types } from 'mongoose';

export type UserRole = 'admin' | 'client' | 'event_manager' | 'worker';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  profileImage?: string;
  role: UserRole;
  workerType?: string;
  businessId?: string;
  isActive: boolean;
  googleId?: string;
  emailVerified: boolean;
  emailVerificationOtpHash?: string;
  emailVerificationOtpExpiresAt?: Date;
  emailVerificationOtpAttempts: number;
  emailVerificationOtpLastSentAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  invitationTokenHash?: string;
  invitationTokenExpiresAt?: Date;
  invitationAcceptedAt?: Date;
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
  };
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: false,
      select: false,
    },
    phone: {
      type: String,
      trim: true,
    },
    profileImage: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'client', 'event_manager', 'worker'],
        message: 'Role must be admin, client, event_manager, or worker',
      },
      default: 'client',
    },
    workerType: {
      type: String,
      enum: {
        values: [
          'Catering Boy',
          'Catering Supervisor',
          'Chef',
          'Cameraman / Photographer',
          'Videographer',
          'Decoration Worker',
          'Juice Worker',
          'Host'
        ],
        message: 'Invalid worker type',
      },
    },
    businessId: {
      type: String,
      // No globally unique index here unless we make it sparse, but the requirements say unique within assigned category.
      // Sparse index is okay since admin/client don't have it.
      unique: true,
      sparse: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    googleId: {
      type: String,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationOtpHash: {
      type: String,
      select: false,
    },
    emailVerificationOtpExpiresAt: {
      type: Date,
      select: false,
    },
    emailVerificationOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    emailVerificationOtpLastSentAt: {
      type: Date,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
    invitationTokenHash: {
      type: String,
      select: false,
    },
    invitationTokenExpiresAt: {
      type: Date,
      select: false,
    },
    invitationAcceptedAt: {
      type: Date,
    },
    location: {
      address: {
        type: String,
        trim: true,
      },
      lat: {
        type: Number,
      },
      lng: {
        type: Number,
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

export const User = model<IUser>('User', userSchema);
