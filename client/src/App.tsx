import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Ticket, Tenant, UserRole, RolePermissionsMatrix, TeamMember, TicketCategory, TicketSeverity } from './types';
import { normalizeSeverity, normalizeStatus } from './utils/formatters';
import { Sidebar, SidebarView } from './components/Sidebar';
import { DashboardHeader, HeaderUser } from './components/DashboardHeader';
import { SummaryCards } from './components/SummaryCards';
import { TeamMembersSection } from './components/TeamMembersSection';
import { TicketsTable, SortField, SortDirection } from './components/TicketsTable';
import { TicketDetailModal } from './components/TicketDetailModal';
import { CreateIncidentModal } from './components/CreateIncidentModal';
import { WidgetSimulatorModal } from './components/WidgetSimulatorModal';
import { ObservabilityGraphs } from './components/ObservabilityGraphs';
import { NeedsAttentionSection } from './components/NeedsAttentionSection';
import { TicketList } from './components/TicketList';
import { SettingsView } from './components/SettingsView';
import { 
  Bell, 
  RefreshCw, 
  Sparkles, 
  Trash2, 
  Cpu, 
  Layers, 
  CheckCircle2 
} from 'lucide-react';

export const App: React.FC = () => {
  // Tenant & Role State (Multi-tenant dynamic isolation with localStorage persistence)
  const [currentTenantId, setCurrentTenantId] = useState<string>(() => {
    return localStorage.getItem('fb_current_tenant_id') || 'tenant-acme-corp-001';
  });
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    return (localStorage.getItem('fb_current_role') as UserRole) || 'tenant_admin';
  });
  const [tenants, setTenants] = useState<Tenant[]>([]);

  // Authenticated User Context (Dynamically loaded from backend)
  const [currentUser, setCurrentUser] = useState<HeaderUser>({
    name: 'Elena Rostova (Admin)',
    role: 'Tenant Administrator',
    initials: 'ER',
    email: 'admin@acme.com'
  });

  // Dynamic Data State (Loaded 100% from live backend API)
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [permissionsMatrix, setPermissionsMatrix] = useState<RolePermissionsMatrix | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);

  // Sidebar navigation state with localStorage persistence
  const [currentView, setCurrentView] = useState<SidebarView>(() => {
    return (localStorage.getItem('fb_current_view') as SidebarView) || 'dashboard';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Search & Filter state for dashboard table
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [activeCardFilter, setActiveCardFilter] = useState<'OPEN' | 'UNASSIGNED' | 'URGENT' | 'RESOLVED' | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('reported');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Dynamic Greeting based on real time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  // Sync state changes to localStorage
  useEffect(() => {
    localStorage.setItem('fb_current_tenant_id', currentTenantId);
  }, [currentTenantId]);

  useEffect(() => {
    localStorage.setItem('fb_current_role', currentRole);
  }, [currentRole]);

  useEffect(() => {
    localStorage.setItem('fb_current_view', currentView);
  }, [currentView]);

  // 1. Fetch Dynamic Tickets from live Backend API with real latency measurement
  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    const start = performance.now();
    try {
      const res = await fetch(`/api/v1/tickets?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole,
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      const elapsed = Math.round(performance.now() - start);
      setApiLatencyMs(elapsed);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch dynamic tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenantId, currentRole]);

  // 2. Fetch Available Tenants List
  const fetchAllTenants = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tenants/all?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tenants) {
          setTenants(data.tenants);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch tenants list:', err);
    }
  }, [currentTenantId, currentRole]);

  // 3. Fetch Dynamic Tenant & Team Members from Backend
  const fetchTenantMetadata = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tenants/current?_t=${Date.now()}`, {
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      if (res.ok) {
        const data = await res.json();
        
        // Dynamic Authenticated User Context from API
        if (data.active_auth) {
          const auth = data.active_auth;
          const initials = (auth.fullName || 'User')
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          setCurrentUser({
            name: auth.fullName || 'Active Engineer',
            role: auth.role === 'squad_lead' ? 'Squad Lead & Arch' : auth.role === 'developer' ? 'Senior Backend Dev' : auth.role === 'tenant_admin' ? 'Tenant Administrator' : 'Client Representative',
            initials: initials || 'EU',
            email: auth.email || 'engineer@feedbackhub.io'
          });
        }

        // Dynamic Team Members list
        if (data.team_members) {
          const mapped: TeamMember[] = data.team_members.map((u: any, idx: number) => ({
            id: u.id,
            name: u.full_name,
            role: u.role === 'squad_lead' ? 'Squad Lead & Arch' : 'Senior Engineer',
            email: u.email,
            avatarInitials: u.full_name
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase(),
            status: idx === 0 ? 'ON_CALL' : 'ONLINE',
            color: idx === 0 
              ? 'bg-purple-100 text-purple-700 border-purple-300' 
              : idx === 1 
              ? 'bg-indigo-100 text-indigo-700 border-indigo-300' 
              : 'bg-violet-100 text-violet-700 border-violet-300'
          }));
          setTeamMembers(mapped);
        }
      }
    } catch (err) {
      console.warn('Tenant metadata fetch error:', err);
    }
  }, [currentTenantId, currentRole]);

  // 4. Fetch Role Permissions Matrix
  const loadTenantPermissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tenants/permissions?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole,
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.matrix) {
          setPermissionsMatrix(data.matrix);
        }
      }
    } catch (err) {
      console.error('Failed to load permissions matrix:', err);
    }
  }, [currentTenantId, currentRole]);

  useEffect(() => {
    fetchTickets();
    fetchTenantMetadata();
    fetchAllTenants();
    loadTenantPermissions();
  }, [fetchTickets, fetchTenantMetadata, fetchAllTenants, loadTenantPermissions]);

  // 5. Real-Time WebSockets connection to live backend
  useEffect(() => {
    const socket: Socket = io({
      query: {
        tenantId: currentTenantId,
        role: currentRole
      }
    });

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('NEW_TICKET_ALERT', (data: { ticket: Ticket; message: string }) => {
      if (data?.ticket) {
        setAlertBanner(data.message || 'New Incident Received');
        setTickets(prev => [data.ticket, ...prev.filter(t => t.id !== data.ticket.id)]);
        setLastUpdated(new Date());
        setTimeout(() => setAlertBanner(null), 7000);
      }
    });

    socket.on('TICKET_UPDATED', (data: { ticket: Ticket }) => {
      if (data?.ticket) {
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
        setSelectedTicket(curr => curr && curr.id === data.ticket.id ? data.ticket : curr);
        setLastUpdated(new Date());
      } else {
        fetchTickets();
      }
    });

    socket.on('TICKET_DELETED', (data: { ticketId: string; message: string }) => {
      setAlertBanner(data.message);
      setTimeout(() => setAlertBanner(null), 6000);
      fetchTickets();
    });

    socket.on('SETTINGS_UPDATED', () => {
      fetchAllTenants();
      fetchTickets();
    });

    socket.on('PERMISSIONS_UPDATED', (data: { matrix?: RolePermissionsMatrix; message?: string }) => {
      if (data.matrix) {
        setPermissionsMatrix(data.matrix);
      }
      if (data.message) {
        setAlertBanner(data.message);
        setTimeout(() => setAlertBanner(null), 5000);
      }
      fetchTickets();
    });

    return () => {
      socket.disconnect();
    };
  }, [currentTenantId, currentRole, fetchTickets, fetchAllTenants]);

  // Compute dynamic counts from live backend data
  const totalCount = tickets.length;

  const openCount = useMemo(() => 
    tickets.filter(t => normalizeStatus(t.status) !== 'Resolved').length, 
    [tickets]
  );

  const unassignedCount = useMemo(() => 
    tickets.filter(t => !t.assigned_to).length, 
    [tickets]
  );

  const urgentCount = useMemo(() => 
    tickets.filter(t => normalizeSeverity(t.severity) === 'Urgent').length, 
    [tickets]
  );

  const resolvedCount = useMemo(() => 
    tickets.filter(t => normalizeStatus(t.status) === 'Resolved').length, 
    [tickets]
  );

  const resolvedTickets = useMemo(() =>
    tickets.filter(t => normalizeStatus(t.status) === 'Resolved' || t.status === 'RESOLVED' || t.status === 'CLOSED'),
    [tickets]
  );

  // Compute open-ticket count per team member dynamically
  const openTicketCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    teamMembers.forEach(m => {
      counts[m.id] = tickets.filter(
        t => t.assigned_to === m.id && normalizeStatus(t.status) !== 'Resolved'
      ).length;
    });
    return counts;
  }, [tickets, teamMembers]);

  // Handle clicking on summary cards to toggle filter
  const handleCardClick = (type: 'OPEN' | 'UNASSIGNED' | 'URGENT' | 'RESOLVED') => {
    if (activeCardFilter === type) {
      setActiveCardFilter(null);
      setStatusFilter('ALL');
      setAssigneeFilter('ALL');
      setPriorityFilter('ALL');
      return;
    }

    setActiveCardFilter(type);
    switch (type) {
      case 'OPEN':
        setStatusFilter('Open');
        setAssigneeFilter('ALL');
        setPriorityFilter('ALL');
        break;
      case 'UNASSIGNED':
        setAssigneeFilter('UNASSIGNED');
        setStatusFilter('ALL');
        setPriorityFilter('ALL');
        break;
      case 'URGENT':
        setPriorityFilter('Urgent');
        setStatusFilter('ALL');
        setAssigneeFilter('ALL');
        break;
      case 'RESOLVED':
        setStatusFilter('Resolved');
        setAssigneeFilter('ALL');
        setPriorityFilter('ALL');
        break;
    }
  };

  // Handle quick filter by selecting team member
  const handleSelectTeamMember = (memberId: string | null) => {
    if (memberId === null) {
      setAssigneeFilter('ALL');
    } else {
      setAssigneeFilter(memberId);
      setActiveCardFilter(null);
    }
  };

  // Sorting handler
  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'reported' ? 'desc' : 'asc');
    }
  };

  // Reset all filters
  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setAssigneeFilter('ALL');
    setPriorityFilter('ALL');
    setActiveCardFilter(null);
  }, []);

  // Live status update via PATCH /api/v1/tickets/:id/status
  const handleUpdateStatus = async (ticketId: string, newStatus: string, note?: string) => {
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({ status: newStatus, note })
      });
      if (res.ok) {
        fetchTickets();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
      fetchTickets();
    }
  };

  // Live assignee update via PATCH /api/v1/tickets/:id/assignee
  const handleUpdateTicketAssignee = async (ticketId: string, newAssigneeId: string | null, newAssigneeName: string | null) => {
    setTickets(prev =>
      prev.map(t => t.id === ticketId ? {
        ...t,
        assigned_to: newAssigneeId || undefined,
        assigned_to_name: newAssigneeName || undefined
      } : t)
    );
    if (selectedTicket && selectedTicket.id === ticketId) {
      setSelectedTicket(prev => prev ? {
        ...prev,
        assigned_to: newAssigneeId || undefined,
        assigned_to_name: newAssigneeName || undefined
      } : null);
    }

    try {
      await fetch(`/api/v1/tickets/${ticketId}/assignee`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          assigneeId: newAssigneeId,
          assigneeName: newAssigneeName
        })
      });
      fetchTickets();
    } catch (err) {
      console.error('Failed to update assignee on server:', err);
      fetchTickets();
    }
  };

  // Handle full ticket update (Edit)
  const handleUpdateTicket = async (ticketId: string, updatedFields: Partial<Ticket>) => {
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify(updatedFields)
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update ticket');
      }
      fetchTickets();
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(prev => prev ? { ...prev, ...updatedFields } : null);
      }
    } catch (err: any) {
      console.error('Failed to update ticket:', err);
      throw err;
    }
  };

  // Handle delete ticket
  const handleDeleteTicket = async (ticketId: string) => {
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}`, {
        method: 'DELETE',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete ticket');
      }
      fetchTickets();
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(null);
      }
    } catch (err: any) {
      console.error('Failed to delete ticket:', err);
      throw err;
    }
  };

  // Handle add event / dev note
  const handleAddEvent = async (ticketId: string, content: string, isInternalOnly: boolean) => {
    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({ content, is_internal_only: isInternalOnly })
      });
      if (res.ok) {
        fetchTickets();
      }
    } catch (err) {
      console.error('Failed to add event:', err);
    }
  };

  // Live create ticket via POST /api/v1/tickets
  const handleCreateTicket = async (ticketData: {
    title: string;
    description: string;
    category: TicketCategory;
    severity: TicketSeverity;
    assigned_to?: string;
    assigned_to_name?: string;
    reporter_email?: string;
  }) => {
    const res = await fetch('/api/v1/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      },
      body: JSON.stringify(ticketData)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.ticket) {
        setTickets(prev => [data.ticket, ...prev]);
        setAlertBanner(`Incident ${data.ticket.short_code} logged dynamically.`);
        setTimeout(() => setAlertBanner(null), 5000);
      }
    }
  };

  // Quick Seed 3 live dynamic incidents
  const handleSeedDemo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/tickets/seed-demo', {
        method: 'POST',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      if (res.ok) {
        fetchTickets();
        setAlertBanner('Seeded 3 dynamic live telemetry incidents.');
        setTimeout(() => setAlertBanner(null), 5000);
      }
    } catch (err) {
      console.error('Failed to seed demo tickets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear all tickets for clean workspace state
  const handleClearTickets = async () => {
    if (!window.confirm('Clear all incidents for this tenant? (Resets workspace to 0 tickets)')) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/tickets/clear', {
        method: 'DELETE',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      if (res.ok) {
        setTickets([]);
        setSelectedTicket(null);
        setAlertBanner('All incidents cleared for this workspace.');
        setTimeout(() => setAlertBanner(null), 4000);
      }
    } catch (err) {
      console.error('Failed to clear tickets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f4f6fb] text-slate-900 flex font-sans select-none">
      
      {/* Sleek Dark Left Sidebar */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        totalTicketsCount={totalCount}
        resolvedTicketsCount={resolvedCount}
        onLogout={() => setIsLogoutModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        activeTab={currentView}
        openCount={openCount}
      />

      {/* Main Content Area - Dedicated Vertical Scroll Container */}
      <div className="flex-1 h-screen flex flex-col min-w-0 overflow-y-auto overflow-x-hidden bg-[#f4f6fb]">
        
        {/* Dynamic Dashboard Header with live workspace selector, role switcher, and user details */}
        <DashboardHeader
          tenants={tenants}
          currentTenantId={currentTenantId}
          onSelectTenant={(id) => {
            setCurrentTenantId(id);
            setActiveCardFilter(null);
          }}
          currentRole={currentRole}
          onSelectRole={setCurrentRole}
          user={currentUser}
          totalOpenTickets={openCount}
          totalTickets={tickets.length}
          urgentTickets={urgentCount}
          tickets={tickets}
          onNewIncidentClick={() => setIsCreateModalOpen(true)}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          onSeedDemo={handleSeedDemo}
          onClearTickets={handleClearTickets}
        />

        {/* Real-time Incident Alert Banner */}
        {alertBanner && (
          <div className="bg-purple-900 border-b border-purple-800 text-purple-100 px-6 py-2.5 text-xs font-semibold flex items-center justify-between animate-in slide-in-from-top duration-200">
            <div className="flex items-center space-x-2.5">
              <Bell className="w-4 h-4 text-purple-300 animate-bounce" />
              <span>{alertBanner}</span>
            </div>
            <button
              onClick={() => setAlertBanner(null)}
              className="text-purple-300 hover:text-white font-bold cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* VIEW 1: DASHBOARD (Edge-to-Edge Observability & Incident Workspace) */}
        {currentView === 'dashboard' && (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full animate-in fade-in duration-150">
            
            {/* Greeting & Operations Breadcrumb Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {greeting}, {currentUser.name} 👋
                  </h1>
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-[2px] text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span>{isConnected ? 'Live WebSockets Connected' : 'Syncing Live Engine'}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Live multi-tenant telemetry bridge with instant client feedback and engineering on-call triage.
                </p>
              </div>

              {/* Quick action buttons */}
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <button
                  type="button"
                  onClick={() => setIsSimulatorOpen(true)}
                  title="Test live client SDK crash / error telemetry"
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-purple-300 text-purple-700 rounded-[2px] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Cpu className="w-3.5 h-3.5 text-purple-600" />
                  <span>Simulate Ingest</span>
                </button>

                <button
                  type="button"
                  onClick={handleSeedDemo}
                  title="Seed 3 dynamic test incidents"
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-purple-300 text-slate-700 rounded-[2px] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Quick Seed</span>
                </button>

                {tickets.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearTickets}
                    title="Clear all tickets in this workspace"
                    className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 rounded-[2px] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={fetchTickets}
                  title="Refresh live tickets from API"
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:text-purple-700 rounded-[2px] text-xs font-semibold shadow-xs hover:border-purple-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-purple-600 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* 2. Needs Attention Area - Urgent & Unassigned, SLA Alerts, Client Blockers */}
            <NeedsAttentionSection
              tickets={tickets}
              teamMembers={teamMembers}
              onSelectTicket={setSelectedTicket}
            />

            {/* 3. Four Summary Cards with dynamic calculations */}
            <SummaryCards
              tickets={tickets}
              openCount={openCount}
              unassignedCount={unassignedCount}
              urgentCount={urgentCount}
              resolvedCount={resolvedCount}
              activeFilterType={activeCardFilter}
              onCardClick={handleCardClick}
            />

            {/* 4. Telemetry Observability & Triage Velocity Graphs */}
            <ObservabilityGraphs
              tickets={tickets}
              teamMembers={teamMembers}
              isLoading={isLoading}
              onSeedDemo={handleSeedDemo}
              onSimulateTelemetry={() => setIsSimulatorOpen(true)}
              apiLatencyMs={apiLatencyMs}
              onSelectCategory={(cat) => {
                setSearchQuery(cat);
                setActiveCardFilter(null);
              }}
            />

            {/* 5. Dynamic Squad Members Section */}
            <TeamMembersSection
              members={teamMembers}
              openTicketCounts={openTicketCounts}
              selectedAssigneeId={assigneeFilter === 'ALL' || assigneeFilter === 'UNASSIGNED' ? null : assigneeFilter}
              onSelectAssignee={handleSelectTeamMember}
            />

            {/* 6. Live Dynamic Tickets Table */}
            <section aria-labelledby="incident-table-heading" className="space-y-2">
              <h2 id="incident-table-heading" className="sr-only">Incidents Table</h2>
              <TicketsTable
                tickets={tickets}
                teamMembers={teamMembers}
                searchQuery={searchQuery}
                onSearchChange={(q) => {
                  setSearchQuery(q);
                  setActiveCardFilter(null);
                }}
                statusFilter={statusFilter}
                onStatusFilterChange={(s) => {
                  setStatusFilter(s);
                  setActiveCardFilter(null);
                }}
                assigneeFilter={assigneeFilter}
                onAssigneeFilterChange={(a) => {
                  setAssigneeFilter(a);
                  setActiveCardFilter(null);
                }}
                priorityFilter={priorityFilter}
                onPriorityFilterChange={(p) => {
                  setPriorityFilter(p);
                  setActiveCardFilter(null);
                }}
                sortField={sortField}
                sortDirection={sortDirection}
                onSortChange={handleSortChange}
                onResetFilters={handleResetFilters}
                onSelectTicket={setSelectedTicket}
                onOpenCreateModal={() => setIsCreateModalOpen(true)}
                onOpenSimulatorModal={() => setIsSimulatorOpen(true)}
                onSeedDemo={handleSeedDemo}
                onUpdateStatus={handleUpdateStatus}
                onUpdateAssignee={handleUpdateTicketAssignee}
                lastUpdated={lastUpdated}
                isLoading={isLoading}
              />
            </section>

          </main>
        )}

        {/* VIEW 2: TOTAL TICKETS */}
        {currentView === 'total-tickets' && (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full animate-in fade-in duration-150">
            {/* Header Box */}
            <div className="bg-white border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-lg font-bold text-slate-900 font-mono uppercase tracking-wide flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    <span>Total Tickets Registry</span>
                  </h2>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                    {totalCount} Total
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Complete registry of all ingested incidents, bug reports, feature ideas, and customer feedback across all client products.
                </p>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-mono flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ Ingest Incident</span>
                </button>
                <button
                  onClick={fetchTickets}
                  disabled={isLoading}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Main Ticket Queue */}
            <TicketList
              tickets={tickets}
              onSelectTicket={setSelectedTicket}
              currentRole={currentRole}
              isLoading={isLoading}
              onOpenWidgetSimulator={() => setIsSimulatorOpen(true)}
              onUpdateStatus={handleUpdateStatus}
              onDeleteTicket={handleDeleteTicket}
              permissionsMatrix={permissionsMatrix}
            />
          </main>
        )}

        {/* VIEW 3: TICKETS RESOLVED */}
        {currentView === 'resolved-tickets' && (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full animate-in fade-in duration-150">
            {/* Header Box */}
            <div className="bg-white border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-lg font-bold text-slate-900 font-mono uppercase tracking-wide flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Resolved Incidents & SLA Compliance</span>
                  </h2>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                    {resolvedCount} Resolved
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Closed and verified incidents meeting enterprise SLA resolution benchmarks with complete audit trail.
                </p>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                <button
                  onClick={fetchTickets}
                  disabled={isLoading}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Main Ticket Queue for Resolved */}
            <TicketList
              tickets={resolvedTickets}
              onSelectTicket={setSelectedTicket}
              currentRole={currentRole}
              isLoading={isLoading}
              onOpenWidgetSimulator={() => setIsSimulatorOpen(true)}
              onUpdateStatus={handleUpdateStatus}
              onDeleteTicket={handleDeleteTicket}
              isResolvedOnly={true}
              permissionsMatrix={permissionsMatrix}
            />
          </main>
        )}

        {/* VIEW 4: SETTINGS (Dynamic RBAC Permissions Matrix) */}
        {currentView === 'settings' && (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full animate-in fade-in duration-150">
            <SettingsView 
              currentTenantId={currentTenantId}
              currentRole={currentRole}
              permissionsMatrix={permissionsMatrix}
              onTenantUpdated={() => {
                fetchAllTenants();
                fetchTickets();
                loadTenantPermissions();
              }}
            />
          </main>
        )}

        {/* Footer */}
        <footer className="border-t border-slate-200/80 bg-white py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 w-full mt-auto">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-700">FEEDBACK-HUB ENTERPRISE</span>
            <span>•</span>
            <span>DYNAMIC REST API & WEBSOCKET ENGINE</span>
          </div>
          <div className="flex items-center space-x-3 text-slate-500">
            <span className="text-purple-600 font-medium">REAL-TIME TELEMETRY</span>
            <span>•</span>
            <span>POSTGRESQL 16 RLS READY</span>
          </div>
        </footer>

      </div>

      {/* Ticket Details & Edit / Delete Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        currentRole={currentRole}
        onUpdateStatus={handleUpdateStatus}
        onAddEvent={handleAddEvent}
        onUpdateTicket={handleUpdateTicket}
        onDeleteTicket={handleDeleteTicket}
        permissionsMatrix={permissionsMatrix}
      />

      {/* Create Live Incident Modal */}
      <CreateIncidentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        teamMembers={teamMembers}
        onCreateTicket={handleCreateTicket}
      />

      {/* Client SDK Telemetry Simulator Modal */}
      <WidgetSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        currentTenantId={currentTenantId}
        onTicketCreated={() => {
          fetchTickets();
          setAlertBanner('Client SDK telemetry ingested successfully.');
          setTimeout(() => setAlertBanner(null), 5000);
        }}
      />

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 w-full max-w-sm p-6 space-y-4 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">Sign Out</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to end your current tenant session?
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-3.5 py-1.5 border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  setCurrentRole('client_user');
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
