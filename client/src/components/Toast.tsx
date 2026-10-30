import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  durationMs?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  durationMs = 3000,
  onClose
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onClose]);

  const isSuccess = type === 'success';

  return (
    <div
      id="toast-notification"
      role="status"
      aria-live="polite"
      className={`fixed top-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-300 font-sans text-xs ${
        isSuccess
          ? 'bg-[#121215] border border-emerald-500/40 text-emerald-300 shadow-emerald-950/40'
          : 'bg-[#121215] border border-red-500/40 text-red-300 shadow-red-950/40'
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
      )}
      <span className="font-medium text-white">{message}</span>
      <button
        id="toast-dismiss-btn"
        onClick={onClose}
        type="button"
        aria-label="Dismiss notification"
        className="ml-2 text-neutral-400 hover:text-white transition-colors focus:outline-none cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
