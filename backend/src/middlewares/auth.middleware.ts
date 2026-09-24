import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import type { UserRole } from '../modules/auth/model/user.model.js';

interface JwtPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * authenticate — Reusable JWT authentication middleware.
 *
 * Responsibilities:
 * 1. Read the Authorization header.
 * 2. Validate "Bearer <token>" format.
 * 3. Verify the token signature and expiration via JWT secret.
 * 4. Extract authenticated identity ({ id, role }).
 * 5. Attach minimal identity to req.user.
 * 6. Call next().
 *
 * Note: Does NOT query MongoDB. Database lookups belong in the service layer.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(ApiError.unauthorized('Authorization header is missing'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
    return next(ApiError.unauthorized('Invalid authorization format. Expected: Bearer <token>'));
  }

  const token = parts[1].trim();

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as unknown as JwtPayload;

    if (!decoded || !decoded.userId || !decoded.role) {
      return next(ApiError.unauthorized('Invalid token payload'));
    }

    req.user = {
      id: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(ApiError.unauthorized('Token has expired'));
    }
    return next(ApiError.unauthorized('Invalid token'));
  }
};
