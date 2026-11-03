import React, { useState, useMemo, useEffect } from 'react';
import { Ticket, TicketSeverity, TicketStatus, UserRole, RolePermissionsMatrix } from '../types';
import { hasRolePermission } from '../constants/permissions';
import { CustomSelect } from './CustomSelect';
import { safeArray, safeNumber, safeSearchMatch } from '../utils/edgeCaseHelpers';
import { normalizeStatus, normalizeSeverity } from '../utils/formatters';
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
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ShieldAlert,
  Clock,
  Layers,
  RotateCcw
} from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[];
  teamMembers?: Array<{ id: string; name: string; role?: string }>;
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
  teamMembers = [],
  onSelectTicket,
  currentRole,
  isLoading,
  onOpenWidgetSimulator,
  onUpdateStatus,
  onDeleteTicket,
  isResolvedOnly = false,
  permissionsMatrix
}) => {
  const safeTickets = safeArray(tickets);
  const safeTeam = safeArray(teamMembers);

  const [localSearch, setLocalSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Debounce search input (200–300ms) to prevent UI stutter & main-thread lag during 5,000+ ticket filtering
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(localSearch);
    }, 250);
    return () => clearTimeout(handler);
  }, [localSearch]);

  // Dynamic RBAC permissions (with role fallback)
  const canChangeStatus = hasRolePermission(permissionsMatrix, currentRole, 'tickets:change_status');
  const canDeleteTicket = hasRolePermission(permissionsMatrix, currentRole, 'tickets:delete');

  // Pagination for High Ticket Influx (5,000+ items)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Reset to page 1 whenever search query or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterStatus, filterAssignee, filterPriority, filterCategory]);

  const handleClearAllFilters = () => {
    setLocalSearch('');
    setDebouncedSearch('');
    setFilterStatus('ALL');
    setFilterAssignee('ALL');
    setFilterPriority('ALL');
    setFilterCategory('ALL');
    setCurrentPage(1);
  };

  const filteredTickets = useMemo(() => {
    return safeTickets.filter(t => {
      // Search filter with safe regex character escaping on debounced query
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        const matchTitle = safeSearchMatch(t.title, q);
        const matchCode = safeSearchMatch(t.short_code, q);
        const matchReporter = safeSearchMatch(t.reporter_email, q);
        const matchSquad = safeSearchMatch(t.assigned_squad, q);
        const matchProduct = safeSearchMatch(t.product_name, q);
        if (!matchTitle && !matchCode && !matchReporter && !matchSquad && !matchProduct) return false;
      }

      // Status filter with normalized status comparison
      if (filterStatus !== 'ALL') {
        const normTicketStatus = normalizeStatus(t.status);
        const normFilterStatus = normalizeStatus(filterStatus);
        if (normTicketStatus !== normFilterStatus) return false;
      }

      // Assignee filter
      if (filterAssignee === 'UNASSIGNED' && t.assigned_to) return false;
      if (filterAssignee !== 'ALL' && filterAssignee !== 'UNASSIGNED') {
        if (t.assigned_to !== filterAssignee && t.assigned_to_name !== filterAssignee) return false;
      }

      // Priority / Severity filter with normalized severity comparison
      if (filterPriority !== 'ALL') {
        const normTicketSev = normalizeSeverity(t.severity);
        const normFilterSev = normalizeSeverity(filterPriority as any);
        if (normTicketSev !== normFilterSev) return false;
      }

      // Category filter: Maps technical subcategories into top-level groups (e.g. BUG includes UI_GLITCH, API_FAILURE, PERFORMANCE, SECURITY)
      if (filterCategory !== 'ALL') {
        const cat = (t.category || '').toUpperCase();
        if (filterCategory === 'BUG') {
          const isBugGroup = cat === 'BUG' || cat === 'UI_GLITCH' || cat === 'API_FAILURE' || cat === 'PERFORMANCE' || cat === 'SECURITY';
          if (!isBugGroup) return false;
        } else if (cat !== filterCategory) {
          return false;
        }
      }

      return true;
    });
  }, [safeTickets, debouncedSearch, filterStatus, filterAssignee, filterPriority, filterCategory]);

  const totalFiltered = filteredTickets.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // Avoid rendering thousands of complex DOM card rows simultaneously; slice to current page
  const paginatedTickets = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, safeCurrentPage, pageSize]);

  const getSeverityBadge = (severity: TicketSeverity | string) => {
    const norm = normalizeSeverity(severity as any);
    switch (norm) {
      case 'Urgent':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'High':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Medium':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusBadge = (status: TicketStatus | string) => {
    const norm = normalizeStatus(status);
    switch (norm) {
      case 'Open':
        return 'text-amber-800 border-amber-300 bg-amber-50/80';
      case 'In Dev':
        return 'text-indigo-800 border-indigo-300 bg-indigo-50/80';
      case 'In QA':
        return 'text-purple-800 border-purple-300 bg-purple-50/80';
      case 'Resolved':
        return 'text-emerald-800 border-emerald-300 bg-emerald-50/80';
      default:
        return 'text-slate-700 border-slate-300 bg-slate-50';
    }
  };

  const getCategoryIcon = (category: string) => {
    const cat = (category || '').toUpperCase();
    switch (cat) {
      case 'BUG':
      case 'UI_GLITCH':
        return <Bug className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
      case 'IDEA':
        return <Lightbulb className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
      case 'HELP':
        return <HelpCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
      case 'RATING':
        return <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />;
      case 'API_FAILURE':
      case 'PERFORMANCE':
        return <Cpu className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
      case 'SECURITY':
      case 'AUTH_SECURITY':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-700 shrink-0" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
    }
  };

  // Quick counts for status pills with single-pass optimization and safe zero defaults
  const { openCount, inDevCount, inQaCount, resolvedCount } = useMemo(() => {
    let open = 0;
    let inDev = 0;
    let inQa = 0;
    let resolved = 0;

    for (let i = 0; i < safeTickets.length; i++) {
      const s = normalizeStatus(safeTickets[i].status);
      if (s === 'Open') open++;
      else if (s === 'In Dev') inDev++;
      else if (s === 'In QA') inQa++;
      else if (s === 'Resolved') resolved++;
    }

    return { openCount: open, inDevCount: inDev, inQaCount: inQa, resolvedCount: resolved };
  }, [safeTickets]);

  return (
    <div className="space-y-4 select-none">
      
      {/* Clean, Modern Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-[12px] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4 font-poppins">
        
        {/* Top Search & Dropdown Filters Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by title, ticket code (e.g. FB-1041), squad, or reporter..."
              className="w-full bg-[#f8fafc] border border-slate-200 pl-10 pr-8 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 rounded-[8px] transition-colors font-poppins"
            />
            {localSearch && (
              <button 
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  setDebouncedSearch('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Clean Dropdown Filters */}
          <div className="flex items-center flex-wrap gap-2 text-xs font-poppins">
            
            {/* Status Dropdown (hidden if resolvedOnly view) */}
            {!isResolvedOnly && (
              <CustomSelect
                label="Status"
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: 'ALL', label: `All Statuses (${safeTickets.length})` },
                  { value: 'OPEN', label: `Open (${openCount})` },
                  { value: 'IN_DEV', label: `In Dev (${inDevCount})` },
                  { value: 'IN_QA', label: `In QA (${inQaCount})` },
                  { value: 'RESOLVED', label: `Resolved (${resolvedCount})` }
                ]}
              />
            )}

            {/* Assignee Dropdown */}
            <CustomSelect
              label="Assignee"
              value={filterAssignee}
              onChange={setFilterAssignee}
              options={
                safeTeam.length === 0
                  ? [
                      { value: 'ALL', label: 'All Team' },
                      { value: 'UNASSIGNED', label: 'Unassigned Only' },
                      { value: 'NO_STAFF', label: 'No staff available', disabled: true }
                    ]
                  : [
                      { value: 'ALL', label: 'All Team' },
                      { value: 'UNASSIGNED', label: 'Unassigned Only' },
                      ...safeTeam.map((m) => ({ value: m.id, label: m.name }))
                    ]
              }
            />

            {/* Priority Dropdown */}
            <CustomSelect
              label="Priority"
              value={filterPriority}
              onChange={setFilterPriority}
              options={[
                { value: 'ALL', label: 'All Priorities' },
                { value: 'URGENT', label: 'Urgent (P0)' },
                { value: 'HIGH', label: 'High (P1)' },
                { value: 'MEDIUM', label: 'Medium (P2)' },
                { value: 'LOW', label: 'Low (P3)' }
              ]}
            />

            {/* Reset Filters button if any filter active */}
            {(localSearch || filterStatus !== 'ALL' || filterAssignee !== 'ALL' || filterPriority !== 'ALL' || filterCategory !== 'ALL') && (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-medium rounded-[8px] cursor-pointer transition-colors inline-flex items-center space-x-1"
                title="Clear all active filters"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Clear</span>
              </button>
            )}

          </div>

        </div>

        {/* Clean Category Filter Chips */}
        <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100 text-xs font-poppins">
          <span className="text-slate-400 uppercase mr-1 text-[10px] font-medium">Category:</span>
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
              className={`px-3 py-1 text-xs cursor-pointer transition-all border rounded-[8px] font-medium ${
                filterCategory === cat.id
                  ? 'bg-slate-900 text-white border-slate-900 font-medium shadow-xs'
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
          Showing <span className="font-medium text-slate-900">{totalFiltered === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}–{Math.min(safeCurrentPage * pageSize, totalFiltered)}</span> of <span className="font-medium text-slate-900">{totalFiltered}</span> tickets
          {totalFiltered !== safeTickets.length && (
            <span className="text-slate-400"> (filtered from {safeTickets.length})</span>
          )}
        </div>
        <div className="hidden sm:block text-slate-400 text-[11px]">
          Click any card to inspect full telemetry, console logs & dev notes
        </div>
      </div>

      {/* Main Ticket Cards Container */}
      {isLoading ? (
        <div className="p-16 text-center text-xs font-mono text-slate-400 border border-slate-200 bg-white rounded-md card-subtle shadow-2xs">
          FETCHING TENANT INCIDENTS...
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-md card-subtle p-16 text-center shadow-2xs space-y-3">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto rounded-md shadow-2xs">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h4 className="text-base font-medium text-slate-900 tracking-tight">
              {safeTickets.length === 0 
                ? (isResolvedOnly ? 'No Resolved Incidents In Archive' : 'Workspace Clean • No Incidents Found')
                : 'No incidents match your active filters'}
            </h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
              {safeTickets.length === 0 
                ? (isResolvedOnly
                    ? 'All active incidents for this tenant are currently in development, investigation, or QA.'
                    : 'No tickets currently stored in this tenant scope. Telemetry listeners and WebSocket triage active.')
                : 'No tickets match your active filter criteria. Clear filters to see all tickets.'}
            </p>
          </div>

          {safeTickets.length === 0 && !isResolvedOnly && onOpenWidgetSimulator && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenWidgetSimulator}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-[8px] shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-1.5 font-mono"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ Ingest First Incident</span>
              </button>
            </div>
          )}

          {safeTickets.length > 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="px-4 py-2 bg-[#0b1b36] hover:bg-[#12284c] text-white text-xs font-medium rounded-[8px] shadow-xs transition-colors cursor-pointer inline-flex items-center space-x-1.5 font-poppins"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Modern, Clean Ticket Rows List */
        <div className="border border-slate-200/80 divide-y divide-slate-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)] rounded-[12px] overflow-hidden">
          {paginatedTickets.map((ticket) => {
            let domain = ticket.domain_origin || '';
            if (!domain && ticket.telemetry?.page_url) {
              try {
                const urlStr = ticket.telemetry.page_url.includes('://')
                  ? ticket.telemetry.page_url
                  : `https://${ticket.telemetry.page_url}`;
                domain = new URL(urlStr).hostname || 'client.app';
              } catch {
                domain = 'api.telemetry';
              }
            }
            if (!domain) domain = 'client.app';

            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                className="p-4 hover:bg-slate-50 transition-colors cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-4 font-poppins"
              >
                {/* Left & Center: Badges, Title, Clean Metadata */}
                <div className="space-y-2 flex-1 min-w-0">
                  
                  {/* Clean Badges Bar */}
                  <div className="flex items-center flex-wrap gap-1.5 text-xs">
                    
                    {/* Short Code */}
                    <span className="font-mono text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200/80 px-2 py-0.5 rounded-[6px]">
                      {ticket.short_code || `FH-${ticket.id ? ticket.id.slice(0, 4).toUpperCase() : 'INC'}`}
                    </span>

                    {/* Category */}
                    <div className="flex items-center space-x-1 text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-[6px] font-medium text-[11px]">
                      {getCategoryIcon(ticket.category)}
                      <span>{ticket.category}</span>
                      {ticket.category === 'RATING' && ticket.rating && (
                        <span className="text-amber-500 font-medium ml-1">({ticket.rating}★)</span>
                      )}
                    </div>

                    {/* Priority Badge */}
                    {ticket.category !== 'IDEA' && ticket.category !== 'RATING' && (
                      <span className={`text-[11px] font-medium px-2 py-0.5 border rounded-[6px] ${getSeverityBadge(ticket.severity)}`}>
                        {ticket.severity}
                      </span>
                    )}

                    {/* Status Badge */}
                    <span className={`text-[11px] font-medium px-2 py-0.5 border rounded-[6px] ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>

                    {/* Product Name */}
                    <span className="text-slate-600 bg-white border border-slate-200 px-2 py-0.5 text-[11px] rounded-[6px]">
                      {ticket.product_name || 'Product'}
                    </span>

                    {/* Screenshot Badge */}
                    {(ticket.screenshot_url || ticket.telemetry?.screenshot_url) && (
                      <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-medium rounded-[6px] flex items-center space-x-1">
                        <ImageIcon className="w-3 h-3" />
                        <span>Screenshot</span>
                      </span>
                    )}

                    {/* API Failures Badge */}
                    {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 && (
                      <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-medium rounded-[6px] flex items-center space-x-1">
                        <Cpu className="w-3 h-3" />
                        <span>
                          {ticket.telemetry.network_errors.length > 99 ? '99+' : ticket.telemetry.network_errors.length} API Error(s)
                        </span>
                      </span>
                    )}

                  </div>

                  {/* Ticket Title */}
                  <h3 
                    title={ticket.title || 'Untitled Incident'}
                    className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors truncate break-all max-w-[320px] sm:max-w-none font-poppins"
                  >
                    {ticket.title || 'Untitled Incident'}
                  </h3>

                  {/* Clean Metadata Line */}
                  <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 font-poppins text-[11px]">
                    <span className="flex items-center space-x-1">
                      <Globe className="w-3 h-3 text-slate-400" />
                      <span>{domain}</span>
                    </span>
                    <span>•</span>
                    <span>Reporter: <span className="text-slate-700 font-medium">{ticket.reporter_email || 'Anonymous'}</span></span>
                    <span>•</span>
                    <span>Squad: <span className="text-slate-700 font-medium">{ticket.assigned_squad || 'Unassigned'}</span></span>
                  </div>

                </div>

                {/* Right: Developer Assignee, Status Quick Switch, Delete */}
                <div className="flex items-center space-x-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100" onClick={(e) => e.stopPropagation()}>
                  
                  {/* Assignee Pill */}
                  {(() => {
                    const assigneeDisplayName = ticket.assigned_to_name
                      ? ticket.assigned_to_name.split(' (')[0]
                      : (ticket.assigned_to ? 'Former Staff' : 'Unassigned');
                    const hasAssignee = Boolean(ticket.assigned_to_name || ticket.assigned_to);
                    return (
                      <div className="flex items-center space-x-1.5 text-xs">
                        <div className="w-6 h-6 rounded-[6px] bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-medium text-[10px]">
                          {hasAssignee && assigneeDisplayName.trim().length > 0
                            ? assigneeDisplayName.trim().charAt(0).toUpperCase()
                            : <User className="w-3 h-3 text-slate-400" />}
                        </div>
                        <span className={`text-[11px] font-medium ${hasAssignee ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                          {assigneeDisplayName}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Status Dropdown / Badge */}
                  {onUpdateStatus && canChangeStatus ? (
                    <CustomSelect
                      value={ticket.status}
                      onChange={(newStatus) => onUpdateStatus(ticket.id, newStatus)}
                      options={[
                        { value: 'OPEN', label: 'OPEN' },
                        { value: 'TRIAGED', label: 'TRIAGED' },
                        { value: 'IN_DEV', label: 'IN_DEV' },
                        { value: 'IN_QA', label: 'IN_QA' },
                        { value: 'RESOLVED', label: 'RESOLVED' },
                        { value: 'CLOSED', label: 'CLOSED' }
                      ]}
                      buttonClassName={`text-xs px-2.5 py-1 border rounded-[8px] cursor-pointer font-medium ${getStatusBadge(ticket.status)}`}
                    />
                  ) : (
                    <span className={`text-xs font-mono px-2.5 py-1 border font-medium rounded-[6px] ${getStatusBadge(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  )}

                  {/* Delete Button (dynamic permission) */}
                  {canDeleteTicket && onDeleteTicket && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const ticketCode = ticket.short_code || `FH-${ticket.id ? ticket.id.slice(0, 4).toUpperCase() : 'INC'}`;
                        if (confirm(`Permanently delete ticket ${ticketCode}?`)) {
                          onDeleteTicket(ticket.id);
                        }
                      }}
                      title="Permanently Delete Ticket"
                      className="p-1.5 bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-[8px] transition-colors cursor-pointer shadow-2xs"
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

      {/* Pagination Controls for High Ticket Influx */}
      {!isLoading && totalFiltered > 0 && (
        <div className="bg-white border border-slate-200/80 rounded-[12px] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 font-poppins select-none">
          {/* Left: Rows Per Page Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              aria-label="Rows per page"
              className="bg-white border border-slate-200 text-slate-800 text-xs px-2 py-1 rounded-[6px] focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs font-medium"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          {/* Right: Page Navigation Controls */}
          <div className="flex items-center space-x-1.5 self-end sm:self-auto">
            <span className="text-slate-500 mr-2 text-[11px] font-mono">
              Page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong>
            </span>

            {/* First Page */}
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(1)}
              title="First Page"
              className="p-1.5 border border-slate-200 rounded-[6px] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 cursor-pointer"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>

            {/* Previous Page */}
            <button
              type="button"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              title="Previous Page"
              className="p-1.5 border border-slate-200 rounded-[6px] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Quick Page Jump indicator */}
            <div className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-[6px] font-mono text-[11px] text-slate-700 font-medium">
              {safeCurrentPage}
            </div>

            {/* Next Page */}
            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              title="Next Page"
              className="p-1.5 border border-slate-200 rounded-[6px] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Last Page */}
            <button
              type="button"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
              title="Last Page"
              className="p-1.5 border border-slate-200 rounded-[6px] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 cursor-pointer"
            >
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
