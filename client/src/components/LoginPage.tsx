import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Building2, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, Zap, Layers } from 'lucide-react';

export interface LoginPageProps {
  onNavigateToForgotPassword?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToForgotPassword }) => {
  const { login } = useAuth();

  const [tenantSlug, setTenantSlug] = useState<string>('acme-payments');
  const [email, setEmail] = useState<string>('dev.rahul@acme.com');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Smooth professional typewriter effect for "Better Feedback. Better Decisions."
  const fullPart1 = 'Better Feedback.';
  const fullPart2 = 'Better Decisions.';
  const [displayedPart1, setDisplayedPart1] = useState<string>('');
  const [displayedPart2, setDisplayedPart2] = useState<string>('');
  const [isTypingComplete, setIsTypingComplete] = useState<boolean>(false);

  useEffect(() => {
    let index = 0;
    const speed = 50;

    const interval = setInterval(() => {
      index++;
      if (index <= fullPart1.length) {
        setDisplayedPart1(fullPart1.slice(0, index));
      } else if (index <= fullPart1.length + fullPart2.length) {
        setDisplayedPart2(fullPart2.slice(0, index - fullPart1.length));
      } else {
        setIsTypingComplete(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Basic client-side validation
    if (!tenantSlug.trim()) {
      setErrorMessage('Tenant slug is required.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Password is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({
        tenant_slug: tenantSlug.trim(),
        email: email.trim().toLowerCase(),
        password
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center p-4 sm:p-6 lg:p-10 overflow-x-hidden bg-[#0a0c10]">
      {/* Background Ambience & Lighting */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Soft radial glow simulating executive dusk resort/tech atmosphere */}
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[130px]" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[60%] rounded-full bg-indigo-600/10 blur-[140px]" />
        <div className="absolute -bottom-[10%] left-[30%] w-[40%] h-[50%] rounded-full bg-emerald-600/5 blur-[120px]" />
        
        {/* High-tech architectural grid texture */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Main Container: 2-Column Responsive Layout */}
      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* ============================================================== */}
        {/* LEFT COLUMN: BRANDING & PLATFORM INTRO                         */}
        {/* ============================================================== */}
        <div className="lg:col-span-6 xl:col-span-7 flex flex-col justify-center space-y-8 lg:pr-6">
          
          {/* Brand Header & Live Stream Status */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-md flex items-center justify-center text-white font-mono font-medium text-base shadow-lg shadow-blue-500/30 border border-blue-400/30">
                FH
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium tracking-tight text-white text-base">FEEDBACK-HUB</span>
                  <span className="px-2 py-0.5 text-[10px] font-mono tracking-wider font-normal border border-blue-500/30 bg-blue-500/10 text-blue-300 rounded">
                    ENTERPRISE
                  </span>
                </div>
                <p className="text-xs text-neutral-400 font-mono">Incident Bridge & Observability Platform</p>
              </div>
            </div>

            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
              <span>Multi-Tenant RLS & Live Incident Stream</span>
            </div>
          </div>

          {/* Primary Hero Heading & Narrative */}
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-medium tracking-tight text-white leading-[1.18] min-h-[2.4em]">
              {displayedPart1}
              {displayedPart1 === fullPart1 && ' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-200">
                {displayedPart2}
              </span>
              {!isTypingComplete && (
                <span className="inline-block w-[3px] h-[0.85em] ml-1 bg-blue-400 animate-pulse align-baseline" />
              )}
            </h1>

            <div className="flex space-x-3.5">
              <div className="w-0.5 bg-gradient-to-b from-blue-500 via-indigo-500 to-transparent rounded-full flex-shrink-0" />
              <p className="text-neutral-300/90 text-sm sm:text-base font-normal leading-relaxed max-w-xl">
                Collect feedback, track issues, collaborate with your team, and turn insights into meaningful improvements.
              </p>
            </div>
          </div>

          {/* Feature Badges Footer */}
          <div className="pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2 text-xs font-mono text-neutral-300 font-normal">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Bank-Grade AES</span>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono text-neutral-300 font-normal">
              <Layers className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span>Tenant Isolation</span>
            </div>
            <div className="flex items-center space-x-2 text-xs font-mono text-neutral-300 font-normal">
              <Zap className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>Real-Time Sync</span>
            </div>
          </div>

        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN: LOGIN CARD                                       */}
        {/* ============================================================== */}
        <div className="lg:col-span-6 xl:col-span-5">
          
          {/* Main Login Card: Square with subtle rounding */}
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
                    ERP
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">Enterprise Incident Management</p>
              </div>
            </div>

            {/* Form Titles: Lighter font weight */}
            <div className="pt-4 pb-1">
              <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-neutral-900">
                Sign in to your account
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                Welcome back! Please enter your details to continue.
              </p>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-start space-x-2 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
                <div className="flex-1">
                  <span className="font-medium block">Authentication Failed</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              
              {/* Tenant Slug Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="tenantSlug" className="block text-xs font-medium text-neutral-600">
                    Organization / Tenant Slug
                  </label>
                  {/* Quick Seeded Tenant Switchers */}
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTenantSlug('acme-payments');
                        setEmail('dev.rahul@acme.com');
                        setErrorMessage(null);
                      }}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                        tenantSlug === 'acme-payments'
                          ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                      }`}
                      title="Use Acme Payments demo tenant"
                    >
                      Acme
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTenantSlug('medsync');
                        setEmail('dev.elena@medsync.io');
                        setErrorMessage(null);
                      }}
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                        tenantSlug === 'medsync'
                          ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium'
                          : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200'
                      }`}
                      title="Use MedSync demo tenant"
                    >
                      MedSync
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    id="tenantSlug"
                    type="text"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder="e.g. acme-payments"
                    disabled={isSubmitting}
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Email Address Input */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-medium text-neutral-600">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    disabled={isSubmitting}
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Password Input with Visibility Toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium text-neutral-600">
                    Password
                  </label>
                  {onNavigateToForgotPassword && (
                    <button
                      type="button"
                      onClick={onNavigateToForgotPassword}
                      className="text-xs font-medium text-blue-600 hover:text-blue-500 hover:underline transition-colors focus:outline-none"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isSubmitting}
                    required
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

              {/* Primary Sign In Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs rounded-md shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <span>Sign in</span>
                  )}
                </button>
              </div>

            </form>

            {/* Card Footer */}
            <div className="mt-6 pt-4 border-t border-neutral-100 text-center">
              <p className="text-[11px] text-neutral-400 font-mono">
                Feedback-Hub Enterprise System • Bank-Grade Security
              </p>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
