import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

describe('Health Check Endpoint', () => {
  it('GET /api/health → 200 OK with success: true and message: "API is running"', async () => {
    // We can simulate request dispatch to app or test via an HTTP request / supertest-like pattern with Node http
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepEqual(data, {
        success: true,
        message: 'API is running',
      });
    } finally {
      server.close();
    }
  });
});
