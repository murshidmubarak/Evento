/// <reference path="../src/types/express.d.ts" />
import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { authenticate } from '../src/middlewares/auth.middleware.js';
import { ApiError } from '../src/utils/ApiError.js';
import { env } from '../src/config/env.js';

describe('Authentication Middleware — authenticate', () => {
  const createMockReq = (authHeader?: string): Request => {
    return {
      headers: authHeader ? { authorization: authHeader } : {},
    } as unknown as Request;
  };

  const createMockRes = (): Response => {
    return {} as unknown as Response;
  };

  it('1. Missing Authorization header → 401 Unauthorized', () => {
    const req = createMockReq(undefined);
    let capturedError: unknown;

    authenticate(req, createMockRes(), (err?: unknown) => {
      capturedError = err;
    });

    assert.ok(capturedError instanceof ApiError);
    assert.equal((capturedError as ApiError).statusCode, 401);
    assert.equal((capturedError as ApiError).message, 'Authorization header is missing');
  });

  it('2. Invalid authorization format (no Bearer) → 401 Unauthorized', () => {
    const req = createMockReq('Basic some_token');
    let capturedError: unknown;

    authenticate(req, createMockRes(), (err?: unknown) => {
      capturedError = err;
    });

    assert.ok(capturedError instanceof ApiError);
    assert.equal((capturedError as ApiError).statusCode, 401);
    assert.equal((capturedError as ApiError).message, 'Invalid authorization format. Expected: Bearer <token>');
  });

  it('3. Invalid token → 401 Unauthorized', () => {
    const req = createMockReq('Bearer invalid_token_here');
    let capturedError: unknown;

    authenticate(req, createMockRes(), (err?: unknown) => {
      capturedError = err;
    });

    assert.ok(capturedError instanceof ApiError);
    assert.equal((capturedError as ApiError).statusCode, 401);
    assert.equal((capturedError as ApiError).message, 'Invalid token');
  });

  it('4. Expired token → 401 Unauthorized ("Token has expired")', () => {
    const expiredToken = jwt.sign(
      { userId: 'u123', role: 'client' },
      env.jwtSecret,
      { expiresIn: -10 },
    );
    const req = createMockReq(`Bearer ${expiredToken}`);
    let capturedError: unknown;

    authenticate(req, createMockRes(), (err?: unknown) => {
      capturedError = err;
    });

    assert.ok(capturedError instanceof ApiError);
    assert.equal((capturedError as ApiError).statusCode, 401);
    assert.equal((capturedError as ApiError).message, 'Token has expired');
  });

  it('5. Valid token → attaches req.user and proceeds', () => {
    const validToken = jwt.sign(
      { userId: 'u123', role: 'admin' },
      env.jwtSecret,
      { expiresIn: '1h' },
    );
    const req = createMockReq(`Bearer ${validToken}`);
    let capturedError: unknown;
    let nextCalled = false;

    authenticate(req, createMockRes(), (err?: unknown) => {
      nextCalled = true;
      capturedError = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(capturedError, undefined);
    assert.deepEqual(req.user, { id: 'u123', role: 'admin' });
  });
});
