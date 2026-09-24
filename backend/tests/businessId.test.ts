import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { Sequence } from '../src/modules/users/model/sequence.model.js';
import { BusinessIdService } from '../src/modules/users/service/business-id.service.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import bcrypt from 'bcryptjs';

describe('Business ID Generation & Assignment', () => {
  let adminToken: string;
  let adminId: string;
  let server: any;
  let port: number;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    adminId = new mongoose.Types.ObjectId().toString();
    const adminUser = new User({
      _id: adminId,
      name: 'Test Admin',
      email: 'admin.businessid@example.com',
      password: await bcrypt.hash('password123', 10),
      role: 'admin',
      isActive: true,
    });
    await adminUser.save();

    adminToken = generateToken(adminId, 'admin');
  });

  after(async () => {
    await User.deleteMany({ email: { $ne: 'admin.businessid@example.com' } });
    await Sequence.deleteMany({});
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({ email: { $ne: 'admin.businessid@example.com' } });
    await Sequence.deleteMany({});
  });

  it('1. First Event Manager receives the configured starting ID (1000+)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Manager One', email: 'manager1.businessid_test@example.com', password: 'password123' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    const bid = Number(data.data.user.businessId);
    assert.ok(bid >= 1000 && bid < 2000, `Expected businessId in range 1000-1999, got ${bid}`);
  });

  it('2. Second Event Manager receives the next ID', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Manager One', email: 'manager1_2.businessid_test@example.com', password: 'password123' }),
    });

    const res2 = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Manager Two', email: 'manager2_2.businessid_test@example.com', password: 'password123' }),
    });
    assert.equal(res2.status, 201);
    const data1 = await res1.json() as any;
    const data2 = await res2.json() as any;
    const bid1 = Number(data1.data.user.businessId);
    const bid2 = Number(data2.data.user.businessId);
    assert.ok(bid2 > bid1, `Expected bid2 (${bid2}) to be greater than bid1 (${bid1})`);
  });

  it('3. First Worker of a category receives that category configured starting ID', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering Boy One', email: 'cb1.businessid_test@example.com', password: 'password123', workerType: 'Catering Boy' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.equal(data.data.user.businessId, '2000');
  });

  it('4. Second Worker of the same category receives the next ID', async () => {
    await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering Boy One', email: 'cb1.businessid_test@example.com', password: 'password123', workerType: 'Catering Boy' }),
    });

    const res2 = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering Boy Two', email: 'cb2.businessid_test@example.com', password: 'password123', workerType: 'Catering Boy' }),
    });
    assert.equal(res2.status, 201);
    const data2 = await res2.json() as any;
    assert.equal(data2.data.user.businessId, '2001');
  });

  it('5. Different Worker types use their own independent sequences/ranges', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering Boy One', email: 'cb1.businessid_test@example.com', password: 'password123', workerType: 'Catering Boy' }),
    });

    const res2 = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Chef One', email: 'chef1.businessid_test@example.com', password: 'password123', workerType: 'Chef' }),
    });

    assert.equal(res1.status, 201);
    const data1 = await res1.json() as any;
    assert.equal(data1.data.user.businessId, '2000');
    
    assert.equal(res2.status, 201);
    const data2 = await res2.json() as any;
    assert.equal(data2.data.user.businessId, '4000');
  });

  it('6. Two simultaneous creations cannot receive the same business ID', async () => {
    const businessIdService = new BusinessIdService();
    const promises = Array.from({ length: 50 }).map(() => businessIdService.generateBusinessId('Catering Boy'));
    const generatedIds = await Promise.all(promises);

    const uniqueIds = new Set(generatedIds);
    assert.equal(uniqueIds.size, 50);
    const numbers = generatedIds.map(Number);
    assert.equal(Math.min(...numbers), 2000);
    assert.equal(Math.max(...numbers), 2049);
  });

  it('7. Client does not receive a business ID', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Client One', email: 'client1.businessid_test@example.com', password: 'password123' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.equal(data.data.user.businessId, undefined);
  });

  it('8. Caller-supplied businessId is ignored', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Manager Hacker', email: 'manager_hack.businessid_test@example.com', password: 'password123', businessId: '9999' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    const bid = Number(data.data.user.businessId);
    assert.ok(bid >= 1000 && bid < 2000, 'Should ignore 9999 and generate valid Event Manager ID');
    assert.notEqual(data.data.user.businessId, '9999');
  });

  it('9. Newly created Event Manager can log in', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Manager Login', email: 'manager_login.businessid_test@example.com', password: 'password123' }),
    });
    const data1 = await res1.json() as any;
    const generatedBid = data1.data.user.businessId;

    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'manager_login.businessid_test@example.com', password: 'password123' }),
    });
    assert.equal(loginRes.status, 200);
    const data = await loginRes.json() as any;
    assert.equal(data.data.user.businessId, generatedBid);
  });
});
