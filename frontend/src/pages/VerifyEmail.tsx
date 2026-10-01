import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { verifyEmailOtp, resendVerificationOtp, clearError } from '../features/auth/authSlice';

export const VerifyEmail: React.FC = () => {
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const [localError, setLocalError] = useState('');

  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { isLoading, error } = useAppSelector((state) => state.auth);

  const email = location.state?.email;

  useEffect(() => {
    if (!email) {
      navigate('/signup');
    }
    dispatch(clearError());
  }, [email, navigate, dispatch]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setLocalError('');

    if (otp.length !== 6 || !/^\d+$/.test(otp)) {
      setLocalError('OTP must be exactly 6 digits');
      return;
    }

    try {
      await dispatch(verifyEmailOtp({ email, otp })).unwrap();
      setMessage('Email verified successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      // Error handled by redux
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    
    setMessage('');
    setLocalError('');
    dispatch(clearError());

    try {
      await dispatch(resendVerificationOtp({ email })).unwrap();
      setMessage('Verification code sent to your email.');
      setCooldown(60); // 60 seconds cooldown
    } catch (err) {
      // Error handled by redux
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-white p-8 rounded-xl shadow-lg border">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
            Verify Your Email
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter the 6-digit verification code sent to <br/>
            <strong>{email}</strong>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {(error || localError) && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{localError || error}</div>
            </div>
          )}
          {message && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">{message}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm">
            <div>
              <label htmlFor="otp" className="sr-only">Verification Code</label>
              <input
                id="otp"
                name="otp"
                type="text"
                required
                maxLength={6}
                className="relative block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 text-center tracking-widest text-2xl focus:z-10 focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-lg"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-300"
            >
              {isLoading ? 'Verifying...' : 'Verify Email'}
            </button>
          </div>
          
          <div className="text-center">
            <button
              type="button"
              disabled={cooldown > 0 || isLoading}
              onClick={handleResend}
              className="text-sm font-medium text-blue-600 hover:text-blue-500 disabled:text-gray-400"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        </form>
        <div className="text-center mt-4">
          <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};
