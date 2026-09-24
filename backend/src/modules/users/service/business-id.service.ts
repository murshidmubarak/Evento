import { SequenceRepository } from '../repository/sequence.repository.js';
import { ApiError } from '../../../utils/ApiError.js';

export const CATEGORY_RANGES: Record<string, number> = {
  'event_manager': 1000,
  'Catering Boy': 2000,
  'Catering Supervisor': 3000,
  'Chef': 4000,
  'Cameraman / Photographer': 5000,
  'Videographer': 6000,
  'Decoration Worker': 7000,
  'Juice Worker': 8000,
  'Host': 9000,
};

export class BusinessIdService {
  constructor(private readonly sequenceRepository: SequenceRepository = new SequenceRepository()) {}

  /**
   * Generates a unique 4-digit business ID for a given category.
   * Ensures the generated ID strictly falls within its configured category range (e.g. 1000-1999).
   */
  async generateBusinessId(categoryName: string): Promise<string> {
    const startValue = CATEGORY_RANGES[categoryName];

    if (startValue === undefined) {
      throw ApiError.internal(`No business ID range configured for category: ${categoryName}`);
    }

    const nextSeq = await this.sequenceRepository.getNextSequenceValue(categoryName, startValue);

    // Enforce 4-digit requirement and prevent overflow into the next category range.
    // e.g., if start is 1000, the maximum valid ID is 1999.
    const maxLimit = startValue + 999;
    
    if (nextSeq > maxLimit) {
      throw ApiError.internal(`Business ID range exhausted for category: ${categoryName}`);
    }

    // Return exactly 4 digits as string
    return nextSeq.toString().padStart(4, '0');
  }
}
