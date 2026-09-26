import { User, type IUser } from '../model/user.model.js';

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
   * Find active event managers, optionally excluding specific IDs (e.g. busy managers).
   */
  async findActiveEventManagers(excludeIds: string[] = []): Promise<IUser[]> {
    const query: any = { role: 'event_manager', isActive: true };
    if (excludeIds.length > 0) {
      query._id = { $nin: excludeIds };
    }
    return User.find(query).select('_id businessId name email status isActive'); // Exclude password/sensitive fields
  }
}
