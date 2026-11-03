import React, { useMemo, useState, useEffect } from 'react';
import { Ticket, TeamMember, UserRole, RolePermissionsMatrix } from '../types';
import { normalizeSeverity, normalizeStatus, formatTimeAgo } from '../utils/formatters';
import { safeArray, safeSearchMatch } from '../utils/edgeCaseHelpers';
import { hasRolePermission } from '../constants/permissions';
import { CustomSelect } from './CustomSelect';
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
  Layers,
  Lock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';

export type SortField = 'title' | 'priority' | 'status' | 'assignee' | 'reported';
export type SortDirection = 'asc' | 'desc';

interface TicketsTableProps {
  tickets?: Ticket[];
  teamMembers?: TeamMember[];
  currentRole?: UserRole;
  permissionsMatrix?: RolePermissionsMatrix | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (assigneeId: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (priority: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (category: string) => void;
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
  tickets = [],
  teamMembers = [],
  currentRole,
  permissionsMatrix,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  categoryFilter = 'ALL',
  onCategoryFilterChange,
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
  const safeTickets = safeArray<Ticket>(tickets);
  const safeTeam = safeArray<TeamMember>(teamMembers);

  // Dynamic RBAC Permission Checks
  const canChangeStatus = hasRolePermission(permissionsMatrix, currentRole, 'tickets:change_status');
  const canAssign = hasRolePermission(permissionsMatrix, currentRole, 'tickets:assign');
  const canViewTelemetry = hasRolePermission(permissionsMatrix, currentRole, 'tickets:view_telemetry_internal');
  const canCreateTicket = hasRolePermission(permissionsMatrix, currentRole, 'tickets:create');

  // Debounced Search Input State
  const [localSearch, setLocalSearch] = useState<string>(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== searchQuery) {
        onSearchChange(localSearch);
      }
    }, 250);
    return () => clearTimeout(handler);
  }, [localSearch, searchQuery, onSearchChange]);

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
    priorityFilter !== 'ALL' ||
    (Boolean(categoryFilter) && categoryFilter !== 'ALL');

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
    const trimmedQuery = searchQuery.trim().toLowerCase();

    const result = safeTickets.filter((t) => {
      const normPriority = normalizeSeverity(t.severity);
      const normStatus = normalizeStatus(t.status);

      if (trimmedQuery) {
        const matchesTitle = safeSearchMatch(t.title, trimmedQuery);
        const matchesCode = safeSearchMatch(t.short_code, trimmedQuery);
        const matchesDesc = safeSearchMatch(t.description, trimmedQuery);
        const matchesReporter = safeSearchMatch(t.reporter_email, trimmedQuery);
        const matchesAssignee = safeSearchMatch(t.assigned_to_name || 'unassigned', trimmedQuery);
        const matchesCategory = safeSearchMatch(t.category, trimmedQuery);
        if (!matchesTitle && !matchesCode && !matchesDesc && !matchesReporter && !matchesAssignee && !matchesCategory) {
          return false;
        }
      }

      // Active in-flight lifecycle filtering (Open card includes Open, Triaged, In Dev, In QA)
      if (statusFilter === 'NON_RESOLVED') {
        if (normStatus === 'Resolved') return false;
      } else if (statusFilter !== 'ALL' && normStatus !== statusFilter) {
        return false;
      }

      // Category multi-dimensional filtering
      if (categoryFilter && categoryFilter !== 'ALL') {
        const cat = (t.category || '').toUpperCase().trim();
        if (categoryFilter === 'OTHER') {
          const standardCats = ['API_FAILURE', 'SECURITY', 'PERFORMANCE', 'BUG', 'UI_GLITCH'];
          if (standardCats.includes(cat)) return false;
        } else if (cat !== categoryFilter.toUpperCase()) {
          return false;
        }
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
          comparison = (a.title || '').localeCompare(b.title || '');
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
          const timeA = new Date(a.created_at).getTime() || 0;
          const timeB = new Date(b.created_at).getTime() || 0;
          comparison = timeB - timeA;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [safeTickets, searchQuery, statusFilter, assigneeFilter, priorityFilter, sortField, sortDirection]);

  // Pagination for high ticket influx (5,000+ items)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Reset to page 1 whenever search, filter, or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, assigneeFilter, priorityFilter, sortField, sortDirection]);

  const totalFiltered = filteredAndSortedTickets.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTickets = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedTickets.slice(start, start + pageSize);
  }, [filteredAndSortedTickets, safeCurrentPage, pageSize]);

  // Priority Badge Helper
  const renderPriorityBadge = (severity: string) => {
    const priority = normalizeSeverity(severity);
    switch (priority) {
      case 'Urgent':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[6px] bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
            <span>Urgent</span>
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[6px] bg-amber-50 text-amber-700 border border-amber-200">
            <span>High</span>
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[6px] bg-blue-50 text-blue-700 border border-blue-200">
            <span>Medium</span>
          </span>
        );
      case 'Low':
        return (
          <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[6px] bg-slate-100 text-slate-700 border border-slate-200">
            <span>Low</span>
          </span>
        );
    }
  };

  // Telemetry Type and Indicator Helper
  const renderTelemetryIndicator = (ticket: Ticket) => {
    const t = ticket.telemetry;
    if (!t) {
      return (
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          <span 
            className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-medium rounded-[6px] bg-slate-100 text-slate-600 border border-slate-200"
            title="Created manually via dashboard or modal without automated SDK telemetry"
          >
            <span>Manual Ingest</span>
          </span>
        </div>
      );
    }

    const hasBrowser = Boolean(t.user_agent || t.viewport_dimensions);
    const hasApi = Boolean(
      (t.network_errors && t.network_errors.length > 0) || 
      ticket.category === 'API_FAILURE' || 
      (t.page_url && (t.page_url.includes('/api/') || t.page_url.startsWith('POST') || t.page_url.startsWith('GET')))
    );
    const hasLogs = Boolean(t.console_logs && t.console_logs.length > 0);

    return (
      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
        {hasBrowser && (
          <span 
            className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-medium rounded-[6px] bg-sky-50 text-sky-700 border border-sky-200"
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
            className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-medium rounded-[6px] bg-rose-50 text-rose-700 border border-rose-200"
            title={`API Telemetry Attached: ${t.page_url || 'Endpoint failure'}`}
          >
            <Terminal className="w-3 h-3 text-rose-600 flex-shrink-0" />
            <span>API Telemetry</span>
            {t.network_errors?.[0]?.status && (
              <span className="font-mono text-[9px] font-medium">HTTP {t.network_errors[0].status}</span>
            )}
          </span>
        )}

        {!hasBrowser && !hasApi && (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 text-[10px] font-medium rounded-[6px] bg-blue-50 text-blue-700 border border-blue-200">
            <Activity className="w-3 h-3 text-blue-600" />
            <span>Telemetry Attached</span>
          </span>
        )}

        {hasLogs && (
          <span 
            className="inline-flex items-center space-x-1 px-2 py-0.5 text-[9px] font-mono rounded-[6px] bg-slate-100 text-slate-600 border border-slate-200"
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
        return <Cpu className="w-3 h-3 text-red-500 mr-1" />;
      case 'BUG':
        return <Bug className="w-3 h-3 text-indigo-500 mr-1" />;
      case 'UI_GLITCH':
        return <Layout className="w-3 h-3 text-blue-500 mr-1" />;
      case 'SECURITY':
        return <ShieldAlert className="w-3 h-3 text-purple-600 mr-1" />;
      case 'PERFORMANCE':
        return <AlertTriangle className="w-3 h-3 text-amber-500 mr-1" />;
      default:
        return null;
    }
  };

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
    <div className="bg-white rounded-[12px] border border-slate-200/80 shadow-2xs p-5 sm:p-6 space-y-4 font-poppins">
      
      {/* Top Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        
        {/* Search Field with Snappy Local Input + Debounced Trigger */}
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSearchChange(localSearch);
              }
            }}
            placeholder="Search tickets by title, ID (e.g. FH-402), or reporter..."
            aria-label="Search tickets"
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs pl-9 pr-8 py-2 rounded-[8px] placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 transition-all font-normal"
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                onSearchChange('');
              }}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns & Reset Button */}
        <div className="flex items-center flex-wrap gap-2.5">
          
          {/* Status Filter */}
          <CustomSelect
            id="status-filter"
            label="Status"
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'NON_RESOLVED', label: 'Active In-Flight (Open/Dev/QA)' },
              { value: 'Open', label: 'Open' },
              { value: 'In Dev', label: 'In Dev' },
              { value: 'In QA', label: 'In QA' },
              { value: 'Resolved', label: 'Resolved' }
            ]}
          />

          {/* Assignee Filter with Zero-Staff Safety */}
          <CustomSelect
            id="assignee-filter"
            label="Assignee"
            value={assigneeFilter}
            onChange={onAssigneeFilterChange}
            options={
              safeTeam.length === 0
                ? [
                    { value: 'ALL', label: 'All Assignees' },
                    { value: 'UNASSIGNED', label: 'Unassigned Only' },
                    { value: 'NO_STAFF', label: 'No engineers available', disabled: true }
                  ]
                : [
                    { value: 'ALL', label: 'All Assignees' },
                    ...safeTeam.map((m) => ({ value: m.id, label: m.name })),
                    { value: 'UNASSIGNED', label: 'Unassigned Only' }
                  ]
            }
          />

          {/* Priority Filter */}
          <CustomSelect
            id="priority-filter"
            label="Priority"
            value={priorityFilter}
            onChange={onPriorityFilterChange}
            options={[
              { value: 'ALL', label: 'All Priorities' },
              { value: 'Urgent', label: 'Urgent (P0)' },
              { value: 'High', label: 'High (P1)' },
              { value: 'Medium', label: 'Medium (P2)' },
              { value: 'Low', label: 'Low (P3)' }
            ]}
          />

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                onResetFilters();
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-[8px] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

        </div>

      </div>

      {/* Active Multi-Dimensional Filter Pills Bar with 1-Click Reset (2.2) */}
      {hasActiveFilters && (
        <div className="flex items-center flex-wrap gap-2 px-1">
          <span className="text-[11px] font-medium text-slate-400">Active filters:</span>
          {categoryFilter && categoryFilter !== 'ALL' && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-[6px] text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
              <span>Category: {categoryFilter.replace('_', ' ')}</span>
              {onCategoryFilterChange && (
                <button
                  type="button"
                  onClick={() => onCategoryFilterChange('ALL')}
                  className="hover:text-purple-900 cursor-pointer"
                  title="Remove category filter"
                >
                  <X className="w-3 h-3 ml-0.5" />
                </button>
              )}
            </span>
          )}
          {statusFilter !== 'ALL' && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-[6px] text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <span>Status: {statusFilter === 'NON_RESOLVED' ? 'Active In-Flight' : statusFilter}</span>
              <button
                type="button"
                onClick={() => onStatusFilterChange('ALL')}
                className="hover:text-blue-900 cursor-pointer"
                title="Remove status filter"
              >
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </span>
          )}
          {priorityFilter !== 'ALL' && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-[6px] text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
              <span>Priority: {priorityFilter}</span>
              <button
                type="button"
                onClick={() => onPriorityFilterChange('ALL')}
                className="hover:text-rose-900 cursor-pointer"
                title="Remove priority filter"
              >
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </span>
          )}
          {assigneeFilter !== 'ALL' && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-[6px] text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <span>Assignee: {assigneeFilter === 'UNASSIGNED' ? 'Unassigned' : safeTeam.find(m => m.id === assigneeFilter)?.name || assigneeFilter}</span>
              <button
                type="button"
                onClick={() => onAssigneeFilterChange('ALL')}
                className="hover:text-amber-900 cursor-pointer"
                title="Remove assignee filter"
              >
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </span>
          )}
          {searchQuery.trim() && (
            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-[6px] text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <span>Query: "{searchQuery}"</span>
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('');
                  onSearchChange('');
                }}
                className="hover:text-slate-900 cursor-pointer"
                title="Clear search query"
              >
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setLocalSearch('');
              onResetFilters();
            }}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 ml-1 cursor-pointer underline underline-offset-2"
          >
            Reset All
          </button>
        </div>
      )}

      {/* Table Results Counter & Status Row */}
      <div className="flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2 pt-0.5">
        <div className="flex items-center space-x-2">
          <span>
            Showing <strong className="text-slate-800">{totalFiltered === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1}–{Math.min(safeCurrentPage * pageSize, totalFiltered)}</strong> of <strong className="text-slate-800">{totalFiltered}</strong> {totalFiltered === 1 ? 'incident' : 'incidents'}
            {hasActiveFilters && <span> (filtered from {safeTickets.length})</span>}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 inline-block" />
          <span className="font-mono text-[11px] text-slate-400">
            Last sync: {freshnessLabel}
          </span>
        </div>

        <div className="text-xs text-slate-400 font-normal">
          Click any row to triage telemetry and dispatch notes
        </div>
      </div>

      {/* Incidents Table Body / Empty States */}
      <div className="overflow-x-auto min-h-[220px]">
        {isLoading ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-6 h-6 mx-auto border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-mono">Syncing incidents from backend API...</p>
            <div className="space-y-2 max-w-xl mx-auto pt-2">
              <div className="h-9 bg-slate-100 rounded-[8px] animate-pulse" />
              <div className="h-9 bg-slate-50 rounded-[8px] animate-pulse" />
              <div className="h-9 bg-slate-100 rounded-[8px] animate-pulse" />
            </div>
          </div>
        ) : safeTickets.length === 0 ? (
          /* Empty State: Clear No Data Available in this workspace */
          <div className="py-16 px-4 text-center space-y-3">
            <div className="w-14 h-14 mx-auto bg-purple-50 border border-purple-200 rounded-[8px] flex items-center justify-center text-purple-600 shadow-2xs">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-medium text-slate-800">
                No data available in this workspace
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No active incidents found in this tenant database. Live telemetry listeners and WebSocket feeds are online and awaiting inbound events.
              </p>
            </div>
            <div className="flex items-center justify-center space-x-2.5 pt-2 flex-wrap gap-y-2">
              {onSeedDemo && (
                <button
                  type="button"
                  onClick={onSeedDemo}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-[8px] shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Quick Seed Demo Incidents</span>
                </button>
              )}
              {onOpenSimulatorModal && (
                <button
                  type="button"
                  onClick={onOpenSimulatorModal}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-medium bg-white border border-slate-200 hover:border-purple-300 text-purple-700 rounded-[8px] shadow-xs transition-colors cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Simulate SDK Telemetry</span>
                </button>
              )}
              {onOpenCreateModal && canCreateTicket && (
                <button
                  type="button"
                  onClick={onOpenCreateModal}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 text-xs font-medium bg-[#0b1b36] hover:bg-[#12284c] text-white rounded-[8px] shadow-xs transition-colors cursor-pointer"
                >
                  <span>Log New Incident</span>
                </button>
              )}
            </div>
          </div>
        ) : filteredAndSortedTickets.length === 0 ? (
          /* Filtered Empty State */
          <div className="py-14 px-4 text-center space-y-3">
            <div className="w-12 h-12 mx-auto bg-purple-50 border border-purple-100 rounded-[8px] flex items-center justify-center text-purple-600">
              <Search className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-slate-800">
                No incidents match your active filters
              </h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No tickets matched your search query or selected filter criteria.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                onResetFilters();
              }}
              className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-medium bg-[#0b1b36] hover:bg-[#12284c] text-white rounded-[8px] shadow-xs transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-left border-collapse" role="table">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                
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
              {paginatedTickets.map((ticket) => {
                const assignedMember = safeTeam.find((m) => m.id === ticket.assigned_to);
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
                    <td className="py-3.5 px-4 max-w-[280px]">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          {/* Ticket Code Tag */}
                          <span className="font-mono text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-[6px]">
                            {ticket.short_code}
                          </span>

                          {/* Category Tag */}
                          <span className="inline-flex items-center space-x-1 text-[10px] font-medium uppercase px-2 py-0.5 rounded-[6px] bg-amber-50 text-amber-700 border border-amber-200">
                            {renderCategoryIcon(ticket.category)}
                            <span>{ticket.category?.replace(/_/g, ' ') || 'Incident'}</span>
                          </span>

                          {/* Squad / Product Tag */}
                          {ticket.product_name && (
                            <span className="text-[11px] text-slate-500 font-normal">
                              {ticket.product_name}
                            </span>
                          )}

                          {ticket.assigned_squad && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded-[6px]">
                              {ticket.assigned_squad.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>

                        {/* Ticket Title - 200+ char unbroken titles safe with truncate, break-all & max-w-[280px] */}
                        <div 
                          className="text-xs font-medium text-slate-900 group-hover:text-blue-600 transition-colors truncate break-all max-w-[280px]"
                          title={ticket.title}
                        >
                          {ticket.title}
                        </div>

                        {/* Telemetry Indicator Tags */}
                        {renderTelemetryIndicator(ticket)}
                      </div>
                    </td>

                    {/* Priority Cell */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderPriorityBadge(ticket.severity)}
                    </td>

                    {/* Status Cell with Direct Inline Change Dropdown */}
                    <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {canChangeStatus ? (
                        <CustomSelect
                          value={normStatus}
                          onChange={(val) => onUpdateStatus?.(ticket.id, val.toUpperCase().replace(/\s+/g, '_'))}
                          options={[
                            { value: 'Open', label: 'Open' },
                            { value: 'Triaged', label: 'Triaged' },
                            { value: 'In Dev', label: 'In Dev' },
                            { value: 'In QA', label: 'In QA' },
                            { value: 'Resolved', label: 'Resolved' }
                          ]}
                          buttonClassName={`px-2 py-0.5 rounded-[6px] border text-xs ${
                            normStatus === 'Resolved'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : normStatus === 'In Dev' || normStatus === 'In QA'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        />
                      ) : (
                        <span className={`px-2 py-0.5 rounded-[6px] text-xs font-medium border inline-block ${
                          normStatus === 'Resolved'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : normStatus === 'In Dev' || normStatus === 'In QA'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {normStatus}
                        </span>
                      )}
                    </td>

                    {/* Assignee Cell with Zero-Staff Safe Inline Change Dropdown */}
                    <td className="py-3.5 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center space-x-2">
                        {/* Avatar */}
                        {assignedMember ? (
                          <div className={`w-6 h-6 rounded-full border flex items-center justify-center font-medium text-[9px] shadow-2xs flex-shrink-0 ${assignedMember.color}`}>
                            {assignedMember.avatarInitials}
                          </div>
                        ) : ticket.assigned_to_name ? (
                          <div className="w-6 h-6 rounded-full border flex items-center justify-center font-medium text-[9px] bg-indigo-100 text-indigo-700 border-indigo-200 flex-shrink-0">
                            {ticket.assigned_to_name.slice(0, 2).toUpperCase()}
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full border border-dashed border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center text-[10px] flex-shrink-0">
                            <UserX className="w-3 h-3" />
                          </div>
                        )}

                        {canAssign ? (
                          safeTeam.length === 0 ? (
                            <span
                              title="No engineers available on roster. Add staff in Staff Workload first."
                              className="inline-flex items-center space-x-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-[6px]"
                            >
                              <span>No staff available</span>
                            </span>
                          ) : (
                            <CustomSelect
                              value={ticket.assigned_to || 'UNASSIGNED'}
                              onChange={(val) => {
                                if (val === 'UNASSIGNED') {
                                  onUpdateAssignee?.(ticket.id, null, null);
                                } else {
                                  const m = safeTeam.find(mem => mem.id === val);
                                  onUpdateAssignee?.(ticket.id, val, m ? m.name : null);
                                }
                              }}
                              options={[
                                { value: 'UNASSIGNED', label: 'Unassigned' },
                                ...safeTeam.map(m => ({ value: m.id, label: m.name }))
                              ]}
                              buttonClassName={`px-2 py-0.5 rounded-[6px] border text-xs ${
                                ticket.assigned_to 
                                  ? 'bg-slate-50 border-slate-200 text-slate-700' 
                                  : 'border-dashed border-amber-300 bg-amber-50 text-amber-700'
                              }`}
                            />
                          )
                        ) : (
                          <span
                            title="Assignee reallocation restricted by role permissions"
                            className="text-xs font-medium text-slate-700 truncate max-w-[150px]"
                          >
                            {assignedMember ? assignedMember.name : ticket.assigned_to_name || 'Unassigned'}
                          </span>
                        )}
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

      {/* Pagination Controls for High Ticket Influx */}
      {totalFiltered > 0 && (
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 font-poppins select-none">
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
