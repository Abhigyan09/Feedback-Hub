import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Send, 
  Bug, 
  Lightbulb, 
  HelpCircle, 
  Star, 
  Image as ImageIcon, 
  Upload, 
  Monitor, 
  ChevronDown, 
  ChevronUp, 
  MessageSquarePlus,
  Trash2,
  Check
} from 'lucide-react';

interface WidgetSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTenantId?: string;
  onTicketCreated: () => void;
}

type FeedbackCategory = 'BUG' | 'IDEA' | 'HELP' | 'RATING';
type SeverityPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export const WidgetSimulatorModal: React.FC<WidgetSimulatorModalProps> = ({
  isOpen,
  onClose,
  onTicketCreated
}) => {
  // Category & Conditional Fields
  const [category, setCategory] = useState<FeedbackCategory>('BUG');
  const [severity, setSeverity] = useState<SeverityPriority>('Medium');
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);

  // Form inputs
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multi-Product / Domain Simulation Switcher
  const [simulatedProduct, setSimulatedProduct] = useState<'checkout' | 'merchant' | 'medsync'>('checkout');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global paste listener for Ctrl+V / Cmd+V screenshot paste
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                setScreenshot(event.target.result as string);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  if (!isOpen) return null;

  // Active Simulated Context
  const productConfigs = {
    checkout: {
      name: 'Acme Payments Inc. (Checkout Gateway)',
      key: 'fb_live_acme_checkout_key_998',
      domain: 'checkout.acme.com',
      url: 'https://checkout.acme.com/v2/pay/upi'
    },
    merchant: {
      name: 'Acme Payments Inc. (Merchant Portal)',
      key: 'hash_prod_live_portal_key',
      domain: 'merchant.acme.com',
      url: 'https://merchant.acme.com/billing/invoices'
    },
    medsync: {
      name: 'MedSync Healthcare (Patient Portal)',
      key: 'fb_live_acme_checkout_key_998', // Fallback for dev demo
      domain: 'portal.medsync.io',
      url: 'https://portal.medsync.io/records/telehealth'
    }
  };

  const currentConfig = productConfigs[simulatedProduct];

  // Dynamic placeholders based on category
  const getSubjectPlaceholder = () => {
    if (category === 'BUG') return 'e.g. Rate parity disparity on Agoda';
    return 'e.g. Suggestion for quick reservation form';
  };

  const getDetailsPlaceholder = () => {
    if (category === 'BUG') return 'What happened? What were you trying to do?';
    return 'Tell us how we can improve your experience...';
  };

  const getRatingLabel = (score: number) => {
    switch (score) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Very Good';
      case 5: return 'Excellent';
      default: return 'Excellent';
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setScreenshot(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.trim()) {
      alert('Please fill out the Details field.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v1/ingest/ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Product-Key': currentConfig.key
        },
        body: JSON.stringify({
          title: subject.trim() || `${category}: Feedback from ${currentConfig.domain}`,
          description: details,
          category,
          severity: category === 'BUG' || category === 'HELP' ? severity.toUpperCase() : 'LOW',
          rating: category === 'RATING' ? rating : undefined,
          screenshot: screenshot || undefined,
          reporter_email: 'sarah.jenkins@clientops.com',
          telemetry: {
            page_url: currentConfig.url,
            domain_origin: currentConfig.domain,
            user_agent: navigator.userAgent,
            viewport_dimensions: `${window.innerWidth}x${window.innerHeight}`,
            console_logs: [
              { type: 'info', message: `Initialized client on ${currentConfig.domain}`, timestamp: new Date().toLocaleTimeString() },
              ...(category === 'BUG' ? [
                { type: 'error', message: `Uncaught Error: Fetch failed at ${currentConfig.url}`, timestamp: new Date().toLocaleTimeString() }
              ] : [])
            ],
            network_errors: category === 'BUG' ? [
              { url: `${currentConfig.url}/api/sync`, status: 500, method: 'POST', timestamp: new Date().toLocaleTimeString() }
            ] : []
          }
        })
      });

      if (response.ok) {
        onTicketCreated();
        onClose();
      } else {
        const errorData = await response.json();
        alert('Submission failed: ' + (errorData.error || 'Server error'));
      }
    } catch (err: any) {
      alert('Network error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white text-slate-800 w-full max-w-[540px] max-h-[90vh] flex flex-col rounded-md shadow-2xl border border-slate-300 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200 modal-subtle">
        
        {/* Modal Header - Fixed at top */}
        <div className="px-6 py-4 flex items-start justify-between border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-md bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 shadow-2xs shrink-0">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 leading-tight">
                Share Feedback with Engineering
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Report bugs, suggest improvements, or ask for help
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-200 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form - non-scrollable shell */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* Scrollable Form Content - ONLY this content scrolls */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* 1. Feedback Category (4 Cards) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Feedback Category</label>
            <div className="grid grid-cols-4 gap-2.5">
              
              {/* Bug */}
              <button
                type="button"
                onClick={() => setCategory('BUG')}
                className={`flex flex-col items-center justify-center py-3 px-2 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                  category === 'BUG'
                    ? 'border-purple-600 bg-purple-50/50 text-purple-700 ring-1 ring-purple-600 shadow-2xs font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Bug className="w-5 h-5 mb-1 text-inherit" />
                <span>Bug</span>
              </button>

              {/* Idea */}
              <button
                type="button"
                onClick={() => setCategory('IDEA')}
                className={`flex flex-col items-center justify-center py-3 px-2 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                  category === 'IDEA'
                    ? 'border-purple-600 bg-purple-50/50 text-purple-700 ring-1 ring-purple-600 shadow-2xs font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Lightbulb className="w-5 h-5 mb-1 text-inherit" />
                <span>Idea</span>
              </button>

              {/* Help */}
              <button
                type="button"
                onClick={() => setCategory('HELP')}
                className={`flex flex-col items-center justify-center py-3 px-2 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                  category === 'HELP'
                    ? 'border-purple-600 bg-purple-50/50 text-purple-700 ring-1 ring-purple-600 shadow-2xs font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <HelpCircle className="w-5 h-5 mb-1 text-inherit" />
                <span>Help</span>
              </button>

              {/* Rating */}
              <button
                type="button"
                onClick={() => setCategory('RATING')}
                className={`flex flex-col items-center justify-center py-3 px-2 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                  category === 'RATING'
                    ? 'border-purple-600 bg-purple-50/50 text-purple-700 ring-1 ring-purple-600 shadow-2xs font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Star className="w-5 h-5 mb-1 text-inherit" />
                <span>Rating</span>
              </button>

            </div>
          </div>

          {/* 2. Conditional Secondary Selector */}
          {(category === 'BUG' || category === 'HELP') && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="text-xs font-medium text-slate-700">Severity / Priority</label>
              <div className="grid grid-cols-4 gap-2">
                {(['Low', 'Medium', 'High', 'Urgent'] as SeverityPriority[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setSeverity(level)}
                    className={`py-2 text-xs rounded-sm font-medium border transition-all text-center cursor-pointer ${
                      severity === level
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}

          {category === 'RATING' && (
            <div className="space-y-1.5 animate-in fade-in duration-150">
              <label className="text-xs font-medium text-slate-700">Overall Satisfaction</label>
              <div className="flex items-center space-x-2 py-1">
                <div className="flex items-center space-x-1.5">
                  {[1, 2, 3, 4, 5].map((starIndex) => {
                    const isFilled = starIndex <= (hoverRating || rating);
                    return (
                      <button
                        key={starIndex}
                        type="button"
                        onMouseEnter={() => setHoverRating(starIndex)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(starIndex)}
                        className="text-amber-400 hover:scale-110 transition-transform p-0.5 focus:outline-none cursor-pointer"
                      >
                        <Star 
                          className={`w-6 h-6 ${isFilled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} 
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs font-medium text-slate-600 pl-2">
                  {getRatingLabel(hoverRating || rating)}
                </span>
              </div>
            </div>
          )}

          {/* 3. Subject / Summary */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Subject / Summary</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={getSubjectPlaceholder()}
              className="w-full px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-purple-600 shadow-2xs"
            />
          </div>

          {/* 4. Details * */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">
              Details <span className="text-red-500">*</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={getDetailsPlaceholder()}
              rows={3}
              required
              className="w-full px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-purple-600 resize-none shadow-2xs"
            />
          </div>

          {/* 5. Attach Screenshot (Optional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 flex items-center space-x-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                <span>Attach Screenshot <span className="text-slate-400 font-normal">(Optional)</span></span>
              </span>
              <span className="text-purple-600 text-[11px] font-medium">
                or paste with ⌘V / Ctrl+V
              </span>
            </div>

            {screenshot ? (
              <div className="relative border border-slate-200 rounded-md p-2 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img src={screenshot} alt="Screenshot preview" className="w-14 h-14 object-cover rounded-md border border-slate-200" />
                  <div className="text-xs">
                    <p className="font-medium text-slate-800">Screenshot Attached</p>
                    <p className="text-[11px] text-slate-400">Ready to transmit with incident</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  className="p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-white transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-md p-4 text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center space-y-1">
                  <div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-2xs">
                    <Upload className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-slate-700">Click to upload or paste screenshot</p>
                  <p className="text-[11px] text-slate-400">PNG, JPG, WebP supported up to 10MB</p>
                </div>
              </div>
            )}
          </div>

          {/* 6. Auto-Captured System Telemetry Accordion */}
          <div className="border border-slate-200 rounded-md overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setIsTelemetryOpen(!isTelemetryOpen)}
              className="w-full px-3.5 py-2.5 bg-slate-50 flex items-center justify-between text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Monitor className="w-4 h-4 text-purple-600" />
                <span className="font-medium">Auto-Captured System Telemetry</span>
              </div>
              {isTelemetryOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {isTelemetryOpen && (
              <div className="p-3.5 bg-white border-t border-slate-200 space-y-3 animate-in fade-in duration-150">
                {/* Product / Domain Simulator Switcher */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    Simulate Client Product & Domain Origin:
                  </label>
                  <select
                    value={simulatedProduct}
                    onChange={(e) => setSimulatedProduct(e.target.value as any)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-md p-2 text-slate-800 focus:outline-none focus:border-purple-600"
                  >
                    <option value="checkout">Acme Payments (checkout.acme.com)</option>
                    <option value="merchant">Acme Payments (merchant.acme.com)</option>
                    <option value="medsync">MedSync Healthcare (portal.medsync.io)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 bg-slate-50 p-2.5 rounded-md border border-slate-100">
                  <div>
                    <span className="text-slate-400">Domain:</span> {currentConfig.domain}
                  </div>
                  <div>
                    <span className="text-slate-400">Viewport:</span> {window.innerWidth}x{window.innerHeight}
                  </div>
                  <div className="col-span-2 truncate">
                    <span className="text-slate-400">Route:</span> {currentConfig.url}
                  </div>
                  <div className="col-span-2 truncate">
                    <span className="text-slate-400">Key:</span> {currentConfig.key}
                  </div>
                </div>
              </div>
            )}
          </div>

          </div>

          {/* Modal Footer - Fixed at bottom */}
          <div className="px-6 py-3.5 flex items-center justify-end space-x-2.5 border-t border-slate-100 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-[#0066FF] hover:bg-blue-600 text-white text-xs font-semibold rounded-md shadow-xs flex items-center space-x-2 disabled:opacity-50 transition-all cursor-pointer active:scale-[0.98]"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Sending...' : 'Send Feedback'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
