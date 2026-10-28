import React, { useMemo, useState, useEffect } from 'react';
import { Ticket, TeamMember } from '../types';
import { normalizeSeverity, normalizeStatus, formatTimeAgo } from '../utils/formatters';
import { 
  Search, 
  X, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Clock, 
  Cpu, 
  Bug, 
  Layout, 
  ShieldAlert, 
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  UserCheck,
  UserX,
  Sparkles,
  Globe,
  Terminal,
  Activity,
  Layers
} from 'lucide-react';

export type SortField = 'title' | 'priority' | 'status' | 'assignee' | 'reported';
export type SortDirection = 'asc' | 'desc';

interface TicketsTableProps {
  tickets: Ticket[];
  teamMembers: TeamMember[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (assigneeId: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (priority: string) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  onResetFilters: () => void;
  onSelectTicket: (ticket: Ticket) => void;
  onOpenCreateModal?: () => void;
  onOpenSimulatorModal?: () => void;
  onSeedDemo?: () => void;
  onUpdateStatus?: (ticketId: string, status: string) => void;
  onUpdateAssignee?: (ticketId: string, assigneeId: string | null, assigneeName: string | null) => void;
  lastUpdated?: Date;
  isLoading?: boolean;
}

export const TicketsTable: React.FC<TicketsTableProps> = ({
  tickets,
  teamMembers,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  sortField,
  sortDirection,
  onSortChange,
  onResetFilters,
  onSelectTicket,
  onOpenCreateModal,
  onOpenSimulatorModal,
  onSeedDemo,
  onUpdateStatus,
  onUpdateAssignee,
  lastUpdated,
  isLoading = false
}) => {
  // Format last updated time
  const [freshnessLabel, setFreshnessLabel] = useState<string>('Just now');

  useEffect(() => {
    const updateFreshness = () => {
      if (!lastUpdated) {
        setFreshnessLabel('Just now');
        return;
      }
      const diffSecs = Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      if (diffSecs < 10) {
        setFreshnessLabel('Just now');
      } else if (diffSecs < 60) {
        setFreshnessLabel(`${diffSecs}s ago`);
      } else {
        const mins = Math.floor(diffSecs / 60);
        setFreshnessLabel(`${mins}m ago`);
      }
    };

    updateFreshness();
    const interval = setInterval(updateFreshness, 5000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const hasActiveFilters = 
    Boolean(searchQuery.trim()) || 
    statusFilter !== 'ALL' || 
    assigneeFilter !== 'ALL' || 
    priorityFilter !== 'ALL';

  const getPriorityWeight = (priority: string): number => {
    switch (priority) {
      case 'Urgent': return 4;
      case 'High': return 3;
      case 'Medium': return 2;
      case 'Low': return 1;
      default: return 0;
    }
  };

  const getStatusWeight = (status: string): number => {
    switch (status) {
      case 'Open': return 4;
      case 'Triaged': return 3.5;
      case 'In Dev': return 3;
      case 'In QA': return 2;
      case 'Resolved': return 1;
      default: return 0;
    }
  };

  const filteredAndSortedTickets = useMemo(() => {
    let result = tickets.filter((t) => {
      const normPriority = normalizeSeverity(t.severity);
      const normStatus = normalizeStatus(t.status);

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesCode = t.short_code.toLowerCase().includes(q);
        const matchesDesc = (t.description || '').toLowerCase().includes(q);
        const matchesReporter = (t.reporter_email || '').toLowerCase().includes(q);
        const matchesAssignee = (t.assigned_to_name || 'unassigned').toLowerCase().includes(q);
        const matchesCategory = (t.category || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesCode && !matchesDesc && !matchesReporter && !matchesAssignee && !matchesCategory) {
          return false;
        }
      }

      if (statusFilter !== 'ALL' && normStatus !== statusFilter) {
        return false;
      }

      if (assigneeFilter !== 'ALL') {
        if (assigneeFilter === 'UNASSIGNED') {
          if (t.assigned_to) return false;
        } else {
          if (t.assigned_to !== assigneeFilter) return false;
        }
      }

      if (priorityFilter !== 'ALL' && normPriority !== priorityFilter) {
        return false;
      }

      return true;
    });

    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'priority':
          comparison = getPriorityWeight(normalizeSeverity(b.severity)) - getPriorityWeight(normalizeSeverity(a.severity));
          break;
        case 'status':
          comparison = getStatusWeight(normalizeStatus(b.status)) - getStatusWeight(normalizeStatus(a.status));
          break;
        case 'assignee':
          const nameA = a.assigned_to_name || 'zzz';
          const nameB = b.assigned_to_name || 'zzz';
          comparison = nameA.localeCompare(nameB);
          break;
        case 'reported':
          comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [tickets, searchQuery, statusFilter, assigneeFilter, priorityFilter, sortField, sortDirection]);

  // Priority Badge Helper
  const renderPriorityBadge = (severity: string) => {
    const priority = normalizeSeverity(severity);
    switch (priority) {
      case 'Urgent':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-[2px] bg-red-50 text-red-700 border border-red-200 shadow-2xs">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span>Urgent</span>
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-[2px] bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
            <span>High</span>
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-[2px] bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
            <span>Medium</span>
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-[2px] bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
            <span>Low</span>
          </span>
        );
    }
  };

  // Telemetry Type and Indicator Helper
  const renderTelemetryIndicator = (ticket: Ticket) => {
    const t = ticket.telemetry;
    if (!t) return null;

    const hasBrowser = Boolean(t.user_agent || t.viewport_dimensions);
    const hasApi = Boolean(
      t.network_errors?.length || 
      ticket.category === 'API_FAILURE' || 
      (t.page_url && (t.page_url.includes('/api/') || t.page_url.startsWith('POST') || t.page_url.startsWith('GET')))
    );
    const hasLogs = Boolean(t.console_logs && t.console_logs.length > 0);

    return (
      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
        {hasBrowser && (
          <span 
            className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-[2px] bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs"
            title={`Browser Telemetry: ${t.viewport_dimensions || 'Web Viewport'} | ${t.user_agent ? t.user_agent.slice(0, 35) + '...' : 'Browser Engine'}`}
          >
            <Globe className="w-3 h-3 text-sky-600 flex-shrink-0" />
            <span>Browser Telemetry</span>
            {t.viewport_dimensions && (
              <span className="font-mono text-[9px] opacity-80 font-normal">({t.viewport_dimensions})</span>
            )}
          </span>
        )}

        {hasApi && (
          <span 
            className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-[2px] bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs"
            title={`API Telemetry Attached: ${t.page_url || 'Endpoint failure'}`}
          >
            <Terminal className="w-3 h-3 text-rose-600 flex-shrink-0" />
            <span>API Telemetry</span>
            {t.network_errors?.[0]?.status && (
              <span className="font-mono text-[9px] font-bold">HTTP {t.network_errors[0].status}</span>
            )}
          </span>
        )}

        {!hasBrowser && !hasApi && (
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 text-[10px] font-medium rounded-[2px] bg-purple-50 text-purple-700 border border-purple-200">
            <Activity className="w-3 h-3 text-purple-600" />
            <span>Telemetry Attached</span>
          </span>
        )}

        {hasLogs && (
          <span 
            className="inline-flex items-center space-x-1 px-1.5 py-0.2 text-[9px] font-mono rounded-[2px] bg-slate-100 text-slate-600 border border-slate-200"
            title={`${t.console_logs?.length} console log entries captured`}
          >
            <span>{t.console_logs?.length} logs</span>
          </span>
        )}
      </div>
    );
  };

  // Category Icon Helper
  const renderCategoryIcon = (category: string) => {
    switch (category) {
      case 'API_FAILURE':
        return <span title="API Failure"><Cpu className="w-3.5 h-3.5 text-red-500" /></span>;
      case 'BUG':
        return <span title="Application Bug"><Bug className="w-3.5 h-3.5 text-amber-500" /></span>;
      case 'UI_GLITCH':
        return <span title="UI Glitch"><Layout className="w-3.5 h-3.5 text-blue-500" /></span>;
      case 'SECURITY':
        return <span title="Security & Auth"><ShieldAlert className="w-3.5 h-3.5 text-purple-600" /></span>;
      default:
        return <span title="Performance & Telemetry"><AlertTriangle className="w-3.5 h-3.5 text-slate-500" /></span>;
    }
  };

  // Sort Arrow Icon Helper
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 ml-1 inline" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-purple-600 ml-1 inline" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-purple-600 ml-1 inline" />
    );
  };

  return (
    <div className="bg-white rounded-[2px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 space-y-4">
      
      {/* Top Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        
        {/* Search Field */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tickets by title, ID (e.g. FH-402), or reporter..."
            aria-label="Search tickets"
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs pl-9 pr-8 py-2 rounded-[2px] placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns & Navy Blue Reset Button */}
        <div className="flex items-center flex-wrap gap-2.5">
          
          {/* Status Filter */}
          <div className="flex items-center space-x-1.5">
            <label htmlFor="status-filter" className="text-xs text-slate-500 font-medium hidden sm:inline">
              Status:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              aria-label="Filter tickets by status"
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-[2px] font-medium focus:outline-none focus:border-purple-500 cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="Open">Open</option>
              <option value="In Dev">In Dev</option>
              <option value="In QA">In QA</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div className="flex items-center space-x-1.5">
            <label htmlFor="assignee-filter" className="text-xs text-slate-500 font-medium hidden sm:inline">
              Assignee:
            </label>
            <select
              id="assignee-filter"
              value={assigneeFilter}
              onChange={(e) => onAssigneeFilterChange(e.target.value)}
              aria-label="Filter tickets by assignee"
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-[2px] font-medium focus:outline-none focus:border-purple-500 cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Assignees</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
              <option value="UNASSIGNED">Unassigned Only</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center space-x-1.5">
            <label htmlFor="priority-filter" className="text-xs text-slate-500 font-medium hidden sm:inline">
              Priority:
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(e) => onPriorityFilterChange(e.target.value)}
              aria-label="Filter tickets by priority"
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-[2px] font-medium focus:outline-none focus:border-purple-500 cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Priorities</option>
              <option value="Urgent">Urgent (P0)</option>
              <option value="High">High (P1)</option>
              <option value="Medium">Medium (P2)</option>
              <option value="Low">Low (P3)</option>
            </select>
          </div>

          {/* Navy Blue Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0b1b36] hover:bg-[#12284c] text-white rounded-[2px] shadow-xs transition-all active:scale-[0.98]"
              title="Reset all search queries and filters"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}

        </div>

      </div>

      {/* Counter bar & Data Freshness */}
      <div className="flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <span>
            Showing <strong className="text-slate-900 font-bold">{filteredAndSortedTickets.length}</strong> of {tickets.length} tickets
          </span>
          {hasActiveFilters && (
            <span className="text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-[2px]">
              Filters Active
            </span>
          )}
        </div>

        {/* Data Freshness Indicator */}
        <div className="flex items-center space-x-3">
          <div className="inline-flex items-center space-x-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-[2px]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>Last updated: <strong className="text-slate-800 font-semibold">{freshnessLabel}</strong></span>
            {lastUpdated && (
              <span className="text-slate-400 font-mono text-[10px]">
                ({lastUpdated.toLocaleTimeString()})
              </span>
            )}
          </div>
          <span className="text-xs text-slate-400 hidden lg:inline">
            Click row for full telemetry • Inline dropdowns to assign & update
          </span>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-[2px] border border-slate-200/90">
        {isLoading ? (
          /* Loading State Skeleton */
          <div className="py-12 px-6 text-center space-y-4">
            <div className="w-8 h-8 mx-auto border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-700">Fetching incident stream...</p>
              <p className="text-[11px] text-slate-400">Synchronizing live telemetry and tickets from multi-tenant engine</p>
            </div>
            {/* Shimmer skeleton lines */}
            <div className="max-w-2xl mx-auto space-y-2 pt-2">
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
              <div className="h-9 bg-slate-50 rounded animate-pulse" />
              <div className="h-9 bg-slate-100 rounded animate-pulse" />
            </div>
          </div>
        ) : tickets.length === 0 ? (
          /* Empty State: Clear No Active Incidents message with Quick Seed and Simulate Telemetry actions */
          <div className="py-16 px-4 text-center space-y-3">
            <div className="w-14 h-14 mx-auto bg-purple-50 border border-purple-200 rounded-[2px] flex items-center justify-center text-purple-600 shadow-2xs">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-800">
                Workspace Clean · No Active Incidents
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No active incidents in this tenant database. Live telemetry listeners and WebSocket feeds are online and ready for inbound events.
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2.5 pt-2 flex-wrap gap-y-2">
              {onSeedDemo && (
                <button
                  type="button"
                  onClick={onSeedDemo}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white rounded-[2px] shadow-xs transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Quick Seed Demo Incidents</span>
                </button>
              )}
              {onOpenSimulatorModal && (
                <button
                  type="button"
                  onClick={onOpenSimulatorModal}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 hover:border-purple-300 text-purple-700 rounded-[2px] shadow-xs transition-colors"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Simulate SDK Telemetry</span>
                </button>
              )}
              {onOpenCreateModal && (
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0b1b36] hover:bg-[#12284c] text-white rounded-[2px] shadow-xs transition-colors"
                >
                  <span>Log New Incident</span>
                </button>
              )}
            </div>
          </div>
        ) : filteredAndSortedTickets.length === 0 ? (
          /* Filtered Empty State */
          <div className="py-14 px-4 text-center space-y-3">
            <div className="w-12 h-12 mx-auto bg-purple-50 border border-purple-100 rounded-[2px] flex items-center justify-center text-purple-600">
              <Search className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">
                No matching incidents found
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No tickets matched your search query or selected filter criteria.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[#0b1b36] hover:bg-[#12284c] text-white rounded-[2px] shadow-xs transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear All Active Filters</span>
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse" role="table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                
                {/* Title Column */}
                <th
                  scope="col"
                  className="py-3 px-4 cursor-pointer select-none hover:text-purple-600 transition-colors"
                  onClick={() => onSortChange('title')}
                  aria-sort={sortField === 'title' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center space-x-1">
                    <span>Incident ID & Short Title</span>
                    {renderSortIndicator('title')}
                  </div>
                </th>

                {/* Priority Column */}
                <th
                  scope="col"
                  className="py-3 px-4 w-28 cursor-pointer select-none hover:text-purple-600 transition-colors"
                  onClick={() => onSortChange('priority')}
                  aria-sort={sortField === 'priority' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center space-x-1">
                    <span>Severity</span>
                    {renderSortIndicator('priority')}
                  </div>
                </th>

                {/* Status Column */}
                <th
                  scope="col"
                  className="py-3 px-4 w-36 cursor-pointer select-none hover:text-purple-600 transition-colors"
                  onClick={() => onSortChange('status')}
                  aria-sort={sortField === 'status' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center space-x-1">
                    <span>Status</span>
                    {renderSortIndicator('status')}
                  </div>
                </th>

                {/* Assignee Column */}
                <th
                  scope="col"
                  className="py-3 px-4 w-52 cursor-pointer select-none hover:text-purple-600 transition-colors"
                  onClick={() => onSortChange('assignee')}
                  aria-sort={sortField === 'assignee' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center space-x-1">
                    <span>Assignee</span>
                    {renderSortIndicator('assignee')}
                  </div>
                </th>

                {/* Reported Column */}
                <th
                  scope="col"
                  className="py-3 px-4 w-36 cursor-pointer select-none hover:text-purple-600 transition-colors"
                  onClick={() => onSortChange('reported')}
                  aria-sort={sortField === 'reported' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <div className="flex items-center space-x-1">
                    <span>Reported</span>
                    {renderSortIndicator('reported')}
                  </div>
                </th>

              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredAndSortedTickets.map((ticket) => {
                const assignedMember = teamMembers.find((m) => m.id === ticket.assigned_to);
                const normStatus = normalizeStatus(ticket.status);

                return (
                  <tr
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className="hover:bg-purple-50/40 cursor-pointer transition-colors group"
                    role="row"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectTicket(ticket);
                      }
                    }}
                    aria-label={`Ticket ${ticket.short_code}: ${ticket.title}. Severity ${ticket.severity}. Status ${ticket.status}. Click to view details.`}
                  >
                    {/* Title & Context Cell */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          {/* Ticket Code Tag in Purple */}
                          <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-[2px] shadow-2xs">
                            {ticket.short_code}
                          </span>

                          {/* Category Tag */}
                          <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-slate-500">
                            {renderCategoryIcon(ticket.category)}
                            <span>{(ticket.category || 'BUG').replace('_', ' ')}</span>
                          </span>

                          {/* Telemetry Attached Indicators */}
                          {renderTelemetryIndicator(ticket)}
                        </div>

                        {/* Title */}
                        <div className="font-bold text-slate-800 group-hover:text-purple-700 transition-colors line-clamp-1">
                          {ticket.title}
                        </div>

                        {/* Description snippet */}
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {ticket.description}
                        </p>
                      </div>
                    </td>

                    {/* Priority Cell */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderPriorityBadge(ticket.severity)}
                    </td>

                    {/* Status Cell with Direct Inline Change Dropdown */}
                    <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block">
                        <select
                          value={ticket.status}
                          onChange={(e) => {
                            if (onUpdateStatus) {
                              onUpdateStatus(ticket.id, e.target.value);
                            }
                          }}
                          aria-label={`Change status for incident ${ticket.short_code}`}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-[2px] border cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400 appearance-none pr-6 shadow-2xs transition-colors ${
                            normStatus === 'In Dev'
                              ? 'bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-300'
                              : normStatus === 'In QA'
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-300'
                              : normStatus === 'Resolved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-300'
                              : ticket.status === 'TRIAGED'
                              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-300'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-300'
                          }`}
                        >
                          <option value="OPEN">Open</option>
                          <option value="TRIAGED">Triaged</option>
                          <option value="IN_DEV">In Dev</option>
                          <option value="IN_QA">In QA</option>
                          <option value="RESOLVED">Resolved</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                        <ChevronDown className="w-3 h-3 text-slate-500 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </td>

                    {/* Assignee Cell with Direct Inline Change Dropdown */}
                    <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center space-x-2">
                        {/* Avatar */}
                        {assignedMember ? (
                          <div className={`w-6 h-6 rounded-[2px] border flex items-center justify-center font-bold text-[9px] shadow-2xs flex-shrink-0 ${assignedMember.color}`}>
                            {assignedMember.avatarInitials}
                          </div>
                        ) : ticket.assigned_to_name ? (
                          <div className="w-6 h-6 rounded-[2px] border flex items-center justify-center font-bold text-[9px] bg-indigo-100 text-indigo-700 border-indigo-200 flex-shrink-0">
                            {ticket.assigned_to_name.slice(0, 2).toUpperCase()}
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-[2px] border border-dashed border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center text-[10px] flex-shrink-0">
                            <UserX className="w-3 h-3" />
                          </div>
                        )}

                        {/* Inline Assignee Selector */}
                        <div className="relative inline-block flex-1 max-w-[150px]">
                          <select
                            value={ticket.assigned_to || 'UNASSIGNED'}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'UNASSIGNED') {
                                onUpdateAssignee?.(ticket.id, null, null);
                              } else {
                                const m = teamMembers.find(mem => mem.id === val);
                                onUpdateAssignee?.(ticket.id, val, m ? m.name : null);
                              }
                            }}
                            aria-label={`Change assignee for incident ${ticket.short_code}`}
                            className="w-full text-xs font-medium text-slate-700 bg-slate-50 hover:bg-white border border-slate-200 hover:border-purple-300 px-2 py-1 rounded-[2px] cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-400 appearance-none pr-5 truncate shadow-2xs transition-colors"
                          >
                            <option value="UNASSIGNED">Unassigned</option>
                            {teamMembers.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    </td>

                    {/* Reported Cell */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1 text-slate-700 font-mono text-[11px]">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatTimeAgo(ticket.created_at)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[130px]" title={ticket.reporter_email}>
                          {ticket.reporter_email || 'Client'}
                        </div>
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
