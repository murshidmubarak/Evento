import { Router } from 'express';
import { UserController } from '../controller/user.controller.js';
import { validateRegistration, validateLogin, validateForgotPassword, validateResetPassword, validateProfileUpdate } from '../validation/user.validation.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';

const router = Router();
const userController = new UserController();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new client user
 * @access  Public
 */
router.post('/register', validateRegistration, userController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return JWT
 * @access  Public
 */
router.post('/login', validateLogin, userController.login);

/**
 * @route   GET /api/auth/me
 * @desc    Fetch current authenticated user
 * @access  Private
 */
router.get('/me', authenticate, userController.getMe);

/**
 * @route   PATCH /api/auth/me
 * @desc    Update current authenticated user profile
 * @access  Private
 */
router.patch('/me', authenticate, validateProfileUpdate, userController.updateMe);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Initiate password reset process
 * @access  Public
 */
router.post('/forgot-password', validateForgotPassword, userController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Completes password reset process
 * @access  Public
 */
router.post('/reset-password', validateResetPassword, userController.resetPassword);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', authenticate, userController.logout);

export default router;
