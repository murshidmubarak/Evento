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
  'RAZORPAY_KEY_SECRET'
] as const;

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: parseInt(process.env.PORT as string, 10),
  mongodbUri: process.env.MONGODB_URI as string,
  nodeEnv: process.env.NODE_ENV as string,
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN as string,
  passwordResetExpiresInMins: parseInt(process.env.PASSWORD_RESET_EXPIRES_IN_MINS as string, 10),
  razorpayKeyId: process.env.RAZORPAY_KEY_ID as string,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET as string,
} as const;
