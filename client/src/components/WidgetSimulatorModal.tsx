import React, { useState } from 'react';
import { X, Sparkles, Send, Bug, Cpu, Terminal, AlertTriangle } from 'lucide-react';

interface WidgetSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTicketCreated: () => void;
}

export const WidgetSimulatorModal: React.FC<WidgetSimulatorModalProps> = ({
  isOpen,
  onClose,
  onTicketCreated
}) => {
  const [title, setTitle] = useState('Payment Gateway 502 Bad Gateway on retry');
  const [description, setDescription] = useState('Customer experienced a hang on checkout step 3. The retry request timed out and returned 502 from proxy.');
  const [category, setCategory] = useState<'API_FAILURE' | 'BUG' | 'UI_GLITCH'>('API_FAILURE');
  const [severity, setSeverity] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM'>('CRITICAL');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/ingest/ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Product-Key': 'fb_live_acme_checkout_key_998' // Valid test product key
        },
        body: JSON.stringify({
          title,
          description,
          category,
          severity,
          reporter_email: 'client-user@enterprise.com',
          telemetry: {
            page_url: 'https://checkout.acme.com/v2/orders/pay',
            app_version: 'v2.16.1',
            user_agent: navigator.userAgent,
            viewport_dimensions: `${window.innerWidth}x${window.innerHeight}`,
            console_logs: [
              { type: 'info', message: 'Loaded payment widget', timestamp: new Date().toLocaleTimeString() },
              { type: 'error', message: '502 Bad Gateway from upstream settlement service', timestamp: new Date().toLocaleTimeString() }
            ],
            network_errors: [
              { url: 'https://api.acme.com/v2/orders/pay', status: 502, method: 'POST', timestamp: new Date().toLocaleTimeString() }
            ]
          },
          sensitive_data: {
            authHeader: 'Bearer [ENCRYPTED_CLIENT_AUTH_TOKEN]',
            orderId: 'ord_live_884912'
          }
        })
      });

      if (response.ok) {
        onTicketCreated();
        onClose();
      } else {
        const data = await response.json();
        alert('Ingestion error: ' + (data.error || 'Failed to submit'));
      }
    } catch (err: any) {
      alert('Network error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121215] border border-[#27272a] w-full max-w-lg shadow-2xl rounded-none animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 border-b border-[#27272a] flex items-center justify-between bg-[#09090b]">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h3 className="font-mono text-xs uppercase font-bold text-white tracking-wider">
              CLIENT PRODUCT EMBEDDED WIDGET SIMULATOR
            </h3>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 border border-indigo-900/50 bg-indigo-950/20 text-xs text-indigo-200 font-mono space-y-1">
            <p className="font-bold">Automated Context Ingestion:</p>
            <p className="text-[11px] text-indigo-300/80">
              Submitting will automatically attach the client's current browser console errors, failed API network requests, and user environment directly into the squad's queue.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono uppercase text-neutral-400">Incident Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-[#09090b] border border-[#27272a] text-xs text-white p-2.5 font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-400">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-[#09090b] border border-[#27272a] text-xs text-white p-2 font-mono focus:outline-none focus:border-indigo-500"
              >
                <option value="API_FAILURE">API FAILURE</option>
                <option value="BUG">APPLICATION BUG</option>
                <option value="UI_GLITCH">UI GLITCH</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-mono uppercase text-neutral-400">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full bg-[#09090b] border border-[#27272a] text-xs text-white p-2 font-mono focus:outline-none focus:border-indigo-500"
              >
                <option value="CRITICAL">CRITICAL (P0)</option>
                <option value="HIGH">HIGH (P1)</option>
                <option value="MEDIUM">MEDIUM (P2)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono uppercase text-neutral-400">User Observation / Notes</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
              className="w-full bg-[#09090b] border border-[#27272a] text-xs text-white p-2.5 font-mono focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-mono border border-[#27272a] text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-medium flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'INGESTING...' : 'DISPATCH TO SQUAD'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
