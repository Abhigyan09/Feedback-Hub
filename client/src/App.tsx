import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { Toast } from './components/Toast';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { Ticket, Tenant, UserRole, RolePermissionsMatrix, TeamMember, TicketCategory, TicketSeverity } from './types';
import { normalizeSeverity, normalizeStatus } from './utils/formatters';
import { safeNumber } from './utils/edgeCaseHelpers';
import { Sidebar, SidebarView } from './components/Sidebar';
import { DashboardHeader, HeaderUser } from './components/DashboardHeader';
import { SummaryCards } from './components/SummaryCards';
import { FeedbackChannelsSection } from './components/FeedbackChannelsSection';
import { TicketsTable, SortField, SortDirection } from './components/TicketsTable';
import { TicketDetailModal } from './components/TicketDetailModal';
import { CreateIncidentModal } from './components/CreateIncidentModal';
import { WidgetSimulatorModal } from './components/WidgetSimulatorModal';
import { ObservabilityGraphs } from './components/ObservabilityGraphs';
import { NeedsAttentionSection } from './components/NeedsAttentionSection';
import { TicketList } from './components/TicketList';
import { SettingsView } from './components/SettingsView';
import { StaffWorkloadView } from './components/StaffWorkloadView';
import { hasRolePermission } from './constants/permissions';
import { 
  Bell, 
  RefreshCw, 
  Sparkles, 
  Trash2, 
  Cpu, 
  Layers, 
  CheckCircle2,
  Plus,
  Loader2
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user, accessToken, logout, authFetch } = useAuth();

  // Tenant & Role State (Multi-tenant dynamic isolation with localStorage persistence or verified user)
  const [currentTenantId, setCurrentTenantId] = useState<string>(() => {
    return localStorage.getItem('fb_current_tenant_id') || user?.tenant_id || 'tenant-acme-corp-001';
  });
  const currentTenantIdRef = useRef<string>(currentTenantId);
  useEffect(() => {
    currentTenantIdRef.current = currentTenantId;
  }, [currentTenantId]);
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    return (localStorage.getItem('fb_current_role') as UserRole) || user?.role || 'tenant_admin';
  });
  const [tenants, setTenants] = useState<Tenant[]>([]);

  // Authenticated User Context (Dynamically bound to real authenticated user or API response)
  const [currentUser, setCurrentUser] = useState<HeaderUser>(() => ({
    name: user?.full_name || user?.email || 'Elena Rostova',
    role: user?.role === 'squad_lead' ? 'Squad Lead & Arch' : user?.role === 'developer' ? 'Senior Backend Dev' : user?.role === 'tenant_admin' ? 'Tenant Administrator' : user?.role === 'super_admin' ? 'Global Super Admin' : 'Tenant Administrator',
    initials: (user?.full_name || user?.email || 'ER')
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    email: user?.email || 'admin@acme.com'
  }));

  // Synchronize dynamic user attributes when authenticated user is restored or changes
  useEffect(() => {
    if (user) {
      setCurrentUser({
        name: user.full_name || user.email,
        role: user.role === 'squad_lead' ? 'Squad Lead & Arch' : user.role === 'developer' ? 'Senior Backend Dev' : user.role === 'tenant_admin' ? 'Tenant Administrator' : user.role === 'super_admin' ? 'Global Super Admin' : 'Tenant Administrator',
        initials: (user.full_name || user.email)
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        email: user.email
      });
      if (user.tenant_id) {
        setCurrentTenantId(user.tenant_id);
      }
      if (user.role) {
        setCurrentRole(user.role);
      }
    }
  }, [user]);

  // Dynamic Data State (Loaded 100% from live backend API)
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [permissionsMatrix, setPermissionsMatrix] = useState<RolePermissionsMatrix | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // WebSocket burst-throttling & batching refs
  const pendingNewTicketsRef = useRef<Ticket[]>([]);
  const pendingUpdatedTicketsRef = useRef<Map<string, Ticket>>(new Map());
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState<boolean>(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal Scrollbar Trapping: Lock document.body and main scroll container overflow when any modal is open
  const isAnyModalOpen = Boolean(selectedTicket || isCreateModalOpen || isSimulatorOpen || isLogoutModalOpen || isClearConfirmOpen);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isAnyModalOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const mainContainer = document.getElementById('main-scroll-container');
      const originalContainerOverflow = mainContainer ? mainContainer.style.overflow : '';
      if (mainContainer) mainContainer.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        if (mainContainer) mainContainer.style.overflow = originalContainerOverflow;
      };
    }
  }, [isAnyModalOpen]);

  // Sidebar navigation state with localStorage persistence
  const [currentView, setCurrentView] = useState<SidebarView>(() => {
    return (localStorage.getItem('fb_current_view') as SidebarView) || 'dashboard';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('fb_sidebar_collapsed');
    if (saved !== null) return saved === 'true';
    return typeof window !== 'undefined' && window.innerWidth < 1024;
  });

  useEffect(() => {
    localStorage.setItem('fb_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Disable browser automatic scroll restoration so page doesn't anchor at bottom on reload
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Guarantee that the view always starts at top when switching navigation tabs
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [currentView]);

  // Search & Filter state for dashboard table
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
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

  // 1. Fetch Dynamic Tickets from live Backend API with real latency measurement and resilient retry
  const fetchTickets = useCallback(async () => {
    setIsLoading(true);
    const start = performance.now();
    try {
      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole,
        'pragma': 'no-cache',
        'cache-control': 'no-cache'
      };
      const res = await authFetch(`/api/v1/tickets?_t=${Date.now()}`, {
        cache: 'no-store',
        headers
      });
      const elapsed = Math.round(performance.now() - start);
      setApiLatencyMs(elapsed);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setTickets(data?.tickets || []);
        setLastUpdated(new Date());
        setAlertBanner(curr => (curr && curr.includes('Network connection interrupted') ? null : curr));
      } else {
        const err = await res.json().catch(() => ({}));
        console.warn('API returned non-OK status on fetchTickets:', res.status, err);
      }
    } catch (err) {
      console.error('Failed to fetch dynamic tickets:', err);
      setAlertBanner('Network connection interrupted. Retrying live sync...');
      if (!retryTimeoutRef.current) {
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          fetchTickets();
        }, 4000);
      }
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, currentTenantId, currentRole]);

  // 2. Fetch Available Tenants List (Restricted strictly to super_admin by RBAC specification)
  const fetchAllTenants = useCallback(async () => {
    if (currentRole !== 'super_admin') {
      return;
    }
    try {
      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch(`/api/v1/tenants/all?_t=${Date.now()}`, {
        cache: 'no-store',
        headers
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.tenants) {
          setTenants(data.tenants);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch tenants list:', err);
    }
  }, [authFetch, currentTenantId, currentRole]);

  // 3. Fetch Dynamic Tenant & Team Members from Backend
  const fetchTenantMetadata = useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch(`/api/v1/tenants/current?_t=${Date.now()}`, {
        headers
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        
        // For non-super_admin users, populate the active tenant so tenant switcher and header have valid data
        if (data?.tenant && currentRole !== 'super_admin') {
          setTenants([data.tenant]);
        }

        // Dynamic Authenticated User Context from API
        if (data.active_auth) {
          const auth = data.active_auth;
          const cleanName = (auth.fullName || 'Active Engineer').replace(/\s*\([^)]*\)$/, '');
          const initials = (cleanName || 'User')
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();

          setCurrentUser({
            name: cleanName,
            role: auth.role === 'squad_lead' ? 'Squad Lead & Arch' : auth.role === 'developer' ? 'Senior Backend Dev' : auth.role === 'tenant_admin' ? 'Tenant Administrator' : auth.role === 'super_admin' ? 'Super Administrator' : auth.role === 'support_agent' ? 'Support Agent' : 'Client Representative',
            initials: initials || 'EU',
            email: auth.email || 'engineer@feedbackhub.io'
          });
        }

        // Dynamic Team Members list
        if (data.team_members) {
          const colorList = [
            'bg-purple-100 text-purple-700 border-purple-300',
            'bg-indigo-100 text-indigo-700 border-indigo-300',
            'bg-violet-100 text-violet-700 border-violet-300',
            'bg-blue-100 text-blue-700 border-blue-300',
            'bg-emerald-100 text-emerald-700 border-emerald-300',
            'bg-amber-100 text-amber-700 border-amber-300',
          ];
          const mapped: TeamMember[] = data.team_members.map((u: any, idx: number) => ({
            id: u.id,
            name: u.full_name,
            role: u.role === 'squad_lead' 
              ? 'Squad Lead & Arch' 
              : u.role === 'developer' 
              ? 'Senior Engineer' 
              : u.role === 'tenant_admin' 
              ? 'Tenant Administrator' 
              : u.role === 'super_admin' 
              ? 'Super Administrator' 
              : 'Support Specialist',
            email: u.email,
            avatarInitials: (u.full_name || 'EM')
              .replace(/\s*\([^)]*\)$/, '')
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() || 'EM',
            status: u.status || (idx === 0 ? 'ON_CALL' : 'ONLINE'),
            color: colorList[idx % colorList.length],
            squad: u.squad || 'Core Engineering Squad'
          }));
          setTeamMembers(mapped);
        }
      }
    } catch (err) {
      console.warn('Tenant metadata fetch error:', err);
    }
  }, [authFetch, currentTenantId, currentRole]);

  // 4. Fetch Role Permissions Matrix
  const loadTenantPermissions = useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole,
        'pragma': 'no-cache',
        'cache-control': 'no-cache'
      };
      const res = await authFetch(`/api/v1/tenants/permissions?_t=${Date.now()}`, {
        cache: 'no-store',
        headers
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.matrix) {
          setPermissionsMatrix(data.matrix);
        }
      }
    } catch (err) {
      console.error('Failed to load permissions matrix:', err);
    }
  }, [authFetch, currentTenantId, currentRole]);

  useEffect(() => {
    fetchTickets();
    fetchTenantMetadata();
    fetchAllTenants();
    loadTenantPermissions();
  }, [fetchTickets, fetchTenantMetadata, fetchAllTenants, loadTenantPermissions]);

  // 5. Real-Time WebSockets connection to live backend with auto-reconnect backoff & burst throttling
  useEffect(() => {
    const socket: Socket = io({
      auth: accessToken ? { token: accessToken } : undefined,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000
    });

    const flushSocketBatch = () => {
      batchTimeoutRef.current = null;
      const newItems = [...pendingNewTicketsRef.current];
      const updatedMap = new Map(pendingUpdatedTicketsRef.current);

      if (newItems.length === 0 && updatedMap.size === 0) return;

      pendingNewTicketsRef.current = [];
      pendingUpdatedTicketsRef.current.clear();

      setTickets(prev => {
        let current = prev;

        // Apply batched updates
        if (updatedMap.size > 0) {
          current = current.map(t => updatedMap.has(t.id) ? updatedMap.get(t.id)! : t);
        }

        // Apply batched new tickets with duplicate checking by ID (prev.some check) and tenant check
        if (newItems.length > 0) {
          const uniqueToAdd: Ticket[] = [];
          for (let i = 0; i < newItems.length; i++) {
            const nt = newItems[i];
            if (nt.tenant_id && nt.tenant_id !== currentTenantIdRef.current) {
              continue;
            }
            const alreadyExists = current.some(t => t.id === nt.id) || uniqueToAdd.some(t => t.id === nt.id);
            if (!alreadyExists) {
              uniqueToAdd.push(nt);
            }
          }
          if (uniqueToAdd.length > 0) {
            current = [...uniqueToAdd, ...current];
          }
        }

        return current;
      });

      if (updatedMap.size > 0) {
        setSelectedTicket(curr => curr && updatedMap.has(curr.id) ? updatedMap.get(curr.id)! : curr);
      }

      if (newItems.length > 1) {
        setAlertBanner(`${newItems.length} new incidents ingested`);
        setTimeout(() => setAlertBanner(null), 5000);
      } else if (newItems.length === 1) {
        setAlertBanner(`New Incident: ${newItems[0].title}`);
        setTimeout(() => setAlertBanner(null), 6000);
      }

      setLastUpdated(new Date());
    };

    const scheduleSocketBatch = () => {
      if (!batchTimeoutRef.current) {
        batchTimeoutRef.current = setTimeout(flushSocketBatch, 350); // 350ms batching window prevents render thrashing during bursts
      }
    };

    const handleIncomingNewTicket = (newTicket: Ticket) => {
      if (!newTicket || !newTicket.id) return;
      // Cross-Tenant Socket Isolation: Defensively discard mismatched tenant_id
      if (newTicket.tenant_id && newTicket.tenant_id !== currentTenantIdRef.current) {
        return;
      }
      pendingNewTicketsRef.current.push(newTicket);
      scheduleSocketBatch();
    };

    const handleIncomingUpdatedTicket = (updatedTicket: Ticket) => {
      if (!updatedTicket || !updatedTicket.id) return;
      // Cross-Tenant Socket Isolation: Defensively discard mismatched tenant_id
      if (updatedTicket.tenant_id && updatedTicket.tenant_id !== currentTenantIdRef.current) {
        return;
      }
      pendingUpdatedTicketsRef.current.set(updatedTicket.id, updatedTicket);
      scheduleSocketBatch();
    };

    socket.on('connect', () => {
      setIsConnected(true);
      // On reconnect after drop/offline, re-fetch to catch any missed updates
      fetchTickets();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[WebSocket] Connection error:', err.message);
      setIsConnected(false);
    });

    socket.on('NEW_TICKET_ALERT', (data: { ticket: Ticket; message?: string }) => {
      if (data?.ticket) {
        handleIncomingNewTicket(data.ticket);
      }
    });

    socket.on('TICKET_CREATED', (data: { ticket: Ticket }) => {
      if (data?.ticket) {
        handleIncomingNewTicket(data.ticket);
      }
    });

    socket.on('TICKET_UPDATED', (data: { ticket: Ticket }) => {
      if (data?.ticket) {
        handleIncomingUpdatedTicket(data.ticket);
      } else {
        fetchTickets();
      }
    });

    socket.on('TICKET_DELETED', (data: { ticketId: string; message: string; tenant_id?: string }) => {
      if (data?.tenant_id && data.tenant_id !== currentTenantIdRef.current) {
        return;
      }
      setAlertBanner(data.message);
      setTimeout(() => setAlertBanner(null), 6000);
      fetchTickets();
    });

    socket.on('SETTINGS_UPDATED', (data?: { tenant_id?: string; tenantId?: string; message?: string }) => {
      const incomingTenant = data?.tenant_id || data?.tenantId;
      if (incomingTenant && incomingTenant !== currentTenantIdRef.current) {
        return; // Defensively discard cross-tenant settings update
      }
      fetchTenantMetadata();
      fetchAllTenants();
      fetchTickets();
    });

    socket.on('PERMISSIONS_UPDATED', (data?: { tenant_id?: string; tenantId?: string; matrix?: RolePermissionsMatrix; message?: string }) => {
      const incomingTenant = data?.tenant_id || data?.tenantId;
      if (incomingTenant && incomingTenant !== currentTenantIdRef.current) {
        return; // Defensively discard cross-tenant permissions update
      }
      if (data?.matrix) {
        setPermissionsMatrix(data.matrix);
      }
      if (data?.message) {
        setAlertBanner(data.message);
        setTimeout(() => setAlertBanner(null), 5000);
      }
      fetchTickets();
      fetchTenantMetadata();
    });

    socket.on('STAFF_UPDATED', (data: { tenant_id?: string; tenantId?: string; staff?: any; message?: string }) => {
      const incomingTenant = data?.tenant_id || data?.tenantId;
      if (incomingTenant && incomingTenant !== currentTenantIdRef.current) {
        return; // Defensively discard cross-tenant staff broadcast packet
      }
      fetchTenantMetadata();
      fetchAllTenants();
      fetchTickets();
      if (data?.message) {
        setAlertBanner(data.message);
        setTimeout(() => setAlertBanner(null), 5000);
      }
    });

    socket.on('TICKET_ASSIGNED', (data: { tenant_id?: string; tenantId?: string; ticket?: Ticket; message?: string }) => {
      const incomingTenant = data?.tenant_id || data?.tenantId || data?.ticket?.tenant_id;
      if (incomingTenant && incomingTenant !== currentTenantIdRef.current) {
        return; // Defensively discard cross-tenant assignment packet
      }
      if (data?.ticket) {
        handleIncomingUpdatedTicket(data.ticket);
      } else {
        fetchTickets();
      }
      if (data?.message) {
        setAlertBanner(data.message);
        setTimeout(() => setAlertBanner(null), 5000);
      }
    });

    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }
      socket.disconnect();
    };
  }, [accessToken, currentTenantId, currentRole, fetchTickets, fetchTenantMetadata, fetchAllTenants]);

  // Compute dynamic counts from live backend data
  const totalCount = tickets.length;

  // High ticket influx optimization: Compute counts & metrics in a single O(N) pass
  const { openCount, unassignedCount, urgentCount, resolvedCount, resolvedTickets, openTicketCounts } = useMemo(() => {
    let open = 0;
    let unassigned = 0;
    let urgent = 0;
    let resolved = 0;
    const resolvedList: Ticket[] = [];
    const memberCounts: Record<string, number> = {};

    const safeTeam = Array.isArray(teamMembers) ? teamMembers : [];
    for (let i = 0; i < safeTeam.length; i++) {
      memberCounts[safeTeam[i].id] = 0;
    }

    const safeTicketList = Array.isArray(tickets) ? tickets : [];
    for (let i = 0; i < safeTicketList.length; i++) {
      const t = safeTicketList[i];
      const isResolved = normalizeStatus(t.status) === 'Resolved' || t.status === 'RESOLVED' || t.status === 'CLOSED';
      if (isResolved) {
        resolved++;
        resolvedList.push(t);
      } else {
        open++;
        if (t.assigned_to && memberCounts[t.assigned_to] !== undefined) {
          memberCounts[t.assigned_to]++;
        }
      }

      if (!t.assigned_to) {
        unassigned++;
      }

      if (normalizeSeverity(t.severity) === 'Urgent') {
        urgent++;
      }
    }

    return {
      openCount: open,
      unassignedCount: unassigned,
      urgentCount: urgent,
      resolvedCount: resolved,
      resolvedTickets: resolvedList,
      openTicketCounts: memberCounts
    };
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
        setStatusFilter('NON_RESOLVED');
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
    setCategoryFilter('ALL');
    setActiveCardFilter(null);
  }, []);

  // Tenant Switch Handler: Defensively close all open modals, clear active ticket selections, and reset search/filter states
  const handleTenantSwitch = useCallback((newTenantId: string) => {
    if (newTenantId === currentTenantId) return;
    setCurrentTenantId(newTenantId);
    setSelectedTicket(null);
    setIsCreateModalOpen(false);
    setIsSimulatorOpen(false);
    setIsLogoutModalOpen(false);
    handleResetFilters();
  }, [currentTenantId, handleResetFilters]);

  // Listen for 403 Forbidden events dispatched by authFetch (Permission Downgrade Mid-Session)
  useEffect(() => {
    const handlePermissionDenied = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      const msg = customEvent.detail?.message || 'Access Forbidden (403): Your role permissions have changed.';
      setAlertBanner(msg);
      loadTenantPermissions();
      fetchTickets();
      setTimeout(() => setAlertBanner(null), 6000);
    };

    window.addEventListener('fb:permission_denied', handlePermissionDenied);
    return () => {
      window.removeEventListener('fb:permission_denied', handlePermissionDenied);
    };
  }, [loadTenantPermissions, fetchTickets]);

  // Live status update via PATCH /api/v1/tickets/:id/status (Optimistic UI + Rollback on error)
  const handleUpdateStatus = async (ticketId: string, newStatus: string, note?: string) => {
    const previousTickets = tickets;
    const previousSelected = selectedTicket;

    // Optimistic UI update
    setTickets(prev => prev.map(t => t.id === ticketId ? {
      ...t,
      status: newStatus as any,
      updated_at: new Date().toISOString()
    } : t));
    if (selectedTicket && selectedTicket.id === ticketId) {
      setSelectedTicket(prev => prev ? {
        ...prev,
        status: newStatus as any,
        updated_at: new Date().toISOString()
      } : null);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch(`/api/v1/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: newStatus, note })
      });

      if (!res.ok) {
        // Rollback on server error
        setTickets(previousTickets);
        setSelectedTicket(previousSelected);
        const err = await res.json().catch(() => ({}));
        const errorMsg = err.message || err.error || 'Failed to update ticket status';
        if (res.status === 403) {
          loadTenantPermissions();
          setAlertBanner(`Access Forbidden (403): ${errorMsg}`);
        } else {
          setAlertBanner(errorMsg);
        }
        setTimeout(() => setAlertBanner(null), 5000);
        fetchTickets();
      }
    } catch (err: any) {
      // Rollback on network failure
      setTickets(previousTickets);
      setSelectedTicket(previousSelected);
      console.error('Failed to update status:', err);
      setAlertBanner(err.message || 'Network error updating status');
      setTimeout(() => setAlertBanner(null), 5000);
      fetchTickets();
    }
  };

  // Live assignee update via PATCH /api/v1/tickets/:id/assignee (Optimistic UI + Rollback on error)
  const handleUpdateTicketAssignee = async (ticketId: string, newAssigneeId: string | null, newAssigneeName: string | null) => {
    const previousTickets = tickets;
    const previousSelected = selectedTicket;

    // Optimistic UI update
    setTickets(prev => prev.map(t => t.id === ticketId ? {
      ...t,
      assigned_to: newAssigneeId || undefined,
      assigned_to_name: newAssigneeName || undefined,
      updated_at: new Date().toISOString()
    } : t));
    if (selectedTicket && selectedTicket.id === ticketId) {
      setSelectedTicket(prev => prev ? {
        ...prev,
        assigned_to: newAssigneeId || undefined,
        assigned_to_name: newAssigneeName || undefined,
        updated_at: new Date().toISOString()
      } : null);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch(`/api/v1/tickets/${ticketId}/assignee`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          assigneeId: newAssigneeId,
          assigneeName: newAssigneeName
        })
      });
      if (!res.ok) {
        // Rollback on server error
        setTickets(previousTickets);
        setSelectedTicket(previousSelected);
        const err = await res.json().catch(() => ({}));
        const errorMsg = err.message || err.error || 'Failed to update assignee';
        if (res.status === 403) {
          loadTenantPermissions();
          setAlertBanner(`Access Forbidden (403): ${errorMsg}`);
        } else {
          setAlertBanner(errorMsg);
        }
        setTimeout(() => setAlertBanner(null), 5000);
        fetchTickets();
      }
    } catch (err: any) {
      // Rollback on network failure
      setTickets(previousTickets);
      setSelectedTicket(previousSelected);
      console.error('Failed to update assignee on server:', err);
      setAlertBanner(err.message || 'Network error updating assignee');
      setTimeout(() => setAlertBanner(null), 5000);
      fetchTickets();
    }
  };

  // Handle full ticket update (Edit)
  const handleUpdateTicket = async (ticketId: string, updatedFields: Partial<Ticket>) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch(`/api/v1/tickets/${ticketId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedFields)
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || 'Failed to update ticket';
        if (res.status === 403) {
          loadTenantPermissions();
          setAlertBanner(`Access Forbidden (403): ${errorMsg}`);
          setTimeout(() => setAlertBanner(null), 5000);
          return;
        }
        throw new Error(errorMsg);
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
      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch(`/api/v1/tickets/${ticketId}`, {
        method: 'DELETE',
        headers
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || 'Failed to delete ticket';
        if (res.status === 403) {
          loadTenantPermissions();
          setAlertBanner(`Access Forbidden (403): ${errorMsg}`);
          setTimeout(() => setAlertBanner(null), 5000);
          return;
        }
        throw new Error(errorMsg);
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch(`/api/v1/tickets/${ticketId}/events`, {
        method: 'POST',
        headers,
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
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch('/api/v1/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify(ticketData)
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.ticket) {
          setTickets(prev => [data.ticket, ...prev]);
          setAlertBanner(`Incident ${data.ticket.short_code} logged dynamically.`);
          setTimeout(() => setAlertBanner(null), 5000);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setAlertBanner(err?.message || err?.error || 'Failed to create incident');
        setTimeout(() => setAlertBanner(null), 5000);
      }
    } catch (err: any) {
      console.error('Failed to create ticket:', err);
      setAlertBanner(err?.message || 'Network error creating ticket');
      setTimeout(() => setAlertBanner(null), 5000);
    }
  };

  // Quick Seed 3 live dynamic incidents
  const handleSeedDemo = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch('/api/v1/tickets/seed-demo', {
        method: 'POST',
        headers
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

  // Clear all tickets for clean workspace state (dispatches confirmed deletion)
  const executeClearTickets = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      };
      const res = await authFetch('/api/v1/tickets/clear', {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        setTickets([]);
        setSelectedTicket(null);
        setAlertBanner('All incidents cleared for this workspace.');
        setTimeout(() => setAlertBanner(null), 4000);
      } else {
        const err = await res.json().catch(() => ({}));
        const errorMsg = err.message || err.error || 'Failed to clear incidents';
        if (res.status === 403) {
          loadTenantPermissions();
          setAlertBanner(`Access Forbidden (403): ${errorMsg}`);
        } else {
          setAlertBanner(errorMsg);
        }
        setTimeout(() => setAlertBanner(null), 5000);
      }
    } catch (err) {
      console.error('Failed to clear tickets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearTickets = () => {
    setIsClearConfirmOpen(true);
  };

  // Handle confirmed logout
  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
      setIsLogoutModalOpen(false);
    }
  };

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#f0f5fa] text-slate-800 font-sans">
      
      {/* Sleek Dark Left Sidebar - Fixed at left, independent vertical scroll */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        totalTicketsCount={totalCount}
        resolvedTicketsCount={resolvedCount}
        staffMembersCount={teamMembers.length}
        onLogout={() => setIsLogoutModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        activeTab={currentView}
        openCount={openCount}
      />

      {/* Main App Column: Header fixed at top, independent scrollable content below */}
      <div className="flex-1 h-screen flex flex-col min-w-0 overflow-hidden bg-[#f0f5fa]">
        
        {/* Dynamic Dashboard Header - Fixed at top of main area */}
        <DashboardHeader
          tenants={tenants}
          currentTenantId={currentTenantId}
          onSelectTenant={handleTenantSwitch}
          currentRole={currentRole}
          onSelectRole={setCurrentRole}
          user={currentUser}
          totalOpenTickets={openCount}
          totalTickets={tickets.length}
          urgentTickets={urgentCount}
          tickets={tickets}
          permissionsMatrix={permissionsMatrix}
          onNewIncidentClick={() => setIsSimulatorOpen(true)}
          onOpenSimulator={() => setIsSimulatorOpen(true)}
          onClearTickets={handleClearTickets}
          onSelectTicket={(ticket) => setSelectedTicket(ticket)}
          onSelectView={(view) => setCurrentView(view)}
        />

        {/* Real-time Incident Alert Banner */}
        {alertBanner && (
          <div className="bg-purple-900 border-b border-purple-800 text-purple-100 px-6 py-2.5 text-xs font-medium flex items-center justify-between animate-in slide-in-from-top duration-200 shrink-0">
            <div className="flex items-center space-x-2.5 min-w-0 pr-4">
              <Bell className="w-4 h-4 text-purple-300 animate-bounce shrink-0" />
              <span className="truncate break-all max-w-3xl">{alertBanner}</span>
            </div>
            <button
              onClick={() => setAlertBanner(null)}
              className="text-purple-300 hover:text-white font-medium cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        )}

        {/* Dedicated Independent Vertical Scroll Container for Main Content ONLY */}
        <div 
          ref={scrollContainerRef}
          id="main-scroll-container"
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col bg-[#f0f5fa] main-content-scroll"
        >

        {/* VIEW 1: DASHBOARD (Edge-to-Edge Observability & Incident Workspace) */}
        {currentView === 'dashboard' && (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full pb-8 animate-in fade-in duration-150">
            
            {/* Greeting & Operations Breadcrumb Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h1 className="text-xl sm:text-2xl font-medium text-slate-900 tracking-tight font-poppins">
                    {greeting}, {currentUser.name.replace(/\s*\([^)]*\)/g, '').trim()} 👋
                  </h1>
                  <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-[6px] text-xs font-medium border shadow-2xs ${
                    isConnected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                      : 'bg-amber-50 text-amber-700 border-amber-300'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                      isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`} />
                    <span className="font-poppins">{isConnected ? 'Live WebSockets Connected' : 'Offline (Polling Mode Active)'}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-poppins">
                  Live multi-tenant telemetry bridge with instant client feedback and engineering on-call triage.
                </p>
              </div>

              {/* Quick action buttons */}
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setIsSimulatorOpen(true)}
                  title="Test live client SDK crash / error telemetry"
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-300 text-blue-700 rounded-[8px] text-xs font-medium shadow-2xs transition-colors cursor-pointer font-poppins disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Cpu className="w-3.5 h-3.5 text-blue-600" />
                  <span>Simulate Ingest</span>
                </button>

                {hasRolePermission(permissionsMatrix, currentRole, 'tickets:create') && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleSeedDemo}
                    title="Seed 3 dynamic test incidents"
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-amber-300 text-slate-700 rounded-[8px] text-xs font-medium shadow-2xs transition-colors cursor-pointer font-poppins disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Quick Seed</span>
                  </button>
                )}

                {tickets.length > 0 && hasRolePermission(permissionsMatrix, currentRole, 'tickets:delete') && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={handleClearTickets}
                    title="Clear all tickets in this workspace"
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 rounded-[8px] text-xs font-medium shadow-2xs transition-colors cursor-pointer font-poppins disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={fetchTickets}
                  title="Refresh live tickets from API"
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:text-blue-700 rounded-[8px] text-xs font-medium shadow-2xs hover:border-blue-200 transition-colors cursor-pointer font-poppins disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isLoading ? 'animate-spin' : ''}`} />
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

            {/* 3.5 Feedback Channels & Triage Streams (Bugs, Ideas, Help, Ratings) */}
            <FeedbackChannelsSection
              tickets={tickets}
              activeCategoryFilter={categoryFilter}
              onSelectCategory={(cat) => {
                setCategoryFilter(prev => prev === cat ? 'ALL' : cat);
              }}
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
                setCategoryFilter(prev => prev === cat ? 'ALL' : cat);
              }}
            />


            {/* 6. Live Dynamic Tickets Table */}
            <section aria-labelledby="incident-table-heading" className="space-y-2">
              <h2 id="incident-table-heading" className="sr-only">Incidents Table</h2>
              <TicketsTable
                tickets={tickets}
                teamMembers={teamMembers}
                currentRole={currentRole}
                permissionsMatrix={permissionsMatrix}
                categoryFilter={categoryFilter}
                onCategoryFilterChange={setCategoryFilter}
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
                onOpenCreateModal={() => setIsSimulatorOpen(true)}
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
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full pb-8 animate-in fade-in duration-150">
            {/* Header Box */}
            <div className="bg-white border border-slate-200/80 rounded-[12px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs font-poppins">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-lg font-medium text-slate-900 font-poppins tracking-tight flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-indigo-600" />
                    <span>Total Tickets Registry</span>
                  </h2>
                  <span className="px-2.5 py-0.5 text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-[6px] font-poppins">
                    {safeNumber(totalCount, 0)} Total
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-poppins">
                  Complete registry of all ingested incidents, bug reports, feature ideas, and customer feedback across all client products.
                </p>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                {hasRolePermission(permissionsMatrix, currentRole, 'tickets:create') && (
                  <>
                    <button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="px-4 py-2 bg-[#0b1b36] hover:bg-[#12284c] text-white text-xs font-medium rounded-[8px] flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs font-poppins"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">New Incident</span>
                    </button>
                    <button
                      onClick={() => setIsSimulatorOpen(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-[8px] flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs font-poppins"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Simulate Ingest</span>
                    </button>
                  </>
                )}
                <button
                  onClick={fetchTickets}
                  disabled={isLoading}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs rounded-[8px] font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs font-poppins"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {/* Main Ticket Queue */}
            <TicketList
              key={currentTenantId}
              tickets={tickets}
              teamMembers={teamMembers}
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
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full pb-8 animate-in fade-in duration-150">
            {/* Header Box */}
            <div className="bg-white border border-slate-200/80 rounded-[12px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs font-poppins">
              <div className="space-y-1">
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-lg font-medium text-slate-900 font-poppins tracking-tight flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Resolved Incidents & SLA Compliance</span>
                  </h2>
                  <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-[6px] font-poppins">
                    {safeNumber(resolvedCount, 0)} Resolved
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-poppins">
                  Closed and verified incidents meeting enterprise SLA resolution benchmarks with complete audit trail.
                </p>
              </div>

              <div className="flex items-center space-x-2.5 shrink-0">
                <button
                  onClick={fetchTickets}
                  disabled={isLoading}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs rounded-[8px] font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs font-poppins"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>

            {/* Main Ticket Queue for Resolved */}
            <TicketList
              key={`resolved-${currentTenantId}`}
              tickets={resolvedTickets}
              teamMembers={teamMembers}
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

        {/* VIEW 4: STAFF MEMBERS & ACTIVE LOAD MODULE */}
        {currentView === 'staff-members' && (
          <StaffWorkloadView
            key={currentTenantId}
            currentTenantId={currentTenantId}
            currentRole={currentRole}
            teamMembers={teamMembers}
            tickets={tickets}
            permissionsMatrix={permissionsMatrix}
            onSelectTicket={setSelectedTicket}
            onUpdateStatus={handleUpdateStatus}
            onAssignTicket={(ticketId, memberId, memberName) => {
              handleUpdateTicketAssignee(ticketId, memberId, memberName);
            }}
            onRefresh={() => {
              fetchTickets();
              fetchTenantMetadata();
              fetchAllTenants();
            }}
            onStaffUpdated={() => {
              fetchTenantMetadata();
              fetchTickets();
              fetchAllTenants();
            }}
          />
        )}

        {/* VIEW 5: SETTINGS (Dynamic RBAC Permissions Matrix) */}
        {currentView === 'settings' && (
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full animate-in fade-in duration-150">
            <SettingsView 
              key={currentTenantId}
              currentTenantId={currentTenantId}
              currentRole={currentRole}
              permissionsMatrix={permissionsMatrix}
              onPermissionsUpdated={(matrix) => {
                setPermissionsMatrix(matrix);
              }}
              onTenantUpdated={() => {
                fetchAllTenants();
                fetchTickets();
                loadTenantPermissions();
              }}
            />
          </main>
        )}

        {/* Footer */}
        <footer className="border-t border-slate-200/90 bg-white/95 py-5 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 w-full mt-auto shrink-0 shadow-xs">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-slate-800">FEEDBACK-HUB ENTERPRISE</span>
            <span>•</span>
            <span className="text-slate-500">DYNAMIC REST API & WEBSOCKET ENGINE</span>
          </div>
          <div className="flex items-center space-x-3 text-slate-500 font-mono text-[11px]">
            <span className="text-purple-600 font-medium">REAL-TIME TELEMETRY</span>
            <span>•</span>
            <span>POSTGRESQL 16 RLS READY</span>
          </div>
        </footer>

        </div>
      </div>

      {/* Ticket Details & Edit / Delete Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        currentRole={currentRole}
        accessToken={accessToken}
        onUpdateStatus={handleUpdateStatus}
        onAddEvent={handleAddEvent}
        onUpdateTicket={handleUpdateTicket}
        onDeleteTicket={handleDeleteTicket}
        permissionsMatrix={permissionsMatrix}
        teamMembers={teamMembers}
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

      {/* Logout Confirmation Dialog */}
      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onConfirm={handleConfirmLogout}
        onCancel={() => setIsLogoutModalOpen(false)}
        isLoggingOut={isLoggingOut}
        user={currentUser}
        tenantName={tenants.find(t => t.id === currentTenantId)?.name}
      />

      {/* Localized Destructive Clear Workspace Confirmation Dialog */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[12px] p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 font-poppins">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="w-10 h-10 rounded-[8px] bg-rose-50 border border-rose-200 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Clear Workspace Incidents</h3>
                <p className="text-xs text-slate-500">Destructive workspace action</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently clear all <strong>{tickets.length}</strong> incident(s) for <strong>{tenants.find(t => t.id === currentTenantId)?.name || 'this workspace'}</strong>? This resets the tenant telemetry queue to zero and cannot be undone.
            </p>
            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-[8px] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={async () => {
                  setIsClearConfirmOpen(false);
                  await executeClearTickets();
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-[8px] transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Clearing...' : 'Confirm Clear'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, toast, clearToast } = useAuth();

  const [authView, setAuthView] = useState<'login' | 'forgot-password' | 'reset-password'>(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;
    if (params.has('token') || path === '/reset-password') {
      return 'reset-password';
    }
    if (path === '/forgot-password') {
      return 'forgot-password';
    }
    return 'login';
  });

  // Listen for browser popstate
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const path = window.location.pathname;
      if (params.has('token') || path === '/reset-password') {
        setAuthView('reset-password');
      } else if (path === '/forgot-password') {
        setAuthView('forgot-password');
      } else {
        setAuthView('login');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (view: 'login' | 'forgot-password' | 'reset-password') => {
    setAuthView(view);
    if (view === 'login') {
      window.history.pushState({}, '', '/');
    } else if (view === 'forgot-password') {
      window.history.pushState({}, '', '/forgot-password');
    }
  };

  // Screen-flash prevention while silent session restoration runs
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-[12px] flex items-center justify-center text-white font-mono font-medium text-xl shadow-lg shadow-blue-500/30 border border-blue-400/30 animate-pulse">
          FH
        </div>
        <div className="mt-4 flex items-center space-x-2 text-neutral-400 font-mono text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
          <span>Restoring Feedback-Hub session...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated users see Login, Forgot Password, or Reset Password
  if (!isAuthenticated) {
    return (
      <>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={clearToast}
          />
        )}
        {authView === 'forgot-password' && (
          <ForgotPasswordPage onBackToLogin={() => navigateTo('login')} />
        )}
        {authView === 'reset-password' && (
          <ResetPasswordPage
            onNavigateToLogin={() => navigateTo('login')}
            onRequestNewLink={() => navigateTo('forgot-password')}
          />
        )}
        {authView === 'login' && (
          <LoginPage onNavigateToForgotPassword={() => navigateTo('forgot-password')} />
        )}
      </>
    );
  }

  // Authenticated users enter the rich incident management dashboard
  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={clearToast}
        />
      )}
      <Dashboard />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};
