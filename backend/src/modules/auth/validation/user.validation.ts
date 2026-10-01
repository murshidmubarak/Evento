import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../../../utils/ApiError.js';

export const validateRegistration = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, email, password, phone } = req.body;
  const errors: string[] = [];

  // Validate Name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  }

  // Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  // Validate Password
  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password is required and must be at least 6 characters long');
  }

  // Validate Phone (optional, but if provided must be string)
  if (phone !== undefined && phone !== null && typeof phone !== 'string') {
    errors.push('Phone must be a valid string');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateLogin = (req: Request, _res: Response, next: NextFunction): void => {
  const { email, password } = req.body;
  const errors: string[] = [];

  // Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  // Validate Password
  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    errors.push('Password is required');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateForgotPassword = (req: Request, _res: Response, next: NextFunction): void => {
  const { email } = req.body;
  const errors: string[] = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateResetPassword = (req: Request, _res: Response, next: NextFunction): void => {
  const { token, newPassword, confirmPassword } = req.body;
  const errors: string[] = [];

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    errors.push('Token is required');
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    errors.push('New password is required and must be at least 6 characters long');
  }

  if (newPassword !== confirmPassword) {
    errors.push('Passwords do not match');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateWorkerCreation = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, email, password, phone, workerType } = req.body;
  const errors: string[] = [];

  // Validate Name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  }

  // Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  // Validate Password
  if (!password || typeof password !== 'string' || password.length < 6) {
    errors.push('Password is required and must be at least 6 characters long');
  }

  // Validate Phone
  if (phone !== undefined && phone !== null && typeof phone !== 'string') {
    errors.push('Phone must be a valid string');
  }

  // Validate WorkerType
  const allowedWorkerTypes = [
    'Catering Boy',
    'Catering Supervisor',
    'Chef',
    'Cameraman / Photographer',
    'Videographer',
    'Decoration Worker',
    'Juice Worker',
    'Host'
  ];
  if (!workerType || typeof workerType !== 'string' || !allowedWorkerTypes.includes(workerType.trim())) {
    errors.push('A valid workerType is required');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateUserStatusUpdate = (req: Request, _res: Response, next: NextFunction): void => {
  const { isActive } = req.body;
  const errors: string[] = [];

  if (isActive === undefined || isActive === null || typeof isActive !== 'boolean') {
    errors.push('isActive is required and must be a boolean');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateProfileUpdate = (req: Request, _res: Response, next: NextFunction): void => {
  const { name, phone, profileImage } = req.body;
  const errors: string[] = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      errors.push('Name must be a non-empty string');
    }
  }

  if (phone !== undefined && phone !== null) {
    if (typeof phone !== 'string') {
      errors.push('Phone must be a valid string');
    }
  }

  if (profileImage !== undefined && profileImage !== null) {
    if (typeof profileImage !== 'string') {
      errors.push('Profile image must be a valid string');
    }
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateVerifyEmailOtp = (req: Request, _res: Response, next: NextFunction): void => {
  const { email, otp } = req.body;
  const errors: string[] = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  if (!otp || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    errors.push('OTP is required and must be exactly 6 digits');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};

export const validateResendVerificationOtp = (req: Request, _res: Response, next: NextFunction): void => {
  const { email } = req.body;
  const errors: string[] = [];

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
    errors.push('A valid email address is required');
  }

  if (errors.length > 0) {
    return next(ApiError.badRequest('Validation failed', errors));
  }

  next();
};
