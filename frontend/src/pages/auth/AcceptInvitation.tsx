import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { invitationApi, type InvitationDetails } from '../../features/auth/invitationApi';
import { 
  ShieldCheck, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  Sparkles,
  CalendarCheck
} from 'lucide-react';

export const AcceptInvitation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  // Page state: 'loading' | 'valid' | 'invalid' | 'success'
  const [pageState, setPageState] = useState<'loading' | 'valid' | 'invalid' | 'success'>('loading');
  const [invitationDetails, setInvitationDetails] = useState<InvitationDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Form fields
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      setErrorMessage('No invitation token was provided in the link.');
      return;
    }

    const verifyToken = async () => {
      try {
        setPageState('loading');
        const details = await invitationApi.getInvitationDetails(token);
        setInvitationDetails(details);
        setPageState('valid');
      } catch (err: any) {
        setPageState('invalid');
        const msg = err.response?.data?.message || 'This invitation link is invalid or has expired. Please contact your administrator to request a new invitation.';
        setErrorMessage(msg);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!token) {
      setSubmitError('Invalid invitation token.');
      return;
    }

    if (!password || password.length < 6) {
      setSubmitError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match. Please re-enter.');
      return;
    }

    try {
      setIsSubmitting(true);
      await invitationApi.acceptInvitation({
        token,
        password,
        confirmPassword,
      });
      setPageState('success');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.errors?.[0] || 'Failed to accept invitation. Please try again.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 mb-3">
          <CalendarCheck size={22} className="stroke-[2.5]" />
          <span className="font-extrabold tracking-tight text-lg">EventOps ERP</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
          {invitationDetails?.role === 'worker'
            ? 'Worker Onboarding'
            : invitationDetails?.role === 'event_manager'
            ? 'Event Manager Onboarding'
            : 'Account Onboarding'}
        </h1>
        <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-semibold">
          Secure Account Activation
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-200/60 rounded-2xl border border-gray-100 sm:px-10 transition-all">
          
          {/* 1. Loading State */}
          {pageState === 'loading' && (
            <div className="py-12 text-center flex flex-col items-center justify-center">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
              <h3 className="text-base font-bold text-gray-900">Verifying Invitation Token...</h3>
              <p className="text-xs text-gray-500 mt-1">
                Please wait while we validate your one-time onboarding link.
              </p>
            </div>
          )}

          {/* 2. Invalid / Expired State */}
          {pageState === 'invalid' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={32} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900">Invitation Invalid or Expired</h2>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {errorMessage}
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 text-left">
                <span className="font-semibold block mb-0.5">Need a new link?</span>
                Invitation links expire after 24 hours or after being used. Please ask your Event Manager or ERP Administrator to resend your invitation.
              </div>

              <div className="pt-2">
                <Link
                  to="/login"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-900 hover:bg-black text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  Return to Login
                </Link>
              </div>
            </div>
          )}

          {/* 3. Valid State — Password Setup Form */}
          {pageState === 'valid' && invitationDetails && (
            <div className="space-y-6">
              {/* Recipient Profile Banner */}
              <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 mb-1">
                  <ShieldCheck size={14} />
                  <span>
                    Authorized Role:{' '}
                    {invitationDetails.role === 'worker'
                      ? `Worker (${invitationDetails.workerType || 'Staff'})`
                      : 'Event Manager'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  Welcome, {invitationDetails.name}!
                </h3>
                <p className="text-xs text-gray-600 mt-0.5">
                  Set a password for <span className="font-semibold text-gray-800">{invitationDetails.email}</span> to activate your account and access your dashboard.
                </p>
              </div>

              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {/* New Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-9 pr-10 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full pl-9 pr-10 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
                  )}
                </div>

                {/* Password Policy Hint */}
                <div className="text-[11px] text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-200/60">
                  <span className="font-semibold block text-gray-700 mb-0.5">Security Guidelines:</span>
                  Choose a strong, unique password of at least 6 characters. Passwords are securely hashed with bcrypt upon activation.
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !password || password.length < 6 || password !== confirmPassword}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Activating Account...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Set Password & Activate Account
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* 4. Success State */}
          {pageState === 'success' && (
            <div className="text-center py-4 space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 size={36} />
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900">Account Activated Successfully!</h2>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  Your password has been saved, your email has been verified, and your{' '}
                  {invitationDetails?.role === 'worker' ? 'Worker' : 'Event Manager'} account is now active.
                </p>
              </div>

              <div className="bg-emerald-50/80 border border-emerald-200/70 rounded-xl p-3.5 text-xs text-emerald-800 text-left">
                <span className="font-semibold block mb-0.5">Ready for Operational Access:</span>
                You can now log in using your email address and newly established password to access the{' '}
                {invitationDetails?.role === 'worker' ? 'Worker Dashboard' : 'Manager Dashboard'}.
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm shadow-sm transition-colors"
                >
                  Proceed to Login
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
