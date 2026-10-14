import { Types } from 'mongoose';
import { Event } from '../../events/model/event.model.js';
import { Quotation } from '../../quotations/model/quotation.model.js';
import '../../auth/model/user.model.js';
import '../../services/model/service.model.js';
import { Payment } from '../model/payment.model.js';
import {
  PaymentReminderLog,
  IPaymentReminderLog,
  ReminderType,
  ReminderStatus,
} from '../model/payment-reminder-log.model.js';
import { PaymentRepository } from '../repository/payment.repository.js';
import { emailService } from '../../email/service/email.service.js';
import { round2 } from '../../../utils/money.js';

export interface DueDateReminderCandidate {
  eventId: string;
  quotationId: string;
  quotationRevision: number;
  quotationNumber: string;
  installmentIndex: number;
  installmentTitle: string;
  scheduledAmount: number;
  verifiedPaidAmount: number;
  outstandingAmount: number;
  dueDate: Date;
  daysUntilDue: number;
  activeLinkUrl?: string;
  linkExpiryDate?: Date;
  clientEmail: string;
  clientName?: string;
  dedupKey: string;
  reminderWindow: string;
}

export interface ExpiryWarningCandidate {
  eventId: string;
  quotationId: string;
  quotationRevision: number;
  quotationNumber: string;
  installmentIndex: number;
  installmentTitle: string;
  scheduledAmount: number;
  verifiedPaidAmount: number;
  outstandingAmount: number;
  dueDate?: Date;
  linkExpiryDate: Date;
  hoursUntilExpiry: number;
  paymentLinkId: string;
  paymentLinkUrl: string;
  clientEmail: string;
  clientName?: string;
  dedupKey: string;
  reminderWindow: string;
}

export interface ReminderProcessingResult {
  candidateKey: string;
  status: ReminderStatus | 'already_sent' | 'already_skipped';
  logId?: string;
  error?: string;
  reason?: string;
}

export class PaymentReminderService {
  constructor(private readonly paymentRepository: PaymentRepository = new PaymentRepository()) {}

