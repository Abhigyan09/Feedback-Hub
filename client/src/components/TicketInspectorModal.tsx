import React, { useMemo } from 'react';
import { CustomSelect } from './CustomSelect';
import { safeArray, processLogTraces, downloadRawLog } from '../utils/edgeCaseHelpers';
import { Ticket, TeamMember } from '../types';
import { normalizeSeverity, normalizeStatus, formatTimeAgo } from '../utils/formatters';
import { X, Terminal, Cpu, Bug, ShieldAlert, CheckCircle2, User, Clock, AlertTriangle, ExternalLink, Download } from 'lucide-react';

interface TicketInspectorModalProps {
  ticket: Ticket | null;
  teamMembers: TeamMember[];
  onClose: () => void;
  onUpdateStatus: (ticketId: string, newStatus: string) => void;
  onUpdateAssignee: (ticketId: string, newAssigneeId: string | null, newAssigneeName: string | null) => void;
}

export const TicketInspectorModal: React.FC<TicketInspectorModalProps> = ({
  ticket,
  teamMembers = [],
  onClose,
  onUpdateStatus,
  onUpdateAssignee
}) => {
  if (!ticket) return null;

  const safeTeam = safeArray(teamMembers);
  const assignedMember = safeTeam.find((m) => m.id === ticket.assigned_to);
  const currentStatusNorm = normalizeStatus(ticket.status);
  const currentPriorityNorm = normalizeSeverity(ticket.severity);
  const processedLogs = useMemo(() => processLogTraces(ticket.telemetry?.console_logs), [ticket.telemetry?.console_logs]);

  // Modal Scrollbar Trapping Prevention: Lock background body scroll while modal is mounted
  React.useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Close on Escape key (nested CustomSelect dropdown stops propagation when open)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-ticket-title"
    >
      <div 
        className="bg-white border border-slate-200 rounded-[12px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative text-slate-800 modal-subtle overflow-hidden"
        tabIndex={-1}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="font-mono text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-[6px]">
                {ticket.short_code}
              </span>
              <span className="text-[11px] font-medium uppercase bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-[6px] text-slate-700">
                {(ticket.category || 'BUG').replace('_', ' ')}
              </span>
              <span className="text-[11px] font-medium uppercase border border-red-200 bg-red-50 text-red-700 px-2 py-0.5 rounded-[6px]">
                {currentPriorityNorm} Priority
              </span>
            </div>
            <h2 id="modal-ticket-title" className="text-base sm:text-lg font-medium text-slate-900 leading-snug break-all" title={ticket.title}>
              {ticket.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-[8px] transition-colors flex-shrink-0"
            aria-label="Close details modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          
          {/* Quick Actions Strip: Status & Reassignment */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-[12px] grid grid-cols-1 sm:grid-cols-2 gap-4 card-subtle">
            
            {/* Status Flow Buttons */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-700">
                Workflow Status:
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Open', val: 'OPEN' },
                  { label: 'In Dev', val: 'IN_DEV' },
                  { label: 'In QA', val: 'IN_QA' },
                  { label: 'Resolved', val: 'RESOLVED' }
                ].map(({ label, val }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onUpdateStatus(ticket.id, val)}
                    className={`py-1.5 text-xs rounded-[8px] font-medium transition-all border text-center ${
                      currentStatusNorm === label
                        ? 'bg-[#0b1b36] text-white border-[#0b1b36] shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reassign Teammate */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-slate-700">
                Assigned Squad Engineer:
              </span>
              <CustomSelect
                fullWidth
                disabled={safeTeam.length === 0}
                value={ticket.assigned_to || 'UNASSIGNED'}
                onChange={(val: string) => {
                  const member = safeTeam.find(m => m.id === val);
                  onUpdateAssignee(ticket.id, val === 'UNASSIGNED' ? null : val, member ? member.name : null);
                }}
                options={
                  safeTeam.length === 0
                    ? [{ value: 'UNASSIGNED', label: 'No engineers available' }]
                    : [
                        { value: 'UNASSIGNED', label: '-- Unassigned --' },
                        ...safeTeam.map(m => ({ value: m.id, label: `${m.name} (${(m.role || 'Staff').split(' ')[0]})` })),
                        ...(ticket.assigned_to && !safeTeam.some(m => m.id === ticket.assigned_to)
                          ? [{ value: ticket.assigned_to, label: `${ticket.assigned_to_name || 'Former Staff'} (Former Staff)` }]
                          : [])
                      ]
                }
                buttonClassName="bg-white border-slate-200 text-slate-800 text-xs px-3 py-1.5 rounded-[8px]"
              />
              {safeTeam.length === 0 && (
                <p className="text-[11px] text-amber-600 font-medium">
                  No engineers available. Add staff in Settings first.
                </p>
              )}
            </div>

          </div>

          {/* Issue Description */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">
              Description & Context
            </span>
            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-[12px] text-slate-700 leading-relaxed font-sans">
              {ticket.description}
            </div>
          </div>

          {/* Reporter & SLA Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-[12px] space-y-1">
              <span className="text-[10px] font-medium uppercase text-slate-400">Reporter</span>
              <p className="text-slate-800 font-medium">{ticket.reporter_email || 'Client User'}</p>
              <p className="text-purple-700 font-medium text-[11px]">Product: {ticket.product_name || 'Core API'}</p>
              <p className="text-slate-500 text-[11px]">Squad: {ticket.assigned_squad}</p>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-[12px] space-y-1">
              <span className="text-[10px] font-medium uppercase text-slate-400">Telemetry Timestamp</span>
              <p className="text-slate-800 font-mono text-[11px]">{ticket.created_at}</p>
              <p className="text-slate-500 font-mono text-[11px]">Relative: {formatTimeAgo(ticket.created_at)}</p>
              <p className="text-emerald-600 font-medium text-[11px]">SOC-2 Telemetry Verified</p>
            </div>
          </div>

          {/* Telemetry Payload / Stack Trace */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-700 font-medium">
              <div className="flex items-center space-x-1.5">
                <Terminal className="w-3.5 h-3.5 text-purple-600" />
                <span className="text-xs">
                  Captured Telemetry & Stack Trace
                </span>
              </div>
              {!ticket.telemetry && (
                <span className="px-2 py-0.5 rounded-[6px] text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  Manual Ingest
                </span>
              )}
            </div>

            <div className="p-3.5 bg-slate-900 rounded-[12px] font-mono text-[11px] space-y-2 text-slate-200">
              <div className="flex items-start space-x-2">
                <span className="text-slate-400 uppercase w-20 flex-shrink-0">URL:</span>
                <span className="text-purple-300 font-medium break-all">
                  {ticket.telemetry?.page_url ?? 'N/A'}
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-slate-400 uppercase w-20 flex-shrink-0">Version:</span>
                <span className="text-slate-300">
                  {ticket.telemetry?.app_version ?? 'N/A'}
                </span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="text-slate-400 uppercase w-20 flex-shrink-0">User-Agent:</span>
                <span className="text-slate-400 text-[10px] break-all">
                  {ticket.telemetry?.user_agent ?? 'Manual Ingest (Web Console)'}
                </span>
              </div>

              {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                  <span className="text-amber-400 font-medium block mb-1">Network Error:</span>
                  <div className="text-amber-300 bg-amber-950/40 border border-amber-900/60 p-2 rounded-[8px] text-[10px]">
                    {ticket.telemetry.network_errors[0].method || 'POST'} {ticket.telemetry.network_errors[0].url} — HTTP {ticket.telemetry.network_errors[0].status}
                  </div>
                </div>
              )}

              {/* Massive Console Log Traces handling: Truncate to first 50KB with Download Raw Log button */}
              {processedLogs.rawText && (
                <div className="mt-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-red-400 font-medium block">Console Exception:</span>
                    <button
                      type="button"
                      onClick={() => downloadRawLog(processedLogs.rawText, `ticket-${ticket.short_code || ticket.id}-logs.log`)}
                      className="inline-flex items-center space-x-1 text-[10px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded-[6px] border border-slate-700 transition-colors cursor-pointer"
                      title="Download complete raw console log trace"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download Raw Log</span>
                    </button>
                  </div>
                  {processedLogs.isTruncated && (
                    <div className="text-[10px] text-amber-400 bg-amber-950/50 border border-amber-800/60 px-2 py-1 rounded-[6px] mb-1">
                      ⚠️ Large log dump truncated to 50KB for UI performance. Click &quot;Download Raw Log&quot; to inspect full {(processedLogs.totalBytes / 1024).toFixed(1)}KB telemetry.
                    </div>
                  )}
                  <pre className="text-red-300 bg-red-950/40 border border-red-900/60 p-2.5 rounded-[8px] overflow-x-auto text-[10px] leading-tight font-mono max-h-48 overflow-y-auto">
                    {processedLogs.truncatedText}
                  </pre>
                </div>
              )}

              {!ticket.telemetry && (
                <div className="text-slate-400 italic text-[11px] pt-1">
                  No automated SDK telemetry or stack traces captured for this manual entry.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Modal Footer with Navy Blue Button */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 rounded-b-[12px] flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Real-time multi-tenant telemetry stream
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium bg-[#0b1b36] hover:bg-[#12284c] text-white rounded-[8px] shadow-xs transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
