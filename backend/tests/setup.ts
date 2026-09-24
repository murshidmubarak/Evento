import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure .env is loaded from backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

// Provide fallback values if environment variables are not set in the running shell
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/eventops_test';
}

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Please check your .env file.');
}