  /**
   * Identifies installments eligible for due-date reminders (approaching due date within 2 days).
   */
  async findEligibleDueDateReminders(referenceDate: Date = new Date(), eventId?: string): Promise<DueDateReminderCandidate[]> {
    const candidates: DueDateReminderCandidate[] = [];
    const refTime = referenceDate.getTime();

    const query: any = {
      status: { $nin: ['cancelled', 'rejected'] },
    };
    if (eventId) {
      query._id = eventId;
    }

    // Query non-cancelled, non-rejected events
    const activeEvents = await Event.find(query).populate('clientId', 'name email');

    for (const event of activeEvents) {
      if (!event.clientId) continue;
      const client = event.clientId as any;
      if (!client.email) continue;

      // Find accepted quotation
      const acceptedQuotation = await Quotation.findOne({
        eventId: event._id,
        status: 'accepted',
      });

      if (!acceptedQuotation || !acceptedQuotation.paymentPlan || acceptedQuotation.paymentPlan.length === 0) {
        continue;
      }

      // Fetch all verified payments for balance calculation
      const allVerifiedPayments = await this.paymentRepository.findAllVerifiedPayments(
        event._id.toString(),
        acceptedQuotation._id.toString()
      );

      for (let idx = 0; idx < acceptedQuotation.paymentPlan.length; idx++) {
        const inst = acceptedQuotation.paymentPlan[idx];
        if (!inst.dueDate) continue;

        const dueDateTime = new Date(inst.dueDate).getTime();
        // Calculate days until due (24h per day)
        const daysUntilDue = Math.ceil((dueDateTime - refTime) / (1000 * 60 * 60 * 24));

        // Reminder policy: 2 days before due date (daysUntilDue <= 2 and >= 0)
        // If daysUntilDue < 0, it is overdue -> catch-up policy skips flood of old past reminders
        if (daysUntilDue > 2 || daysUntilDue < 0) {
          continue;
        }

        const scheduledAmount = round2(inst.amount);

        // Calculate verified paid amount authoritatively
        const paidForInst = round2(
          allVerifiedPayments.reduce((acc, p) => {
            if (p.allocations && p.allocations.length > 0) {
              const matchedAlloc = p.allocations.find((a: any) => a.installmentIndex === idx);
              return acc + (matchedAlloc ? matchedAlloc.allocatedAmount : 0);
            }
            if (p.installmentIndex !== undefined) {
              return p.installmentIndex === idx ? acc + p.amount : acc;
            }
            return idx === 0 && p.paymentType === 'advance' ? acc + p.amount : acc;
          }, 0)
        );

        const outstandingAmount = Math.max(0, round2(scheduledAmount - paidForInst));

        // Skip fully paid installments
        if (outstandingAmount <= 0) {
          continue;
        }

        // State eligibility:
        // Advance (idx 0): event must be 'awaiting_payment'
        // Subsequent installments (idx > 0): advance must already be fully paid (event confirmed/in_progress)
        if (idx === 0) {
          if (event.status !== 'awaiting_payment') {
            continue;
          }
        } else {
          // Check if advance is fully paid
          const advanceScheduled = round2(acceptedQuotation.paymentPlan[0].amount);
          const advancePaid = round2(
            allVerifiedPayments.reduce((acc, p) => {
              if (p.allocations && p.allocations.length > 0) {
                const matched = p.allocations.find((a: any) => a.installmentIndex === 0);
                return acc + (matched ? matched.allocatedAmount : 0);
              }
              return (p.installmentIndex === 0 || p.paymentType === 'advance') ? acc + p.amount : acc;
            }, 0)
          );
          if (advancePaid < advanceScheduled) {
            // Subsequent installments cannot be reminded before advance is settled
            continue;
          }
        }

        const reminderWindow = '2_days_before';
        const dedupKey = `due_date:${acceptedQuotation._id.toString()}:${idx}:${reminderWindow}`;

        // Check if reminder was already sent
        const existingLog = await PaymentReminderLog.findOne({
          dedupKey,
          status: { $in: ['sent', 'pending'] },
        });

        if (existingLog) {
          continue;
        }

        // Check for active payment link if available
        const activeLink = await this.paymentRepository.findActiveLinkForInstallment(
          event._id.toString(),
          acceptedQuotation._id.toString(),
          idx
        );

        candidates.push({
          eventId: event._id.toString(),
          quotationId: acceptedQuotation._id.toString(),
          quotationRevision: acceptedQuotation.revision,
          quotationNumber: acceptedQuotation.quotationNumber,
          installmentIndex: idx,
          installmentTitle: inst.title,
          scheduledAmount,
          verifiedPaidAmount: paidForInst,
          outstandingAmount,
          dueDate: new Date(inst.dueDate),
          daysUntilDue,
          activeLinkUrl: activeLink?.paymentLinkUrl,
          linkExpiryDate: activeLink?.linkExpiresAt,
          clientEmail: client.email,
          clientName: client.name,
          dedupKey,
          reminderWindow,
        });
      }
    }

    return candidates;
  }

