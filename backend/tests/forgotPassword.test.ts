import './setup.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';

describe('Forgot Password Endpoint', () => {
  before(async () => {
    await connectDB();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  it('1. Missing email → 400 Bad Request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Validation failed'));
    } finally {
      server.close();
    }
  });

  it('2. Invalid email format → 400 Bad Request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Validation failed'));
    } finally {
      server.close();
    }
  });

  it('3. Email for non-existing user → 200 OK (Generic response)', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nonexistent@example.com' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.message, 'If an account exists for this email, password reset instructions will be sent.');
    } finally {
      server.close();
    }
  });

  it('4. Valid email for existing user → 200 OK (Generic response) & updates DB', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      // Create user
      const user = new User({
        name: 'Forgot Test User',
        email: 'forgot@example.com',
        password: 'hashedpassword',
        role: 'client',
      });
      await user.save();

      const res = await fetch(`http://127.0.0.1:${port}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'forgot@example.com' }),
      });
      
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.message, 'If an account exists for this email, password reset instructions will be sent.');
      assert.equal(data.data.passwordResetTokenHash, undefined); // Token not returned to API

      // Verify DB update
      const updatedUser = await User.findById(user._id).select('+passwordResetTokenHash +passwordResetExpiresAt');
      assert.ok(updatedUser?.passwordResetTokenHash, 'Hash should be saved');
      assert.ok(updatedUser?.passwordResetExpiresAt, 'Expiry should be saved');
      assert.ok(updatedUser?.passwordResetExpiresAt.getTime() > Date.now(), 'Expiry should be in the future');

      // Cleanup
      await User.findByIdAndDelete(user._id);
    } finally {
      server.close();
    }
  });
});
