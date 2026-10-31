import React, { useEffect } from 'react';
import { LogOut, X, Loader2 } from 'lucide-react';

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoggingOut?: boolean;
  user?: {
    name: string;
    role: string;
    email?: string;
    initials?: string;
  };
  tenantName?: string;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  isLoggingOut = false,
  user,
  tenantName
}) => {
  // Close dialog on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoggingOut) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel, isLoggingOut]);

  if (!isOpen) return null;

  const displayEmail = user?.email || 'engineer@feedbackhub.io';
  const displayTenant = tenantName || 'Feedback-Hub Enterprise';

  return (
    <div
      id="logout-confirmation-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoggingOut) {
          onCancel();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-dialog-title"
    >
      <div
        id="logout-confirmation-card"
        className="bg-white border border-slate-200/90 w-full max-w-[420px] shadow-2xl flex flex-col rounded-[16px] overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-poppins relative"
      >
        {/* Subtle top-right dismiss button */}
        <button
          type="button"
          id="logout-close-btn"
          onClick={onCancel}
          disabled={isLoggingOut}
          aria-label="Close dialog"
          className="absolute top-4 right-4 z-10 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-[8px] transition-colors disabled:opacity-50 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Hero Section (Reference: Soft Gray Inset Rounded Card) */}
        <div className="m-2.5 p-6 bg-[#f4f4f5] rounded-[12px] flex flex-col space-y-3.5 text-left">
          {/* Top Icon Badge */}
          <div className="w-9 h-9 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs">
            <LogOut className="w-4 h-4 text-slate-700 stroke-[2.2]" />
          </div>

          {/* Heading and Description */}
          <div className="space-y-1">
            <h2 id="logout-dialog-title" className="text-xl sm:text-2xl font-medium text-slate-900 tracking-tight leading-snug">
              Log out
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
              Are you sure you want to log out of your enterprise session?
            </p>
            <p className="text-xs sm:text-sm text-slate-800 font-medium break-all pt-0.5">
              {displayEmail}
            </p>
          </div>
        </div>

        {/* Bottom Action Section (Reference: Field Row, Session Pill, Full-Width Dark Button) */}
        <div className="p-5 sm:p-6 pt-2 space-y-4">
          {/* Session verification info row */}
          <div className="space-y-1.5 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-700 font-medium">
                Active account <span className="text-rose-500">*</span>
              </span>
              <span className="text-slate-400 text-[11px] font-mono">
                {user?.role || 'Authenticated'}
              </span>
            </div>

            {/* Inactive Input-style Display Field */}
            <div className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-[8px] text-xs text-slate-700 flex items-center justify-between shadow-2xs">
              <div className="flex items-center space-x-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-mono text-slate-800 truncate">{displayEmail}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase shrink-0 pl-2">
                {displayTenant}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {/* Primary Dark Button (Matching Reference Button exactly) */}
            <button
              type="button"
              id="logout-confirm-btn"
              onClick={onConfirm}
              disabled={isLoggingOut}
              className="w-full py-3 bg-[#262626] hover:bg-[#18181b] active:bg-[#09090b] text-white text-xs font-mono font-medium tracking-wider uppercase rounded-[8px] transition-all shadow-xs active:scale-[0.99] flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>LOGGING OUT...</span>
                </>
              ) : (
                <span>LOG OUT</span>
              )}
            </button>

            {/* Cancel Link / Text Button */}
            <button
              type="button"
              id="logout-cancel-btn"
              onClick={onCancel}
              disabled={isLoggingOut}
              className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-center"
            >
              Cancel and stay signed in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
