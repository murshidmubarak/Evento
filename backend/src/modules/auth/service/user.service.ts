import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { UserRepository } from '../repository/user.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { env } from '../../../config/env.js';
import type { IUser } from '../model/user.model.js';
import { BusinessIdService } from '../../users/service/business-id.service.js';
import { emailService } from '../../email/service/email.service.js';

export interface RegisterUserDto {
  name: string;
  email: string;
  password: string;
  phone?: string;
  profileImage?: string;
  role?: string;
}

export interface CreateEventManagerDto {
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  password?: string;
}

export interface CreateWorkerDto {
  name: string;
  email: string;
  workerType: string;
  phone?: string;
  profileImage?: string;
  password?: string;
}

export interface AcceptInvitationDto {
  token: string;
  password: string;
}

export interface LoginUserDto {
  email: string;
  password: string;
}

export interface UpdateProfileDto {
  name?: string;
  phone?: string;
  profileImage?: string;
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
  } | string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  role: string;
  workerType?: string;
  businessId?: string;
  isActive: boolean;
  emailVerified?: boolean;
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
  };
  createdBy?: string;
  invitationAcceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResult {
  user: SafeUser;
  token: string;
}

export class UserService {
  constructor(
    private readonly userRepository: UserRepository = new UserRepository(),
    private readonly businessIdService: BusinessIdService = new BusinessIdService()
  ) { }

