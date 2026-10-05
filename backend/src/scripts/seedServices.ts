import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { Service } from '../modules/services/model/service.model.js';

const seedServices = async () => {
  try {
    await connectDB();
    console.log('Connected to MongoDB');

    const servicesToSeed = [
      {
        name: 'Catering Service',
        description: 'Full food and beverage catering service',
        pricingType: 'per_guest',
        basePrice: 500,
        isActive: true,
      },
      {
        name: 'Stage Decoration Service',
        description: 'Complete stage and venue decoration',
        pricingType: 'per_event',
        basePrice: 15000,
        isActive: true,
      },
      {
        name: 'Photography & Videography',
        description: 'Professional photo and video coverage',
        pricingType: 'per_event',
        basePrice: 20000,
        isActive: true,
      }
    ];

    for (const service of servicesToSeed) {
      const updated = await Service.findOneAndUpdate(
        { name: service.name },
        { $set: service },
        { upsert: true, new: true }
      );
      console.log(`Upserted service: ${updated.name}`);
    }

    console.log('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding services:', error);
    process.exit(1);
  }
};

seedServices();
