import React, { useState } from 'react';
import { Ticket, TicketSeverity, TicketStatus, UserRole, RolePermissionsMatrix } from '../types';
import { hasRolePermission } from '../constants/permissions';
import { 
  Bug, 
  Lightbulb, 
  HelpCircle, 
  Star, 
  Globe, 
  ArrowRight, 
  Image as ImageIcon, 
  Cpu, 
  Trash2, 
  Search, 
  CheckCircle2, 
  Sparkles, 
  User,
  Filter,
  X,
  ChevronRight,
  ShieldAlert,
  Clock,
  Layers
} from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  currentRole: UserRole;
  isLoading: boolean;
  onOpenWidgetSimulator?: () => void;
  onUpdateStatus?: (ticketId: string, status: string) => Promise<void>;
  onDeleteTicket?: (ticketId: string) => Promise<void>;
  isResolvedOnly?: boolean;
  permissionsMatrix?: RolePermissionsMatrix | null;
}

export const TicketList: React.FC<TicketListProps> = ({
  tickets,
  onSelectTicket,
  currentRole,
  isLoading,
  onOpenWidgetSimulator,
  onUpdateStatus,
  onDeleteTicket,
  isResolvedOnly = false,
  permissionsMatrix
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Dynamic RBAC permissions (with role fallback)
  const canChangeStatus = hasRolePermission(permissionsMatrix, currentRole, 'tickets:change_status');
  const canDeleteTicket = hasRolePermission(permissionsMatrix, currentRole, 'tickets:delete');

  const filteredTickets = tickets.filter(t => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchCode = t.short_code.toLowerCase().includes(q);
      const matchReporter = t.reporter_email.toLowerCase().includes(q);
      const matchSquad = t.assigned_squad.toLowerCase().includes(q);
      const matchProduct = (t.product_name || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCode && !matchReporter && !matchSquad && !matchProduct) return false;
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
        return 'bg-rose-50 text-rose-700 border-rose-200';
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
        return 'text-amber-800 border-amber-300 bg-amber-50/80';
      case 'IN_DEV':
        return 'text-indigo-800 border-indigo-300 bg-indigo-50/80';
      case 'IN_QA':
        return 'text-purple-800 border-purple-300 bg-purple-50/80';
      case 'RESOLVED':
      case 'CLOSED':
        return 'text-emerald-800 border-emerald-300 bg-emerald-50/80';
      default:
        return 'text-slate-700 border-slate-300 bg-slate-50';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'BUG':
        return <Bug className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
      case 'IDEA':
        return <Lightbulb className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
      case 'HELP':
        return <HelpCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      case 'RATING':
        return <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />;
      case 'API_FAILURE':
        return <Cpu className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
    }
  };

  // Quick counts for status pills
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const inDevCount = tickets.filter(t => t.status === 'IN_DEV').length;
  const inQaCount = tickets.filter(t => t.status === 'IN_QA').length;
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length;

  return (
    <div className="space-y-4 select-none">
      
      {/* Clean, Modern Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-3 font-sans">
        
        {/* Top Search & Dropdown Filters Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, ticket code (e.g. FB-1041), squad, or reporter..."
              className="w-full bg-[#f8fafc] border border-slate-200 pl-9 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors font-mono"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Clean Dropdown Filters */}
          <div className="flex items-center flex-wrap gap-2 text-xs font-mono">
            
            {/* Status Dropdown (hidden if resolvedOnly view) */}
            {!isResolvedOnly && (
              <div className="flex items-center space-x-1.5 bg-[#f8fafc] border border-slate-200 px-3 py-1.5 shadow-2xs">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Status:</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-transparent text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses ({tickets.length})</option>
                  <option value="OPEN">Open ({openCount})</option>
                  <option value="IN_DEV">In Dev ({inDevCount})</option>
                  <option value="IN_QA">In QA ({inQaCount})</option>
                  <option value="RESOLVED">Resolved ({resolvedCount})</option>
                </select>
              </div>
            )}

            {/* Assignee Dropdown */}
            <div className="flex items-center space-x-1.5 bg-[#f8fafc] border border-slate-200 px-3 py-1.5 shadow-2xs">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Assignee:</span>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Team</option>
                <option value="UNASSIGNED">Unassigned Only</option>
                <option value="user-dev-01">Rahul Sharma</option>
                <option value="user-dev-02">Priya Nair</option>
                <option value="user-dev-03">Amit Patel</option>
                <option value="user-lead-01">Vikram Mehta</option>
              </select>
            </div>

            {/* Priority Dropdown */}
            <div className="flex items-center space-x-1.5 bg-[#f8fafc] border border-slate-200 px-3 py-1.5 shadow-2xs">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Priority:</span>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent (P0)</option>
                <option value="HIGH">High (P1)</option>
                <option value="MEDIUM">Medium (P2)</option>
                <option value="LOW">Low (P3)</option>
              </select>
            </div>

            {/* Reset Filters button if any filter active */}
            {(searchQuery || filterStatus !== 'ALL' || filterAssignee !== 'ALL' || filterPriority !== 'ALL' || filterCategory !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('ALL');
                  setFilterAssignee('ALL');
                  setFilterPriority('ALL');
                  setFilterCategory('ALL');
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 text-[11px] font-bold cursor-pointer transition-colors"
                title="Clear all active filters"
              >
                Clear
              </button>
            )}

          </div>

        </div>

        {/* Clean Category Filter Chips */}
        <div className="flex items-center flex-wrap gap-1.5 pt-2 border-t border-slate-100 text-xs font-mono">
          <span className="text-slate-400 uppercase mr-1 text-[10px] font-bold">Category:</span>
          {[
            { id: 'ALL', label: 'All Incidents' },
            { id: 'BUG', label: 'Bugs' },
            { id: 'IDEA', label: 'Ideas' },
            { id: 'HELP', label: 'Help' },
            { id: 'RATING', label: 'Ratings' }
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className={`px-3 py-1 text-xs cursor-pointer transition-all border ${
                filterCategory === cat.id
                  ? 'bg-slate-900 text-white border-slate-900 font-bold'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

      </div>

      {/* Meta Row: Live Count & Subtitle */}
      <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-mono">
        <div>
          Showing <span className="font-bold text-slate-900">{filteredTickets.length}</span> of {tickets.length} tickets
        </div>
        <div className="hidden sm:block text-slate-400 text-[11px]">
          Click any card to inspect full telemetry, console logs & dev notes
        </div>
      </div>

      {/* Main Ticket Cards Container */}
      {isLoading ? (
        <div className="p-16 text-center text-xs font-mono text-slate-400 border border-slate-200 bg-white shadow-2xs">
          FETCHING TENANT INCIDENTS...
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white border border-slate-200 p-16 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900 tracking-tight">
              {isResolvedOnly ? 'No Resolved Incidents In Archive' : 'Workspace Clean • No Incidents Found'}
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              {tickets.length === 0 
                ? 'No tickets currently stored in this tenant scope. Telemetry listeners and WebSocket triage active.'
                : 'No tickets match your active filter criteria. Clear filters to see all tickets.'}
            </p>
          </div>

          {tickets.length === 0 && onOpenWidgetSimulator && (
            <div className="pt-2">
              <button
                onClick={onOpenWidgetSimulator}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-1.5 font-mono"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ Ingest First Incident</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Modern, Clean Ticket Rows List */
        <div className="border border-slate-200 divide-y divide-slate-200 bg-white shadow-2xs">
          {filteredTickets.map((ticket) => {
            const domain = ticket.domain_origin || 
              (ticket.telemetry?.page_url ? new URL(ticket.telemetry.page_url).hostname : 'client.app');

            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans"
              >
                {/* Left & Center: Badges, Title, Clean Metadata */}
                <div className="space-y-2 flex-1 min-w-0">
                  
                  {/* Clean Badges Bar */}
                  <div className="flex items-center flex-wrap gap-1.5 font-mono text-xs">
                    
                    {/* Short Code */}
                    <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5">
                      {ticket.short_code}
                    </span>

                    {/* Category */}
                    <div className="flex items-center space-x-1 text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 font-medium">
                      {getCategoryIcon(ticket.category)}
                      <span>{ticket.category}</span>
                      {ticket.category === 'RATING' && ticket.rating && (
                        <span className="text-amber-500 font-bold ml-1">({ticket.rating}★)</span>
                      )}
                    </div>

                    {/* Priority Badge */}
                    {ticket.category !== 'IDEA' && ticket.category !== 'RATING' && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 border ${getSeverityBadge(ticket.severity)}`}>
                        {ticket.severity}
                      </span>
                    )}

                    {/* Status Badge */}
                    <span className={`text-[11px] font-bold px-2 py-0.5 border ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>

                    {/* Product Name */}
                    <span className="text-slate-600 bg-white border border-slate-200 px-2 py-0.5 text-[11px]">
                      {ticket.product_name || 'Product'}
                    </span>

                    {/* Screenshot Badge */}
                    {(ticket.screenshot_url || ticket.telemetry?.screenshot_url) && (
                      <span className="text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold flex items-center space-x-1">
                        <ImageIcon className="w-3 h-3" />
                        <span>Screenshot</span>
                      </span>
                    )}

                    {/* API Failures Badge */}
                    {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 && (
                      <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold flex items-center space-x-1">
                        <Cpu className="w-3 h-3" />
                        <span>{ticket.telemetry.network_errors.length} API Error(s)</span>
                      </span>
                    )}

                  </div>

                  {/* Ticket Title */}
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                    {ticket.title}
                  </h3>

                  {/* Clean Metadata Line */}
                  <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 font-mono text-[11px]">
                    <span className="flex items-center space-x-1">
                      <Globe className="w-3 h-3 text-slate-400" />
                      <span>{domain}</span>
                    </span>
                    <span>•</span>
                    <span>Reporter: <span className="text-slate-700 font-medium">{ticket.reporter_email}</span></span>
                    <span>•</span>
                    <span>Squad: <span className="text-slate-700 font-medium">{ticket.assigned_squad}</span></span>
                  </div>

                </div>

                {/* Right: Developer Assignee, Status Quick Switch, Delete */}
                <div className="flex items-center space-x-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100" onClick={(e) => e.stopPropagation()}>
                  
                  {/* Assignee Pill */}
                  <div className="flex items-center space-x-1.5 font-mono text-xs">
                    <div className="w-6 h-6 bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                      {ticket.assigned_to_name ? ticket.assigned_to_name.charAt(0) : <User className="w-3 h-3 text-slate-400" />}
                    </div>
                    <span className={`text-[11px] font-semibold ${ticket.assigned_to_name ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                      {ticket.assigned_to_name ? ticket.assigned_to_name.split(' (')[0] : 'Unassigned'}
                    </span>
                  </div>

                  {/* Status Dropdown / Badge */}
                  {onUpdateStatus && canChangeStatus ? (
                    <select
                      value={ticket.status}
                      onChange={(e) => onUpdateStatus(ticket.id, e.target.value)}
                      className={`text-xs font-mono px-2.5 py-1.5 border cursor-pointer focus:outline-none font-bold ${getStatusBadge(ticket.status)}`}
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="TRIAGED">TRIAGED</option>
                      <option value="IN_DEV">IN_DEV</option>
                      <option value="IN_QA">IN_QA</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  ) : (
                    <span className={`text-xs font-mono px-2.5 py-1 border font-bold ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  )}

                  {/* Delete Button (dynamic permission) */}
                  {canDeleteTicket && onDeleteTicket && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Permanently delete ticket ${ticket.short_code}?`)) {
                          onDeleteTicket(ticket.id);
                        }
                      }}
                      title="Permanently Delete Ticket"
                      className="p-1.5 bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Inspect Chevron */}
                  <div className="text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all hidden sm:block">
                    <ChevronRight className="w-4 h-4" />
                  </div>

                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
