import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import app from '../src/app.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Sequence } from '../src/modules/users/model/sequence.model.js';
import bcrypt from 'bcryptjs';

describe('Profile Management Endpoints', () => {
  let server: any;
  let port: number;

  let clientToken: string;
  let workerToken: string;
  let managerToken: string;
  let adminToken: string;
  let workerUserId: string;
  let managerUserId: string;

  before(async () => {
    // 1. Connect to MongoDB (isolated test DB)
    await connectDB();
    await User.deleteMany({});
    await Sequence.deleteMany({});

    // 2. Start the server
    server = app.listen(0);
    port = server.address().port;

    // 3. Setup Users

    // Create Admin
    const hashedPassword = await bcrypt.hash('password123', 10);
    await User.create({
      name: 'Admin Profile',
      email: 'admin.profile@example.com',
      password: hashedPassword,
      role: 'admin',
      isActive: true,
    });
    const adminLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin.profile@example.com', password: 'password123' })
    });
    const adminData = await adminLoginRes.json() as any;
    adminToken = adminData.data.token;

    // Create Client
    await User.create({
      name: 'Client Profile',
      email: 'client.profile@example.com',
      password: hashedPassword,
      role: 'client',
      isActive: true,
      emailVerified: true
    });
    const clientLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'client.profile@example.com', password: 'password123' })
    });
    const clientData = await clientLoginRes.json() as any;
    clientToken = clientData.data.token;

    // Create Event Manager
    const emRes = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'EM Profile', email: 'em.profile@example.com', password: 'password123' })
    });
    const emBody = await emRes.json() as any;
    managerUserId = emBody.data.user.id;

    // Activate the manager and set password for testing profile operations
    await User.findByIdAndUpdate(managerUserId, {
      isActive: true,
      emailVerified: true,
      password: hashedPassword,
    });

    const emLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'em.profile@example.com', password: 'password123' })
    });
    const emData = await emLoginRes.json() as any;
    managerToken = emData.data.token;

    // Create Worker
    const workerRes = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Worker Profile', email: 'worker.profile@example.com', password: 'password123', workerType: 'Chef' })
    });
    const workerBody = await workerRes.json() as any;
    workerUserId = workerBody.data.user.id;

    const workerLoginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'worker.profile@example.com', password: 'password123' })
    });
    const workerData = await workerLoginRes.json() as any;
    workerToken = workerData.data.token;
  });

  after(async () => {
    await mongoose.disconnect();
    server.close();
  });

  it('1. Unauthenticated profile request returns 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
    assert.equal(res.status, 401);
  });

  it('2. Authenticated Client can view own profile', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.data.user.email, 'client.profile@example.com');
    assert.equal(body.data.user.role, 'client');
  });

  it('3. Authenticated Worker can view own profile', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${workerToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.data.user.email, 'worker.profile@example.com');
    assert.equal(body.data.user.role, 'worker');
    assert.equal(body.data.user.workerType, 'Chef');
    assert.ok(body.data.user.businessId);
  });

  it('4. Authenticated Event Manager can view own profile', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${managerToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.data.user.email, 'em.profile@example.com');
    assert.equal(body.data.user.role, 'event_manager');
    assert.ok(body.data.user.businessId);
  });

  it('5. Authenticated Admin can view own profile', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.data.user.email, 'admin.profile@example.com');
    assert.equal(body.data.user.role, 'admin');
  });

  it('6. User can update allowed profile fields', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: JSON.stringify({ name: 'Client Updated', phone: '1234567890' })
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.data.user.name, 'Client Updated');
    assert.equal(body.data.user.phone, '1234567890');
  });

  it('7, 8, 9, 10, 11, 12. Protected fields cannot be updated', async () => {
    // Attempt mass assignment with forbidden fields
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
      body: JSON.stringify({
        name: 'Worker Hack',
        _id: '123456789012345678901234',
        role: 'admin',
        businessId: '9999',
        isActive: false,
        password: 'hackedpassword',
        workerType: 'Decoration Worker'
      })
    });
    assert.equal(res.status, 200); // the allowed fields should update, rest ignored
    const body = await res.json() as any;
    
    // Allowed
    assert.equal(body.data.user.name, 'Worker Hack');
    
    // Not allowed
    assert.notEqual(body.data.user.id, '123456789012345678901234');
    assert.equal(body.data.user.id, workerUserId);
    assert.equal(body.data.user.role, 'worker');
    assert.notEqual(body.data.user.businessId, '9999');
    assert.equal(body.data.user.isActive, true);
    assert.equal(body.data.user.workerType, 'Chef');
    
    // Ensure password wasn't changed (login with original)
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'worker.profile@example.com', password: 'password123' })
    });
    assert.equal(loginRes.status, 200);
  });

  it('13. Sensitive fields are not returned', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(!body.data.user.password);
    assert.ok(!body.data.user.passwordResetTokenHash);
  });

  it('14. Worker businessId remains unchanged after profile update', async () => {
    const meRes1 = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${workerToken}` }
    });
    const body1 = await meRes1.json() as any;
    const initialBid = body1.data.user.businessId;

    const patchRes = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
      body: JSON.stringify({ name: 'Worker Updated' })
    });
    assert.equal(patchRes.status, 200);
    const body2 = await patchRes.json() as any;
    assert.equal(body2.data.user.businessId, initialBid);
  });

  it('15. Event Manager businessId remains unchanged after profile update', async () => {
    const meRes1 = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${managerToken}` }
    });
    const body1 = await meRes1.json() as any;
    const initialBid = body1.data.user.businessId;

    const patchRes = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
      body: JSON.stringify({ name: 'EM Updated' })
    });
    assert.equal(patchRes.status, 200);
    const body2 = await patchRes.json() as any;
    assert.equal(body2.data.user.businessId, initialBid);
  });

});
