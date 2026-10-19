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

describe('Worker Onboarding & Invitation Flow', () => {
  let server: any;
  let port: number;
  let adminToken: string;
  let adminId: string;
  let managerToken: string;
  let managerId: string;
  let otherManagerToken: string;
  let otherManagerId: string;
  let clientToken: string;
  let clientId: string;

  before(async () => {
    await connectDB();
    await User.deleteMany({});
    await Sequence.deleteMany({});

    server = app.listen(0);
    port = (server.address() as any).port;

    // 1. Setup Admin
    adminId = new mongoose.Types.ObjectId().toString();
    const adminUser = new User({
      _id: adminId,
      name: 'System Admin',
      email: 'admin_worker_onboarding@eventops.com',
      password: await bcrypt.hash('adminPass123', 10),
      role: 'admin',
      isActive: true,
      emailVerified: true,
    });
    await adminUser.save();
    adminToken = jwt.sign({ userId: adminId, role: 'admin' }, env.jwtSecret, { expiresIn: '1h' });

    // 2. Setup Event Manager A
    managerId = new mongoose.Types.ObjectId().toString();
    const managerUser = new User({
      _id: managerId,
      name: 'Manager Rahul',
      email: 'manager_rahul@eventops.com',
      password: await bcrypt.hash('managerPass123', 10),
      role: 'event_manager',
      isActive: true,
      emailVerified: true,
      businessId: '1001',
    });
    await managerUser.save();
    managerToken = jwt.sign({ userId: managerId, role: 'event_manager' }, env.jwtSecret, { expiresIn: '1h' });

    // 3. Setup Event Manager B
    otherManagerId = new mongoose.Types.ObjectId().toString();
    const otherManager = new User({
      _id: otherManagerId,
      name: 'Manager Priya',
      email: 'manager_priya@eventops.com',
      password: await bcrypt.hash('managerPass123', 10),
      role: 'event_manager',
      isActive: true,
      emailVerified: true,
      businessId: '1002',
    });
    await otherManager.save();
    otherManagerToken = jwt.sign({ userId: otherManagerId, role: 'event_manager' }, env.jwtSecret, { expiresIn: '1h' });

    // 4. Setup Client
    clientId = new mongoose.Types.ObjectId().toString();
    const clientUser = new User({
      _id: clientId,
      name: 'Client User',
      email: 'client_worker_test@eventops.com',
      password: await bcrypt.hash('clientPass123', 10),
      role: 'client',
      isActive: true,
      emailVerified: true,
    });
    await clientUser.save();
    clientToken = jwt.sign({ userId: clientId, role: 'client' }, env.jwtSecret, { expiresIn: '1h' });
  });

  after(async () => {
    if (server) server.close();
    await User.deleteMany({});
    await Sequence.deleteMany({});
    await mongoose.disconnect();
  });

  let createdWorkerId: string;

  it('1. Event Manager creates a Worker account without providing a password', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: 'Arjun Das',
        email: 'arjun.chef@eventops.com',
        phone: '+91 91234 56789',
        workerType: 'Chef',
        role: 'admin', // Attempted role escalation
      }),
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.user.role, 'worker', 'Role must be strictly forced to worker');
    assert.equal(body.data.user.workerType, 'Chef');
    assert.equal(body.data.user.isActive, false, 'Initial state must be inactive/pending');
    assert.equal(body.data.user.emailVerified, false, 'Email must not be verified prior to invitation acceptance');
    assert.equal(body.data.user.password, undefined, 'Password must not be returned');
    assert.equal(body.data.user.invitationTokenHash, undefined, 'Token hash must not be returned');
    assert.equal(body.data.user.createdBy, managerId, 'Creator attribution must match authenticated Event Manager');

    createdWorkerId = body.data.user.id;

    // Verify database record
    const dbUser = await User.findById(createdWorkerId).select('+invitationTokenHash +invitationTokenExpiresAt +password');
    assert.ok(dbUser);
    assert.equal(dbUser.role, 'worker');
    assert.ok(dbUser.invitationTokenHash, 'Invitation token hash must be persisted in database');
    assert.ok(dbUser.invitationTokenExpiresAt, 'Expiration date must be stored');
    assert.ok(dbUser.invitationTokenExpiresAt.getTime() > Date.now(), 'Token expiry must be in the future');
    assert.equal(dbUser.businessId, '4000', 'Chef category starting business ID should be 4000');
  });

  it('2. Unauthenticated user cannot create Worker accounts', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unauth Worker',
        email: 'unauth@eventops.com',
        workerType: 'Host',
      }),
    });
    assert.equal(res.status, 401);
  });

  it('3. Client cannot create Worker accounts', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clientToken}`,
      },
      body: JSON.stringify({
        name: 'Client Created Worker',
        email: 'client_created@eventops.com',
        workerType: 'Host',
      }),
    });
    assert.equal(res.status, 403);
  });

  it('4. Duplicate worker email is rejected with 409 Conflict', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: 'Duplicate Arjun',
        email: 'arjun.chef@eventops.com',
        workerType: 'Chef',
      }),
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as any;
    assert.ok(body.message.includes('already registered'));
  });

  it('5. Invalid worker type is rejected with 400 Bad Request', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: 'Invalid Type Worker',
        email: 'invalid_type@eventops.com',
        workerType: 'Astronaut',
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.ok(body.message.includes('Validation failed'));
  });

  it('6. Pending Worker cannot log in prior to password setup', async () => {
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'arjun.chef@eventops.com',
        password: 'anyPassword123',
      }),
    });

    assert.equal(loginRes.status, 401);
    const body = (await loginRes.json()) as any;
    assert.ok(body.message.includes('pending activation'));
  });

  it('7. Public GET /api/auth/invitation/:token returns worker details and role', async () => {
    const rawToken = 'known_worker_raw_token_arjun_1234567890';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await User.findByIdAndUpdate(createdWorkerId, {
      invitationTokenHash: tokenHash,
      invitationTokenExpiresAt: expiresAt,
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/auth/invitation/${rawToken}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.data.name, 'Arjun Das');
    assert.equal(body.data.email, 'arjun.chef@eventops.com');
    assert.equal(body.data.role, 'worker');
    assert.equal(body.data.workerType, 'Chef');
  });

  it('8. Creating Manager can resend invitation, invalidating previous token', async () => {
    const rawToken = 'known_worker_raw_token_arjun_1234567890';

    const resendRes = await fetch(`http://127.0.0.1:${port}/api/manager/workers/${createdWorkerId}/resend-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    });

    assert.equal(resendRes.status, 200);
    const body = (await resendRes.json()) as any;
    assert.equal(body.success, true);

    // Old token should now be invalidated
    const oldCheck = await fetch(`http://127.0.0.1:${port}/api/auth/invitation/${rawToken}`);
    assert.equal(oldCheck.status, 400);
  });

  it('9. Non-creator Event Manager cannot resend invitation to another manager’s worker -> 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/workers/${createdWorkerId}/resend-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${otherManagerToken}`,
      },
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as any;
    assert.ok(body.message.includes('permission'));
  });

  it('10. Worker accepts invitation, sets password, and activates account', async () => {
    const acceptRawToken = 'accept_token_worker_arjun_' + crypto.randomBytes(16).toString('hex');
    const acceptHash = crypto.createHash('sha256').update(acceptRawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);

    await User.findByIdAndUpdate(createdWorkerId, {
      invitationTokenHash: acceptHash,
      invitationTokenExpiresAt: expiresAt,
    });

    const acceptRes = await fetch(`http://127.0.0.1:${port}/api/auth/accept-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: acceptRawToken,
        password: 'ArjunChefPassword@2026',
        confirmPassword: 'ArjunChefPassword@2026',
      }),
    });

    assert.equal(acceptRes.status, 200);
    const body = (await acceptRes.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.data.user.isActive, true, 'Worker must now be active');
    assert.equal(body.data.user.emailVerified, true, 'Email must now be verified');

    // DB state verification
    const dbUser = await User.findById(createdWorkerId).select('+invitationTokenHash +password');
    assert.ok(dbUser);
    assert.equal(dbUser.isActive, true);
    assert.equal(dbUser.emailVerified, true);
    assert.equal(dbUser.invitationTokenHash, undefined, 'Token hash must be cleared');
    assert.ok(dbUser.invitationAcceptedAt);

    // Replay attack rejected
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

  it('11. Newly activated Worker logs in and receives worker JWT', async () => {
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'arjun.chef@eventops.com',
        password: 'ArjunChefPassword@2026',
      }),
    });

    assert.equal(loginRes.status, 200);
    const body = (await loginRes.json()) as any;
    assert.equal(body.data.user.role, 'worker');
    assert.equal(body.data.user.workerType, 'Chef');
    assert.equal(body.data.user.isActive, true);
    assert.ok(body.data.token);

    // Verify decoded token role
    const decoded = jwt.decode(body.data.token) as any;
    assert.equal(decoded.role, 'worker');
  });

  it('12. Resending invitation for already active Worker is rejected -> 400', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/manager/workers/${createdWorkerId}/resend-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken}`,
      },
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.ok(body.message.includes('already active'));
  });

  it('13. Worker record isolation: Manager A only sees workers they created', async () => {
    // Create a worker by Manager B
    const workerB = await fetch(`http://127.0.0.1:${port}/api/manager/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${otherManagerToken}`,
      },
      body: JSON.stringify({
        name: 'Worker of Priya',
        email: 'priya_worker@eventops.com',
        workerType: 'Videographer',
      }),
    });
    assert.equal(workerB.status, 201);

    // Manager A queries workers
    const listResA = await fetch(`http://127.0.0.1:${port}/api/manager/workers`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    });
    assert.equal(listResA.status, 200);
    const bodyA = (await listResA.json()) as any;
    const workerIdsA = bodyA.data.workers.map((w: any) => w.id);
    assert.ok(workerIdsA.includes(createdWorkerId), 'Manager A should see worker they created');
    assert.ok(!workerIdsA.includes((await workerB.json() as any).data.user.id), 'Manager A must NOT see worker created by Manager B');

    // Admin queries workers -> Admin sees both workers
    const adminListRes = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminListRes.status, 200);
    const adminBody = (await adminListRes.json()) as any;
    const adminWorkerEmails = adminBody.data.workers.map((w: any) => w.email);
    assert.ok(adminWorkerEmails.includes('arjun.chef@eventops.com'));
    assert.ok(adminWorkerEmails.includes('priya_worker@eventops.com'));
  });

  it('14. Inactive Event Manager cannot create Worker accounts -> 403', async () => {
    const inactiveManagerId = new mongoose.Types.ObjectId().toString();
    const inactiveManager = new User({
      _id: inactiveManagerId,
      name: 'Inactive Manager',
      email: 'inactive_mgr@eventops.com',
      password: await bcrypt.hash('pass123', 10),
      role: 'event_manager',
      isActive: false,
      emailVerified: true,
    });
    await inactiveManager.save();
    const inactiveToken = jwt.sign({ userId: inactiveManagerId, role: 'event_manager' }, env.jwtSecret, { expiresIn: '1h' });

    const res = await fetch(`http://127.0.0.1:${port}/api/manager/workers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inactiveToken}`,
      },
      body: JSON.stringify({
        name: 'Worker from Inactive Manager',
        email: 'fail_worker@eventops.com',
        workerType: 'Host',
      }),
    });

    assert.equal(res.status, 403);
  });
});
