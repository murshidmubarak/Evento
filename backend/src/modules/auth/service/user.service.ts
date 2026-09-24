import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { UserRepository } from '../repository/user.repository.js';
import { ApiError } from '../../../utils/ApiError.js';
import { env } from '../../../config/env.js';
import type { IUser } from '../model/user.model.js';

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
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResult {
  user: SafeUser;
  token: string;
}

export class UserService {
  constructor(private readonly userRepository: UserRepository = new UserRepository()) {}

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
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
