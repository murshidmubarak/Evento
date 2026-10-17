import './setup.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Sequence } from '../src/modules/users/model/sequence.model.js';

describe('Event Manager Onboarding & Invitation Flow', () => {
  let server: any;
  let port: number;
  let adminToken: string;
  let adminId: string;

  before(async () => {
    await connectDB();
    await User.deleteMany({});
    await Sequence.deleteMany({});

    server = app.listen(0);
    port = (server.address() as any).port;

    adminId = new mongoose.Types.ObjectId().toString();
    const adminUser = new User({
      _id: adminId,
      name: 'System Admin',
      email: 'admin_onboarding@eventops.com',
      password: await bcrypt.hash('adminPass123', 10),
      role: 'admin',
      isActive: true,
      emailVerified: true,
    });
    await adminUser.save();

    adminToken = jwt.sign({ userId: adminId, role: 'admin' }, env.jwtSecret, { expiresIn: '1h' });
  });

  after(async () => {
    if (server) server.close();
    await User.deleteMany({});
    await Sequence.deleteMany({});
    await mongoose.disconnect();
  });

  let createdManagerId: string;
  let extractedRawToken: string;

  it('1. Admin creates Event Manager without providing password', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Karan Mehra',
        email: 'karan@eventops.com',
        phone: '+91 98765 43210',
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.user.role, 'event_manager');
    assert.equal(body.data.user.isActive, false, 'Initial state must be inactive/pending');
    assert.equal(body.data.user.emailVerified, false, 'Email must not be verified prior to invitation acceptance');
    assert.equal(body.data.user.password, undefined, 'Password must not be returned');
    assert.equal(body.data.user.invitationTokenHash, undefined, 'Token hash must not be returned');

    createdManagerId = body.data.user.id;

    // Verify database record
    const dbUser = await User.findById(createdManagerId).select('+invitationTokenHash +invitationTokenExpiresAt +password');
    assert.ok(dbUser);
    assert.ok(dbUser.invitationTokenHash, 'Invitation token hash must be persisted in database');
    assert.ok(dbUser.invitationTokenExpiresAt, 'Expiration date must be stored');
    assert.ok(dbUser.invitationTokenExpiresAt.getTime() > Date.now(), 'Token expiry must be in the future');
  });

  it('2. Pending Event Manager cannot log in prior to password setup', async () => {
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'karan@eventops.com',
        password: 'anyPassword123',
      }),
    });

    assert.equal(loginRes.status, 401);
    const body = (await loginRes.json()) as any;
    assert.equal(body.success, false);
  });

  it('3. GET /api/auth/invitation/:token with invalid token returns 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/invitation/invalid_token_12345`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.ok(body.message.includes('invalid or has expired'));
  });

  it('4. Admin resends invitation to pending manager, regenerating token', async () => {
    // Inject a known test raw token to test verification and acceptance deterministically
    const knownRawToken = 'test_raw_invitation_token_karan_1234567890abcdef';
    const knownHash = crypto.createHash('sha256').update(knownRawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await User.findByIdAndUpdate(createdManagerId, {
      invitationTokenHash: knownHash,
      invitationTokenExpiresAt: expiresAt,
    });

    // Check GET invitation details with known token
    const checkRes = await fetch(`http://127.0.0.1:${port}/api/auth/invitation/${knownRawToken}`);
    assert.equal(checkRes.status, 200);
    const checkBody = (await checkRes.json()) as any;
    assert.equal(checkBody.data.name, 'Karan Mehra');
    assert.equal(checkBody.data.email, 'karan@eventops.com');
    assert.equal(checkBody.data.role, 'event_manager');

    // Admin resends invitation
    const resendRes = await fetch(`http://127.0.0.1:${port}/api/users/event-managers/${createdManagerId}/resend-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assert.equal(resendRes.status, 200);

    // Old token should now be invalidated
    const oldCheck = await fetch(`http://127.0.0.1:${port}/api/auth/invitation/${knownRawToken}`);
    assert.equal(oldCheck.status, 400);
  });

  it('5. Manager accepts invitation, sets password, and activates account', async () => {
    // Generate and inject a fresh known raw token for deterministic acceptance
    const acceptRawToken = 'accept_token_karan_' + crypto.randomBytes(16).toString('hex');
    const acceptHash = crypto.createHash('sha256').update(acceptRawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await User.findByIdAndUpdate(createdManagerId, {
      invitationTokenHash: acceptHash,
      invitationTokenExpiresAt: expiresAt,
    });

    // Invalid password (too short) is rejected
    const shortPassRes = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: acceptRawToken,
        password: '123',
      }),
    });
    assert.equal(shortPassRes.status, 400);

    // Valid acceptance
    const acceptRes = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: acceptRawToken,
        password: 'KaranPassword@2026',
        confirmPassword: 'KaranPassword@2026',
      }),
    });
    assert.equal(acceptRes.status, 200);
    const body = (await acceptRes.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.user.isActive, true, 'User must now be active');
    assert.equal(body.data.user.emailVerified, true, 'Email must now be verified');

    // DB state verification
    const dbUser = await User.findById(createdManagerId).select('+invitationTokenHash +invitationTokenExpiresAt +password');
    assert.ok(dbUser);
    assert.equal(dbUser.isActive, true);
    assert.equal(dbUser.emailVerified, true);
    assert.equal(dbUser.invitationTokenHash, undefined, 'Token hash must be cleared');
    assert.ok(dbUser.invitationAcceptedAt, 'Acceptance timestamp must be set');

    // Password must be properly hashed
    const match = await bcrypt.compare('KaranPassword@2026', dbUser.password || '');
    assert.ok(match, 'New password must match stored bcrypt hash');

    // Token cannot be accepted twice
    const replayRes = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: acceptRawToken,
        password: 'AnotherPassword@2026',
      }),
    });
    assert.equal(replayRes.status, 400);
  });

  it('6. Newly activated Event Manager logs in and receives event_manager JWT', async () => {
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'karan@eventops.com',
        password: 'KaranPassword@2026',
      }),
    });

    assert.equal(loginRes.status, 200);
    const body = (await loginRes.json()) as any;
    assert.equal(body.data.user.role, 'event_manager');
    assert.equal(body.data.user.isActive, true);
    assert.ok(body.data.token);

    // Verify decoded token role
    const decoded = jwt.decode(body.data.token) as any;
    assert.equal(decoded.role, 'event_manager');
  });

  it('7. Admin cannot resend invitation for already active Event Manager', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers/${createdManagerId}/resend-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.ok(body.message.includes('already active'));
  });

  it('8. Expired invitation token is rejected upon acceptance', async () => {
    // Create an expired manager invitation
    const expiredManager = new User({
      name: 'Expired Manager',
      email: 'expired_manager@eventops.com',
      role: 'event_manager',
      isActive: false,
      emailVerified: false,
      invitationTokenHash: crypto.createHash('sha256').update('expired_token_123').digest('hex'),
      invitationTokenExpiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
    });
    await expiredManager.save();

    const res = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'expired_token_123',
        password: 'NewPassword123',
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.ok(body.message.includes('invalid or has expired'));
  });
});
