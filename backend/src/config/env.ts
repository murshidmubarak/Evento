import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const requiredEnvVars = [
  'MONGODB_URI', 
  'JWT_SECRET', 
  'PORT', 
  'NODE_ENV', 
  'JWT_EXPIRES_IN', 
  'PASSWORD_RESET_EXPIRES_IN_MINS',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'EMAIL_FROM',
  'EMAIL_VERIFICATION_OTP_TTL_MINUTES',
  'EMAIL_VERIFICATION_OTP_MAX_ATTEMPTS',
  'EMAIL_VERIFICATION_OTP_RESEND_COOLDOWN_SECONDS'
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: parseInt(process.env.PORT as string, 10),
  get mongodbUri(): string {
    return process.env.MONGODB_URI as string;
  },
  get nodeEnv(): string {
    return (process.env.NODE_ENV as string) || 'development';
  },
  get isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN as import('jsonwebtoken').SignOptions['expiresIn'],
  passwordResetExpiresInMins: parseInt(process.env.PASSWORD_RESET_EXPIRES_IN_MINS as string, 10),
  get razorpayKeyId(): string {
    return process.env.RAZORPAY_KEY_ID as string;
  },
  get razorpayKeySecret(): string {
    return process.env.RAZORPAY_KEY_SECRET as string;
  },
  get razorpayWebhookSecret(): string {
    return (process.env.RAZORPAY_WEBHOOK_SECRET as string) || '';
  },
  get frontendUrl(): string {
    return process.env.FRONTEND_URL || 'http://localhost:5173';
  },
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY as string,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET as string,
  emailFrom: process.env.EMAIL_FROM as string,
  // SMTP — optional (falls back to console log in dev if not set)
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  emailVerificationOtpTtlMinutes: parseInt(process.env.EMAIL_VERIFICATION_OTP_TTL_MINUTES as string, 10),
  emailVerificationOtpMaxAttempts: parseInt(process.env.EMAIL_VERIFICATION_OTP_MAX_ATTEMPTS as string, 10),
  emailVerificationOtpResendCooldownSeconds: parseInt(process.env.EMAIL_VERIFICATION_OTP_RESEND_COOLDOWN_SECONDS as string, 10),
  get reminderCheckIntervalMs(): number {
    return parseInt(process.env.REMINDER_CHECK_INTERVAL_MS || '3600000', 10);
  },
  get enableReminderScheduler(): boolean {
    return process.env.ENABLE_REMINDER_SCHEDULER !== 'false';
  },
} as const;
