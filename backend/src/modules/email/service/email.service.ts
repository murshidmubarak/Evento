import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../../config/env.js';

export interface SendVerificationOtpInput {
  to: string;
  name?: string;
  otp: string;
}

export interface IEmailService {
  sendVerificationOtp(input: SendVerificationOtpInput): Promise<void>;
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
}

export const emailService = new EmailService();
