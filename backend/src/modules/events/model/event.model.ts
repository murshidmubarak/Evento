import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type EventType = 'Nikah' | 'Wedding' | 'Reception' | 'Engagement' | 'Birthday' | 'Corporate' | 'Other';
export type EventStatus = 'requested' | 'quoted' | 'awaiting_payment' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';

export interface IEvent extends Document {
  clientId: Types.ObjectId;
  eventManagerId?: Types.ObjectId;
  title: string;
  eventType: EventType;
  customEventType?: string;
  date: Date;
  startTime: string;
  endTime: string;
  notes?: string;
  clientInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  location: {
    address: string;
    lat?: number;
    lng?: number;
  };
  guestCount: number;
  budget?: number;
  selectedServices: Array<{ serviceId: Types.ObjectId; preferences?: Record<string, unknown> }>;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    eventManagerId: { type: Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, required: true },
    eventType: {
      type: String,
      enum: ['Nikah', 'Wedding', 'Reception', 'Engagement', 'Birthday', 'Corporate', 'Other'],
      required: true,
    },
    customEventType: { type: String, trim: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    notes: { type: String },
    clientInfo: {
      name: { type: String },
      phone: { type: String },
      email: { type: String },
    },
    location: {
      address: { type: String, required: true },
      lat: { type: Number },
      lng: { type: Number },
    },
    guestCount: { type: Number, required: true, min: 1 },
    budget: { type: Number, min: 0 },
    selectedServices: [
      {
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
        preferences: { type: Schema.Types.Mixed, default: {} },
      },
    ],
    status: {
      type: String,
      enum: ['requested', 'quoted', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'cancelled'],
      default: 'requested',
    },
  },
  { timestamps: true }
);

export const Event = mongoose.model<IEvent>('Event', eventSchema);
