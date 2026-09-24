import { Schema, model, type Document } from 'mongoose';

export interface ISequence extends Document<string> {
  _id: string; // The category name, e.g., 'event_manager', 'Catering Boy'
  seq: number;
}

const sequenceSchema = new Schema<ISequence>({
  _id: {
    type: String,
    required: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

export const Sequence = model<ISequence>('Sequence', sequenceSchema);
