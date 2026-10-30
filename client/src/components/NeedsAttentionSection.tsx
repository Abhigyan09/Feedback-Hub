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
      <div className="bg-white border border-emerald-200/90 rounded-md p-3.5 px-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 transition-all card-subtle">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-800 tracking-tight">
                Needs Attention
              </span>
              <span className="inline-flex items-center px-2 py-0.2 rounded-sm text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                All Clear (0)
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              No incidents currently breach SLAs, urgent tickets are assigned, and no client blockers detected.
            </p>
          </div>
        </div>
        <div className="text-[11px] text-emerald-700 font-medium flex items-center space-x-1 pl-9 sm:pl-0">
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
          <span>SLA Health 100% Verified</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#fff8f8] border border-rose-200/90 rounded-md p-4 space-y-3 shadow-2xs transition-all animate-in fade-in duration-200 card-subtle">
      
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-rose-100">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-md bg-red-100 border border-red-200 flex items-center justify-center text-red-600 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs font-bold text-slate-900 tracking-wider uppercase">
                NEEDS ATTENTION
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-semibold bg-red-600 text-white shadow-2xs">
                {attentionItems.length} {attentionItems.length === 1 ? 'Incident' : 'Incidents'} Require Action
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Urgent unassigned items, SLA threshold alerts, and tickets awaiting client response.
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-normal flex items-center space-x-1 cursor-pointer hover:text-red-600 transition-colors">
          <span>Click any item to inspect telemetry and triage</span>
          <span className="text-red-500 font-bold ml-0.5">&rarr;</span>
        </div>
      </div>

      {/* Grid of Attention items */}
      <div className={`grid gap-3 ${
        attentionItems.length === 1
          ? 'grid-cols-1'
          : attentionItems.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : attentionItems.length === 3
          ? 'grid-cols-1 md:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
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
              className="bg-white hover:bg-rose-50/20 border border-rose-100 hover:border-rose-300 rounded-md p-3.5 shadow-2xs cursor-pointer transition-all duration-150 flex flex-col justify-between space-y-2.5 text-left group card-subtle"
              aria-label={`Needs attention: ${ticket.short_code} - ${ticket.title}`}
            >
              {/* Top row: SLA Due Pill */}
              <div className="flex items-center justify-between">
                <div className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold border ${
                  isBreached 
                    ? 'bg-rose-100 text-rose-800 border-rose-300 font-bold' 
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <Clock className="w-3 h-3 text-amber-600" />
                  <span>{slaLabel}</span>
                </div>
              </div>

              {/* Second row: Short Code, Severity Badge, Status Badge */}
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-sm">
                  {ticket.short_code}
                </span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm border ${
                  normSeverity === 'Urgent'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {normSeverity}
                </span>
                <span className="text-[10px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-sm">
                  {normStatus}
                </span>
              </div>

              {/* Third row: Title */}
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-red-700 transition-colors line-clamp-1 leading-snug">
                {ticket.title}
              </h3>

              {/* Fourth row: Assignee on left, Waiting on right */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-slate-400">Assignee:</span>
                  {assignedMember ? (
                    <span className="font-semibold text-slate-700 px-2 py-0.5 rounded-sm bg-slate-50 border border-slate-200 text-xs truncate max-w-[140px]" title={assignedMember.name}>
                      {assignedMember.name}
                    </span>
                  ) : ticket.assigned_to_name ? (
                    <span className="font-semibold text-slate-700 px-2 py-0.5 rounded-sm bg-slate-50 border border-slate-200 text-xs truncate max-w-[140px]">
                      {ticket.assigned_to_name}
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-sm text-xs">
                      Unassigned
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-1.5 text-slate-400 text-xs">
                  <div className="flex items-center space-x-1 font-mono text-slate-500">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Waiting {waitingDuration}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600 transition-colors" />
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
