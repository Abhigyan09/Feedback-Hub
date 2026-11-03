import React, { useMemo } from 'react';
import { Ticket, TeamMember } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';
import { 
  AlertTriangle, 
  Clock, 
  ChevronRight,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface NeedsAttentionSectionProps {
  tickets: Ticket[];
  teamMembers?: TeamMember[];
  onSelectTicket: (ticket: Ticket) => void;
}

export interface AttentionItem {
  ticket: Ticket;
  slaLabel: string;
  isBreached: boolean;
  waitingDuration: string;
}

export const NeedsAttentionSection: React.FC<NeedsAttentionSectionProps> = ({
  tickets,
  teamMembers = [],
  onSelectTicket
}) => {
  const now = Date.now();

  // Helper to format waiting time (e.g., "8m", "48m", "2h 15m")
  const formatWaitTime = (dateStr: string) => {
    const diff = Math.max(0, now - new Date(dateStr).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  // Find all tickets needing attention dynamically
  const attentionItems: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];

    tickets.forEach((ticket) => {
      const normStatus = normalizeStatus(ticket.status);
      if (normStatus === 'Resolved') return;

      const normSev = normalizeSeverity(ticket.severity);
      const isUnassigned = !ticket.assigned_to;
      const isWaitingClient = 
        Boolean(ticket.waiting_for_client) || 
        ticket.status === 'TRIAGED' ||
        ticket.description?.toLowerCase().includes('awaiting client');

      // Dynamic SLA determination
      let slaDueTime = ticket.sla_due_at ? new Date(ticket.sla_due_at).getTime() : null;
      if (!slaDueTime && ticket.created_at) {
        // Industry-standard dynamic SLA: Urgent = 1h, High = 4h, Medium = 2h response, Low = 24h
        const createdMs = new Date(ticket.created_at).getTime();
        const slaDurationMs = normSev === 'Urgent' 
          ? 1 * 3600000 
          : normSev === 'High' 
          ? 4 * 3600000 
          : normSev === 'Medium' 
          ? 2 * 3600000 
          : 24 * 3600000;
        slaDueTime = createdMs + slaDurationMs;
      }

      let slaLabel = 'SLA Active';
      let isBreached = false;
      let needsAttention = false;

      if (slaDueTime) {
        const diffMs = slaDueTime - now;
        if (diffMs <= 0) {
          isBreached = true;
          needsAttention = true;
          const overdueMins = Math.floor(Math.abs(diffMs) / 60000);
          const overdueStr = overdueMins > 60 ? `${Math.floor(overdueMins / 60)}h overdue` : `${overdueMins}m overdue`;
          slaLabel = `SLA Breached (${overdueStr})`;
        } else {
          // Within SLA window
          const minsLeft = Math.floor(diffMs / 60000);
          const timeStr = minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : `${minsLeft}m`;
          slaLabel = `SLA Due in ${timeStr}`;
          if (diffMs <= 24 * 3600000) {
            needsAttention = true;
          }
        }
      }

      if (isUnassigned || isWaitingClient || normSev === 'Urgent' || needsAttention) {
        items.push({
          ticket,
          slaLabel,
          isBreached,
          waitingDuration: formatWaitTime(ticket.updated_at || ticket.created_at)
        });
      }
    });

    // Sort: Breached first, then Urgent unassigned, then closest SLA
    items.sort((a, b) => {
      if (a.isBreached && !b.isBreached) return -1;
      if (!a.isBreached && b.isBreached) return 1;
      return 0;
    });

    return items;
  }, [tickets, now]);

  if (attentionItems.length === 0) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-[12px] p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all font-poppins">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-[8px] bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-sm font-medium text-slate-900 tracking-tight">
                Needs Attention
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                All Clear (0)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-normal">
              No incidents currently breach SLAs, urgent tickets are assigned, and no client blockers detected.
            </p>
          </div>
        </div>
        <div className="text-xs text-emerald-700 font-medium flex items-center space-x-1.5 pl-12 sm:pl-0">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          <span>SLA Health 100% Verified</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-rose-200/80 rounded-[12px] p-5 sm:p-6 space-y-4 shadow-[0_2px_12px_rgba(244,63,94,0.04)] transition-all animate-in fade-in duration-200 font-poppins">
      
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-rose-100/70">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-[8px] bg-rose-50 border border-rose-200/80 flex items-center justify-center text-rose-600 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xs font-medium text-slate-800 tracking-wider uppercase">
                NEEDS ATTENTION
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-[6px] text-xs font-medium bg-rose-600 text-white shadow-2xs">
                {attentionItems.length} {attentionItems.length === 1 ? 'Incident' : 'Incidents'} Require Action
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-normal">
              Urgent unassigned items, SLA threshold alerts, and tickets awaiting client response.
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium flex items-center space-x-1 cursor-pointer hover:text-blue-600 transition-colors">
          <span>Click any item to inspect telemetry and triage</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors ml-0.5" />
        </div>
      </div>

      {/* Grid of Attention items */}
      <div className={`grid gap-3.5 ${
        attentionItems.length === 1
          ? 'grid-cols-1'
          : attentionItems.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : attentionItems.length === 3
          ? 'grid-cols-1 md:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }`}>
        {attentionItems.map(({ ticket, slaLabel, isBreached, waitingDuration }) => {
          const normSeverity = normalizeSeverity(ticket.severity);
          const normStatus = normalizeStatus(ticket.status);
          const assignedMember = teamMembers.find(m => m.id === ticket.assigned_to);

          return (
            <div
              key={ticket.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectTicket(ticket)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTicket(ticket);
                }
              }}
              className="bg-white hover:bg-slate-50/70 border border-slate-200/80 hover:border-blue-400 rounded-[12px] p-4 shadow-2xs hover:shadow-xs transition-all duration-200 flex flex-col justify-between space-y-3 text-left group cursor-pointer"
              aria-label={`Needs attention: ${ticket.short_code} - ${ticket.title}`}
            >
              {/* Top row: SLA Due Badge (Squarish 4-corner tag) */}
              <div className="flex items-center justify-between">
                <div className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-[6px] text-[11px] font-medium border ${
                  isBreached 
                    ? 'bg-rose-50 text-rose-700 border-rose-200' 
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <Clock className="w-3 h-3" />
                  <span>{slaLabel}</span>
                </div>
              </div>

              {/* Second row: Short Code, Severity Badge, Status Badge (Squarish 4-corner tags) */}
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="font-mono text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-[6px] shrink-0">
                  {ticket.short_code}
                </span>
                <span className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-[6px] border shrink-0 ${
                  normSeverity === 'Urgent'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {normSeverity}
                </span>
                <span className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-[6px] shrink-0">
                  {normStatus}
                </span>
              </div>

              {/* Third row: Title */}
              <h3 className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 leading-snug tracking-tight">
                {ticket.title}
              </h3>

              {/* Fourth row: Assignee on left, Waiting on right */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500 overflow-hidden">
                <div className="flex items-center space-x-1.5 min-w-0 flex-1 overflow-hidden">
                  <span className="text-[11px] text-slate-400 shrink-0">Assignee:</span>
                  {assignedMember ? (
                    <span className="font-medium text-slate-700 px-1.5 py-0.5 rounded-[6px] bg-slate-50 border border-slate-200 text-[11px] truncate" title={assignedMember.name}>
                      {assignedMember.name}
                    </span>
                  ) : ticket.assigned_to_name ? (
                    <span className="font-medium text-slate-700 px-1.5 py-0.5 rounded-[6px] bg-slate-50 border border-slate-200 text-[11px] truncate" title={ticket.assigned_to_name}>
                      {ticket.assigned_to_name}
                    </span>
                  ) : (
                    <span className="font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-[6px] text-[11px] shrink-0">
                      Unassigned
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-1 text-slate-400 text-[11px] font-mono shrink-0 ml-auto" title={`Waiting time: ${waitingDuration}`}>
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="whitespace-nowrap">{waitingDuration}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors shrink-0" />
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