  /**
   * Processes a single due-date reminder candidate with atomic deduplication,
   * authoritative just-in-time re-check, and decoupled failure tracking.
   */
  async processDueDateReminder(candidate: DueDateReminderCandidate): Promise<ReminderProcessingResult> {
    // 1. Atomic reservation via PaymentReminderLog insertion
    let log: IPaymentReminderLog;
    try {
      log = await PaymentReminderLog.create({
        dedupKey: candidate.dedupKey,
        eventId: new Types.ObjectId(candidate.eventId),
        quotationId: new Types.ObjectId(candidate.quotationId),
        quotationRevision: candidate.quotationRevision,
        installmentIndex: candidate.installmentIndex,
        installmentTitle: candidate.installmentTitle,
        reminderType: 'due_date',
        reminderWindow: candidate.reminderWindow,
        recipientEmail: candidate.clientEmail,
        recipientName: candidate.clientName,
        scheduledAmount: candidate.scheduledAmount,
        paidAmount: candidate.verifiedPaidAmount,
        outstandingAmount: candidate.outstandingAmount,
        dueDate: candidate.dueDate,
        linkExpiryDate: candidate.linkExpiryDate,
        paymentLinkUrl: candidate.activeLinkUrl,
        status: 'pending',
      });
    } catch (err: any) {
      if (err.code === 11000) {
        return {
          candidateKey: candidate.dedupKey,
          status: 'skipped',
          reason: 'duplicate_or_already_in_progress',
        };
      }
      throw err;
    }

    return this.dispatchQueuedDueDateReminder(log);
  }

  /**
   * Dispatches a previously queued or reserved due-date reminder email with authoritative JIT checks.
   */
  async dispatchQueuedDueDateReminder(log: IPaymentReminderLog): Promise<ReminderProcessingResult> {
    // 1. Authoritative Just-in-Time Re-Check
    const allVerifiedPayments = await this.paymentRepository.findAllVerifiedPayments(
      log.eventId.toString(),
      log.quotationId.toString()
    );
    const paidForInst = round2(
      allVerifiedPayments.reduce((acc, p) => {
        if (p.allocations && p.allocations.length > 0) {
          const matchedAlloc = p.allocations.find((a: any) => a.installmentIndex === log.installmentIndex);
          return acc + (matchedAlloc ? matchedAlloc.allocatedAmount : 0);
        }
        if (p.installmentIndex !== undefined) {
          return p.installmentIndex === log.installmentIndex ? acc + p.amount : acc;
        }
        return log.installmentIndex === 0 && p.paymentType === 'advance' ? acc + p.amount : acc;
      }, 0)
    );
    const currentOutstanding = Math.max(0, round2(log.scheduledAmount - paidForInst));

    if (currentOutstanding <= 0) {
      log.status = 'skipped';
      log.failureReason = 'Installment settled before email delivery';
      await log.save();
      return {
        candidateKey: log.dedupKey,
        status: 'skipped',
        logId: log._id.toString(),
        reason: 'fully_paid',
      };
    }

    // Update log with current re-checked balance
    log.paidAmount = paidForInst;
    log.outstandingAmount = currentOutstanding;

    // Check for updated active link if present
    const activeLink = await this.paymentRepository.findActiveLinkForInstallment(
      log.eventId.toString(),
      log.quotationId.toString(),
      log.installmentIndex
    );
    if (activeLink) {
      log.paymentLinkUrl = activeLink.paymentLinkUrl;
      log.linkExpiryDate = activeLink.linkExpiresAt;
    }

    // Resolve event and recipient from trusted application data
    const event = await Event.findById(log.eventId).populate('clientId', 'name email');
    const quotation = await Quotation.findById(log.quotationId);
    const recipientEmail = (event?.clientId as any)?.email || log.recipientEmail;
    const recipientName = (event?.clientId as any)?.name || log.recipientName;

    // 2. Dispatch Email
    try {
      await emailService.sendPaymentDueDateReminder({
        to: recipientEmail,
        clientName: recipientName,
        eventName: event?.title || 'Event',
        quotationNumber: quotation?.quotationNumber || '',
        quotationRevision: log.quotationRevision,
        installmentTitle: log.installmentTitle,
        scheduledAmount: log.scheduledAmount,
        verifiedPaidAmount: paidForInst,
        outstandingAmount: currentOutstanding,
        dueDate: log.dueDate || new Date(),
        linkExpiryDate: log.linkExpiryDate,
        paymentLinkUrl: log.paymentLinkUrl,
        eventId: log.eventId.toString(),
      });

      log.status = 'sent';
      log.sentAt = new Date();
      await log.save();

      return {
        candidateKey: log.dedupKey,
        status: 'sent',
        logId: log._id.toString(),
      };
    } catch (emailErr: any) {
      console.error(`[PaymentReminderService] Failed to send due date reminder to ${recipientEmail}:`, emailErr);
      log.status = 'failed';
      log.failureReason = emailErr.message || 'Email delivery failed';
      log.retryCount = (log.retryCount || 0) + 1;
      await log.save();

      return {
        candidateKey: log.dedupKey,
        status: 'failed',
        logId: log._id.toString(),
        error: log.failureReason,
      };
    }
  }

