import { Schema, model, type Document, type Types } from 'mongoose';

export interface IPendingUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  profileImage?: string;
  role: string;
  emailVerificationOtpHash: string;
  emailVerificationOtpExpiresAt: Date;
  emailVerificationOtpAttempts: number;
  emailVerificationOtpLastSentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pendingUserSchema = new Schema<IPendingUser>(
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
      required: [true, 'Password is required'],
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
      default: 'client',
    },
    emailVerificationOtpHash: {
      type: String,
      required: true,
    },
    emailVerificationOtpExpiresAt: {
      type: Date,
      required: true,
    },
    emailVerificationOtpAttempts: {
      type: Number,
      default: 0,
    },
    emailVerificationOtpLastSentAt: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400, // Document automatically removed after 24 hours
    },
  },
  {
    timestamps: true,
  },
);

export const PendingUser = model<IPendingUser>('PendingUser', pendingUserSchema);
