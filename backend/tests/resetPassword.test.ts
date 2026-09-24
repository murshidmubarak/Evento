import './setup.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

describe('Reset Password Endpoint', () => {
  before(async () => {
    await connectDB();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  it('1. Missing token → 400 Bad Request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123'
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Validation failed'));
    } finally {
      server.close();
    }
  });

  it('2. Invalid new password → 400 Bad Request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'some-token',
          newPassword: 'short',
          confirmPassword: 'short'
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Validation failed'));
    } finally {
      server.close();
    }
  });

  it('3. Confirm password mismatch → 400 Bad Request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'some-token',
          newPassword: 'NewPassword123',
          confirmPassword: 'DifferentPassword123'
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Validation failed'));
    } finally {
      server.close();
    }
  });

  it('4. Invalid reset token → 400 Bad Request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid-token-123',
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123'
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.equal(data.message, 'Invalid or expired password reset token.');
    } finally {
      server.close();
    }
  });

  it('5. Expired reset token → 400 Bad Request', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const user = new User({
        name: 'Expired Token User',
        email: 'expired@example.com',
        password: 'oldpassword',
        passwordResetTokenHash: hash,
        passwordResetExpiresAt: new Date(Date.now() - 10000), // Expired
      });
      await user.save();

      const res = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123'
        }),
      });
      
      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.equal(data.message, 'Invalid or expired password reset token.');

      await User.findByIdAndDelete(user._id);
    } finally {
      server.close();
    }
  });

  it('6. Valid reset token → success, token cleared, new password hashes correctly', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const user = new User({
        name: 'Valid Token User',
        email: 'valid@example.com',
        password: await bcrypt.hash('oldpassword', 10),
        passwordResetTokenHash: hash,
        passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      await user.save();

      const res = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          newPassword: 'NewPassword123',
          confirmPassword: 'NewPassword123'
        }),
      });
      
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.message, 'Password reset successfully');
      
      // Verify DB updates
      const updatedUser = await User.findById(user._id).select('+password +passwordResetTokenHash +passwordResetExpiresAt');
      assert.ok(updatedUser);
      assert.notEqual(updatedUser.password, 'NewPassword123', 'Password should not be stored as plain text');
      assert.notEqual(updatedUser.password, user.password, 'Password should be updated');
      
      const isPasswordValid = await bcrypt.compare('NewPassword123', updatedUser.password || '');
      assert.ok(isPasswordValid, 'New password should be correctly hashed');

      assert.equal(updatedUser.passwordResetTokenHash, undefined, 'Reset token hash should be cleared');
      assert.equal(updatedUser.passwordResetExpiresAt, undefined, 'Reset token expiry should be cleared');

      // Verify old password does NOT work via login
      const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'valid@example.com',
          password: 'oldpassword'
        }),
      });
      assert.equal(loginRes.status, 401, 'Old password should no longer work');

      // Verify single-use token rule (reuse should fail)
      const reuseRes = await fetch(`http://127.0.0.1:${port}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: rawToken,
          newPassword: 'AnotherPassword123',
          confirmPassword: 'AnotherPassword123'
        }),
      });
      assert.equal(reuseRes.status, 400);

      await User.findByIdAndDelete(user._id);
    } finally {
      server.close();
    }
  });
});
