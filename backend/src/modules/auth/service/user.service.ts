import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { UserRepository } from '../repository/user.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { env } from '../../../config/env.js';
import type { IUser } from '../model/user.model.js';
import { BusinessIdService } from '../../users/service/business-id.service.js';

export interface RegisterUserDto {
  name: string;
  email: string;
  password: string;
  phone?: string;
  profileImage?: string;
  role?: string;
}

export interface LoginUserDto {
  email: string;
  password: string;
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
  ) {}

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
  async registerUser(dto: RegisterUserDto): Promise<SafeUser> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Check duplicate email
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict('Email is already registered');
    }

    // 2. Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    // 3. Prepare payload with forced role 'client'
    const userData: Partial<IUser> = {
      name: dto.name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: dto.phone?.trim(),
      profileImage: dto.profileImage?.trim(),
      role: 'client', // Backend is source of truth — force role to 'client'
      isActive: true,
    };

    // 4. Save via repository
    const createdUser = await this.userRepository.create(userData);

    // 5. Return safe user data
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

    // 2. Verify password against stored bcrypt hash
    const isPasswordValid = await bcrypt.compare(dto.password, user.password ?? '');
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // 3. Check account active status
    if (!user.isActive) {
      throw ApiError.unauthorized('Account is inactive. Please contact support.');
    }

    // 4. Generate JWT with minimal payload (userId & role derived exclusively from database)
    const payload = {
      userId: user._id.toString(),
      role: user.role,
    };

    const secret: Secret = env.jwtSecret;
    const options: SignOptions = {
      expiresIn: env.jwtExpiresIn as unknown as SignOptions['expiresIn'],
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
   * Admin creates an Event Manager.
   *
   * Business Rules:
   * 1. Normalizes email (lowercase, trim).
   * 2. Checks if email is already registered; throws 409 Conflict if so.
   * 3. Hashes password using bcrypt.
   * 4. Forces user role to 'event_manager'.
   * 5. Saves user via UserRepository.
   * 6. Returns sanitized user data omitting password.
   */
  async createEventManager(dto: RegisterUserDto): Promise<SafeUser> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Check duplicate email
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw ApiError.conflict('Email is already registered');
    }

    // 2. Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    // 3. Prepare payload with forced role 'event_manager'
    const userData: Partial<IUser> = {
      name: dto.name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      phone: dto.phone?.trim(),
      profileImage: dto.profileImage?.trim(),
      role: 'event_manager', // Backend is source of truth — force role to 'event_manager'
      businessId: await this.businessIdService.generateBusinessId('event_manager'),
      isActive: true,
    };

    // 4. Save via repository
    const createdUser = await this.userRepository.create(userData);

    // 5. Return safe user data
    return this.toSafeUser(createdUser);
  }

  /**
   * Admin or Event Manager creates a Worker.
   *
   * Business Rules:
   * 1. Normalizes email.
   * 2. Checks duplicate email.
   * 3. Hashes password using bcrypt.
   * 4. Forces role to 'worker'.
   * 5. Includes the mandatory workerType field.
   * 6. Returns sanitized user data.
   */
  async createWorker(dto: RegisterUserDto & { workerType: string }): Promise<SafeUser> {
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
      role: 'worker', // Backend enforces role
      workerType: dto.workerType.trim(),
      businessId: await this.businessIdService.generateBusinessId(dto.workerType.trim()),
      isActive: true, // Default status
    };

    const createdUser = await this.userRepository.create(userData);

    return this.toSafeUser(createdUser);
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