  /**
   * Identifies active payment links approaching expiry within 24 hours (1 day).
   */
  async findEligibleExpiryWarnings(referenceDate: Date = new Date(), eventId?: string): Promise<ExpiryWarningCandidate[]> {
    const candidates: ExpiryWarningCandidate[] = [];
    const refTime = referenceDate.getTime();

    const query: any = {
      linkStatus: 'active',
      paymentLinkUrl: { $exists: true, $ne: '' },
      linkExpiresAt: { $gt: referenceDate }, // Still valid and not yet expired
    };
    if (eventId) {
      query.eventId = eventId;
    }

    // Query active payment links
    const activeLinks = await Payment.find(query)
      .populate('eventId', 'title status clientId')
      .populate('clientId', 'name email')
      .populate('quotationId', 'quotationNumber revision paymentPlan');

    for (const link of activeLinks) {
      if (!link.eventId || !link.clientId || !link.quotationId) continue;
      const event = link.eventId as any;
      const client = link.clientId as any;
      const quotation = link.quotationId as any;

      if (!client.email || event.status === 'cancelled' || event.status === 'rejected') {
        continue;
      }

      if (!link.linkExpiresAt) continue;

      const expiryTime = new Date(link.linkExpiresAt).getTime();
      const hoursUntilExpiry = (expiryTime - refTime) / (1000 * 60 * 60);

      // Warning policy: 24 hours before expiry (1 day)
      // Must be between 0 and 24 hours
      if (hoursUntilExpiry > 24 || hoursUntilExpiry <= 0) {
        continue;
      }

      const instIndex = link.installmentIndex !== undefined ? link.installmentIndex : 0;
      const targetInst = quotation.paymentPlan?.[instIndex];
      const scheduledAmount = targetInst ? round2(targetInst.amount) : link.amount;

      // Authoritative balance check
      const allVerifiedPayments = await this.paymentRepository.findAllVerifiedPayments(
        event._id.toString(),
        quotation._id.toString()
      );
      const paidForInst = round2(
        allVerifiedPayments.reduce((acc, p) => {
          if (p.allocations && p.allocations.length > 0) {
            const matchedAlloc = p.allocations.find((a: any) => a.installmentIndex === instIndex);
            return acc + (matchedAlloc ? matchedAlloc.allocatedAmount : 0);
          }
          if (p.installmentIndex !== undefined) {
            return p.installmentIndex === instIndex ? acc + p.amount : acc;
          }
          return instIndex === 0 && p.paymentType === 'advance' ? acc + p.amount : acc;
        }, 0)
      );

      const outstandingAmount = Math.max(0, round2(scheduledAmount - paidForInst));

      if (outstandingAmount <= 0) {
        continue; // Fully settled installment needs no expiry warning
      }

      const paymentLinkId = link.razorpayPaymentLinkId || link._id.toString();
      const reminderWindow = '1_day_before';
      const dedupKey = `link_expiry:${quotation._id.toString()}:${instIndex}:${paymentLinkId}:${reminderWindow}`;

      const existingLog = await PaymentReminderLog.findOne({
        dedupKey,
        status: { $in: ['sent', 'pending'] },
      });

      if (existingLog) {
        continue;
      }

      candidates.push({
        eventId: event._id.toString(),
        quotationId: quotation._id.toString(),
        quotationRevision: quotation.revision,
        quotationNumber: quotation.quotationNumber,
        installmentIndex: instIndex,
        installmentTitle: link.installmentTitle || targetInst?.title || 'Installment',
        scheduledAmount,
        verifiedPaidAmount: paidForInst,
        outstandingAmount,
        dueDate: targetInst?.dueDate ? new Date(targetInst.dueDate) : undefined,
        linkExpiryDate: new Date(link.linkExpiresAt),
        hoursUntilExpiry,
        paymentLinkId,
        paymentLinkUrl: link.paymentLinkUrl as string,
        clientEmail: client.email,
        clientName: client.name,
        dedupKey,
        reminderWindow,
      });
    }

    return candidates;
  }

