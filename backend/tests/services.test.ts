import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { User } from '../src/modules/auth/model/user.model.js';
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
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest', basePrice: 100 }),
    });
    assert.equal(res.status, 401);
  });

  it('2. Client create request → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest', basePrice: 100 }),
    });
    assert.equal(res.status, 403);
  });

  it('3. Event Manager create request → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest', basePrice: 100 }),
    });
    assert.equal(res.status, 403);
  });

  it('4. Worker create request → 403', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${workerToken}` },
      body: JSON.stringify({ name: 'Test', description: 'Test desc', pricingType: 'per_guest', basePrice: 100 }),
    });
    assert.equal(res.status, 403);
  });

  it('5. Admin can create a service', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Photography', description: 'Professional photos', pricingType: 'per_event', basePrice: 5000 }),
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
      body: JSON.stringify({ description: 'Test desc', pricingType: 'per_guest', basePrice: 100 }),
    });
    assert.equal(res.status, 400);
  });

  it('7. Invalid pricingType rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Invalid Service', description: 'Test desc', pricingType: 'per_hour', basePrice: 100 }),
    });
    assert.equal(res.status, 400);
  });

  it('8. Negative basePrice rejected', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Negative Price Service', description: 'Test desc', pricingType: 'per_event', basePrice: -100 }),
    });
    assert.equal(res.status, 400);
  });

  it('9. Duplicate service handling', async () => {
    await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering', description: 'Food', pricingType: 'per_guest', basePrice: 200 }),
    });

    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Catering', description: 'Different food', pricingType: 'per_event', basePrice: 5000 }),
    });
    assert.equal(res.status, 400);
  });

  it('10. Admin can retrieve service list, and Clients see active services', async () => {
    // Create active service
    await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Active Service', description: 'Test', pricingType: 'package', basePrice: 1000 }),
    });

    // Create inactive service
    const res = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Inactive Service', description: 'Test', pricingType: 'package', basePrice: 1000 }),
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
      body: JSON.stringify({ name: 'Videography', description: 'Video', pricingType: 'per_event', basePrice: 8000 }),
    });
    const data1 = await res1.json() as any;
    const id = data1.data.service._id;

    const res2 = await fetch(`http://127.0.0.1:${port}/api/services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ basePrice: 9000 }),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json() as any;
    assert.equal(data2.data.service.basePrice, 9000);
  });

  it('12. Admin can deactivate service', async () => {
    const res1 = await fetch(`http://127.0.0.1:${port}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Juice', description: 'Fresh juice', pricingType: 'per_guest', basePrice: 20 }),
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
      body: JSON.stringify({ name: 'Hosting', description: 'Hosts', pricingType: 'per_event', basePrice: 3000 }),
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
      body: JSON.stringify({ name: 'Mass Assign', description: 'Test', pricingType: 'package', basePrice: 100 }),
    });
    const data1 = await res1.json() as any;
    const id = data1.data.service._id;

    // Try to update isActive via the normal update endpoint (should be ignored or handled properly)
    const res2 = await fetch(`http://127.0.0.1:${port}/api/services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ basePrice: 200, isActive: false }), // malicious payload
    });
    assert.equal(res2.status, 200);

    // Verify it is still active because updateService shouldn't modify isActive
    const res3 = await fetch(`http://127.0.0.1:${port}/api/services/${id}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const data3 = await res3.json() as any;
    assert.equal(data3.data.service.isActive, true);
    assert.equal(data3.data.service.basePrice, 200);
  });

  describe('Pricing Calculation Engine', () => {
    let perGuestServiceId: string;
    let perEventServiceId: string;
    let packageServiceId: string;

    beforeEach(async () => {
      const s1 = await fetch(`http://127.0.0.1:${port}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Catering', description: 'Food', pricingType: 'per_guest', basePrice: 500 }),
      });
      perGuestServiceId = (await s1.json() as any).data.service._id;

      const s2 = await fetch(`http://127.0.0.1:${port}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Venue', description: 'Hall', pricingType: 'per_event', basePrice: 50000 }),
      });
      perEventServiceId = (await s2.json() as any).data.service._id;

      const s3 = await fetch(`http://127.0.0.1:${port}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Premium Bundle', description: 'Bundle', pricingType: 'package', basePrice: 150000 }),
      });
      packageServiceId = (await s3.json() as any).data.service._id;
    });

    it('15. Unauthenticated calculation request → 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestCount: 200 }),
      });
      assert.equal(res.status, 401);
    });

    it('16. Active per_guest service calculates correctly (500 * 200 = 100000)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 200 }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.data.amount, 100000);
      assert.equal(data.data.quantity, 200);
      assert.equal(data.data.basePrice, 500);
    });

    it('17. Active per_event service calculates base price (ignores guestCount)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perEventServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 200 }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.data.amount, 50000);
    });

    it('18. Active package service calculates base price', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${packageServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.data.amount, 150000);
    });

    it('19. Missing guestCount for per_guest → validation error', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({}), // Missing guestCount
      });
      assert.equal(res.status, 400);
    });

    it('20. Zero/negative guestCount handled according to validation rules', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: -5 }),
      });
      assert.equal(res.status, 400);

      const res2 = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 0 }),
      });
      assert.equal(res2.status, 400);
    });

    it('21. Invalid guestCount rejected (decimals, strings)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 200.5 }),
      });
      assert.equal(res.status, 400);

      const res2 = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: "200" }),
      });
      assert.equal(res2.status, 400);
    });

    it('22. Non-existent service handled correctly', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${fakeId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 200 }),
      });
      assert.equal(res.status, 404);
    });

    it('23. Inactive service cannot be normally calculated', async () => {
      // Deactivate it first
      await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ isActive: false }),
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 200 }),
      });
      assert.equal(res.status, 400);
    });

    it('24. Backend uses database basePrice rather than caller-supplied price & cannot override amount', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 200, basePrice: 10, amount: 50, pricingType: 'package' }),
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      
      // Values should remain driven by DB (500 * 200 = 100000)
      assert.equal(data.data.basePrice, 500);
      assert.equal(data.data.pricingType, 'per_guest');
      assert.equal(data.data.amount, 100000);
    });

    it('25. Calculation endpoint does not modify Service data', async () => {
      await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 200, basePrice: 10 }),
      });

      const res = await fetch(`http://127.0.0.1:${port}/api/services/${perGuestServiceId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      const data = await res.json() as any;
      assert.equal(data.data.service.basePrice, 500); // Unchanged
    });

    it('26. Decimal/money calculation follows fixed 2-decimal strategy', async () => {
      // Create a service with decimal basePrice
      const s = await fetch(`http://127.0.0.1:${port}/api/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Decimal Service', description: 'Test', pricingType: 'per_guest', basePrice: 50.55 }),
      });
      const decimalServiceId = (await s.json() as any).data.service._id;

      const res = await fetch(`http://127.0.0.1:${port}/api/services/${decimalServiceId}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clientToken}` },
        body: JSON.stringify({ guestCount: 3 }),
      });
      
      const data = await res.json() as any;
      // 50.55 * 3 = 151.65
      // 50.55 * 3 in JS is 151.64999999999998
      // But we round to 2 decimals using Math.round(val * 100) / 100 -> 151.65
      assert.equal(data.data.amount, 151.65);
    });
  });
});