  /**
   * Registers a new client user.
   *
   * Business Rules:
   * 1. Normalizes email (lowercase, trim).
   * 2. Checks if email is already registered; throws 409 Conflict if so.
   * 3. Hashes password using bcrypt.
   * 4. Forces user role to 'client' (overrides any role sent in DTO).
   * 5. Saves user via UserRepository.
   * 6. Returns sanitized user data omitting password.
   */
  async registerUser(dto: RegisterUserDto): Promise<void> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Check duplicate email
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict('Email is already registered');
    }

    // 2. Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    // 3. Generate OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + env.emailVerificationOtpTtlMinutes * 60 * 1000);

    // 4. Prepare payload with forced role 'client'
    const pendingUserData = {
      name: dto.name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: dto.phone?.trim(),
      profileImage: dto.profileImage?.trim(),
      role: 'client',
      emailVerificationOtpHash: otpHash,
      emailVerificationOtpExpiresAt: expiresAt,
      emailVerificationOtpAttempts: 0,
      emailVerificationOtpLastSentAt: new Date(),
    };

    // 5. Save via repository
    await this.userRepository.upsertPendingUser(normalizedEmail, pendingUserData);

    // 6. Send Email (do not fail registration if email fails)
    try {
      await emailService.sendVerificationOtp({
        to: normalizedEmail,
        name: dto.name.trim(),
        otp,
      });
    } catch (error) {
      console.error('[UserService] Failed to send verification OTP on register:', error);
      // Registration succeeds, user will have to request resend
    }
  }

  /**
   * Creates an initial administrator.
   *
   * Business Rules:
   * 1. Normalizes email.
   * 2. Checks if email exists.
   * 3. Hashes password.
   * 4. Creates user with role='admin', isActive=true, emailVerified=true.
   */
  async createAdmin(dto: RegisterUserDto): Promise<SafeUser> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict('Email is already registered');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    const userData: Partial<IUser> = {
      name: dto.name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: dto.phone?.trim(),
      profileImage: dto.profileImage?.trim(),
      role: 'admin',
      isActive: true,
      emailVerified: true
    };

    const createdUser = await this.userRepository.create(userData);
    return this.toSafeUser(createdUser);
  }

  /**
   * Authenticates a user with email and password, returning safe user data and a JWT token.
   *
   * Business Rules:
   * 1. Normalizes email.
   * 2. Retrieves user with password from repository.
   * 3. Rejects nonexistent email with 401 Unauthorized.
   * 4. Compares password against stored bcrypt hash; rejects mismatch with 401 Unauthorized.
   * 5. Checks user isActive status; rejects inactive account with 401 Unauthorized.
   * 6. Generates JWT containing minimal identity ({ userId, role }).
   * 7. Returns safe user object and JWT token.
   */
  async loginUser(dto: LoginUserDto): Promise<LoginResult> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Find user by email (including password field)
    const user = await this.userRepository.findByEmailWithPassword(normalizedEmail);
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // 2. Check pending activation status before password verification
    if (!user.isActive && !user.emailVerified && (user.role === 'event_manager' || user.role === 'worker')) {
      throw ApiError.unauthorized('Your account is pending activation. Please accept your invitation email to set your password.');
    }

    // 3. Verify password against stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(dto.password, user.password ?? '');
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // 4. Check account active status
    if (!user.isActive) {
      throw ApiError.unauthorized('Account is inactive. Please contact support.');
    }

    if (user.role === 'client' && user.emailVerified === false) {
      throw ApiError.unauthorized('Please verify your email before signing in.');
    }

    // 4. Generate JWT with minimal payload (userId & role derived exclusively from database)
    const payload = {
      userId: user._id.toString(),
      role: user.role,
    };

    const secret: Secret = env.jwtSecret;
    const options: SignOptions = {
      expiresIn: env.jwtExpiresIn,
    };

    const token = jwt.sign(payload, secret, options);

    // 5. Return safe user details and JWT token
    return {
      user: this.toSafeUser(user),
      token,
    };
  }

  /**
   * Generates a secure reset token and stores its hash if the user exists.
   * Does not reveal if the user exists or not.
   */
  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user || !user.isActive) {
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + env.passwordResetExpiresInMins * 60 * 1000);

    await this.userRepository.updatePasswordResetToken(user._id.toString(), resetTokenHash, expiresAt);

    if (env.isDevelopment) {
      console.log(`\n[DEV-ONLY] Password Reset Token for ${user.email}: ${resetToken}\n`);
    }
  }

  /**
   * Resets the user's password using a valid reset token.
   *
   * Business Rules:
   * 1. Hash the provided raw token.
   * 2. Look up the user by the hashed token.
   * 3. Verify user exists and token has not expired.
   * 4. Hash the new password.
   * 5. Update user password and clear reset token fields.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepository.findByPasswordResetToken(resetTokenHash);

    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('Invalid or expired password reset token.');
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.userRepository.updatePasswordAndClearResetToken(user._id.toString(), hashedPassword);
  }

  /**
   * Verifies the email OTP.
   */
  async verifyEmailOtp(email: string, otp: string): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const pendingUser = await this.userRepository.findPendingByEmail(normalizedEmail);

    if (!pendingUser) {
      // Also check if the user is already verified and exists in main User collection
      const existingUser = await this.userRepository.findByEmail(normalizedEmail);
      if (existingUser) {
        throw ApiError.badRequest('Email is already verified');
      }
      throw ApiError.badRequest('Invalid verification request');
    }

    if (pendingUser.emailVerificationOtpAttempts >= env.emailVerificationOtpMaxAttempts) {
      throw ApiError.badRequest('Too many attempts. Please request a new code.');
    }

    if (pendingUser.emailVerificationOtpExpiresAt.getTime() < Date.now()) {
      throw ApiError.badRequest('Verification code has expired. Please request a new one.');
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (otpHash !== pendingUser.emailVerificationOtpHash) {
      await this.userRepository.incrementPendingOtpAttempts(pendingUser._id.toString());
      throw ApiError.badRequest('Invalid verification code');
    }

    // Create the actual user
    const userData: Partial<IUser> = {
      name: pendingUser.name,
      email: pendingUser.email,
      password: pendingUser.password,
      phone: pendingUser.phone,
      profileImage: pendingUser.profileImage,
      role: pendingUser.role as any,
      isActive: true,
      emailVerified: true
    };

    const createdUser = await this.userRepository.create(userData);
    await this.userRepository.deletePendingById(pendingUser._id.toString());

    // Generate JWT
    const payload = {
      userId: createdUser._id.toString(),
      role: createdUser.role,
    };

    const secret: Secret = env.jwtSecret;
    const options: SignOptions = {
      expiresIn: env.jwtExpiresIn,
    };

    const token = jwt.sign(payload, secret, options);

    return {
      user: this.toSafeUser(createdUser),
      token,
    };
  }

  /**
   * Resends the email verification OTP.
   */
  async resendVerificationOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const pendingUser = await this.userRepository.findPendingByEmail(normalizedEmail);

    if (!pendingUser) {
      // Check if user is already verified
      const existingUser = await this.userRepository.findByEmail(normalizedEmail);
      if (existingUser) {
        return; // Already verified, safe response
      }
      return; // Not found, safe response
    }

    const now = Date.now();
    if (
      pendingUser.emailVerificationOtpLastSentAt &&
      now - pendingUser.emailVerificationOtpLastSentAt.getTime() < env.emailVerificationOtpResendCooldownSeconds * 1000
    ) {
      throw ApiError.badRequest(`Please wait before requesting a new code.`);
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(now + env.emailVerificationOtpTtlMinutes * 60 * 1000);

    await this.userRepository.updatePendingOtp(pendingUser._id.toString(), otpHash, expiresAt);

    try {
      await emailService.sendVerificationOtp({
        to: pendingUser.email,
        name: pendingUser.name,
        otp,
      });
    } catch (error) {
      console.error('[UserService] Failed to resend verification OTP:', error);
      throw ApiError.internal('Failed to send verification email. Please try again later.');
    }
  }

  /**
   * Admin creates an Event Manager.
   *
   * Business Rules:
   * 1. Normalizes email (lowercase, trim).
   * 2. Checks if email is already registered; throws 409 Conflict if so.
   * 3. Allocates business ID in category range (1000–1999).
   * 4. Generates a cryptographically secure random invitation token (hashed at rest with SHA-256).
   * 5. Forces role to 'event_manager', isActive: false (pending invitation), emailVerified: false.
   * 6. Dispatches invitation email via EmailService.
   * 7. Saves user via UserRepository.
   * 8. Returns sanitized user data omitting password and tokens.
   */
  async createEventManager(dto: CreateEventManagerDto): Promise<SafeUser> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Check duplicate email
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict('Email is already registered');
    }

    // 2. Generate cryptographically secure one-time invitation token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + env.invitationTokenExpiresInHours * 3600 * 1000);

    // 3. Generate a secure random password placeholder to satisfy model/hash invariants
    const tempPassword = dto.password || crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 4. Prepare payload with forced role 'event_manager' and pending activation state
    const userData: Partial<IUser> = {
      name: dto.name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: dto.phone?.trim(),
      profileImage: dto.profileImage?.trim(),
      role: 'event_manager',
      businessId: await this.businessIdService.generateBusinessId('event_manager'),
      isActive: false, // Inactive until invitation accepted and password set
      emailVerified: false,
      invitationTokenHash: tokenHash,
      invitationTokenExpiresAt: expiresAt,
    };

    // 5. Save via repository
    const createdUser = await this.userRepository.create(userData);

    // 6. Send invitation email
    const invitationUrl = `${env.frontendUrl}/accept-invitation?token=${rawToken}`;
    try {
      await emailService.sendInvitationEmail({
        to: normalizedEmail,
        name: dto.name.trim(),
        role: 'Event Manager',
        invitationUrl,
        expiresAt,
      });
    } catch (error) {
      console.error('[UserService] Failed to send invitation email on manager creation:', error);
      // Account creation still succeeds in pending state; Admin can resend
    }

    // 7. Return safe user data
    return this.toSafeUser(createdUser);
  }

  /**
   * Admin resends an invitation email to a pending Event Manager.
   */
  async resendEventManagerInvitation(managerId: string): Promise<{ success: boolean; message: string }> {
    const manager = await this.userRepository.findById(managerId);
    if (!manager) {
      throw ApiError.notFound('Event Manager not found');
    }

    if (manager.role !== 'event_manager') {
      throw ApiError.forbidden('User is not an Event Manager');
    }

    if (manager.isActive && manager.emailVerified) {
      throw ApiError.badRequest('This Event Manager account is already active.');
    }

    // Generate fresh secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + env.invitationTokenExpiresInHours * 3600 * 1000);

    await this.userRepository.updateInvitationToken(manager._id.toString(), tokenHash, expiresAt);

    const invitationUrl = `${env.frontendUrl}/accept-invitation?token=${rawToken}`;
    await emailService.sendInvitationEmail({
      to: manager.email,
      name: manager.name,
      role: 'Event Manager',
      invitationUrl,
      expiresAt,
    });

    return {
      success: true,
      message: 'Invitation resent successfully',
    };
  }

  /**
   * Retrieves public invitation metadata (name, email, role, workerType) for valid, unexpired token.
   */
  async getInvitationDetails(token: string): Promise<{ name: string; email: string; role: string; workerType?: string }> {
    if (!token || typeof token !== 'string') {
      throw ApiError.badRequest('Invitation token is required');
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const user = await this.userRepository.findByInvitationTokenHash(tokenHash);

    if (!user) {
      throw ApiError.badRequest('This invitation link is invalid or has expired. Please contact your administrator for a new invitation link.');
    }

    if (user.role !== 'event_manager' && user.role !== 'worker') {
      throw ApiError.forbidden('Invalid invitation purpose');
    }

    return {
      name: user.name,
      email: user.email,
      role: user.role,
      workerType: user.workerType,
    };
  }

  /**
   * Accepts invitation and sets the initial password (for Event Manager or Worker).
   */
  async acceptInvitation(dto: AcceptInvitationDto): Promise<SafeUser> {
    const { token, password } = dto;
    if (!token || typeof token !== 'string') {
      throw ApiError.badRequest('Invitation token is required');
    }

    if (!password || password.length < 6) {
      throw ApiError.badRequest('Password must be at least 6 characters long.');
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const user = await this.userRepository.findByInvitationTokenHash(tokenHash);

    if (!user) {
      throw ApiError.badRequest('This invitation link is invalid or has expired. Please contact your administrator for a new invitation link.');
    }

    if (user.role !== 'event_manager' && user.role !== 'worker') {
      throw ApiError.forbidden('Invalid invitation purpose');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await this.userRepository.acceptInvitation(user._id.toString(), hashedPassword);

    if (!updatedUser) {
      throw ApiError.internal('Failed to activate account');
    }

    return this.toSafeUser(updatedUser);
  }

  /**
   * Admin retrieves users list matching optional filters.
   */
  async getUsers(filters: { role?: string; workerType?: string; isActive?: boolean; createdBy?: string } = {}): Promise<SafeUser[]> {
    const users = await this.userRepository.findUsers(filters);
    return users.map((user) => this.toSafeUser(user));
  }

  /**
   * Retrieves workers list.
   * Admin: can view all workers with optional filters.
   * Event Manager: views workers created by them.
   */
  async getWorkers(
    filters: { workerType?: string; isActive?: boolean } = {},
    requestingUser: { id: string; role: string }
  ): Promise<SafeUser[]> {
    const queryFilters: { role: string; workerType?: string; isActive?: boolean; createdBy?: string } = {
      role: 'worker',
      ...filters,
    };

    if (requestingUser.role === 'event_manager') {
      queryFilters.createdBy = requestingUser.id;
    }

    const workers = await this.userRepository.findUsers(queryFilters);
    return workers.map((w) => this.toSafeUser(w));
  }

  /**
   * Admin or Event Manager creates a Worker.
   *
   * Business Rules:
   * 1. Normalizes email.
   * 2. Checks duplicate email -> 409 Conflict.
   * 3. Validates workerType against approved enum values.
   * 4. Enforces role = 'worker'.
   * 5. If creator is Event Manager:
   *    - Manager must be active.
   *    - Account is created in pending invitation state: isActive = false, emailVerified = false.
   *    - Generates 32-byte cryptographic token (hashed at rest with SHA-256, 24h expiry).
   *    - createdBy = creator.id.
   *    - Dispatches branded Worker invitation email via EmailService.
   * 6. If creator is Admin:
   *    - If password provided, hashes password and sets isActive = true, emailVerified = true.
   *    - If password omitted, uses the same invitation-based flow as Event Manager.
   * 7. Allocates businessId in category range for the workerType.
   * 8. Returns sanitized user data omitting password and token hashes.
   */
  async createWorker(
    dto: CreateWorkerDto,
    creator?: { id: string; role: string; isActive?: boolean }
  ): Promise<SafeUser> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Verify creator active state if provided
    if (creator) {
      const creatorUser = await this.userRepository.findById(creator.id);
      if (creatorUser && !creatorUser.isActive) {
        throw ApiError.forbidden('Inactive accounts cannot create Workers');
      }
    }

    // 2. Check duplicate email
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict('Email is already registered');
    }

    // 3. Worker Type validation
    const allowedWorkerTypes = [
      'Catering Boy',
      'Catering Supervisor',
      'Chef',
      'Cameraman / Photographer',
      'Videographer',
      'Decoration Worker',
      'Juice Worker',
      'Host',
    ];
    const workerType = dto.workerType?.trim();
    if (!workerType || !allowedWorkerTypes.includes(workerType)) {
      throw ApiError.badRequest('A valid workerType is required');
    }

    const isAdminDirectPassword = creator?.role === 'admin' && Boolean(dto.password);

    if (isAdminDirectPassword && dto.password) {
      // Direct Admin creation with password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

      const userData: Partial<IUser> = {
        name: dto.name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: dto.phone?.trim(),
        profileImage: dto.profileImage?.trim(),
        role: 'worker',
        workerType,
        businessId: await this.businessIdService.generateBusinessId(workerType),
        isActive: true,
        emailVerified: true,
        createdBy: creator ? (creator.id as any) : undefined,
      };

      const createdUser = await this.userRepository.create(userData);
      return this.toSafeUser(createdUser);
    }

    // Invitation-based creation (Event Manager always; Admin when no password provided)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + env.invitationTokenExpiresInHours * 3600 * 1000);

    // Placeholder password
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const userData: Partial<IUser> = {
      name: dto.name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: dto.phone?.trim(),
      profileImage: dto.profileImage?.trim(),
      role: 'worker',
      workerType,
      businessId: await this.businessIdService.generateBusinessId(workerType),
      isActive: false, // Inactive pending invitation
      emailVerified: false,
      invitationTokenHash: tokenHash,
      invitationTokenExpiresAt: expiresAt,
      createdBy: creator ? (creator.id as any) : undefined,
    };

    const createdUser = await this.userRepository.create(userData);

    // Send invitation email
    const invitationUrl = `${env.frontendUrl}/accept-invitation?token=${rawToken}`;
    try {
      await emailService.sendInvitationEmail({
        to: normalizedEmail,
        name: dto.name.trim(),
        role: workerType,
        invitationUrl,
        expiresAt,
      });
    } catch (error) {
      console.error('[UserService] Failed to send worker invitation email:', error);
    }

    return this.toSafeUser(createdUser);
  }

  /**
   * Resends an invitation email to a pending Worker.
   * Admin can resend for any worker.
   * Event Manager can only resend for workers they created.
   */
  async resendWorkerInvitation(
    workerId: string,
    requestingUser: { id: string; role: string }
  ): Promise<{ success: boolean; message: string }> {
    const worker = await this.userRepository.findById(workerId);
    if (!worker) {
      throw ApiError.notFound('Worker not found');
    }

    if (worker.role !== 'worker') {
      throw ApiError.forbidden('User is not a Worker');
    }

    // Check ownership if caller is an Event Manager
    if (requestingUser.role === 'event_manager') {
      if (!worker.createdBy || worker.createdBy.toString() !== requestingUser.id) {
        throw ApiError.forbidden('You do not have permission to manage this Worker');
      }
    }

    if (worker.isActive && worker.emailVerified) {
      throw ApiError.badRequest('This Worker account is already active.');
    }

    // Generate fresh secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + env.invitationTokenExpiresInHours * 3600 * 1000);

    await this.userRepository.updateInvitationToken(worker._id.toString(), tokenHash, expiresAt);

    const invitationUrl = `${env.frontendUrl}/accept-invitation?token=${rawToken}`;
    await emailService.sendInvitationEmail({
      to: worker.email,
      name: worker.name,
      role: worker.workerType || 'Worker',
      invitationUrl,
      expiresAt,
    });

    return {
      success: true,
      message: 'Invitation resent successfully',
    };
  }

  /**
   * Updates a user's active status.
   *
   * Business Rules:
   * 1. Target user must exist.
   * 2. Cannot deactivate/modify own status (prevents self-lockout).
   * 3. Must handle already active/inactive cases correctly.
   * 4. Only updates the isActive field.
   */
  async updateUserStatus(targetUserId: string, isActive: boolean, requestingAdminId: string): Promise<SafeUser> {
    if (targetUserId === requestingAdminId) {
      throw ApiError.badRequest('Admins cannot change their own account status');
    }

    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw ApiError.notFound('User not found');
    }

    if (targetUser.isActive === isActive) {
      throw ApiError.badRequest(`User is already ${isActive ? 'active' : 'inactive'}`);
    }

    const updatedUser = await this.userRepository.updateUserStatus(targetUserId, isActive);
    if (!updatedUser) {
      throw ApiError.notFound('User not found during update');
    }

    return this.toSafeUser(updatedUser);
  }

  /**
   * Fetches the current authenticated user by ID.
   *
   * Business Rules:
   * 1. Fetches user via UserRepository.findById.
   * 2. Rejects nonexistent user with 404 Not Found.
   * 3. Rejects inactive user with 401 Unauthorized.
   * 4. Converts and returns safe user data.
   */
  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.isActive) {
      throw ApiError.unauthorized('Account is inactive. Please contact support.');
    }

    return this.toSafeUser(user);
  }

  /**
   * Updates the current authenticated user's profile.
   *
   * Business Rules:
   * 1. Updates only allowed profile fields: name, phone, profileImage.
   * 2. Prevents updating protected fields like _id, role, businessId, isActive, password, workerType, email.
   * 3. Rejects non-existent or inactive users.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    if (!user.isActive) {
      throw ApiError.unauthorized('Account is inactive. Please contact support.');
    }

    const updateData: Partial<Pick<IUser, 'name' | 'phone' | 'profileImage' | 'location'>> = {};

    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }
    if (dto.phone !== undefined) {
      updateData.phone = dto.phone.trim();
    }
    if (dto.profileImage !== undefined) {
      updateData.profileImage = dto.profileImage.trim();
    }
    if (dto.location !== undefined) {
      if (typeof dto.location === 'string') {
        updateData.location = { address: dto.location.trim() };
      } else if (typeof dto.location === 'object' && dto.location !== null) {
        updateData.location = {
          address: dto.location.address?.trim(),
          lat: dto.location.lat,
          lng: dto.location.lng,
        };
      }
    }

    const updatedUser = await this.userRepository.updateProfile(userId, updateData);

    if (!updatedUser) {
      throw ApiError.internal('Failed to update profile');
    }

    return this.toSafeUser(updatedUser);
  }

  /**
   * Helper to format user document into a safe object for API response.
   */
  private toSafeUser(user: IUser): SafeUser {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      profileImage: user.profileImage,
      role: user.role,
      workerType: user.workerType,
      businessId: user.businessId,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      location: user.location,
      createdBy: user.createdBy ? user.createdBy.toString() : undefined,
      invitationAcceptedAt: user.invitationAcceptedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