  /**
   * Processes a single payment link expiry warning candidate.
   */
  async processExpiryWarning(candidate: ExpiryWarningCandidate): Promise<ReminderProcessingResult> {
    // 1. Atomic reservation via PaymentReminderLog insertion
    let log: IPaymentReminderLog;
    try {
      log = await PaymentReminderLog.create({
        dedupKey: candidate.dedupKey,
        eventId: new Types.ObjectId(candidate.eventId),
        quotationId: new Types.ObjectId(candidate.quotationId),
        quotationRevision: candidate.quotationRevision,
        installmentIndex: candidate.installmentIndex,
        installmentTitle: candidate.installmentTitle,
        reminderType: 'link_expiry',
        reminderWindow: candidate.reminderWindow,
        paymentLinkId: candidate.paymentLinkId,
        recipientEmail: candidate.clientEmail,
        recipientName: candidate.clientName,
        scheduledAmount: candidate.scheduledAmount,
        paidAmount: candidate.verifiedPaidAmount,
        outstandingAmount: candidate.outstandingAmount,
        dueDate: candidate.dueDate,
        linkExpiryDate: candidate.linkExpiryDate,
        paymentLinkUrl: candidate.paymentLinkUrl,
        status: 'pending',
      });
    } catch (err: any) {
      if (err.code === 11000) {
        return {
          candidateKey: candidate.dedupKey,
          status: 'skipped',
          reason: 'duplicate_or_already_in_progress',
        };
      }
      throw err;
    }

    return this.dispatchQueuedExpiryWarning(log);
  }

