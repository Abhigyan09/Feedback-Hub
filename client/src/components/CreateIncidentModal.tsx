import React, { useState, useEffect } from 'react';
import { CustomSelect } from './CustomSelect';
import { safeArray } from '../utils/edgeCaseHelpers';
import { TeamMember, TicketCategory, TicketSeverity } from '../types';
import { X, Plus, AlertCircle, Cpu, Bug, Layout, ShieldAlert } from 'lucide-react';

interface CreateIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamMembers: Array<{ id: string; name: string; role: string }>;
  onCreateTicket: (ticketData: {
    title: string;
    description: string;
    category: TicketCategory;
    severity: TicketSeverity;
    assigned_to?: string;
    assigned_to_name?: string;
    reporter_email?: string;
  }) => Promise<void>;
}

export const CreateIncidentModal: React.FC<CreateIncidentModalProps> = ({
  isOpen,
  onClose,
  teamMembers = [],
  onCreateTicket
}) => {
  const safeTeam = safeArray(teamMembers);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('BUG');
  const [severity, setSeverity] = useState<TicketSeverity>('HIGH');
  const [assigneeId, setAssigneeId] = useState<string>('UNASSIGNED');
  const [reporterEmail, setReporterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close dialog on Escape key press (Nested Dialog ESC Dismiss)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    const assignedMember = safeTeam.find(m => m.id === assigneeId);

    try {
      await onCreateTicket({
        title: title.trim(),
        description: description.trim() || 'Ingested dynamically via Feedback-Hub dashboard.',
        category,
        severity,
        assigned_to: assigneeId === 'UNASSIGNED' ? undefined : assigneeId,
        assigned_to_name: assignedMember ? assignedMember.name : undefined,
        reporter_email: reporterEmail.trim() || undefined
      });
      // Reset form
      setTitle('');
      setDescription('');
      setCategory('BUG');
      setSeverity('HIGH');
      setAssigneeId('UNASSIGNED');
      setReporterEmail('');
      onClose();
    } catch (err) {
      console.error('Failed to create ticket:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-modal-title"
    >
      <div className="bg-white border border-slate-200/90 rounded-[16px] w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-poppins relative animate-in fade-in zoom-in-95 duration-150">
        
        {/* Subtle top-right dismiss button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 z-10 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-[8px] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Hero Section (Reference: Soft Gray Inset Rounded Card) */}
        <div className="m-3 p-5 sm:p-6 bg-[#f4f4f5] rounded-[12px] flex flex-col space-y-3 text-left shrink-0">
          {/* Top Icon Badge */}
          <div className="w-9 h-9 rounded-full bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 shadow-2xs">
            <Plus className="w-4 h-4 text-slate-700 stroke-[2.2]" />
          </div>

          {/* Heading and Description */}
          <div className="space-y-1">
            <h2 id="create-modal-title" className="text-xl sm:text-2xl font-medium text-slate-900 tracking-tight leading-snug">
              Create incident
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
              Record a new bug, telemetry failure, or operational event to the live backend API.
            </p>
          </div>
        </div>

        {/* Form Body - Independent max-h-[85vh] scrollable container */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 pt-1 space-y-4 text-xs overflow-y-auto max-h-[calc(85vh-140px)]">
          
          {/* Title */}
          <div className="space-y-1.5 text-left">
            <label className="text-slate-700 font-medium text-xs">
              Incident Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Memory leak in WebSocket telemetry relay"
              className="w-full bg-white border border-slate-200 text-slate-800 text-xs px-3.5 py-2.5 rounded-[8px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all font-normal shadow-2xs"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5 text-left">
            <label className="text-slate-700 font-medium text-xs">
              Technical Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe reproducing steps, observed errors, and impact..."
              className="w-full bg-white border border-slate-200 text-slate-800 text-xs p-3 rounded-[8px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all resize-none font-normal shadow-2xs"
            />
          </div>

          {/* Category & Severity Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div className="space-y-1.5">
              <label className="text-slate-700 font-medium text-xs">
                Category
              </label>
              <CustomSelect
                fullWidth
                value={category}
onChange={(val: string) => setCategory(val as TicketCategory)}
                options={[
                  { value: 'BUG', label: 'Bug' },
                  { value: 'IDEA', label: 'Idea' },
                  { value: 'HELP', label: 'Help' },
                  { value: 'RATING', label: 'Rating' },
                  { value: 'API_FAILURE', label: 'API Failure' },
                  { value: 'PERFORMANCE', label: 'Performance' },
                  { value: 'UI_GLITCH', label: 'UI Glitch' },
                  { value: 'SECURITY', label: 'Security' }
                ]}
                buttonClassName="bg-white border-slate-200 p-2 text-xs rounded-[8px] shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-medium text-xs">
                Severity / Priority
              </label>
              <CustomSelect
                fullWidth
                value={severity}
                onChange={(val: string) => setSeverity(val as TicketSeverity)}
                options={[
                  { value: 'CRITICAL', label: 'Critical (Urgent P0)' },
                  { value: 'HIGH', label: 'High (P1)' },
                  { value: 'MEDIUM', label: 'Medium (P2)' },
                  { value: 'LOW', label: 'Low (P3)' }
                ]}
                buttonClassName="bg-white border-slate-200 p-2 text-xs rounded-[8px] shadow-2xs"
              />
            </div>
          </div>

          {/* Assignee & Reporter Email Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div className="space-y-1.5">
              <label className="text-slate-700 font-medium text-xs">
                Assignee
              </label>
              <CustomSelect
                fullWidth
                value={assigneeId}
                onChange={(val: string) => setAssigneeId(val)}
                disabled={safeTeam.length === 0}
                options={
                  safeTeam.length === 0
                    ? [{ value: 'UNASSIGNED', label: 'No staff available (Unassigned)' }]
                    : [
                        { value: 'UNASSIGNED', label: '-- Unassigned --' },
                        ...safeTeam.map((m) => ({ value: m.id, label: m.name }))
                      ]
                }
                buttonClassName="bg-white border-slate-200 p-2 text-xs rounded-[8px] shadow-2xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-medium text-xs">
                Reporter Email
              </label>
              <input
                type="email"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                placeholder="dev-lead@acme.com"
                className="w-full bg-white border border-slate-200 text-slate-800 text-xs px-3.5 py-2.5 rounded-[8px] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all font-normal shadow-2xs"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="w-full py-3 px-4 bg-[#242426] hover:bg-[#18181b] text-white text-xs font-semibold rounded-[8px] shadow-2xs disabled:opacity-50 transition-all cursor-pointer uppercase tracking-wider"
            >
              {isSubmitting ? 'Creating Incident...' : 'CREATE INCIDENT'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-800 font-normal transition-colors cursor-pointer text-center"
            >
              Cancel and stay on dashboard
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
