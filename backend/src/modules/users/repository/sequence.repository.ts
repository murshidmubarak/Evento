import { Sequence } from '../model/sequence.model.js';

export class SequenceRepository {
  /**
   * Retrieves the next sequence number for a given category using an atomic operation.
   * If the sequence document does not exist, it creates one starting at the default value.
   * 
   * @param categoryName The name of the category (e.g., 'event_manager', 'Catering Boy').
   * @param startValue The value to start at if the sequence doesn't exist yet.
   * @returns The next atomic sequence number.
   */
  async getNextSequenceValue(categoryName: string, startValue: number): Promise<number> {
    // 1. Ensure the sequence document exists, initialized to startValue - 1.
    // If it already exists, $setOnInsert does nothing.
    await Sequence.updateOne(
      { _id: categoryName },
      { $setOnInsert: { seq: startValue - 1 } },
      { upsert: true }
    );

    // 2. Increment the sequence atomically and return the new value.
    const sequenceDocument = await Sequence.findByIdAndUpdate(
      categoryName,
      { $inc: { seq: 1 } },
      { new: true }
    );

    if (!sequenceDocument) {
      throw new Error(`Failed to generate sequence for category: ${categoryName}`);
    }

    return sequenceDocument.seq;
  }
}
