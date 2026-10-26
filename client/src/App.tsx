import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Header } from './components/Header';
import { TicketList } from './components/TicketList';
import { TicketDetailModal } from './components/TicketDetailModal';
import { WidgetSimulatorModal } from './components/WidgetSimulatorModal';
import { Ticket, UserRole } from './types';
import { Activity, ShieldAlert, Cpu, Bell, CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const [currentTenantId, setCurrentTenantId] = useState<string>('tenant-acme-corp-001');
  const [currentRole, setCurrentRole] = useState<UserRole>('developer');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isWidgetSimulatorOpen, setIsWidgetSimulatorOpen] = useState<boolean>(false);
  const [alertBanner, setAlertBanner] = useState<string | null>(null);

  // Fetch tickets for current tenant and role
  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/tickets', {
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
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

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

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
      // Auto clear after 6 seconds
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
  }, [currentTenantId, currentRole, loadTickets]);

  // Handle status update
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
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const inDevCount = tickets.filter(t => t.status === 'IN_DEV').length;
  const criticalCount = tickets.filter(t => t.severity === 'CRITICAL' || t.severity === 'BLOCKER').length;

  return (
    <div className="min-h-screen bg-[#09090b] text-neutral-100 flex flex-col font-sans">
      
      {/* Header */}
      <Header
        currentTenantId={currentTenantId}
        onTenantChange={setCurrentTenantId}
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        isConnected={isConnected}
        onOpenWidgetSimulator={() => setIsWidgetSimulatorOpen(true)}
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
        
        {/* KPI Strip (Stripe Squarish Metrics) */}
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

        {/* Current Scope Banner */}
        <div className="p-4 border border-[#27272a] bg-[#121215] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-white uppercase">Active Tenant:</span>
              <span className="text-xs font-mono text-indigo-400">
                {currentTenantId === 'tenant-acme-corp-001' ? 'Acme Payments Inc.' : 'MedSync Healthcare'}
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-xs font-mono font-bold text-white uppercase">Role:</span>
              <span className="text-xs font-mono text-neutral-300 uppercase font-semibold">[{currentRole}]</span>
            </div>
            <p className="text-xs text-neutral-400">
              {currentRole === 'client_user' 
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
          currentRole={currentRole}
          isLoading={isLoading}
        />

      </main>

      {/* Ticket Detail Modal */}
      <TicketDetailModal
        ticket={selectedTicket}
        onClose={() => setSelectedTicket(null)}
        currentRole={currentRole}
        onUpdateStatus={handleUpdateStatus}
        onAddEvent={handleAddEvent}
      />

      {/* Client Widget Simulator Modal */}
      <WidgetSimulatorModal
        isOpen={isWidgetSimulatorOpen}
        onClose={() => setIsWidgetSimulatorOpen(false)}
        onTicketCreated={loadTickets}
      />

      {/* Footer */}
      <footer className="border-t border-[#27272a] py-6 text-center text-xs font-mono text-neutral-500">
        FEEDBACK-HUB ENTERPRISE v1.0 • MULTI-TENANT POSTGRESQL RLS • BANK-GRADE AES-256 TELEMETRY
      </footer>

    </div>
  );
};
