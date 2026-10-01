import readline from 'node:readline/promises';
import { connectDB } from '../config/db.js';
import mongoose from 'mongoose';
import { UserService } from '../modules/auth/service/user.service.js';

async function bootstrap() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log('====================================');
    console.log('EventOps ERP - Admin Bootstrap');
    console.log('====================================\n');

    await connectDB();

    const name = await rl.question('Enter Admin Name: ');
    if (!name.trim()) {
      throw new Error('Name is required.');
    }

    const email = await rl.question('Enter Admin Email: ');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid email format.');
    }

    const password = await rl.question('Enter Password: ');
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      throw new Error('Password must contain an uppercase letter, lowercase letter, number, and special character.');
    }

    const confirmPassword = await rl.question('Confirm Password: ');
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    console.log('\nCreating administrator...');
    
    const userService = new UserService();
    const admin = await userService.createAdmin({
      name,
      email,
      password
    });

    console.log('\nSuccess! Administrator created.');
    console.log(`Name:  ${admin.name}`);
    console.log(`Email: ${admin.email}`);
    console.log(`Role:  ${admin.role}`);
    console.log('You can now log in using the standard login page.');

  } catch (error: any) {
    console.error('\n[Error]', error.message || error);
  } finally {
    rl.close();
    await mongoose.disconnect();
    process.exit(0);
  }
}

bootstrap();
