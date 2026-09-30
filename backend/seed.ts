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
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

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
      // Update password just in case
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
