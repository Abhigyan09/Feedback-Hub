import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Ticket, TeamMember, TicketCategory, TicketSeverity, UserRole } from './types';
import { normalizeSeverity, normalizeStatus } from './utils/formatters';
import { Sidebar } from './components/Sidebar';
import { DashboardHeader, TenantOption, HeaderUser } from './components/DashboardHeader';
import { SummaryCards } from './components/SummaryCards';
import { TeamMembersSection } from './components/TeamMembersSection';
import { TicketsTable, SortField, SortDirection } from './components/TicketsTable';
import { TicketInspectorModal } from './components/TicketInspectorModal';
import { CreateIncidentModal } from './components/CreateIncidentModal';
import { WidgetSimulatorModal } from './components/WidgetSimulatorModal';
import { ObservabilityGraphs } from './components/ObservabilityGraphs';
import { Bell, RefreshCw, Sparkles, Trash2, Cpu } from 'lucide-react';

export const App: React.FC = () => {
  // Tenant & Role State (Multi-tenant dynamic isolation)
  const [currentTenantId, setCurrentTenantId] = useState<string>('tenant-acme-corp-001');
  const [currentRole, setCurrentRole] = useState<UserRole>('developer');
  const [tenantsList, setTenantsList] = useState<TenantOption[]>([]);

  // Authenticated User Context (Dynamically loaded from backend)
  const [currentUser, setCurrentUser] = useState<HeaderUser>({
    name: 'Rahul Sharma (Dev)',
    role: 'Senior Backend Dev',
    initials: 'RS',
    email: 'dev.rahul@acme.com'
  });

  // Dynamic Data State (Loaded 100% from live backend API)
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);

  // Search & Filter state
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

  // 1. Fetch Dynamic Tickets from live Backend API
  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/tickets', {
        headers: {
          'X-Tenant-Id': currentTenantId,
          'X-User-Role': currentRole
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch dynamic tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenantId, currentRole]);

  // 2. Fetch Available Tenants List (for dynamic workspace switching)
  const fetchAllTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/tenants/all', {
        headers: {
          'X-Tenant-Id': currentTenantId,
          'X-User-Role': currentRole
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tenants) {
          setTenantsList(data.tenants);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch tenants list:', err);
    }
  }, [currentTenantId, currentRole]);

  // 3. Fetch Dynamic Tenant & Team Members from Backend
  const fetchTenantMetadata = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/tenants/current', {
        headers: {
          'X-Tenant-Id': currentTenantId,
          'X-User-Role': currentRole
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
            role: auth.role === 'squad_lead' ? 'Squad Lead & Arch' : auth.role === 'developer' ? 'Senior Backend Dev' : 'Client Representative',
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

  useEffect(() => {
    fetchTickets();
    fetchTenantMetadata();
    fetchAllTenants();
  }, [fetchTickets, fetchTenantMetadata, fetchAllTenants]);

  // 4. Real-Time WebSockets connection to live backend
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

    // Real-time live new incident broadcast
    socket.on('NEW_TICKET_ALERT', (data: { ticket: Ticket; message: string }) => {
      if (data?.ticket) {
        setAlertBanner(data.message || 'New Incident Received');
        setTickets(prev => [data.ticket, ...prev.filter(t => t.id !== data.ticket.id)]);
        setTimeout(() => setAlertBanner(null), 7000);
      }
    });

    // Real-time ticket updated or cleared
    socket.on('TICKET_UPDATED', (data: { ticket: Ticket }) => {
      if (data?.ticket) {
        setTickets(prev => prev.map(t => t.id === data.ticket.id ? data.ticket : t));
        setSelectedTicket(curr => curr && curr.id === data.ticket.id ? data.ticket : curr);
      } else {
        fetchTickets();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentTenantId, currentRole, fetchTickets]);

  // Compute dynamic counts from live backend data
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
  const handleUpdateTicketStatus = async (ticketId: string, newStatus: string) => {
    setTickets(prev =>
      prev.map(t => t.id === ticketId ? { ...t, status: newStatus as any } : t)
    );
    if (selectedTicket && selectedTicket.id === ticketId) {
      setSelectedTicket(prev => prev ? { ...prev, status: newStatus as any } : null);
    }

    try {
      await fetch(`/api/v1/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': currentTenantId,
          'X-User-Role': currentRole
        },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error('Failed to update status on server:', err);
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
          'X-Tenant-Id': currentTenantId,
          'X-User-Role': currentRole
        },
        body: JSON.stringify({
          assigneeId: newAssigneeId,
          assigneeName: newAssigneeName
        })
      });
    } catch (err) {
      console.error('Failed to update assignee on server:', err);
      fetchTickets();
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
        'X-Tenant-Id': currentTenantId,
        'X-User-Role': currentRole
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
          'X-Tenant-Id': currentTenantId,
          'X-User-Role': currentRole
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
          'X-Tenant-Id': currentTenantId,
          'X-User-Role': currentRole
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
    <div className="min-h-screen bg-[#f4f6fb] text-slate-800 flex font-sans selection:bg-purple-500 selection:text-white">
      
      {/* 1. Dark Navy Left Sidebar with dynamic badge */}
      <Sidebar activeTab="dashboard" openCount={openCount} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* 2. Dynamic Dashboard Header with live workspace selector, role switcher, and user details */}
        <DashboardHeader
          tenants={tenantsList}
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
              className="text-purple-300 hover:text-white font-bold"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* Dashboard Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          
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
              {/* Simulate SDK Ingest */}
              <button
                type="button"
                onClick={() => setIsSimulatorOpen(true)}
                title="Test live client SDK crash / error telemetry"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-purple-300 text-purple-700 rounded-[2px] text-xs font-semibold shadow-xs transition-colors"
              >
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                <span>Simulate Ingest</span>
              </button>

              {/* Seed Demo Incidents */}
              <button
                type="button"
                onClick={handleSeedDemo}
                title="Seed 3 dynamic test incidents"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-purple-300 text-slate-700 rounded-[2px] text-xs font-semibold shadow-xs transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Quick Seed</span>
              </button>

              {/* Clear workspace if tickets exist */}
              {tickets.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearTickets}
                  title="Clear all tickets in this workspace"
                  className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 rounded-[2px] text-xs font-semibold shadow-xs transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              )}

              {/* Refresh from API */}
              <button
                type="button"
                onClick={fetchTickets}
                title="Refresh live tickets from API"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:text-purple-700 rounded-[2px] text-xs font-semibold shadow-xs hover:border-purple-200 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-purple-600 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* 3. Four Summary Cards with 100% dynamic calculations */}
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

          {/* 5. Live Dynamic Tickets Table */}
          <section aria-labelledby="incident-table-heading" className="space-y-2">
            <h2 id="incident-table-heading" className="sr-only">
              Incidents Table
            </h2>
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
            />
          </section>

        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200/80 bg-white py-4 px-6 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
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

      {/* Interactive Ticket Details Modal */}
      <TicketInspectorModal
        ticket={selectedTicket}
        teamMembers={teamMembers}
        onClose={() => setSelectedTicket(null)}
        onUpdateStatus={handleUpdateTicketStatus}
        onUpdateAssignee={handleUpdateTicketAssignee}
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
        onTicketCreated={() => {
          fetchTickets();
          setAlertBanner('Client SDK telemetry ingested successfully.');
          setTimeout(() => setAlertBanner(null), 5000);
        }}
      />

    </div>
  );
};
