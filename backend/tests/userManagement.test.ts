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

describe('User Management Endpoints', () => {
  before(async () => {
    await connectDB();
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
});
