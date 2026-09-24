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
  isActive: boolean;
  googleId?: string;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
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
      required: [true, 'Password is required'],
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
    isActive: {
      type: Boolean,
      default: true,
    },
    googleId: {
      type: String,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

export const User = model<IUser>('User', userSchema);
