import React, { useState } from 'react';
import { Ticket, TicketSeverity, TicketStatus, UserRole } from '../types';
import { AlertCircle, Clock, CheckCircle2, Terminal, User, ArrowRight, Bug, Cpu, Layout, HelpCircle } from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  currentRole: UserRole;
  isLoading: boolean;
}

export const TicketList: React.FC<TicketListProps> = ({
  tickets,
  onSelectTicket,
  currentRole,
  isLoading
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filteredTickets = tickets.filter(t => {
    if (filterStatus === 'ALL') return true;
    return t.status === filterStatus;
  });

  const getSeverityBadge = (severity: TicketSeverity) => {
    switch (severity) {
      case 'BLOCKER':
      case 'CRITICAL':
        return 'bg-red-950/80 text-red-400 border-red-800';
      case 'HIGH':
        return 'bg-amber-950/80 text-amber-400 border-amber-800';
      case 'MEDIUM':
        return 'bg-blue-950/80 text-blue-400 border-blue-800';
      default:
        return 'bg-neutral-900 text-neutral-400 border-neutral-700';
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'OPEN':
        return 'text-amber-400 border-amber-800/80 bg-amber-950/30';
      case 'IN_DEV':
        return 'text-indigo-400 border-indigo-800/80 bg-indigo-950/30';
      case 'IN_QA':
        return 'text-purple-400 border-purple-800/80 bg-purple-950/30';
      case 'RESOLVED':
      case 'CLOSED':
        return 'text-emerald-400 border-emerald-800/80 bg-emerald-950/30';
      default:
        return 'text-neutral-400 border-neutral-800 bg-neutral-950/30';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'API_FAILURE':
        return <Cpu className="w-3.5 h-3.5 text-red-400" />;
      case 'BUG':
        return <Bug className="w-3.5 h-3.5 text-amber-400" />;
      case 'UI_GLITCH':
        return <Layout className="w-3.5 h-3.5 text-blue-400" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Bar Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#27272a] pb-4">
        <div className="flex items-center space-x-2">
          {['ALL', 'OPEN', 'IN_DEV', 'RESOLVED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1 text-xs font-mono tracking-wide transition-all border ${
                filterStatus === status
                  ? 'bg-neutral-100 text-neutral-900 border-white font-semibold'
                  : 'bg-[#121215] text-neutral-400 border-[#27272a] hover:border-neutral-500'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono text-neutral-400">
          SHOWING <span className="text-white font-bold">{filteredTickets.length}</span> TICKETS
        </div>
      </div>

      {/* Ticket Cards Table */}
      {isLoading ? (
        <div className="p-12 text-center text-xs font-mono text-neutral-500 border border-[#27272a] bg-[#121215]">
          FETCHING TENANT INCIDENTS...
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="p-12 text-center text-xs font-mono text-neutral-500 border border-[#27272a] bg-[#121215]">
          NO TICKETS FOUND IN THIS STATUS FOR THIS TENANT.
        </div>
      ) : (
        <div className="border border-[#27272a] divide-y divide-[#27272a] bg-[#121215]">
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => onSelectTicket(ticket)}
              className="p-4 hover:bg-[#18181b] transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                  {/* Short code */}
                  <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/40 border border-indigo-800/60 px-1.5 py-0.5">
                    {ticket.short_code}
                  </span>

                  {/* Category */}
                  <div className="flex items-center space-x-1 text-[11px] font-mono text-neutral-400">
                    {getCategoryIcon(ticket.category)}
                    <span>{ticket.category}</span>
                  </div>

                  {/* Severity Badge */}
                  <span className={`text-[10px] font-mono font-medium px-2 py-0.5 border ${getSeverityBadge(ticket.severity)}`}>
                    {ticket.severity}
                  </span>

                  {/* Product Tag */}
                  <span className="text-[11px] text-neutral-400 font-mono">
                    [{ticket.product_name || 'App'}]
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors truncate">
                  {ticket.title}
                </h3>

                {/* Subtitle / Reporter */}
                <div className="flex items-center space-x-3 text-xs text-neutral-400">
                  <span>Reported by: <span className="text-neutral-300 font-mono">{ticket.reporter_email}</span></span>
                  <span>•</span>
                  <span>Squad: <span className="text-neutral-300 font-mono">{ticket.assigned_squad}</span></span>
                  {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-red-400 font-mono text-[11px]">
                        {ticket.telemetry.network_errors.length} API ERROR(S) LOGGED
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Status and Action */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                <span className={`text-xs font-mono px-2.5 py-1 border ${getStatusBadge(ticket.status)}`}>
                  • {ticket.status}
                </span>

                <div className="text-neutral-400 group-hover:text-white group-hover:translate-x-0.5 transition-all p-1">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
