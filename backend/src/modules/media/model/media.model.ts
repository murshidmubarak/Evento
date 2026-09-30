import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IMedia extends Document {
  eventId: Types.ObjectId;
  serviceId: Types.ObjectId;
  url: string;
  publicId: string;
  fileName?: string;
  mimeType?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<IMedia>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    fileName: { type: String },
    mimeType: { type: String },
  },
  { timestamps: true }
);

export const Media = mongoose.model<IMedia>('Media', mediaSchema);
