import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { User } from './src/modules/auth/model/user.model.js';
import { Service } from './src/modules/services/model/service.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const seedDatabase = async () => {
  try {
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
      throw new Error(
        'Refusing to run seed script in production/staging environment. ' +
        'Static test credentials must not be inserted into live environments. ' +
        'Use `npm run admin:create` instead to set up administrator accounts securely.'
      );
    }

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Seed Admin User
    const adminEmail = 'admin@eventops.com';
    let admin = await User.findOne({ email: adminEmail });
    if (!admin) {
      const hashedPassword = await bcrypt.hash('Admin@1234', 10);
      admin = await User.create({
        email: adminEmail,
        password: hashedPassword,
        name: 'EventOps Admin',
        role: 'admin',
        phone: '9876543210'
      });
      console.log('Created admin:', adminEmail);
    }

    // Seed Event Manager User
    const managerEmail = 'manager@eventops.com';
    let manager = await User.findOne({ email: managerEmail });
    if (!manager) {
      const hashedPassword = await bcrypt.hash('Manager@1234', 10);
      manager = await User.create({
        email: managerEmail,
        password: hashedPassword,
        name: 'EventOps Manager',
        role: 'event_manager',
        phone: '9876543211'
      });
      console.log('Created event manager:', managerEmail);
    }

    // Seed Client User
    const clientEmail = 'client@example.com';
    let client = await User.findOne({ email: clientEmail });
    if (!client) {
      const hashedPassword = await bcrypt.hash('password123', 10);
      client = await User.create({
        email: clientEmail,
        password: hashedPassword,
        name: 'Test Client',
        role: 'client',
        phone: '1234567890'
      });
      console.log('Created test client:', clientEmail);
    } else {
      console.log('Test client already exists');
      client.password = await bcrypt.hash('password123', 10);
      await client.save();
    }

    // Seed Services
    const servicesToSeed = [
      { name: 'Catering', description: 'Food and beverage services', isActive: true, pricingType: 'per_guest' },
      { name: 'Decoration', description: 'Stage and venue decoration', isActive: true, pricingType: 'per_event' },
      { name: 'Photography', description: 'Photography and videography', isActive: true, pricingType: 'package' },
      { name: 'Juice', description: 'Fresh juices and welcome drinks', isActive: true, pricingType: 'per_guest' }
    ];

    for (const s of servicesToSeed) {
      const existing = await Service.findOne({ name: s.name });
      if (!existing) {
        await Service.create(s);
        console.log(`Created service: ${s.name}`);
      }
    }

    console.log('Database seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedDatabase();
