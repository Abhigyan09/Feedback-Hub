import React, { useMemo } from 'react';
import { Ticket, TeamMember } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';
import { 
  AlertTriangle, 
  Clock, 
  UserX, 
  MessageSquare, 
  Flame, 
  CheckCircle2, 
  ChevronRight,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface NeedsAttentionSectionProps {
  tickets: Ticket[];
  teamMembers?: TeamMember[];
  onSelectTicket: (ticket: Ticket) => void;
}

export type AttentionReason = {
  type: 'urgent_unassigned' | 'sla_breached' | 'sla_approaching' | 'client_response';
  label: string;
  badgeClass: string;
  icon: React.ComponentType<{ className?: string }>;
};

export interface AttentionItem {
  ticket: Ticket;
  reasons: AttentionReason[];
  waitingDuration: string;
}

export const NeedsAttentionSection: React.FC<NeedsAttentionSectionProps> = ({
  tickets,
  teamMembers = [],
  onSelectTicket
}) => {
  const now = Date.now();

  // Helper to format waiting time (e.g., "48m", "2h 15m")
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

  // Find all tickets needing attention
  const attentionItems: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];

    tickets.forEach((ticket) => {
      const normStatus = normalizeStatus(ticket.status);
      if (normStatus === 'Resolved') return;

      const normSev = normalizeSeverity(ticket.severity);
      const isUnassigned = !ticket.assigned_to;
      const reasons: AttentionReason[] = [];

      // 1. Urgent and unassigned
      if (normSev === 'Urgent' && isUnassigned) {
        reasons.push({
          type: 'urgent_unassigned',
          label: 'Urgent & Unassigned',
          badgeClass: 'bg-red-50 text-red-700 border-red-200',
          icon: UserX
        });
      }

      // 2. Approaching or breaching their SLA
      if (ticket.sla_due_at) {
        const dueTime = new Date(ticket.sla_due_at).getTime();
        const diffMs = dueTime - now;

        if (diffMs <= 0) {
          const overdueMins = Math.floor(Math.abs(diffMs) / 60000);
          const overdueStr = overdueMins > 60 ? `${Math.floor(overdueMins / 60)}h overdue` : `${overdueMins}m overdue`;
          reasons.push({
            type: 'sla_breached',
            label: `SLA Breached (${overdueStr})`,
            badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
            icon: Flame
          });
        } else if (diffMs <= 2 * 60 * 60 * 1000) { // Within 2 hours
          const minsLeft = Math.floor(diffMs / 60000);
          const timeStr = minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : `${minsLeft}m`;
          reasons.push({
            type: 'sla_approaching',
            label: `SLA Due in ${timeStr}`,
            badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
            icon: Clock
          });
        }
      }

      // 3. Waiting for a client response
      const isWaitingClient = 
        Boolean(ticket.waiting_for_client) || 
        ticket.status === 'TRIAGED' ||
        ticket.description?.toLowerCase().includes('awaiting client');

      if (isWaitingClient) {
        reasons.push({
          type: 'client_response',
          label: 'Awaiting Client Reply',
          badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: MessageSquare
        });
      }

      if (reasons.length > 0) {
        items.push({
          ticket,
          reasons,
          waitingDuration: formatWaitTime(ticket.updated_at || ticket.created_at)
        });
      }
    });

    // Sort: SLA Breached first, then Urgent & unassigned, then others
    items.sort((a, b) => {
      const aBreached = a.reasons.some(r => r.type === 'sla_breached') ? 2 : 0;
      const bBreached = b.reasons.some(r => r.type === 'sla_breached') ? 2 : 0;
      const aUrgent = a.reasons.some(r => r.type === 'urgent_unassigned') ? 1 : 0;
      const bUrgent = b.reasons.some(r => r.type === 'urgent_unassigned') ? 1 : 0;
      return (bBreached + bUrgent) - (aBreached + aUrgent);
    });

    return items;
  }, [tickets, now]);

  if (attentionItems.length === 0) {
    return (
      <div className="bg-white border border-emerald-200/80 rounded-[2px] p-3.5 px-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 transition-all">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-[2px] bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-800 tracking-tight">
                Needs Attention
              </span>
              <span className="inline-flex items-center px-2 py-0.2 rounded-[2px] text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
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
    <div className="bg-gradient-to-r from-red-50/70 via-amber-50/40 to-white border border-red-200/90 rounded-[2px] p-4 shadow-[0_2px_4px_rgba(239,68,68,0.06)] space-y-3 transition-all animate-in fade-in duration-200">
      
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-red-100">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-[2px] bg-red-100 border border-red-300 flex items-center justify-center text-red-600 flex-shrink-0 shadow-2xs">
            <AlertTriangle className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Needs Attention
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-[2px] text-[11px] font-bold bg-red-600 text-white shadow-2xs animate-pulse">
                {attentionItems.length} {attentionItems.length === 1 ? 'Incident' : 'Incidents'} Require Action
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Urgent unassigned items, SLA threshold alerts, and tickets awaiting client response.
            </p>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-medium flex items-center space-x-1">
          <span>Click any item to inspect telemetry and triage</span>
          <ArrowRight className="w-3.5 h-3.5 text-red-500" />
        </div>
      </div>

      {/* Grid of Attention items - Stretches dynamically edge-to-edge */}
      <div className={`grid gap-3.5 ${
        attentionItems.length === 1
          ? 'grid-cols-1'
          : attentionItems.length === 2
          ? 'grid-cols-1 md:grid-cols-2'
          : attentionItems.length === 3
          ? 'grid-cols-1 md:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      }`}>
        {attentionItems.map(({ ticket, reasons, waitingDuration }) => {
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
              className="bg-white hover:bg-red-50/20 border border-red-200/80 hover:border-red-400 rounded-[2px] p-3 shadow-xs hover:shadow-md cursor-pointer transition-all duration-150 flex flex-col justify-between space-y-2.5 group text-left"
              aria-label={`Needs attention: ${ticket.short_code} - ${ticket.title}`}
            >
              {/* Top row: Badges for attention reasons */}
              <div className="flex items-center flex-wrap gap-1.5">
                {reasons.map((r, i) => {
                  const Icon = r.icon;
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-[2px] text-[10px] font-bold border shadow-2xs ${r.badgeClass}`}
                    >
                      <Icon className="w-3 h-3 flex-shrink-0" />
                      <span>{r.label}</span>
                    </span>
                  );
                })}
              </div>

              {/* Middle: ID + Short Title */}
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded-[2px]">
                    {ticket.short_code}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded-[2px] border ${
                    normSeverity === 'Urgent'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {normSeverity}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded-[2px]">
                    {normStatus}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-red-700 transition-colors line-clamp-2 leading-snug">
                  {ticket.title}
                </h3>
              </div>

              {/* Bottom Row: Assignee + Waiting Time + Quick Action */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                <div className="flex items-center space-x-1.5 truncate max-w-[140px]">
                  <span className="text-[10px] text-slate-400">Assignee:</span>
                  {assignedMember ? (
                    <span className="font-semibold text-slate-700 truncate" title={assignedMember.name}>
                      {assignedMember.name}
                    </span>
                  ) : ticket.assigned_to_name ? (
                    <span className="font-semibold text-slate-700 truncate">
                      {ticket.assigned_to_name}
                    </span>
                  ) : (
                    <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded-[1px] text-[10px]">
                      Unassigned
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0">
                  <div className="flex items-center space-x-1 text-slate-600 font-mono text-[10px] bg-slate-50 px-1.5 py-0.5 rounded-[2px] border border-slate-200" title="Time waiting in current status">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Waiting {waitingDuration}</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-600 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
