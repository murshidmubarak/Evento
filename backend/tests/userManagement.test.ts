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

import { Sequence } from '../src/modules/users/model/sequence.model.js';

describe('User Management Endpoints', () => {
  before(async () => {
    await connectDB();
    await User.deleteMany({});
    await Sequence.deleteMany({});
  });

  after(async () => {
    await mongoose.disconnect();
  });

  describe('Create Event Manager', () => {



  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
  };

  it('1. Unauthenticated request → 401 Unauthorized', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'password123' }),
      });
      assert.equal(res.status, 401);
    } finally {
      server.close();
    }
  });

  it('2. Client role request → 403 Forbidden', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const adminToken = generateToken(new mongoose.Types.ObjectId().toString(), 'client');
      const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'password123' }),
      });
      assert.equal(res.status, 403);
    } finally {
      server.close();
    }
  });

  it('3. Event Manager role request → 403 Forbidden', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const adminToken = generateToken(new mongoose.Types.ObjectId().toString(), 'event_manager');
      const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'password123' }),
      });
      assert.equal(res.status, 403);
    } finally {
      server.close();
    }
  });

  it('4. Admin creates Event Manager successfully (role forced, password hashed)', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const adminId = new mongoose.Types.ObjectId().toString();
      
      // Admin must actually exist for the `authenticate` middleware to attach `req.user` if it verifies DB existence.
      // Wait, `authenticate` middleware just checks JWT, and possibly looks up user.
      const adminUser = new User({
        _id: adminId,
        name: 'Admin User',
        email: 'admin_creator@example.com',
        password: await bcrypt.hash('password123', 10),
        role: 'admin'
      });
      await adminUser.save();

      const adminToken = generateToken(adminId, 'admin');
      
      const payload = {
        name: 'New Event Manager',
        email: 'new_em@example.com',
        password: 'SecurePassword123',
        role: 'admin' // Attempting to escalate role
      };

      const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 201);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.data.user.role, 'event_manager', 'Role must be forced to event_manager');
      assert.equal(data.data.user.email, 'new_em@example.com');
      assert.equal(data.data.user.password, undefined, 'Password should not be returned');

      // Verify DB
      const createdUser = await User.findOne({ email: 'new_em@example.com' }).select('+password');
      assert.ok(createdUser);
      assert.equal(createdUser.role, 'event_manager');
      assert.notEqual(createdUser.password, 'SecurePassword123');
      
      const isMatch = await bcrypt.compare('SecurePassword123', createdUser.password || '');
      assert.ok(isMatch, 'Password should be correctly hashed');

      // Verify login works
      const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new_em@example.com', password: 'SecurePassword123' }),
      });
      assert.equal(loginRes.status, 200);

      // Cleanup
      await User.findByIdAndDelete(adminUser._id);
      await User.findByIdAndDelete(createdUser._id);
    } finally {
      server.close();
    }
  });

  it('5. Duplicate email rejected', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const adminId = new mongoose.Types.ObjectId().toString();
      const adminUser = new User({
        _id: adminId,
        name: 'Admin User',
        email: 'admin_creator_dup@example.com',
        password: await bcrypt.hash('password123', 10),
        role: 'admin'
      });
      await adminUser.save();

      const existingUser = new User({
        name: 'Existing User',
        email: 'existing_em@example.com',
        password: await bcrypt.hash('password123', 10),
        role: 'client'
      });
      await existingUser.save();

      const adminToken = generateToken(adminId, 'admin');
      
      const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: 'Another Em',
          email: 'existing_em@example.com',
          password: 'SecurePassword123',
        }),
      });

      assert.equal(res.status, 409);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Email is already registered'));

      await User.findByIdAndDelete(adminUser._id);
      await User.findByIdAndDelete(existingUser._id);
    } finally {
      server.close();
    }
  });

  it('6. Invalid input rejected', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const adminId = new mongoose.Types.ObjectId().toString();
      const adminUser = new User({
        _id: adminId,
        name: 'Admin User',
        email: 'admin_creator_inv@example.com',
        password: await bcrypt.hash('password123', 10),
        role: 'admin'
      });
      await adminUser.save();

      const adminToken = generateToken(adminId, 'admin');
      
      const res = await fetch(`http://127.0.0.1:${port}/api/users/event-managers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          name: '', // Invalid name
          email: 'not-an-email',
          password: '123', // Too short
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Validation failed'));

      await User.findByIdAndDelete(adminUser._id);
    } finally {
      server.close();
    }
  });
  });

  describe('Create Worker', () => {
    const generateToken = (userId: string, role: string) => {
      return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
    };

    it('1. Unauthorized request (no token) -> 401', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test Worker', email: 'w1@example.com', password: 'password123', workerType: 'Host' }),
        });
        assert.equal(res.status, 401);
      } finally {
        server.close();
      }
    });

    it('2. Client role request -> 403', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const token = generateToken(new mongoose.Types.ObjectId().toString(), 'client');
        const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: 'Test Worker', email: 'w2@example.com', password: 'password123', workerType: 'Host' }),
        });
        assert.equal(res.status, 403);
      } finally {
        server.close();
      }
    });

    it('3. Worker role request -> 403', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const token = generateToken(new mongoose.Types.ObjectId().toString(), 'worker');
        const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: 'Test Worker', email: 'w3@example.com', password: 'password123', workerType: 'Host' }),
        });
        assert.equal(res.status, 403);
      } finally {
        server.close();
      }
    });

    it('4. Event Manager can create a Worker', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const emId = new mongoose.Types.ObjectId().toString();
        const emUser = new User({ _id: emId, name: 'EM User', email: 'em_creator@example.com', password: await bcrypt.hash('password123', 10), role: 'event_manager' });
        await emUser.save();

        const token = generateToken(emId, 'event_manager');
        const payload = { name: 'Worker 1', email: 'new_w1@example.com', password: 'SecurePassword123', workerType: 'Chef', role: 'admin' };
        
        const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
        });

        assert.equal(res.status, 201);
        const data = await res.json() as any;
        assert.equal(data.success, true);
        assert.equal(data.data.user.role, 'worker', 'Role must be forced to worker');
        assert.equal(data.data.user.workerType, 'Chef');
        assert.equal(data.data.user.password, undefined);

        const createdUser = await User.findOne({ email: 'new_w1@example.com' }).select('+password');
        assert.ok(createdUser);
        assert.notEqual(createdUser.password, 'SecurePassword123');

        await User.findByIdAndDelete(emUser._id);
        await User.findByIdAndDelete(createdUser._id);
      } finally {
        server.close();
      }
    });

    it('5. Admin can create a Worker', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const adminUser = new User({ _id: adminId, name: 'Admin', email: 'admin_creator_w@example.com', password: await bcrypt.hash('password123', 10), role: 'admin' });
        await adminUser.save();

        const token = generateToken(adminId, 'admin');
        const payload = { name: 'Worker 2', email: 'new_w2@example.com', password: 'SecurePassword123', workerType: 'Catering Boy' };
        
        const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(payload),
        });

        assert.equal(res.status, 201);
        const data = await res.json() as any;
        assert.equal(data.success, true);

        // Verification of created user
        const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'new_w2@example.com', password: 'SecurePassword123' }),
        });
        assert.equal(loginRes.status, 200, 'Newly created Worker can authenticate');

        const createdUser = await User.findOne({ email: 'new_w2@example.com' });
        await User.findByIdAndDelete(adminUser._id);
        if (createdUser) await User.findByIdAndDelete(createdUser._id);
      } finally {
        server.close();
      }
    });

    it('6. Duplicate email rejected', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const token = generateToken(adminId, 'admin');
        
        const existingUser = new User({ name: 'Existing', email: 'dup_w@example.com', password: 'hash', role: 'worker', workerType: 'Host' });
        await existingUser.save();

        const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: 'Test', email: 'dup_w@example.com', password: 'password123', workerType: 'Host' }),
        });

        assert.equal(res.status, 409);
        await User.findByIdAndDelete(existingUser._id);
      } finally {
        server.close();
      }
    });

    it('7. Invalid workerType rejected', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const token = generateToken(adminId, 'admin');

        const res = await fetch(`http://127.0.0.1:${port}/api/users/workers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: 'Test', email: 'inv_wt@example.com', password: 'password123', workerType: 'Astronaut' }),
        });

        assert.equal(res.status, 400);
        const data = await res.json() as any;
        assert.ok(data.message.includes('Validation failed'));
      } finally {
        server.close();
      }
    });
  });

  describe('User Status Management', () => {
    const generateToken = (userId: string, role: string) => {
      return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
    };

    it('1. Unauthenticated request -> 401', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/users/some-id/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: false }),
        });
        assert.equal(res.status, 401);
      } finally {
        server.close();
      }
    });

    it('2. Client role request -> 403', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const token = generateToken(new mongoose.Types.ObjectId().toString(), 'client');
        const res = await fetch(`http://127.0.0.1:${port}/api/users/some-id/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ isActive: false }),
        });
        assert.equal(res.status, 403);
      } finally {
        server.close();
      }
    });

    it('3. Event Manager role request -> 403', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const token = generateToken(new mongoose.Types.ObjectId().toString(), 'event_manager');
        const res = await fetch(`http://127.0.0.1:${port}/api/users/some-id/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ isActive: false }),
        });
        assert.equal(res.status, 403);
      } finally {
        server.close();
      }
    });

    it('4. Worker role request -> 403', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const token = generateToken(new mongoose.Types.ObjectId().toString(), 'worker');
        const res = await fetch(`http://127.0.0.1:${port}/api/users/some-id/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ isActive: false }),
        });
        assert.equal(res.status, 403);
      } finally {
        server.close();
      }
    });

    it('5. Admin can deactivate an active user & 9. Request cannot change role & 10. Mass assignment ignored', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const token = generateToken(adminId, 'admin');

        const targetUser = new User({ name: 'Target', email: 'target_deact@example.com', password: 'hash', role: 'worker', isActive: true, workerType: 'Host' });
        await targetUser.save();

        const res = await fetch(`http://127.0.0.1:${port}/api/users/${targetUser._id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ isActive: false, role: 'admin', email: 'hacked@example.com' }), // malicious payload
        });

        assert.equal(res.status, 200);
        const data = await res.json() as any;
        assert.equal(data.success, true);
        assert.equal(data.data.user.isActive, false);
        assert.equal(data.data.user.role, 'worker', 'Role must not be changed');
        assert.equal(data.data.user.email, 'target_deact@example.com', 'Email must not be changed');

        const dbUser = await User.findById(targetUser._id);
        assert.ok(dbUser);
        assert.equal(dbUser.isActive, false);
        assert.equal(dbUser.role, 'worker');

        await User.findByIdAndDelete(targetUser._id);
      } finally {
        server.close();
      }
    });

    it('6. Admin can activate an inactive user & 11. Deactivated user cannot log in & 12. Reactivated user can log in', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const token = generateToken(adminId, 'admin');

        const passwordHash = await bcrypt.hash('password123', 10);
        const targetUser = new User({ name: 'Target', email: 'target_act@example.com', password: passwordHash, role: 'client', isActive: false, emailVerified: true });
        await targetUser.save();

        // Ensure inactive user cannot login
        const loginRes1 = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'target_act@example.com', password: 'password123' }),
        });
        assert.equal(loginRes1.status, 401);

        // Reactivate user
        const res = await fetch(`http://127.0.0.1:${port}/api/users/${targetUser._id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ isActive: true }),
        });
        assert.equal(res.status, 200);

        // Ensure reactivated user can login
        const loginRes2 = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'target_act@example.com', password: 'password123' }),
        });
        assert.equal(loginRes2.status, 200);

        await User.findByIdAndDelete(targetUser._id);
      } finally {
        server.close();
      }
    });

    it('7. Non-existent user returns 404', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const token = generateToken(adminId, 'admin');
        const fakeId = new mongoose.Types.ObjectId().toString();

        const res = await fetch(`http://127.0.0.1:${port}/api/users/${fakeId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ isActive: false }),
        });

        assert.equal(res.status, 404);
      } finally {
        server.close();
      }
    });

    it('8. Invalid user ID is handled correctly (e.g. 500 or 400)', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const token = generateToken(adminId, 'admin');

        const res = await fetch(`http://127.0.0.1:${port}/api/users/invalid-id/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ isActive: false }),
        });

        // The exact status depends on whether Mongoose casts it or not, usually 500 in standard catchAsync without specific CastError handling, or 400.
        // We just assert it fails (not 200)
        assert.notEqual(res.status, 200);
      } finally {
        server.close();
      }
    });
  });

  describe('List Users (GET /api/users)', () => {
    const generateToken = (userId: string, role: string) => {
      return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: '1h' });
    };

    it('1. Unauthenticated request -> 401 Unauthorized', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/users`);
        assert.equal(res.status, 401);
      } finally {
        server.close();
      }
    });

    it('2. Non-admin (Client, Event Manager, Worker) -> 403 Forbidden', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const clientToken = generateToken(new mongoose.Types.ObjectId().toString(), 'client');
        const emToken = generateToken(new mongoose.Types.ObjectId().toString(), 'event_manager');
        const workerToken = generateToken(new mongoose.Types.ObjectId().toString(), 'worker');

        const resClient = await fetch(`http://127.0.0.1:${port}/api/users`, {
          headers: { Authorization: `Bearer ${clientToken}` },
        });
        assert.equal(resClient.status, 403);

        const resEm = await fetch(`http://127.0.0.1:${port}/api/users`, {
          headers: { Authorization: `Bearer ${emToken}` },
        });
        assert.equal(resEm.status, 403);

        const resWorker = await fetch(`http://127.0.0.1:${port}/api/users`, {
          headers: { Authorization: `Bearer ${workerToken}` },
        });
        assert.equal(resWorker.status, 403);
      } finally {
        server.close();
      }
    });

    it('3. Admin can list users and filter by role=event_manager', async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;
      try {
        const adminId = new mongoose.Types.ObjectId().toString();
        const adminToken = generateToken(adminId, 'admin');

        // Create an event manager and a client
        const em = await User.create({
          name: 'Manager For List',
          email: 'em_list@example.com',
          password: 'hashedpassword',
          role: 'event_manager',
          businessId: '1099',
          isActive: true,
        });

        const cl = await User.create({
          name: 'Client For List',
          email: 'cl_list@example.com',
          password: 'hashedpassword',
          role: 'client',
          isActive: true,
        });

        // Filter role=event_manager
        const res = await fetch(`http://127.0.0.1:${port}/api/users?role=event_manager`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(res.status, 200);
        const data = (await res.json()) as any;
        assert.equal(data.success, true);
        assert.ok(Array.isArray(data.data.users));

        const managerFound = data.data.users.find((u: any) => u.email === 'em_list@example.com');
        assert.ok(managerFound, 'Event manager must be returned');
        assert.equal(managerFound.role, 'event_manager');
        assert.equal(managerFound.password, undefined, 'Password must not be returned');

        const clientFound = data.data.users.find((u: any) => u.email === 'cl_list@example.com');
        assert.equal(clientFound, undefined, 'Client must not be in event_manager filtered response');

        await User.findByIdAndDelete(em._id);
        await User.findByIdAndDelete(cl._id);
      } finally {
        server.close();
      }
    });
  });
});
