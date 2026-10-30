import React, { useState, useEffect } from 'react';
import { resetPasswordApi } from '../api/auth.api';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';

interface ResetPasswordPageProps {
  initialToken?: string;
  onNavigateToLogin: () => void;
  onRequestNewLink: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  initialToken,
  onNavigateToLogin,
  onRequestNewLink
}) => {
  // Extract token from prop or URL query string
  const [token, setToken] = useState<string>(() => {
    if (initialToken) return initialToken;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || '';
  });

  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(3);

  // If token is missing from URL, flag immediately as invalid token
  useEffect(() => {
    if (!token.trim()) {
      setErrorMessage('Missing password reset token. Please request a new link.');
      setErrorCode('TOKEN_MISSING');
    }
  }, [token]);

  // Automatic redirect countdown upon success
  useEffect(() => {
    if (!isSuccess) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onNavigateToLogin();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSuccess, onNavigateToLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setErrorCode(null);

    if (!token.trim()) {
      setErrorMessage('A valid reset token is required. Please use the link sent to your email.');
      setErrorCode('TOKEN_MISSING');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('New password and confirmation password do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPasswordApi({
        token: token.trim(),
        new_password: newPassword
      });
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset password. Please try again.');
      setErrorCode(err.code || 'RESET_FAILED');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isTokenExpired = errorCode === 'TOKEN_EXPIRED';
  const isTokenAlreadyUsed = errorCode === 'TOKEN_ALREADY_USED';
  const isTokenInvalid = errorCode === 'INVALID_TOKEN' || errorCode === 'TOKEN_MISSING';

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 lg:p-10 overflow-x-hidden bg-[#0a0c10]">
      {/* Background Ambience & Lighting */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[130px]" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[60%] rounded-full bg-indigo-600/10 blur-[140px]" />
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white text-neutral-900 rounded-lg p-8 sm:p-10 shadow-2xl border border-neutral-200/80">
          
          {/* Header in Card */}
          <div className="flex items-center space-x-3 pb-3 border-b border-neutral-100">
            <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-mono font-medium text-xs shadow-sm">
              FH
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold tracking-tight text-neutral-800 text-sm">FEEDBACK-HUB</span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-medium bg-blue-50 text-blue-700 rounded border border-blue-200">
                  SECURITY
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">Argon2id Enterprise Protection</p>
            </div>
          </div>

          {/* Form Header */}
          <div className="pt-4 pb-1">
            <div className="flex items-center space-x-2 text-blue-600 pb-1">
              <KeyRound className="w-5 h-5" />
              <span className="text-xs font-mono font-semibold uppercase tracking-wider">Set New Credentials</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-neutral-900">
              Reset your password
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Choose a strong password to protect your Feedback-Hub account.
            </p>
          </div>

          {/* Success State */}
          {isSuccess ? (
            <div className="mt-5 space-y-5 animate-in fade-in duration-200">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-sm text-emerald-900 block">Password Updated!</span>
                  <p className="text-emerald-700 leading-relaxed">
                    Your password has been successfully reset. All prior active sessions have been revoked.
                  </p>
                  <p className="text-[11px] text-emerald-600 font-mono pt-1">
                    Redirecting to Sign In in {countdown}s...
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onNavigateToLogin}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md shadow-sm transition-all flex items-center justify-center space-x-2"
              >
                <span>Sign in with new password</span>
              </button>
            </div>
          ) : (
            <>
              {/* Token Expiration / Already Used / Invalid State Banner */}
              {(isTokenExpired || isTokenAlreadyUsed || isTokenInvalid) && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-xs space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <span className="font-semibold block">
                        {isTokenExpired ? 'Reset Link Expired' : isTokenAlreadyUsed ? 'Link Already Used' : 'Invalid Reset Link'}
                      </span>
                      <p className="text-amber-800 mt-0.5 leading-relaxed">
                        {isTokenExpired
                          ? 'This password reset link has expired (15-minute validity). Please request a fresh reset link.'
                          : isTokenAlreadyUsed
                          ? 'This single-use reset link has already been used. Please request a new one.'
                          : 'The reset token is invalid or missing from the URL.'}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onRequestNewLink}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] rounded transition-colors inline-block"
                    >
                      Request New Reset Link
                    </button>
                  </div>
                </div>
              )}

              {/* Standard Error Message */}
              {errorMessage && !isTokenExpired && !isTokenAlreadyUsed && !isTokenInvalid && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-start space-x-2 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                  <div className="flex-1">
                    <span className="font-medium block">Failed to Reset Password</span>
                    <span>{errorMessage}</span>
                  </div>
                </div>
              )}

              {/* Reset Password Form */}
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                
                {/* New Password Input */}
                <div className="space-y-1.5">
                  <label htmlFor="newPassword" className="block text-xs font-medium text-neutral-600">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      disabled={isSubmitting || isTokenExpired || isTokenAlreadyUsed}
                      required
                      autoFocus
                      className="w-full pl-10 pr-10 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div className="space-y-1.5">
                  <label htmlFor="confirmPassword" className="block text-xs font-medium text-neutral-600">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      disabled={isSubmitting || isTokenExpired || isTokenAlreadyUsed}
                      required
                      className="w-full pl-10 pr-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || isTokenExpired || isTokenAlreadyUsed || !token.trim()}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Updating password...</span>
                      </>
                    ) : (
                      <span>Save New Password & Sign In</span>
                    )}
                  </button>
                </div>

              </form>
            </>
          )}

          {/* Footer Back Link */}
          <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onNavigateToLogin}
              className="inline-flex items-center space-x-1.5 text-neutral-600 hover:text-neutral-900 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
            <div className="flex items-center space-x-1 text-neutral-400 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Argon2id</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
