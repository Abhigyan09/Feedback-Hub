import React, { useState } from 'react';
import { Ticket, TicketSeverity, TicketStatus, UserRole } from '../types';
import { 
  Bug, 
  Lightbulb, 
  HelpCircle, 
  Star, 
  Globe, 
  ArrowRight, 
  Image as ImageIcon, 
  Cpu, 
  Clock,
  Trash2,
  Search,
  CheckCircle2,
  Sparkles,
  User
} from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  currentRole: UserRole;
  isLoading: boolean;
  onOpenWidgetSimulator?: () => void;
  onUpdateStatus?: (ticketId: string, status: string) => Promise<void>;
  onDeleteTicket?: (ticketId: string) => Promise<void>;
}

export const TicketList: React.FC<TicketListProps> = ({
  tickets,
  onSelectTicket,
  currentRole,
  isLoading,
  onOpenWidgetSimulator,
  onUpdateStatus,
  onDeleteTicket
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  const filteredTickets = tickets.filter(t => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchCode = t.short_code.toLowerCase().includes(q);
      const matchReporter = t.reporter_email.toLowerCase().includes(q);
      const matchSquad = t.assigned_squad.toLowerCase().includes(q);
      if (!matchTitle && !matchCode && !matchReporter && !matchSquad) return false;
    }

    // Status filter
    if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;

    // Assignee filter
    if (filterAssignee === 'UNASSIGNED' && t.assigned_to) return false;
    if (filterAssignee !== 'ALL' && filterAssignee !== 'UNASSIGNED') {
      if (t.assigned_to !== filterAssignee && t.assigned_to_name !== filterAssignee) return false;
    }

    // Priority / Severity filter
    if (filterPriority !== 'ALL' && t.severity !== filterPriority) return false;

    // Category filter
    if (filterCategory !== 'ALL' && t.category !== filterCategory) return false;

    return true;
  });

  const getSeverityBadge = (severity: TicketSeverity) => {
    switch (severity) {
      case 'URGENT':
      case 'BLOCKER':
      case 'CRITICAL':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'HIGH':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case 'OPEN':
        return 'text-amber-800 border-amber-200 bg-amber-50';
      case 'IN_DEV':
        return 'text-indigo-800 border-indigo-200 bg-indigo-50';
      case 'IN_QA':
        return 'text-purple-800 border-purple-200 bg-purple-50';
      case 'RESOLVED':
      case 'CLOSED':
        return 'text-emerald-800 border-emerald-200 bg-emerald-50';
      default:
        return 'text-slate-700 border-slate-200 bg-slate-50';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'BUG':
        return <Bug className="w-3.5 h-3.5 text-amber-600" />;
      case 'IDEA':
        return <Lightbulb className="w-3.5 h-3.5 text-blue-600" />;
      case 'HELP':
        return <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />;
      case 'RATING':
        return <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />;
      case 'API_FAILURE':
        return <Cpu className="w-3.5 h-3.5 text-red-600" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4 select-none">
      
      {/* Search & Filter Bar (Matching Reference Image) */}
      <div className="bg-white border border-slate-200 p-3 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Input Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tickets by title, ID (e.g. FH-402), or reporter..."
              className="w-full bg-[#f8fafc] border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Filter Dropdowns Strip */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2 text-xs">
            
            {/* Status Dropdown */}
            <div className="flex items-center space-x-1 bg-white border border-slate-200 px-2.5 py-1.5 shadow-2xs">
              <span className="text-slate-500 text-[11px]">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_DEV">In Dev</option>
                <option value="IN_QA">In QA</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            {/* Assignee Dropdown */}
            <div className="flex items-center space-x-1 bg-white border border-slate-200 px-2.5 py-1.5 shadow-2xs">
              <span className="text-slate-500 text-[11px]">Assignee:</span>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Assignees</option>
                <option value="UNASSIGNED">Unassigned</option>
                <option value="user-dev-01">Rahul Sharma</option>
                <option value="user-dev-02">Priya Nair</option>
                <option value="user-dev-03">Amit Patel</option>
                <option value="user-lead-01">Vikram Mehta</option>
              </select>
            </div>

            {/* Priority / Severity Dropdown */}
            <div className="flex items-center space-x-1 bg-white border border-slate-200 px-2.5 py-1.5 shadow-2xs">
              <span className="text-slate-500 text-[11px]">Priority:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent (P0)</option>
                <option value="HIGH">High (P1)</option>
                <option value="MEDIUM">Medium (P2)</option>
                <option value="LOW">Low (P3)</option>
              </select>
            </div>

          </div>

        </div>

        {/* Quick Category Chips */}
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 pt-1 border-t border-slate-100 text-[11px] font-mono">
          <span className="text-slate-400 uppercase mr-1 text-[10px] font-semibold">Filter Type:</span>
          {[
            { id: 'ALL', label: 'All' },
            { id: 'BUG', label: 'Bugs' },
            { id: 'IDEA', label: 'Ideas' },
            { id: 'HELP', label: 'Help' },
            { id: 'RATING', label: 'Ratings' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`px-2.5 py-0.5 border text-xs cursor-pointer transition-colors ${
                filterCategory === cat.id
                  ? 'bg-purple-600 text-white border-purple-600 font-semibold'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Meta Row: Count on Left, Instruction on Right */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-sans">
        <div>
          Showing <span className="font-bold text-slate-900">{filteredTickets.length}</span> of {tickets.length} tickets
        </div>
        <div className="hidden sm:block text-slate-400 text-[11px]">
          Click row for telemetry inspection • Sort by clicking headers
        </div>
      </div>

      {/* Ticket Cards Container */}
      {isLoading ? (
        <div className="p-16 text-center text-xs font-mono text-slate-400 border border-slate-200 bg-white shadow-2xs">
          FETCHING TENANT INCIDENTS...
        </div>
      ) : filteredTickets.length === 0 ? (
        /* Empty State (Exact Match to Reference Image) */
        <div className="bg-white border border-slate-200 p-16 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
              Workspace Clean • No Active Incidents
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              {tickets.length === 0 
                ? 'No tickets in this tenant database. Live telemetry listeners and WebSocket connection active.'
                : 'No tickets match the selected search and filter criteria.'}
            </p>
          </div>

          {tickets.length === 0 && onOpenWidgetSimulator && (
            <div className="pt-2">
              <button
                onClick={onOpenWidgetSimulator}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ Ingest First Incident</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Loaded Ticket Cards List (Crisp White Square Design) */
        <div className="border border-slate-200 divide-y divide-slate-200 bg-white shadow-2xs">
          {filteredTickets.map((ticket) => {
            const domain = ticket.domain_origin || 
              (ticket.telemetry?.page_url ? new URL(ticket.telemetry.page_url).hostname : 'client.app');

            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                className="p-4 hover:bg-slate-50/80 transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    {/* Short Code Badge */}
                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5">
                      {ticket.short_code}
                    </span>

                    {/* Category with Icon */}
                    <div className="flex items-center space-x-1 text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5">
                      {getCategoryIcon(ticket.category)}
                      <span className="font-medium">{ticket.category}</span>
                      {ticket.category === 'RATING' && ticket.rating && (
                        <span className="text-amber-500 font-bold ml-1">({ticket.rating}★)</span>
                      )}
                    </div>

                    {/* Severity Badge */}
                    {ticket.category !== 'IDEA' && ticket.category !== 'RATING' && (
                      <span className={`text-[11px] font-mono font-medium px-2 py-0.5 border ${getSeverityBadge(ticket.severity)}`}>
                        {ticket.severity}
                      </span>
                    )}

                    {/* Product Name */}
                    <span className="text-xs text-indigo-700 font-mono bg-indigo-50 border border-indigo-200 px-2 py-0.5">
                      {ticket.product_name || 'Product'}
                    </span>

                    {/* Domain Origin Tag */}
                    <span className="text-xs text-slate-600 font-mono flex items-center space-x-1 border border-slate-200 px-2 py-0.5 bg-slate-50">
                      <Globe className="w-3 h-3 text-slate-400" />
                      <span>{domain}</span>
                    </span>

                    {/* Screenshot Indicator */}
                    {(ticket.screenshot_url || ticket.telemetry?.screenshot_url) && (
                      <span className="text-[11px] text-blue-700 font-mono flex items-center space-x-1 border border-blue-200 bg-blue-50 px-2 py-0.5">
                        <ImageIcon className="w-3 h-3" />
                        <span>Screenshot</span>
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                    {ticket.title}
                  </h3>

                  {/* Subtitle / Reporter / Squad / Assignee */}
                  <div className="flex items-center space-x-3 text-xs text-slate-500 flex-wrap gap-y-1">
                    <span>From: <span className="text-slate-800 font-mono font-medium">{ticket.reporter_email}</span></span>
                    <span>•</span>
                    <span>Squad: <span className="text-slate-800 font-medium">{ticket.assigned_squad}</span></span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <span className="text-slate-400">Dev:</span>
                      <span className={`font-mono px-2 py-0.5 border text-[11px] ${
                        ticket.assigned_to_name 
                          ? 'border-purple-200 bg-purple-50 text-purple-700 font-semibold' 
                          : 'border-slate-200 bg-slate-100 text-slate-500'
                      }`}>
                        {ticket.assigned_to_name ? ticket.assigned_to_name.split(' (')[0] : 'Unassigned'}
                      </span>
                    </span>
                    {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-red-600 font-mono text-[11px] font-semibold">
                          {ticket.telemetry.network_errors.length} API ERROR(S)
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Status and Action Buttons */}
                <div className="flex items-center space-x-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* Status selector / badge based on Role */}
                  {currentRole === 'client_user' ? (
                    <span className={`text-xs font-mono px-2.5 py-1 border font-semibold ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  ) : currentRole === 'support_agent' ? (
                    onUpdateStatus ? (
                      <select
                        value={ticket.status}
                        onChange={(e) => onUpdateStatus(ticket.id, e.target.value)}
                        className={`text-xs font-mono px-2.5 py-1.5 border cursor-pointer focus:outline-none font-semibold ${getStatusBadge(ticket.status)}`}
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="TRIAGED">TRIAGED</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-mono px-2.5 py-1 border font-semibold ${getStatusBadge(ticket.status)}`}>
                        {ticket.status}
                      </span>
                    )
                  ) : onUpdateStatus ? (
                    <select
                      value={ticket.status}
                      onChange={(e) => onUpdateStatus(ticket.id, e.target.value)}
                      className={`text-xs font-mono px-2.5 py-1.5 border cursor-pointer focus:outline-none font-semibold ${getStatusBadge(ticket.status)}`}
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="IN_DEV">IN_DEV</option>
                      <option value="IN_QA">IN_QA</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  ) : (
                    <span className={`text-xs font-mono px-2.5 py-1 border font-semibold ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  )}

                  {/* Delete button (Strictly restricted to Team Lead and Tenant/Super Admins) */}
                  {['super_admin', 'tenant_admin', 'squad_lead'].includes(currentRole) && onDeleteTicket && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Permanently delete ticket ${ticket.short_code}?`)) {
                          onDeleteTicket(ticket.id);
                        }
                      }}
                      title="Permanently Delete Ticket (Lead & Admin Only)"
                      className="p-1.5 bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
