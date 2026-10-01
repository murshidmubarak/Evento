import test, { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { emailService } from '../src/modules/email/service/email.service.js';

describe('Public Signup & OTP Verification', () => {
  before(async () => {
    await connectDB();
    await User.deleteMany({ email: /@test\.com$/ });
  });

  after(async () => {
    await User.deleteMany({ email: /@test\.com$/ });
    await mongoose.disconnect();
  });

  it('1. Valid public signup creates client with emailVerified=false', async () => {
    mock.method(emailService, 'sendVerificationOtp', async () => {}); // Mock email service
    
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Client',
        email: 'client_otp1@test.com',
        password: 'Password123!',
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.user.role, 'client');
    assert.strictEqual(res.body.data.user.emailVerified, false);
    
    // Check DB
    const dbUser = await User.findOne({ email: 'client_otp1@test.com' }).select('+emailVerificationOtpHash +emailVerificationOtpExpiresAt');
    assert.ok(dbUser);
    assert.strictEqual(dbUser.emailVerified, false);
    assert.ok(dbUser.emailVerificationOtpHash); // Stored as hash
    assert.ok(dbUser.emailVerificationOtpExpiresAt);

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

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.user.role, 'client', 'Role must remain client');
    
    mock.restoreAll();
  });

  it('3. Duplicate email rejected', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Duplicate',
        email: 'client_otp1@test.com', // Already created
        password: 'Password123!',
      });

    assert.strictEqual(res.status, 409);
  });

  it('4. Unverified clients cannot login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'client_otp1@test.com',
        password: 'Password123!',
      });

    assert.strictEqual(res.status, 401);
    assert.match(res.body.message, /verify your email/);
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

    const dbUser = await User.findOne({ email: 'client_otp1@test.com' }).select('+emailVerificationOtpAttempts');
    assert.strictEqual(dbUser!.emailVerificationOtpAttempts, 1);
  });
});
