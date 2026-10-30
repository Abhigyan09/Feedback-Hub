import React, { useEffect } from 'react';
import { LogOut, X, Loader2 } from 'lucide-react';

export interface LogoutConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  isLoggingOut?: boolean;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  isLoggingOut = false
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

  return (
    <div
      id="logout-confirmation-backdrop"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
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
        className="bg-[#121215] border border-[#27272a] w-full max-w-md shadow-2xl flex flex-col rounded-md animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#27272a] flex items-center justify-between bg-[#09090b]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-md bg-red-950/60 border border-red-800/80 flex items-center justify-center text-red-400">
              <LogOut className="w-4 h-4" />
            </div>
            <h2 id="logout-dialog-title" className="text-sm sm:text-base font-bold text-white tracking-tight">
              Confirm Logout
            </h2>
          </div>

          <button
            type="button"
            id="logout-close-btn"
            onClick={onCancel}
            disabled={isLoggingOut}
            aria-label="Close dialog"
            className="p-1.5 text-neutral-400 hover:text-white rounded-md border border-transparent hover:border-[#27272a] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Card Body */}
        <div className="p-5 sm:p-6">
          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed font-sans">
            Are you sure you want to log out?
          </p>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-[#27272a] bg-[#09090b] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
          <button
            type="button"
            id="logout-cancel-btn"
            onClick={onCancel}
            disabled={isLoggingOut}
            className="w-full sm:w-auto px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-[#27272a] rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            id="logout-confirm-btn"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-500 text-white border border-red-500 rounded-md text-xs font-mono font-semibold transition-all shadow-sm active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Logging Out...</span>
              </>
            ) : (
              <>
                <LogOut className="w-3.5 h-3.5" />
                <span>Yes, Log Out</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