  /**
   * Dispatches a previously queued or reserved expiry warning email with authoritative JIT checks.
   */
  async dispatchQueuedExpiryWarning(log: IPaymentReminderLog): Promise<ReminderProcessingResult> {
    // 1. Authoritative Just-in-Time Re-Check of Payment Link
    if (log.paymentLinkId) {
      const currentLink = await Payment.findOne({
        razorpayPaymentLinkId: log.paymentLinkId,
      });

      if (!currentLink || currentLink.linkStatus !== 'active' || (currentLink.linkExpiresAt && currentLink.linkExpiresAt <= new Date())) {
        log.status = 'skipped';
        log.failureReason = 'Payment link is no longer active or was superseded/expired';
        await log.save();
        return {
          candidateKey: log.dedupKey,
          status: 'skipped',
          logId: log._id.toString(),
          reason: 'link_superseded_or_inactive',
        };
      }
    }

    // Re-check outstanding balance
    const allVerifiedPayments = await this.paymentRepository.findAllVerifiedPayments(
      log.eventId.toString(),
      log.quotationId.toString()
    );
    const paidForInst = round2(
      allVerifiedPayments.reduce((acc, p) => {
        if (p.allocations && p.allocations.length > 0) {
          const matchedAlloc = p.allocations.find((a: any) => a.installmentIndex === log.installmentIndex);
          return acc + (matchedAlloc ? matchedAlloc.allocatedAmount : 0);
        }
        if (p.installmentIndex !== undefined) {
          return p.installmentIndex === log.installmentIndex ? acc + p.amount : acc;
        }
        return log.installmentIndex === 0 && p.paymentType === 'advance' ? acc + p.amount : acc;
      }, 0)
    );
    const currentOutstanding = Math.max(0, round2(log.scheduledAmount - paidForInst));

    if (currentOutstanding <= 0) {
      log.status = 'skipped';
      log.failureReason = 'Installment settled before warning delivery';
      await log.save();
      return {
        candidateKey: log.dedupKey,
        status: 'skipped',
        logId: log._id.toString(),
        reason: 'fully_paid',
      };
    }

    log.paidAmount = paidForInst;
    log.outstandingAmount = currentOutstanding;

    // Resolve event and quotation from trusted MongoDB records
    const event = await Event.findById(log.eventId).populate('clientId', 'name email');
    const quotation = await Quotation.findById(log.quotationId);
    const recipientEmail = (event?.clientId as any)?.email || log.recipientEmail;
    const recipientName = (event?.clientId as any)?.name || log.recipientName;

    // 2. Dispatch Email
    try {
      await emailService.sendPaymentLinkExpiryWarning({
        to: recipientEmail,
        clientName: recipientName,
        eventName: event?.title || 'Event',
        quotationNumber: quotation?.quotationNumber || '',
        quotationRevision: log.quotationRevision,
        installmentTitle: log.installmentTitle,
        scheduledAmount: log.scheduledAmount,
        verifiedPaidAmount: paidForInst,
        outstandingAmount: currentOutstanding,
        dueDate: log.dueDate,
        linkExpiryDate: log.linkExpiryDate || new Date(),
        paymentLinkUrl: log.paymentLinkUrl || '',
        eventId: log.eventId.toString(),
      });

      log.status = 'sent';
      log.sentAt = new Date();
      await log.save();

      return {
        candidateKey: log.dedupKey,
        status: 'sent',
        logId: log._id.toString(),
      };
    } catch (emailErr: any) {
      console.error(`[PaymentReminderService] Failed to send expiry warning to ${recipientEmail}:`, emailErr);
      log.status = 'failed';
      log.failureReason = emailErr.message || 'Email delivery failed';
      log.retryCount = (log.retryCount || 0) + 1;
      await log.save();

      return {
        candidateKey: log.dedupKey,
        status: 'failed',
        logId: log._id.toString(),
        error: log.failureReason,
      };
    }
  }

  /**
   * Executes both due-date reminders and expiry warnings across the system.
   */
  async runAllReminders(referenceDate: Date = new Date(), eventId?: string): Promise<{
    dueDateReminders: ReminderProcessingResult[];
    expiryWarnings: ReminderProcessingResult[];
  }> {
    const dueCandidates = await this.findEligibleDueDateReminders(referenceDate, eventId);
    const dueDateResults: ReminderProcessingResult[] = [];
    for (const cand of dueCandidates) {
      const res = await this.processDueDateReminder(cand);
      dueDateResults.push(res);
    }

    const expiryCandidates = await this.findEligibleExpiryWarnings(referenceDate, eventId);
    const expiryResults: ReminderProcessingResult[] = [];
    for (const cand of expiryCandidates) {
      const res = await this.processExpiryWarning(cand);
      expiryResults.push(res);
    }

    return {
      dueDateReminders: dueDateResults,
      expiryWarnings: expiryResults,
    };
  }

  /**
   * Retrieves audit logs for an event and optionally a specific installment index.
   */
  async getReminderLogsForEvent(eventId: string, installmentIndex?: number): Promise<IPaymentReminderLog[]> {
    const query: any = { eventId };
    if (installmentIndex !== undefined) {
      query.installmentIndex = installmentIndex;
    }
    return PaymentReminderLog.find(query).sort({ createdAt: -1 });
  }
}

export const paymentReminderService = new PaymentReminderService();
