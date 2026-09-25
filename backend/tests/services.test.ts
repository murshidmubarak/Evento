import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Service } from '../src/modules/services/model/service.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

describe('Service Catalog API', () => {
  let adminToken: string;
  let clientToken: string;
  let managerToken: string;
  let workerToken: string;
  let server: any;
  let port: number;

  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  before(async () => {
    await connectDB();
    server = app.listen(0);
    port = (server.address() as any).port;

    const adminId = new mongoose.Types.ObjectId().toString();
    const clientId = new mongoose.Types.ObjectId().toString();
    const managerId = new mongoose.Types.ObjectId().toString();
    const workerId = new mongoose.Types.ObjectId().toString();

    adminToken = generateToken(adminId, 'admin');
    clientToken = generateToken(clientId, 'client');
    managerToken = generateToken(managerId, 'event_manager');
    workerToken = generateToken(workerId, 'worker');
  });

  after(async () => {
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Service.deleteMany({});
  });

  it('1. Unauthenticated create request → 401', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest' }),
    });
    assert.equal(res.status, 401);
  });

  it('2. Client create request → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest' }),
    });
    assert.equal(res.status, 403);
  });

  it('3. Event Manager create request → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest' }),
    });
    assert.equal(res.status, 403);
  });

  it('4. Worker create request → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest' }),
    });
    assert.equal(res.status, 403);
  });

  it('5. Admin can create a service', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Photography', description: 'Professional photos', pricingType: 'per_event' }),
    });
    assert.equal(res.status, 201);
    const data = await res.json() as any;
    assert.equal(data.data.service.name, 'Photography');
    assert.equal(data.data.service.isActive, true);
  });

  it('6. Required field validation (missing name)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ description: 'Test desc', pricingType: 'per_guest' }),
    });
    assert.equal(res.status, 400);
  });

  it('7. Invalid pricingType rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Invalid Service', description: 'Test desc', pricingType: 'per_hour' }),
    });
    assert.equal(res.status, 400);
  });

  it('9. Duplicate service handling', async () => {
    await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering', description: 'Food', pricingType: 'per_guest' }),
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering', description: 'Different food', pricingType: 'per_event' }),
    });
    assert.equal(res.status, 400);
  });

  it('10. Admin can retrieve service list, and Clients see active services', async () => {
    // Create active service
    await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Active Service', description: 'Test', pricingType: 'package' }),
    });

    // Create inactive service
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Inactive Service', description: 'Test', pricingType: 'package' }),
    });
    const inactiveService = await res.json() as any;
    
    // Deactivate it
    await fetch(`http://127.0.0.1:${port}/api/services/${inactiveService.data.service._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });

    // Admin should see both
    const adminRes = await fetch(`http://127.0.0.1:${port}/api/services`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const adminData = await adminRes.json() as any;
    assert.equal(adminData.data.services.length, 2);

    // Client should see only active
    const clientRes = await fetch(`http://127.0.0.1:${port}/api/services`, {
      headers: { 'Authorization': `Bearer ${clientToken}` },
    });
    const clientData = await clientRes.json() as any;
    assert.equal(clientData.data.services.length, 1);
    assert.equal(clientData.data.services[0].name, 'Active Service');
  });

  it('11. Admin can update service', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Videography', description: 'Video', pricingType: 'per_event' }),
    });
    const data1 = await res1.json() as any;
    const id = data1.data.service._id;

    const res2 = await fetch(`http://127.0.0.1:${port}/api/services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ description: 'New Video' }),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json() as any;
    assert.equal(data2.data.service.description, 'New Video');
  });

  it('12. Admin can deactivate service', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Juice', description: 'Fresh juice', pricingType: 'per_guest' }),
    });
    const data1 = await res1.json() as any;
    const id = data1.data.service._id;

    const res2 = await fetch(`http://127.0.0.1:${port}/api/services/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json() as any;
    assert.equal(data2.data.service.isActive, false);
  });

  it('13. Admin can reactivate service', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Hosting', description: 'Hosts', pricingType: 'per_event' }),
    });
    const data1 = await res1.json() as any;
    const id = data1.data.service._id;

    await fetch(`http://127.0.0.1:${port}/api/services/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });

    const res3 = await fetch(`http://127.0.0.1:${port}/api/services/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: true }),
    });
    assert.equal(res3.status, 200);
    const data3 = await res3.json() as any;
    assert.equal(data3.data.service.isActive, true);
  });

  it('14. Protected fields cannot be mass-assigned', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Mass Assign', description: 'Test', pricingType: 'package' }),
    });
    const data1 = await res1.json() as any;
    const id = data1.data.service._id;

    // Try to update isActive via the normal update endpoint (should be ignored or handled properly)
    const res2 = await fetch(`http://127.0.0.1:${port}/api/services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }), // malicious payload
    });
    assert.equal(res2.status, 200);

    // Verify it is still active because updateService shouldn't modify isActive
    const res3 = await fetch(`http://127.0.0.1:${port}/api/services/${id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data3 = await res3.json() as any;
    assert.equal(data3.data.service.isActive, true);
  });
});
