import type { Request, Response } from 'express';
import { UserService } from '../service/user.service.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { ApiError } from '../../../utils/ApiError.js';
import { catchAsync } from '../../../utils/catchAsync.js';

export class UserController {
  constructor(private readonly userService: UserService = new UserService()) {}

  /**
   * POST /api/auth/register
   * Registers a new client user.
   */
  register = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const safeUser = await this.userService.registerUser(req.body);

    new ApiResponse(201, 'User registered successfully', {
      user: safeUser,
    }).send(res);
  });

  /**
   * POST /api/auth/login
   * Authenticates user and returns safe user data with JWT token.
   */
  login = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { user, token } = await this.userService.loginUser(req.body);

    new ApiResponse(200, 'Login successful', {
      user,
      token,
    }).send(res);
  });

  /**
   * GET /api/auth/me
   * Fetches current authenticated user data.
   */
  getMe = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const user = await this.userService.getCurrentUser(req.user.id);

    new ApiResponse(200, 'Current user fetched successfully', {
      user,
    }).send(res);
  });

  /**
   * PATCH /api/auth/me
   * Updates current authenticated user profile data.
   */
  updateMe = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required');
    }

    const updatedUser = await this.userService.updateProfile(req.user.id, req.body);

    new ApiResponse(200, 'Profile updated successfully', {
      user: updatedUser,
    }).send(res);
  });

  /**
   * POST /api/auth/logout
   * Handles user logout. For stateless JWTs, there is no server-side token invalidation required.
   * The frontend is responsible for discarding the token.
   */
  logout = catchAsync(async (req: Request, res: Response): Promise<void> => {
    new ApiResponse(200, 'Logout successful', {}).send(res);
  });

  /**
   * POST /api/auth/forgot-password
   * Initiates the password reset process by generating a token and sending an email (mocked).
   */
  forgotPassword = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    await this.userService.forgotPassword(email);

    new ApiResponse(200, 'If an account exists for this email, password reset instructions will be sent.', {}).send(res);
  });

  /**
   * POST /api/auth/reset-password
   * Completes the password reset process.
   */
  resetPassword = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body;
    await this.userService.resetPassword(token, newPassword);

    new ApiResponse(200, 'Password reset successfully', {}).send(res);
  });

  /**
   * POST /api/auth/verify-email-otp
   * Verifies the email OTP.
   */
  verifyEmailOtp = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email, otp } = req.body;
    await this.userService.verifyEmailOtp(email, otp);

    new ApiResponse(200, 'Email verified successfully', {}).send(res);
  });

  /**
   * POST /api/auth/resend-verification-otp
   * Resends the verification OTP.
   */
  resendVerificationOtp = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    await this.userService.resendVerificationOtp(email);

    new ApiResponse(200, 'If the account is eligible for verification, a new code has been sent.', {}).send(res);
  });
}
