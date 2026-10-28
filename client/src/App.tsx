import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Header } from './components/Header';
import { Sidebar, SidebarView } from './components/Sidebar';
import { TicketList } from './components/TicketList';
import { TicketDetailModal } from './components/TicketDetailModal';
import { WidgetSimulatorModal } from './components/WidgetSimulatorModal';
import { SettingsView } from './components/SettingsView';
import { Ticket, Tenant, UserRole, RolePermissionsMatrix } from './types';
import { 
  Activity, 
  ShieldAlert, 
  Cpu, 
  Bell, 
  CheckCircle2, 
  Layers, 
  LogOut, 
  X,
  Sparkles,
  Info,
  UserPlus,
  RefreshCw,
  Users,
  Building,
  Terminal
} from 'lucide-react';

export const App: React.FC = () => {
  const [currentTenantId, setCurrentTenantId] = useState<string>(() => {
    return localStorage.getItem('fb_current_tenant_id') || 'tenant-acme-corp-001';
  });
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    return (localStorage.getItem('fb_current_role') as UserRole) || 'tenant_admin';
  });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [permissionsMatrix, setPermissionsMatrix] = useState<RolePermissionsMatrix | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isWidgetSimulatorOpen, setIsWidgetSimulatorOpen] = useState<boolean>(false);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);


  // Sidebar navigation state with localStorage persistence
  const [currentView, setCurrentView] = useState<SidebarView>(() => {
    return (localStorage.getItem('fb_current_view') as SidebarView) || 'dashboard';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);

  // Sync state changes to localStorage so page refresh preserves user context
  useEffect(() => {
    localStorage.setItem('fb_current_tenant_id', currentTenantId);
  }, [currentTenantId]);

  useEffect(() => {
    localStorage.setItem('fb_current_role', currentRole);
  }, [currentRole]);

  useEffect(() => {
    localStorage.setItem('fb_current_view', currentView);
  }, [currentView]);

  // Fetch tickets for current tenant and role with strict cache-busting
  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/tickets?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole,
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      const data = await response.json();
      if (data.tickets) {
        setTickets(data.tickets);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenantId, currentRole]);

  // Load all available tenants for switcher with strict cache-busting
  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/tenants/all?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tenants) {
          setTenants(data.tenants);
        }
      }
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  }, []);

  // Load permissions for current tenant and role with strict cache-busting
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
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    loadTenantPermissions();
  }, [loadTenantPermissions]);

  // Real-time WebSocket connection
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

    // Real-time new ticket alert
    socket.on('NEW_TICKET_ALERT', (data: { ticket: Ticket; message: string }) => {
      setAlertBanner(data.message);
      setTimeout(() => setAlertBanner(null), 6000);
      loadTickets();
    });

    // Real-time ticket updated
    socket.on('TICKET_UPDATED', () => {
      loadTickets();
    });

    // Real-time ticket deleted
    socket.on('TICKET_DELETED', (data: { ticketId: string; message: string }) => {
      setAlertBanner(data.message);
      setTimeout(() => setAlertBanner(null), 6000);
      loadTickets();
    });

    // Real-time settings updated
    socket.on('SETTINGS_UPDATED', () => {
      loadTenants();
      loadTickets();
    });

    // Real-time permissions updated across clients
    socket.on('PERMISSIONS_UPDATED', (data: { matrix?: RolePermissionsMatrix; message?: string }) => {
      if (data.matrix) {
        setPermissionsMatrix(data.matrix);
      }
      if (data.message) {
        setAlertBanner(data.message);
        setTimeout(() => setAlertBanner(null), 5000);
      }
      loadTickets();
    });

    return () => {
      socket.disconnect();
    };
  }, [currentTenantId, currentRole, loadTickets, loadTenants, loadTenantPermissions]);


  // Handle status update
  const handleUpdateStatus = async (ticketId: string, newStatus: string, note?: string) => {
    try {
      await fetch(`/api/v1/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({ status: newStatus, note })
      });
      loadTickets();
    } catch (err) {
      console.error('Failed to update status:', err);
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
      loadTickets();
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
      loadTickets();
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
    await fetch(`/api/v1/tickets/${ticketId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId,
        'x-user-role': currentRole
      },
      body: JSON.stringify({ content, is_internal_only: isInternalOnly })
    });
  };

  // Metrics calculations
  const totalCount = tickets.length;
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const inDevCount = tickets.filter(t => t.status === 'IN_DEV').length;
  const unassignedCount = tickets.filter(t => !t.assigned_to).length;
  const criticalCount = tickets.filter(t => t.severity === 'CRITICAL' || t.severity === 'BLOCKER' || t.severity === 'URGENT').length;
  const resolvedCount = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
  const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED');

  // Breakdown sub-counts
  const pendingTriageCount = tickets.filter(t => t.status === 'OPEN' && !t.assigned_to).length;
  const unassignedP0P1 = tickets.filter(t => !t.assigned_to && (t.severity === 'URGENT' || t.severity === 'HIGH')).length;
  const unassignedP2P3 = tickets.filter(t => !t.assigned_to && (t.severity === 'MEDIUM' || t.severity === 'LOW')).length;
  const criticalApiCount = tickets.filter(t => (t.severity === 'URGENT' || t.severity === 'CRITICAL') && t.category === 'BUG').length;
  const infraCount = tickets.filter(t => t.assigned_squad === 'CORE_ENGINEERING_SQUAD').length;
  const resolvedBugsCount = resolvedTickets.filter(t => t.category === 'BUG').length;
  const otherResolvedCount = resolvedTickets.length - resolvedBugsCount;

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#f4f6fb] text-slate-900 flex font-sans select-none">
      
      {/* Sleek Dark Left Sidebar (Square Corners - Sticky / Fixed) */}
      <Sidebar
        currentView={currentView}
        onSelectView={setCurrentView}
        totalTicketsCount={totalCount}
        resolvedTicketsCount={resolvedCount}
        onLogout={() => setIsLogoutModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      {/* Main Content Area - Dedicated Vertical Scroll Container */}
      <div className="flex-1 h-screen flex flex-col min-w-0 overflow-y-auto overflow-x-hidden bg-[#f4f6fb]">
        
        {/* Header (Clean Light Square Style) */}
        <Header
          currentTenantId={currentTenantId}
          onTenantChange={setCurrentTenantId}
          currentRole={currentRole}
          onRoleChange={setCurrentRole}
          isConnected={isConnected}
          onOpenWidgetSimulator={() => setIsWidgetSimulatorOpen(true)}
          tenants={tenants}
        />

        {/* Real-time Incident Alert Banner */}
        {alertBanner && (
          <div className="bg-red-50 border-b border-red-200 text-red-800 px-4 py-2.5 text-xs font-mono flex items-center justify-between animate-in slide-in-from-top duration-200 shadow-xs">
            <div className="flex items-center space-x-2">
              <Bell className="w-4 h-4 text-red-600 animate-bounce" />
              <span className="font-semibold">{alertBanner}</span>
            </div>
            <button onClick={() => setAlertBanner(null)} className="text-red-600 hover:text-red-900 font-bold cursor-pointer">
              DISMISS
            </button>
          </div>
        )}

        {/* Dynamic Main Body Content */}
        <main className="flex-1 max-w-[1700px] w-full min-w-0 mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
          
          {/* VIEW 1: DASHBOARD (Matching Reference Image) */}
          {currentView === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
              {/* Hero Greeting Bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                      Good evening, {
                        currentRole === 'super_admin' ? 'Alex Turner (Super Admin)' :
                        currentRole === 'tenant_admin' ? 'Elena Rostova (Tenant Admin)' :
                        currentRole === 'squad_lead' ? 'Vikram Mehta (API Lead)' :
                        currentRole === 'developer' ? 'Rahul Sharma (Dev)' :
                        currentRole === 'support_agent' ? 'Marcus Chen (Support)' :
                        'Sarah Jenkins (Client)'
                      } 👋
                    </h1>
                    <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                      <span className="w-2 h-2 bg-emerald-500 animate-pulse shrink-0" />
                      <span>Live WebSockets Connected</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">
                    Live multi-tenant telemetry bridge with instant client feedback and engineering on-call triage.
                  </p>
                </div>

                {/* Quick Action Buttons (Exact Match to Reference Image) */}
                <div className="flex items-center space-x-2.5 shrink-0">
                  <button
                    onClick={() => setIsWidgetSimulatorOpen(true)}
                    className="px-3.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Simulate Ingest</span>
                  </button>

                  <button
                    onClick={() => setIsWidgetSimulatorOpen(true)}
                    className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Quick Seed</span>
                  </button>

                  <button
                    onClick={loadTickets}
                    disabled={isLoading}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* 4 KPI Cards (Matching Reference Image) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. Open Card */}
                <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 tracking-wide">Open</span>
                    <div className="w-6 h-6 bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center text-xs font-bold">
                      <Info className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold font-mono text-slate-900">{openCount}</span>
                    <div className="text-[11px] font-mono text-slate-500 space-y-0.5 text-right">
                      <p>• In Dev triage <span className="font-bold text-slate-700">({inDevCount})</span></p>
                      <p>• Pending triage <span className="font-bold text-slate-700">({pendingTriageCount})</span></p>
                    </div>
                  </div>
                </div>

                {/* 2. Unassigned Card */}
                <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 tracking-wide">Unassigned</span>
                    <div className="w-6 h-6 bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center text-xs font-bold">
                      <UserPlus className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold font-mono text-slate-900">{unassignedCount}</span>
                    <div className="text-[11px] font-mono text-slate-500 space-y-0.5 text-right">
                      <p>• P0/P1 High <span className="font-bold text-slate-700">({unassignedP0P1})</span></p>
                      <p>• P2/P3 Standard <span className="font-bold text-slate-700">({unassignedP2P3})</span></p>
                    </div>
                  </div>
                </div>

                {/* 3. Urgent Card */}
                <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 tracking-wide">Urgent</span>
                    <div className="w-6 h-6 bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center text-xs font-bold">
                      <ShieldAlert className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold font-mono text-slate-900">{criticalCount}</span>
                    <div className="text-[11px] font-mono text-slate-500 space-y-0.5 text-right">
                      <p>• Critical API/Sec <span className="font-bold text-slate-700">({criticalApiCount})</span></p>
                      <p>• Infra & Core <span className="font-bold text-slate-700">({infraCount})</span></p>
                    </div>
                  </div>
                </div>

                {/* 4. Resolved Card */}
                <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 tracking-wide">Resolved</span>
                    <div className="w-6 h-6 bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold font-mono text-slate-900">{resolvedCount}</span>
                    <div className="text-[11px] font-mono text-slate-500 space-y-0.5 text-right">
                      <p>• Bugs Fixed <span className="font-bold text-slate-700">({resolvedBugsCount})</span></p>
                      <p>• Other Resolved <span className="font-bold text-slate-700">({otherResolvedCount})</span></p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Assigned Squad Members & Active Load Strip (Exact Match to Reference Image) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center space-x-2">
                    <Users className="w-3.5 h-3.5 text-purple-600" />
                    <span className="font-bold text-slate-900 uppercase">Assigned Squad Members & Active Load</span>
                    <span className="px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 border border-purple-200 font-semibold">
                      3 Active
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">Click any teammate to filter workload</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  
                  {/* Member 1: Elena Rostova */}
                  <div className="bg-white border border-slate-200 p-3 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 bg-purple-100 text-purple-700 font-bold font-mono text-xs flex items-center justify-center">
                        ER
                      </div>
                      <div className="leading-tight">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-slate-900">Elena Rostova</span>
                          <span className="px-1 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-semibold">ON-CALL</span>
                        </div>
                        <span className="text-[11px] text-slate-500">Squad Lead & Arch</span>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      Open: <span className="font-bold text-slate-800">0</span>
                    </div>
                  </div>

                  {/* Member 2: Marcus Chen */}
                  <div className="bg-white border border-slate-200 p-3 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 bg-blue-100 text-blue-700 font-bold font-mono text-xs flex items-center justify-center">
                        MC
                      </div>
                      <div className="leading-tight">
                        <span className="text-xs font-bold text-slate-900 block">Marcus Chen</span>
                        <span className="text-[11px] text-slate-500 block">Senior Engineer</span>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      Open: <span className="font-bold text-slate-800">0</span>
                    </div>
                  </div>

                  {/* Member 3: Sarah Jenkins */}
                  <div className="bg-white border border-slate-200 p-3 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 bg-indigo-100 text-indigo-700 font-bold font-mono text-xs flex items-center justify-center">
                        SJ
                      </div>
                      <div className="leading-tight">
                        <span className="text-xs font-bold text-slate-900 block">Sarah Jenkins</span>
                        <span className="text-[11px] text-slate-500 block">Senior Engineer</span>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-slate-500">
                      Open: <span className="font-bold text-slate-800">0</span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Main Ticket Queue */}
              <div className="pt-2">
                <TicketList
                  tickets={tickets}
                  onSelectTicket={setSelectedTicket}
                  currentRole={currentRole}
                  isLoading={isLoading}
                  onOpenWidgetSimulator={() => setIsWidgetSimulatorOpen(true)}
                  onUpdateStatus={handleUpdateStatus}
                  onDeleteTicket={handleDeleteTicket}
                />
              </div>

            </div>
          )}

          {/* VIEW 2: TOTAL TICKETS */}
          {currentView === 'total-tickets' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
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
                    onClick={() => setIsWidgetSimulatorOpen(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-mono flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+ Ingest Incident</span>
                  </button>
                  <button
                    onClick={loadTickets}
                    disabled={isLoading}
                    className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* 4 Summary Stat Cards for Total Tickets */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block font-mono">Total Ingested</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-slate-900">{totalCount}</span>
                    <span className="text-[10px] font-mono text-indigo-600 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5">100% Registry</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block font-mono">Active Triage</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-amber-700">{openCount + inDevCount}</span>
                    <span className="text-[10px] font-mono text-amber-700 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5">Open & Dev</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block font-mono">Urgent & High</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-rose-700">{criticalCount}</span>
                    <span className="text-[10px] font-mono text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5">P0/P1 Priority</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block font-mono">Resolved Benchmark</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-emerald-700">{resolvedCount}</span>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5">Verified</span>
                  </div>
                </div>
              </div>

              {/* Main Ticket Queue */}
              <TicketList
                tickets={tickets}
                onSelectTicket={setSelectedTicket}
                currentRole={currentRole}
                isLoading={isLoading}
                onOpenWidgetSimulator={() => setIsWidgetSimulatorOpen(true)}
                onUpdateStatus={handleUpdateStatus}
                onDeleteTicket={handleDeleteTicket}
                permissionsMatrix={permissionsMatrix}
              />
            </div>
          )}

          {/* VIEW 3: TICKETS RESOLVED */}
          {currentView === 'resolved-tickets' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              
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
                    onClick={loadTickets}
                    disabled={isLoading}
                    className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-mono font-medium flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* 4 Summary Stat Cards for Resolved Tickets */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block font-mono">Total Resolved</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-emerald-700">{resolvedCount}</span>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5">100% Closed</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block font-mono">Bugs Fixed</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-slate-900">{resolvedBugsCount}</span>
                    <span className="text-[10px] font-mono text-indigo-700 font-bold bg-indigo-50 border border-indigo-200 px-2 py-0.5">Code Fixes</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block font-mono">Ideas Implemented</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-slate-900">{otherResolvedCount}</span>
                    <span className="text-[10px] font-mono text-purple-700 font-bold bg-purple-50 border border-purple-200 px-2 py-0.5">Delivered</span>
                  </div>
                </div>
                <div className="bg-white border border-slate-200 p-4 shadow-2xs">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block font-mono">Resolution SLA</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-2xl font-bold font-mono text-emerald-700">99.8%</span>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5">On-Time</span>
                  </div>
                </div>
              </div>

              {/* Main Ticket Queue */}
              <TicketList
                tickets={resolvedTickets}
                onSelectTicket={setSelectedTicket}
                currentRole={currentRole}
                isLoading={isLoading}
                onOpenWidgetSimulator={() => setIsWidgetSimulatorOpen(true)}
                onUpdateStatus={handleUpdateStatus}
                onDeleteTicket={handleDeleteTicket}
                isResolvedOnly={true}
                permissionsMatrix={permissionsMatrix}
              />
            </div>
          )}

          {/* VIEW 4: SETTINGS */}
          {currentView === 'settings' && (
            <div className="animate-in fade-in duration-150">
              <SettingsView 
                currentTenantId={currentTenantId}
                currentRole={currentRole}
                permissionsMatrix={permissionsMatrix}
                onTenantUpdated={() => {
                  loadTenants();
                  loadTickets();
                  loadTenantPermissions();
                }}
              />
            </div>
          )}

        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs font-mono text-slate-400 mt-12">
          BLACKBAT.AI • ENTERPRISE INCIDENT BRIDGE • ZERO-LEAKAGE MULTI-TENANCY
        </footer>

      </div>

      {/* Ticket Detail Modal */}
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


      {/* Embed Widget Simulator Modal */}
      <WidgetSimulatorModal
        isOpen={isWidgetSimulatorOpen}
        onClose={() => setIsWidgetSimulatorOpen(false)}
        currentTenantId={currentTenantId}
        onTicketCreated={() => {
          loadTickets();
          setAlertBanner('New client ticket ingested and broadcast in real-time!');
          setTimeout(() => setAlertBanner(null), 6000);
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
