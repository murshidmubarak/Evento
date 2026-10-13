import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../../config/env.js';

export interface SendVerificationOtpInput {
  to: string;
  name?: string;
  otp: string;
}

export interface SendPaymentLinkRenewalEmailInput {
  to: string;
  clientName?: string;
  eventName: string;
  quotationNumber: string;
  quotationRevision: number;
  installmentTitle: string;
  scheduledAmount: number;
  verifiedPaidAmount: number;
  outstandingAmount: number;
  dueDate?: Date | string;
  newExpiryDate: Date | string;
  paymentLinkUrl: string;
}

export interface IEmailService {
  sendVerificationOtp(input: SendVerificationOtpInput): Promise<void>;
  sendPaymentLinkRenewalEmail(input: SendPaymentLinkRenewalEmailInput): Promise<void>;
}

export class EmailService implements IEmailService {
  private transporter: Transporter | null = null;

  constructor() {
    // Only initialize transporter when real SMTP credentials are provided
    if (env.smtpUser && env.smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure, // true for port 465, false for 587 (STARTTLS)
        auth: {
          user: env.smtpUser,
          pass: env.smtpPass,
        },
      });
    }
  }

  async sendVerificationOtp(input: SendVerificationOtpInput): Promise<void> {
    const { to, name, otp } = input;

    // If SMTP not configured — safe dev/test fallback: print to console
    if (!this.transporter) {
      if (env.isDevelopment || env.nodeEnv === 'test') {
        console.log(`\n📧 [EmailService DEV] OTP for ${to} → ${otp}\n`);
        return;
      }
      throw new Error('SMTP is not configured. Set SMTP_USER and SMTP_PASS in .env');
    }

    try {
      await this.transporter.sendMail({
        from: env.emailFrom,
        to,
        subject: 'Your Verification Code — EventOps',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
            <h2 style="margin-top:0;color:#111827;">Email Verification</h2>
            <p style="color:#374151;">Hi ${name || 'there'},</p>
            <p style="color:#374151;">Use the code below to verify your email address:</p>
            <div style="text-align:center;margin:32px 0;">
              <span style="display:inline-block;font-size:2rem;font-weight:700;letter-spacing:8px;color:#1d4ed8;background:#eff6ff;padding:16px 32px;border-radius:8px;">
                ${otp}
              </span>
            </div>
            <p style="color:#6b7280;font-size:0.875rem;">This code expires in <strong>${env.emailVerificationOtpTtlMinutes} minutes</strong>.</p>
            <p style="color:#6b7280;font-size:0.875rem;">If you did not create an account, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      console.error('[EmailService] Failed to send verification email:', error);
      throw new Error('Failed to send verification email. Please try again later.');
    }
  }

  async sendPaymentLinkRenewalEmail(input: SendPaymentLinkRenewalEmailInput): Promise<void> {
    const {
      to,
      clientName,
      eventName,
      quotationNumber,
      quotationRevision,
      installmentTitle,
      scheduledAmount,
      verifiedPaidAmount,
      outstandingAmount,
      dueDate,
      newExpiryDate,
      paymentLinkUrl,
    } = input;

    const formattedDueDate = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'As scheduled';
    const formattedExpiryDate = new Date(newExpiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // If SMTP not configured — safe dev/test fallback: print to console
    if (!this.transporter) {
      if (env.isDevelopment || env.nodeEnv === 'test') {
        console.log(`\n📧 [EmailService DEV] Payment Link Renewal for ${to}:`);
        console.log(`   Event: ${eventName} | Quotation: ${quotationNumber} (Rev ${quotationRevision})`);
        console.log(`   Installment: ${installmentTitle} | Scheduled: ₹${scheduledAmount} | Paid: ₹${verifiedPaidAmount}`);
        console.log(`   Outstanding Balance: ₹${outstandingAmount} | Due Date: ${formattedDueDate}`);
        console.log(`   New Expiry Date: ${formattedExpiryDate}`);
        console.log(`   Payment Link: ${paymentLinkUrl}\n`);
        return;
      }
      throw new Error('SMTP is not configured. Set SMTP_USER and SMTP_PASS in .env');
    }

    try {
      await this.transporter.sendMail({
        from: env.emailFrom,
        to,
        subject: `Updated Payment Link: ${installmentTitle} — ${eventName} (Quotation ${quotationNumber})`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;">
            <div style="border-bottom:1px solid #f3f4f6;padding-bottom:16px;margin-bottom:24px;">
              <span style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#4f46e5;">EventOps ERP</span>
              <h2 style="margin:8px 0 0;color:#111827;font-size:20px;">Replacement Payment Link Issued</h2>
            </div>
            <p style="color:#374151;font-size:15px;">Dear ${clientName || 'Client'},</p>
            <p style="color:#4b5563;font-size:14px;line-height:1.5;">
              A replacement payment link has been generated for your event <strong>${eventName}</strong> regarding installment <strong>${installmentTitle}</strong>.
            </p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:24px 0;">
              <table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#6b7280;">Quotation Reference:</td><td style="padding:6px 0;font-weight:600;text-align:right;">${quotationNumber} (Rev ${quotationRevision})</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Installment:</td><td style="padding:6px 0;font-weight:600;text-align:right;">${installmentTitle}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Scheduled Amount:</td><td style="padding:6px 0;font-weight:600;text-align:right;">₹${scheduledAmount.toLocaleString('en-IN')}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Verified Amount Paid:</td><td style="padding:6px 0;font-weight:600;text-align:right;color:#059669;">₹${verifiedPaidAmount.toLocaleString('en-IN')}</td></tr>
                <tr style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;"><td style="padding:10px 0;color:#111827;font-weight:700;">Outstanding Balance:</td><td style="padding:10px 0;font-weight:700;font-size:16px;text-align:right;color:#d97706;">₹${outstandingAmount.toLocaleString('en-IN')}</td></tr>
                <tr><td style="padding:6px 0;color:#6b7280;">Original Due Date:</td><td style="padding:6px 0;font-weight:600;text-align:right;">${formattedDueDate}</td></tr>
                <tr><td style="padding:6px 0;color:#dc2626;font-weight:600;">New Link Expiry:</td><td style="padding:6px 0;font-weight:700;text-align:right;color:#dc2626;">${formattedExpiryDate}</td></tr>
              </table>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${paymentLinkUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                Pay Outstanding Balance (₹${outstandingAmount.toLocaleString('en-IN')})
              </a>
            </div>
            <p style="color:#6b7280;font-size:12px;text-align:center;margin-top:24px;">
              Please complete the payment before <strong>${formattedExpiryDate}</strong>. If you have any questions, please contact the EventOps team.
            </p>
          </div>
        `,
      });
    } catch (error) {
      console.error('[EmailService] Failed to send payment link renewal email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();
