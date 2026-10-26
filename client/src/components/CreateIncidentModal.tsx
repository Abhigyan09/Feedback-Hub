import React, { useState } from 'react';
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
  teamMembers,
  onCreateTicket
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>('BUG');
  const [severity, setSeverity] = useState<TicketSeverity>('HIGH');
  const [assigneeId, setAssigneeId] = useState<string>('UNASSIGNED');
  const [reporterEmail, setReporterEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    const assignedMember = teamMembers.find(m => m.id === assigneeId);

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
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-[2px] w-full max-w-lg shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-[2px] bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 id="create-modal-title" className="text-base font-bold text-slate-900">
                Create Live Incident
              </h2>
              <p className="text-xs text-slate-500">
                Record new bug or telemetry event directly to the live backend API.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-[2px] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Incident Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Memory leak in WebSocket telemetry relay"
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs px-3 py-2 rounded-[2px] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              Technical Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe reproducing steps, observed errors, and impact..."
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs p-3 rounded-[2px] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all resize-none"
            />
          </div>

          {/* Category & Severity Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs px-3 py-2 rounded-[2px] font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="BUG">Bug</option>
                <option value="API_FAILURE">API Failure</option>
                <option value="PERFORMANCE">Performance</option>
                <option value="UI_GLITCH">UI Glitch</option>
                <option value="SECURITY">Security</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Severity / Priority
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as TicketSeverity)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs px-3 py-2 rounded-[2px] font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="CRITICAL">Critical (Urgent P0)</option>
                <option value="HIGH">High (P1)</option>
                <option value="MEDIUM">Medium (P2)</option>
                <option value="LOW">Low (P3)</option>
              </select>
            </div>
          </div>

          {/* Assignee & Reporter Email Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs px-3 py-2 rounded-[2px] font-medium focus:outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="UNASSIGNED">-- Unassigned --</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Reporter Email
              </label>
              <input
                type="email"
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                placeholder="dev-lead@acme.com"
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs px-3 py-2 rounded-[2px] focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-[2px] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-4 py-2 text-xs font-semibold bg-[#0b1b36] hover:bg-[#12284c] text-white rounded-[2px] shadow-xs disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'Creating...' : 'Create Incident'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
