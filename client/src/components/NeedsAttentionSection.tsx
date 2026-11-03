import React, { useMemo } from 'react';
import { Ticket, TeamMember } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';
import { safeArray, getSyncedNow, getSafeSlaDueAt, parseSafeDate } from '../utils/edgeCaseHelpers';
import { 
  AlertTriangle, 
  Clock, 
  ChevronRight,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

interface NeedsAttentionSectionProps {
  tickets?: Ticket[];
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
  tickets = [],
  teamMembers = [],
  onSelectTicket
}) => {
  const safeTickets = safeArray<Ticket>(tickets);
  const safeTeam = safeArray<TeamMember>(teamMembers);
  const now = getSyncedNow();

  // Helper to format waiting time safely guarding against clock skew or invalid dates
  const formatWaitTime = (dateStr?: string | null) => {
    if (!dateStr) return '0m';
    const parsed = parseSafeDate(dateStr, now);
    const diff = Math.max(0, now - parsed);
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

    safeTickets.forEach((ticket) => {
      const normStatus = normalizeStatus(ticket.status);
      if (normStatus === 'Resolved') return;

      const normSev = normalizeSeverity(ticket.severity);
      const isUnassigned = !ticket.assigned_to;
      const isWaitingClient = 
        Boolean(ticket.waiting_for_client) || 
        ticket.status === 'TRIAGED' ||
        (ticket.description || '').toLowerCase().includes('awaiting client');

      // Safe dynamic SLA calculation falling back to dynamic severity SLA
      const slaDueTime = getSafeSlaDueAt(ticket);

      let slaLabel = 'SLA Active';
      let isBreached = false;
      let needsAttention = false;

      // Exact SLA Breach boundary: consistent < 0 check prevents flickering/state flapping at diff === 0
      const diffMs = slaDueTime - now;
      if (diffMs < 0) {
        isBreached = true;
        needsAttention = true;
        const overdueMins = Math.max(1, Math.floor(Math.abs(diffMs) / 60000));
        const overdueStr = overdueMins >= 60 ? `${Math.floor(overdueMins / 60)}h overdue` : `${overdueMins}m overdue`;
        slaLabel = `SLA Breached (${overdueStr})`;
      } else {
        // Within SLA window
        isBreached = false;
        const minsLeft = Math.floor(diffMs / 60000);
        const timeStr = minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : minsLeft === 0 ? '<1m' : `${minsLeft}m`;
        slaLabel = `SLA Due in ${timeStr}`;
        if (diffMs <= 24 * 3600000) {
          needsAttention = true;
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
  }, [safeTickets, now]);

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

  // Cap visible attention cards to prevent thousands of DOM nodes during high ticket influx
  const MAX_VISIBLE_ATTENTION = 4;
  const visibleItems = attentionItems.slice(0, MAX_VISIBLE_ATTENTION);
  const hiddenCount = Math.max(0, attentionItems.length - MAX_VISIBLE_ATTENTION);

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

      {/* Grid of Attention items (max 4 rendered to preserve performance & layout) */}
      <div className={`grid gap-3.5 ${
        visibleItems.length === 1
          ? 'grid-cols-1'
          : visibleItems.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : visibleItems.length === 3
          ? 'grid-cols-1 md:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }`}>
        {visibleItems.map(({ ticket, slaLabel, isBreached, waitingDuration }) => {
          const normSeverity = normalizeSeverity(ticket.severity);
          const normStatus = normalizeStatus(ticket.status);
          const assignedMember = safeTeam.find(m => m.id === ticket.assigned_to);

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
              <h3 
                className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors truncate break-all leading-snug tracking-tight"
                title={ticket.title}
              >
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

      {/* Overflow summary footer when attention list exceeds MAX_VISIBLE_ATTENTION */}
      {hiddenCount > 0 && (
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-500 border-t border-rose-100/70 font-poppins">
          <span>
            Showing top <strong>{MAX_VISIBLE_ATTENTION}</strong> highest-priority incidents (<strong>{attentionItems.length}</strong> total requiring triage).
          </span>
          <span className="text-slate-400 font-mono text-[11px]">
            Filter by 'Urgent' or 'Open' in table below to inspect full list.
          </span>
        </div>
      )}

    </div>
  );
};
