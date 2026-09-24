import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Logout Endpoint', () => {
  it('1. POST /api/auth/logout without token → 401 Unauthorized', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
        method: 'POST',
      });
      assert.equal(res.status, 401);
      const data = await res.json() as any;
      assert.equal(data.success, false);
      assert.equal(data.message, 'Authorization header is missing');
    } finally {
      server.close();
    }
  });

  it('2. POST /api/auth/logout with valid token → 200 OK', async () => {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const token = jwt.sign({ userId: 'user123', role: 'client' }, env.jwtSecret, {
      expiresIn: '1h',
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.success, true);
      assert.equal(data.message, 'Logout successful');
    } finally {
      server.close();
    }
  });
});
