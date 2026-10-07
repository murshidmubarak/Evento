import { Types } from 'mongoose';
import { Quotation, type IQuotation } from '../model/quotation.model.js';
import { SequenceRepository } from '../../users/repository/sequence.repository.js';

export class QuotationRepository {
  private readonly sequenceRepository: SequenceRepository;

  constructor() {
    this.sequenceRepository = new SequenceRepository();
  }

  async create(data: Partial<IQuotation>): Promise<IQuotation> {
    const quotation = new Quotation(data);
    return quotation.save();
  }

  async getNextQuotationNumber(): Promise<string> {
    const nextSeq = await this.sequenceRepository.getNextSequenceValue('quotation_number', 1);
    // QTN-YYYY-001 format
    const year = new Date().getFullYear();
    const paddedSeq = nextSeq.toString().padStart(3, '0');
    return `QTN-${year}-${paddedSeq}`;
  }

  /**
   * Atomically retrieves the next revision number for a given quotation thread.
   * Uses the existing Sequence infrastructure keyed by quotationNumber to prevent
   * concurrent requests from generating duplicate revision numbers.
   *
   * @param quotationNumber - The quotation thread identifier (e.g. QTN-2026-001)
   * @returns The next safe revision number (starting at 2 for existing threads)
   */
  async getNextRevision(quotationNumber: string): Promise<number> {
    // The sequence for a quotation thread starts at 1 (already used for rev 1).
    // Calling getNextSequenceValue with startValue=1 and then $inc gives us 2, 3, 4...
    return this.sequenceRepository.getNextSequenceValue(`qtn_rev:${quotationNumber}`, 2);
  }

  async getLatestRevision(quotationNumber: string): Promise<IQuotation | null> {
    return Quotation.findOne({ quotationNumber }).sort({ revision: -1 }).exec();
  }

  async findById(id: string): Promise<IQuotation | null> {
    return Quotation.findById(id).exec();
  }

  async findByEventId(eventId: string): Promise<IQuotation[]> {
    return Quotation.find({ eventId }).sort({ createdAt: -1 }).exec();
  }

  async findByClientId(clientId: string): Promise<IQuotation[]> {
    return Quotation.find({ clientId }).sort({ createdAt: -1 }).exec();
  }

  async findAll(filter: any = {}): Promise<IQuotation[]> {
    return Quotation.find(filter).sort({ createdAt: -1 }).exec();
  }
}

