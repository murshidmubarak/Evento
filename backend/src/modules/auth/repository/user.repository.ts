import { User, type IUser } from '../model/user.model.js';
import { PendingUser, type IPendingUser } from '../model/pending-user.model.js';

export class UserRepository {
  /**
   * Find a user document by normalized email address.
   */
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }

  /**
   * Find a user document by normalized email address, explicitly selecting the password field.
   */
  async findByEmailWithPassword(email: string): Promise<IUser | null> {
    return User.findOne({ email }).select('+password');
  }

  /**
   * Find a user document by MongoDB _id.
   */
  async findById(id: string): Promise<IUser | null> {
    return User.findById(id);
  }

  /**
   * Create and save a new user document.
   */
  async create(userData: Partial<IUser>): Promise<IUser> {
    const user = new User(userData);
    return user.save();
  }

  /**
   * Update the password reset token fields for a user.
   */
  async updatePasswordResetToken(id: string, hash: string | undefined, expiresAt: Date | undefined): Promise<void> {
    await User.findByIdAndUpdate(id, {
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: expiresAt,
    });
  }

  /**
   * Find a user document by password reset token hash.
   */
  async findByPasswordResetToken(hash: string): Promise<IUser | null> {
    return User.findOne({ passwordResetTokenHash: hash }).select('+passwordResetTokenHash +passwordResetExpiresAt');
  }

  /**
   * Update the user's password and clear the reset token fields.
   */
  async updatePasswordAndClearResetToken(id: string, newPasswordHash: string): Promise<void> {
    await User.findByIdAndUpdate(id, {
      password: newPasswordHash,
      $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
    });
  }

  /**
   * Update the active status of a user.
   */
  async updateUserStatus(id: string, isActive: boolean): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );
  }

  /**
   * Update the user's profile.
   */
  async updateProfile(id: string, profileData: Partial<Pick<IUser, 'name' | 'phone' | 'profileImage'>>): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      id,
      { $set: profileData },
      { new: true, runValidators: true }
    );
  }

  /**
   * Find a user document by MongoDB _id, explicitly selecting invitationTokenHash.
   */
  async findByIdWithInvitation(id: string): Promise<IUser | null> {
    return User.findById(id).select('+invitationTokenHash');
  }

  /**
   * Find active event managers, excluding pending invitations and busy managers.
   */
  async findActiveEventManagers(excludeIds: string[] = []): Promise<IUser[]> {
    const query: any = {
      role: 'event_manager',
      isActive: true,
      invitationTokenHash: { $exists: false },
    };
    if (excludeIds.length > 0) {
      query._id = { $nin: excludeIds };
    }
    return User.find(query).select('_id businessId name email status isActive'); // Exclude password/sensitive fields
  }

  /**
   * Find users with optional filters (role, workerType, isActive), sorted by creation date descending.
   */
  async findUsers(filters: { role?: string; workerType?: string; isActive?: boolean } = {}): Promise<IUser[]> {
    const query: any = {};
    if (filters.role) {
      query.role = filters.role;
    }
    if (filters.workerType) {
      query.workerType = filters.workerType;
    }
    if (filters.isActive !== undefined) {
      query.isActive = filters.isActive;
    }
    return User.find(query).sort({ createdAt: -1 });
  }

  /**
   * Find a user by email, including OTP verification fields.
   */
  async findByEmailWithOtpFields(email: string): Promise<IUser | null> {
    return User.findOne({ email }).select('+emailVerificationOtpHash +emailVerificationOtpExpiresAt +emailVerificationOtpAttempts +emailVerificationOtpLastSentAt');
  }

  /**
   * Increment the OTP attempts for a user.
   */
  async incrementOtpAttempts(id: string): Promise<void> {
    await User.findByIdAndUpdate(id, {
      $inc: { emailVerificationOtpAttempts: 1 }
    });
  }

  /**
   * Mark user's email as verified and clear OTP fields.
   */
  async verifyEmail(id: string): Promise<void> {
    await User.findByIdAndUpdate(id, {
      emailVerified: true,
      $unset: {
        emailVerificationOtpHash: 1,
        emailVerificationOtpExpiresAt: 1,
        emailVerificationOtpAttempts: 1,
        emailVerificationOtpLastSentAt: 1
      }
    });
  }

  /**
   * Update the user's OTP fields for resend.
   */
  async updateOtp(id: string, hash: string, expiresAt: Date): Promise<void> {
    await User.findByIdAndUpdate(id, {
      emailVerificationOtpHash: hash,
      emailVerificationOtpExpiresAt: expiresAt,
      emailVerificationOtpAttempts: 0,
      emailVerificationOtpLastSentAt: new Date(),
    });
  }

  // Pending User Methods

  async findPendingByEmail(email: string): Promise<IPendingUser | null> {
    return PendingUser.findOne({ email });
  }

  async upsertPendingUser(email: string, userData: Partial<IPendingUser>): Promise<IPendingUser> {
    return PendingUser.findOneAndUpdate(
      { email },
      userData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async updatePendingOtp(id: string, hash: string, expiresAt: Date): Promise<void> {
    await PendingUser.findByIdAndUpdate(id, {
      emailVerificationOtpHash: hash,
      emailVerificationOtpExpiresAt: expiresAt,
      emailVerificationOtpAttempts: 0,
      emailVerificationOtpLastSentAt: new Date(),
    });
  }

  async incrementPendingOtpAttempts(id: string): Promise<void> {
    await PendingUser.findByIdAndUpdate(id, {
      $inc: { emailVerificationOtpAttempts: 1 }
    });
  }

  async deletePendingById(id: string): Promise<void> {
    await PendingUser.findByIdAndDelete(id);
  }

  /**
   * Find a user by active, unexpired invitation token hash.
   */
  async findByInvitationTokenHash(tokenHash: string): Promise<IUser | null> {
    return User.findOne({
      invitationTokenHash: tokenHash,
      invitationTokenExpiresAt: { $gt: new Date() },
    }).select('+invitationTokenHash +invitationTokenExpiresAt');
  }

  /**
   * Update or regenerate invitation token and expiration for an existing user.
   */
  async updateInvitationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      userId,
      {
        invitationTokenHash: tokenHash,
        invitationTokenExpiresAt: expiresAt,
      },
      { new: true }
    );
  }

  /**
   * Complete invitation acceptance: set password, activate account, verify email, and clear token.
   */
  async acceptInvitation(userId: string, passwordHash: string): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      userId,
      {
        password: passwordHash,
        isActive: true,
        emailVerified: true,
        invitationAcceptedAt: new Date(),
        $unset: {
          invitationTokenHash: 1,
          invitationTokenExpiresAt: 1,
        },
      },
      { new: true }
    );
  }
}
