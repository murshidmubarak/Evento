import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI || env.mongodbUri;

    // HARD SAFETY GUARD: Tests must never touch production/development databases
    if (process.env.NODE_ENV === 'test' || env.nodeEnv === 'test') {
      if (!uri || !uri.includes('_test')) {
        throw new Error(
          `CRITICAL DATABASE SAFETY VIOLATION: Test process attempted to connect to '${uri}'. ` +
          `Tests must ONLY run against an isolated test database ending in '_test' (e.g. eventops_test) to protect real data.`
        );
      }
    }

    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB connected: ${conn.connection.host} [DB: ${conn.connection.name}]`);
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected');
});
