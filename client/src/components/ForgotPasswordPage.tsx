import React, { useState } from 'react';
import { forgotPasswordApi } from '../api/auth.api';
import { Mail, ArrowLeft, Loader2, AlertCircle, CheckCircle2, ShieldCheck, Building2 } from 'lucide-react';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onBackToLogin }) => {
  const [email, setEmail] = useState<string>('dev.rahul@acme.com');
  const [tenantSlug, setTenantSlug] = useState<string>('acme-payments');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await forgotPasswordApi({
        email: email.trim().toLowerCase(),
        tenant_slug: tenantSlug.trim() ? tenantSlug.trim() : undefined
      });
      setSuccessMessage(response.message || 'If an account matches that email, a password reset link has been dispatched.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to request password reset. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
                  RESET
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">Account Recovery Service</p>
            </div>
          </div>

          {/* Title */}
          <div className="pt-4 pb-1">
            <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-neutral-900">
              Forgot password?
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Enter your registered email address and we'll send you a single-use link to reset your password.
            </p>
          </div>

          {/* Success Banner */}
          {successMessage && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-start space-x-2.5 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
              <div className="space-y-1">
                <span className="font-semibold block">Instructions Dispatched</span>
                <p className="text-emerald-700 leading-relaxed">{successMessage}</p>
                <p className="text-[11px] text-emerald-600 font-mono pt-1">
                  The reset link remains active for 15 minutes.
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-start space-x-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1">
                <span className="font-medium block">Error</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Form */}
          {!successMessage ? (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              
              {/* Optional Organization Slug */}
              <div className="space-y-1.5">
                <label htmlFor="resetTenantSlug" className="block text-xs font-medium text-neutral-600">
                  Organization Slug <span className="text-neutral-400 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    id="resetTenantSlug"
                    type="text"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder="e.g. acme-payments"
                    disabled={isSubmitting}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div className="space-y-1.5">
                <label htmlFor="resetEmail" className="block text-xs font-medium text-neutral-600">
                  Registered Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="resetEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={isSubmitting}
                    required
                    autoFocus
                    className="w-full pl-10 pr-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending reset link...</span>
                    </>
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>
              </div>

            </form>
          ) : (
            <div className="mt-6 pt-2">
              <button
                type="button"
                onClick={onBackToLogin}
                className="w-full py-2.5 px-4 bg-neutral-900 hover:bg-black text-white font-medium text-xs rounded-md shadow-sm transition-all flex items-center justify-center space-x-2"
              >
                <span>Return to Sign In</span>
              </button>
            </div>
          )}

          {/* Back to Login Footer */}
          <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onBackToLogin}
              className="inline-flex items-center space-x-1.5 text-neutral-600 hover:text-neutral-900 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
            <div className="flex items-center space-x-1 text-neutral-400 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Bank-Grade</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
