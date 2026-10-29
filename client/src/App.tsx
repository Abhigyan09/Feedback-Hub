import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/LoginPage';
import { ForgotPasswordPage } from './components/ForgotPasswordPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { Header } from './components/Header';
import { TicketList } from './components/TicketList';
import { TicketDetailModal } from './components/TicketDetailModal';
import { WidgetSimulatorModal } from './components/WidgetSimulatorModal';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { Toast } from './components/Toast';
import { Ticket } from './types';
import { Activity, ShieldAlert, Cpu, Bell, CheckCircle2, Loader2 } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user, accessToken, logout } = useAuth();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isWidgetSimulatorOpen, setIsWidgetSimulatorOpen] = useState<boolean>(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);

  // Fetch tickets using authenticated JWT claims (tenant & role are authoritatively resolved by backend)
  const loadTickets = useCallback(async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/tickets', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        credentials: 'include'
      });

      if (response.status === 401) {
        // Access token expired; silent refresh will handle or user will be directed to login
        return;
      }

      const data = await response.json();
      if (data.tickets) {
        setTickets(data.tickets);
      }
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Authenticated WebSocket connection using verified access JWT
  useEffect(() => {
    if (!accessToken) return;

    const socket: Socket = io({
      auth: {
        token: accessToken
      }
    });

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('[WebSocket] Connection error:', err.message);
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

    return () => {
      socket.disconnect();
    };
  }, [accessToken, loadTickets]);

  // Handle status update
  const handleUpdateStatus = async (ticketId: string, newStatus: string, note?: string) => {
    if (!accessToken) return;

    try {
      const res = await fetch(`/api/v1/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus, note })
      });

      if (res.ok) {
        const data = await res.json();
        if (selectedTicket && selectedTicket.id === ticketId) {
          setSelectedTicket(data.ticket);
        }
        loadTickets();
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Handle add event / dev note
  const handleAddEvent = async (ticketId: string, content: string, isInternalOnly: boolean) => {
    if (!accessToken) return;

    try {
      await fetch(`/api/v1/tickets/${ticketId}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify({ content, is_internal_only: isInternalOnly })
      });
    } catch (err) {
      console.error('Failed to add event:', err);
    }
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

  if (!user) return null;

  // Metrics calculations
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const inDevCount = tickets.filter(t => t.status === 'IN_DEV').length;
  const criticalCount = tickets.filter(t => t.severity === 'CRITICAL' || t.severity === 'BLOCKER').length;

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-100 flex flex-col font-sans">
      
      {/* Header with verified user & logout */}
      <Header
        user={user}
        isConnected={isConnected}
        onOpenWidgetSimulator={() => setIsWidgetSimulatorOpen(true)}
        onLogout={() => setIsLogoutModalOpen(true)}
      />

      {/* Real-time Incident Alert Banner */}
      {alertBanner && (
        <div className="bg-red-950 border-b border-red-800 text-red-200 px-4 py-2.5 text-xs font-mono flex items-center justify-between animate-in slide-in-from-top duration-200">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-red-400 animate-bounce" />
            <span>{alertBanner}</span>
          </div>
          <button onClick={() => setAlertBanner(null)} className="text-red-400 hover:text-white font-bold">
            DISMISS
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="bg-[#121215] border border-[#27272a] p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-neutral-400 uppercase">Open Incidents</span>
              <p className="text-2xl font-bold font-mono text-white">{openCount}</p>
            </div>
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121215] border border-[#27272a] p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-neutral-400 uppercase">Under Dev Triage</span>
              <p className="text-2xl font-bold font-mono text-indigo-400">{inDevCount}</p>
            </div>
            <div className="p-2.5 bg-indigo-950/40 border border-indigo-800/60 text-indigo-400">
              <Cpu className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121215] border border-[#27272a] p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-neutral-400 uppercase">Critical (P0)</span>
              <p className="text-2xl font-bold font-mono text-red-400">{criticalCount}</p>
            </div>
            <div className="p-2.5 bg-red-950/40 border border-red-800/60 text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#121215] border border-[#27272a] p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-neutral-400 uppercase">SLA Compliance</span>
              <p className="text-2xl font-bold font-mono text-emerald-400">99.4%</p>
            </div>
            <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

        </div>

        {/* Current Scope Banner with Verified Claims */}
        <div className="p-4 border border-[#27272a] bg-[#121215] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-white uppercase">Active Tenant:</span>
              <span className="text-xs font-mono text-indigo-400 font-bold uppercase">
                {user.tenant_name || user.tenant_slug || user.tenant_id}
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-xs font-mono font-bold text-white uppercase">Verified Role:</span>
              <span className="text-xs font-mono text-neutral-200 uppercase font-semibold">[{user.role}]</span>
            </div>
            <p className="text-xs text-neutral-400">
              {user.role === 'client_user' 
                ? 'Client Mode Active: Internal developer notes, dirty telemetry payloads, and secret keys are quarantined.'
                : 'Engineering Mode Active: Full stack traces, console logs, and sensitive diagnostic context are available.'}
            </p>
          </div>

          <button
            onClick={() => setIsWidgetSimulatorOpen(true)}
            className="px-3 py-1.5 text-xs font-mono bg-indigo-600 hover:bg-indigo-500 text-white font-medium self-start md:self-auto"
          >
            + Ingest New Incident
          </button>
        </div>

        {/* Ticket List */}
        <TicketList
          tickets={tickets}
          onSelectTicket={setSelectedTicket}
          currentRole={user.role}
          isLoading={isLoading}
        />

      </main>

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        currentRole={user.role}
        accessToken={accessToken}
        onUpdateStatus={handleUpdateStatus}
        onAddEvent={handleAddEvent}
      />

      {/* Client Widget Simulator Modal */}
      <WidgetSimulatorModal
        isOpen={isWidgetSimulatorOpen}
        onClose={() => setIsWidgetSimulatorOpen(false)}
        onTicketCreated={loadTickets}
      />

      {/* Logout Confirmation Dialog */}
      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        onConfirm={handleConfirmLogout}
        onCancel={() => setIsLogoutModalOpen(false)}
        isLoggingOut={isLoggingOut}
      />

      {/* Footer */}
      <footer className="border-t border-[#27272a] py-6 text-center text-xs font-mono text-neutral-500">
        FEEDBACK-HUB ENTERPRISE v1.0 • MULTI-TENANT POSTGRESQL RLS • BANK-GRADE AES-256 TELEMETRY
      </footer>

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
        <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white font-mono font-bold text-xl shadow-lg shadow-blue-500/30 border border-blue-400/30 animate-pulse">
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

  // Authenticated users enter the protected incident management dashboard
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
