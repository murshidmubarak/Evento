import test, { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { PendingUser } from '../src/modules/auth/model/pending-user.model.js';
import { emailService } from '../src/modules/email/service/email.service.js';

describe('Public Signup & OTP Verification', () => {
  before(async () => {
    await connectDB();
    await User.deleteMany({ email: /@test\.com$/ });
    await PendingUser.deleteMany({ email: /@test\.com$/ });
  });

  after(async () => {
    await User.deleteMany({ email: /@test\.com$/ });
    await PendingUser.deleteMany({ email: /@test\.com$/ });
    await mongoose.disconnect();
  });

  it('1. Valid public signup creates pending client', async () => {
    mock.method(emailService, 'sendVerificationOtp', async () => {}); // Mock email service
    
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Client',
        email: 'client_otp1@test.com',
        password: 'Password123!',
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.user, undefined);
    
    // Check DB
    const dbPendingUser = await PendingUser.findOne({ email: 'client_otp1@test.com' });
    assert.ok(dbPendingUser);
    assert.strictEqual(dbPendingUser.role, 'client');
    assert.ok(dbPendingUser.emailVerificationOtpHash); // Stored as hash
    assert.ok(dbPendingUser.emailVerificationOtpExpiresAt);

    mock.restoreAll();
  });

  it('2. Public signup does not allow role injection', async () => {
    mock.method(emailService, 'sendVerificationOtp', async () => {});

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Hacker',
        email: 'hacker@test.com',
        password: 'Password123!',
        role: 'admin',
      });

    assert.strictEqual(res.status, 200);
    
    const dbPendingUser = await PendingUser.findOne({ email: 'hacker@test.com' });
    assert.strictEqual(dbPendingUser!.role, 'client', 'Role must remain client');
    
    mock.restoreAll();
  });

  it('3. Duplicate email rejected for existing user', async () => {
    await User.create({
      name: 'Duplicate',
      email: 'existing_user@test.com',
      password: 'hash',
      role: 'client',
      isActive: true,
      emailVerified: true
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate',
        email: 'existing_user@test.com',
        password: 'Password123!',
      });

    assert.strictEqual(res.status, 409);
  });

  it('4. Unverified pending clients cannot login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'client_otp1@test.com',
        password: 'Password123!',
      });

    assert.strictEqual(res.status, 401);
    assert.match(res.body.message, /Invalid email or password/);
  });

  it('5. Invalid OTP format rejected', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email-otp')
      .send({
        email: 'client_otp1@test.com',
        otp: '123', // not 6 digits
      });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Validation failed/);
  });

  it('6. Wrong OTP increments attempts and fails', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email-otp')
      .send({
        email: 'client_otp1@test.com',
        otp: '999999', // wrong
      });

    assert.strictEqual(res.status, 400);
    assert.match(res.body.message, /Invalid verification code/);

    const dbUser = await PendingUser.findOne({ email: 'client_otp1@test.com' });
    assert.strictEqual(dbUser!.emailVerificationOtpAttempts, 1);
  });
});
