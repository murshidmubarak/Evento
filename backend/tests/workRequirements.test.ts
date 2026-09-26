import './setup.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { Event } from '../src/modules/events/model/event.model.js';
import { User } from '../src/modules/auth/model/user.model.js';
import { WorkRequirement } from '../src/modules/work-requirements/model/work-requirement.model.js';
import { connectDB } from '../src/config/db.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

describe('Work Requirement API', () => {
  let adminToken: string;
  let clientToken: string;
  let workerToken: string;
  let managerAToken: string;
  let managerBToken: string;
  
  let managerAId: string;
  let managerBId: string;

  let eventAId: string;
  let eventBId: string;
  let eventUnassignedId: string;

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
    const workerId = new mongoose.Types.ObjectId().toString();

    adminToken = generateToken(adminId, 'admin');
    clientToken = generateToken(clientId, 'client');
    workerToken = generateToken(workerId, 'worker');

    await User.deleteMany({});
    
    // Create Managers
    const mA = await User.create({
      name: 'Manager A',
      email: 'ma_wr@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerAId = mA._id.toString();
    managerAToken = generateToken(managerAId, 'event_manager');

    const mB = await User.create({
      name: 'Manager B',
      email: 'mb_wr@example.com',
      password: 'password',
      role: 'event_manager',
      isActive: true,
    });
    managerBId = mB._id.toString();
    managerBToken = generateToken(managerBId, 'event_manager');

    // Create Client
    await User.create({
      _id: clientId,
      name: 'Test Client',
      email: 'client_wr@example.com',
      password: 'password',
      role: 'client',
      isActive: true,
    });
  });

  after(async () => {
    server.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Event.deleteMany({});
    await WorkRequirement.deleteMany({});
    
    const baseEvent = {
      clientId: await User.findOne({ email: 'client_wr@example.com' }).then(u => u?._id),
      title: 'Test Event',
      eventType: 'Wedding',
      date: new Date('2026-10-15T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '14:00',
      location: { address: '123 Main St' },
      guestCount: 100,
    };

    const eA = await Event.create({
      ...baseEvent,
      eventManagerId: managerAId,
      status: 'confirmed',
    });
    eventAId = eA._id.toString();

    const eB = await Event.create({
      ...baseEvent,
      eventManagerId: managerBId,
      status: 'confirmed',
    });
    eventBId = eB._id.toString();

    const eUnassigned = await Event.create({
      ...baseEvent,
      status: 'requested',
    });
    eventUnassignedId = eUnassigned._id.toString();
  });

  describe('Create Work Requirement', () => {
    it('1. Unauthenticated -> 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: 20 })
      });
      assert.equal(res.status, 401);
    });

    it('2. Client/Worker/Admin -> 403', async () => {
      const tokens = [clientToken, workerToken, adminToken];
      for (const t of tokens) {
        const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: 20 })
        });
        assert.equal(res.status, 403);
      }
    });

    it('3. Manager A can create requirement for Event A', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: 20, reportingTime: '09:00' })
      });
      assert.equal(res.status, 201);
      const data = (await res.json()) as any;
      assert.equal(data.data.requirement.workerType, 'Catering Boy');
      assert.equal(data.data.requirement.requiredCount, 20);
      assert.equal(data.data.requirement.pending, 20);
      assert.equal(data.data.requirement.filled, 0);
      assert.equal(data.data.requirement.status, 'draft');
    });

    it('4. Manager A cannot create requirement for Event B', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventBId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: 20 })
      });
      assert.equal(res.status, 403);
    });

    it('5. Cannot create requirement if event is unassigned or not confirmed/in_progress', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventUnassignedId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: 20 })
      });
      assert.equal(res.status, 403); // because not assigned to Manager A
    });
  });

  describe('Validation', () => {
    it('1. requiredCount <= 0 -> invalid', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: 0 })
      });
      assert.equal(res.status, 400);

      const res2 = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: -1 })
      });
      assert.equal(res2.status, 400);
    });

    it('2. requiredCount as float -> invalid', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Catering Boy', requiredCount: 1.5 })
      });
      assert.equal(res.status, 400);
    });

    it('3. invalid workerType -> invalid', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerType: 'Super Hacker', requiredCount: 10 })
      });
      assert.equal(res.status, 400);
    });

    it('4. missing fields -> invalid', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredCount: 10 })
      });
      assert.equal(res.status, 400);
    });
  });

  describe('List Requirements', () => {
    beforeEach(async () => {
      await WorkRequirement.create({
        eventId: eventAId,
        workerType: 'Catering Boy',
        requiredCount: 5,
        status: 'draft'
      });
      await WorkRequirement.create({
        eventId: eventAId,
        workerType: 'Chef',
        requiredCount: 2,
        status: 'draft'
      });
      await WorkRequirement.create({
        eventId: eventBId,
        workerType: 'Host',
        requiredCount: 4,
        status: 'draft'
      });
    });

    it('1. Manager A can list requirements for Event A', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventAId}/work-requirements`, {
        headers: { 'Authorization': `Bearer ${managerAToken}` },
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.data.requirements.length, 2);
    });

    it('2. Manager A cannot list requirements for Event B', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/events/${eventBId}/work-requirements`, {
        headers: { 'Authorization': `Bearer ${managerAToken}` },
      });
      assert.equal(res.status, 403);
    });
  });

  describe('Update / Get Single Requirement', () => {
    let reqId: string;

    beforeEach(async () => {
      const req = await WorkRequirement.create({
        eventId: eventAId,
        workerType: 'Catering Boy',
        requiredCount: 5,
        status: 'draft'
      });
      reqId = req._id.toString();
    });

    it('1. Manager A can get single requirement', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${reqId}`, {
        headers: { 'Authorization': `Bearer ${managerAToken}` },
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.data.requirement.requiredCount, 5);
    });

    it('2. Manager B cannot get Manager As requirement', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${reqId}`, {
        headers: { 'Authorization': `Bearer ${managerBToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('3. Manager A can update requirement count', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${reqId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredCount: 10 })
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as any;
      assert.equal(data.data.requirement.requiredCount, 10);
    });

    it('4. Cannot update eventId', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${reqId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${managerAToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: eventBId })
      });
      assert.equal(res.status, 200); // the eventId in body is ignored by our controller logic
      
      const res2 = await fetch(`http://127.0.0.1:${port}/api/manager/work-requirements/${reqId}`, {
        headers: { 'Authorization': `Bearer ${managerAToken}` },
      });
      const data = (await res2.json()) as any;
      assert.equal(data.data.requirement.eventId.toString(), eventAId);
    });
  });
});
