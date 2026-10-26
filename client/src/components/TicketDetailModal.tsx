import React, { useState, useEffect } from 'react';
import { Ticket, TicketEvent, UserRole } from '../types';
import { X, Terminal, MessageSquare, Shield, CheckCircle2, Lock, Unlock, Send, AlertTriangle, Globe } from 'lucide-react';

interface TicketDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  currentRole: UserRole;
  accessToken: string | null;
  onUpdateStatus: (ticketId: string, newStatus: string, note?: string) => Promise<void>;
  onAddEvent: (ticketId: string, content: string, isInternalOnly: boolean) => Promise<void>;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  onClose,
  currentRole,
  accessToken,
  onUpdateStatus,
  onAddEvent
}) => {
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'TIMELINE'>('TELEMETRY');
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load ticket details and events from backend
  useEffect(() => {
    if (!ticket) return;

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    fetch(`/api/v1/tickets/${ticket.id}`, {
      headers,
      credentials: 'include'
    })
      .then(res => res.json())
      .then(data => {
        if (data.events) {
          setEvents(data.events);
        }
      })
      .catch(err => console.error('Failed to load events:', err));
  }, [ticket, currentRole, accessToken]);

  if (!ticket) return null;

  const canEditStatus = ['super_admin', 'tenant_admin', 'squad_lead', 'developer'].includes(currentRole);
  const isClientRole = currentRole === 'client_user';

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddEvent(ticket.id, newComment, isClientRole ? false : isInternalNote);
      // Optimistic append
      setEvents(prev => [
        ...prev,
        {
          id: `ev-${Date.now()}`,
          ticket_id: ticket.id,
          tenant_id: ticket.tenant_id,
          author_name: currentRole === 'developer' ? 'Rahul Sharma (Dev)' : currentRole === 'squad_lead' ? 'Vikram Mehta (Lead)' : 'Client User',
          author_role: currentRole,
          event_type: isInternalNote && !isClientRole ? 'DEV_NOTE' : 'CLIENT_REPLY',
          content: newComment,
          is_internal_only: isClientRole ? false : isInternalNote,
          created_at: new Date().toISOString()
        }
      ]);
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121215] border border-[#27272a] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl rounded-none animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-[#27272a] flex items-start justify-between bg-[#09090b]">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-2 py-0.5">
                {ticket.short_code}
              </span>
              <span className="text-xs font-mono text-neutral-400">[{ticket.assigned_squad}]</span>
              <span className="text-xs font-mono px-2 py-0.5 border border-neutral-700 bg-neutral-900 text-neutral-300">
                STATUS: {ticket.status}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white">{ticket.title}</h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white border border-transparent hover:border-[#27272a] transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher & Status Controls */}
        <div className="px-5 py-3 border-b border-[#27272a] bg-[#141418] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('TELEMETRY')}
              className={`px-3 py-1.5 text-xs font-mono border transition-all flex items-center space-x-1.5 ${
                activeTab === 'TELEMETRY'
                  ? 'bg-neutral-100 text-neutral-900 border-white font-bold'
                  : 'bg-transparent text-neutral-400 border-transparent hover:border-[#27272a]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>TELEMETRY & LOGS</span>
            </button>

            <button
              onClick={() => setActiveTab('TIMELINE')}
              className={`px-3 py-1.5 text-xs font-mono border transition-all flex items-center space-x-1.5 ${
                activeTab === 'TIMELINE'
                  ? 'bg-neutral-100 text-neutral-900 border-white font-bold'
                  : 'bg-transparent text-neutral-400 border-transparent hover:border-[#27272a]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>TIMELINE & NOTES ({events.length})</span>
            </button>
          </div>

          {/* Status Quick Actions (RBAC Protected) */}
          {canEditStatus && (
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-neutral-400">SET STATUS:</span>
              <button
                onClick={() => onUpdateStatus(ticket.id, 'IN_DEV', 'Dev squad started active investigation.')}
                className="px-2.5 py-1 text-xs font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 hover:bg-indigo-900 transition-colors"
              >
                IN_DEV
              </button>
              <button
                onClick={() => onUpdateStatus(ticket.id, 'RESOLVED', 'Bug fixed and verified in production.')}
                className="px-2.5 py-1 text-xs font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors"
              >
                RESOLVED
              </button>
            </div>
          )}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'TELEMETRY' ? (
            <div className="space-y-6">
              
              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-neutral-400 tracking-wider">Report Details</h4>
                <p className="text-sm text-neutral-200 bg-[#09090b] p-4 border border-[#27272a] leading-relaxed">
                  {ticket.description}
                </p>
              </div>

              {/* Environment Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 border border-[#27272a] bg-[#09090b] space-y-1">
                  <span className="text-[11px] font-mono text-neutral-500 uppercase">Page URL</span>
                  <p className="text-xs font-mono text-neutral-200 truncate">
                    {ticket.telemetry?.page_url || 'https://client-app.com/dashboard'}
                  </p>
                </div>
                <div className="p-3 border border-[#27272a] bg-[#09090b] space-y-1">
                  <span className="text-[11px] font-mono text-neutral-500 uppercase">User Agent & Viewport</span>
                  <p className="text-xs font-mono text-neutral-200 truncate">
                    {ticket.telemetry?.viewport_dimensions || '1920x1080'} • {ticket.telemetry?.app_version || 'v1.0.0'}
                  </p>
                </div>
              </div>

              {/* Console Logs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono uppercase text-neutral-400 tracking-wider flex items-center space-x-1.5">
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Captured Browser Console Logs</span>
                  </h4>
                  <span className="text-[10px] font-mono text-neutral-500">AUTO-EXTRACTED BY SDK</span>
                </div>
                
                <div className="bg-[#09090b] border border-[#27272a] p-3 font-mono text-xs text-neutral-300 space-y-1.5 max-h-40 overflow-y-auto">
                  {ticket.telemetry?.console_logs && ticket.telemetry.console_logs.length > 0 ? (
                    ticket.telemetry.console_logs.map((log, idx) => (
                      <div key={idx} className="flex items-start space-x-2">
                        <span className="text-neutral-500 text-[10px]">[{log.timestamp}]</span>
                        <span className={`text-[10px] uppercase font-bold ${log.type === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
                          [{log.type}]
                        </span>
                        <span className="flex-1 text-neutral-200">{log.message}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-neutral-600">No client console errors recorded.</span>
                  )}
                </div>
              </div>

              {/* Network Error Inspector */}
              <div className="space-y-2">
                <h4 className="text-xs font-mono uppercase text-neutral-400 tracking-wider flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>Failed API Requests (4xx / 5xx)</span>
                </h4>
                
                <div className="bg-[#09090b] border border-[#27272a] p-3 font-mono text-xs text-neutral-300 space-y-1.5">
                  {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 ? (
                    ticket.telemetry.network_errors.map((net, idx) => (
                      <div key={idx} className="flex items-center space-x-3 p-1.5 bg-red-950/20 border border-red-900/50">
                        <span className="px-1.5 py-0.5 bg-red-900 text-white text-[10px] font-bold">
                          HTTP {net.status}
                        </span>
                        <span className="text-red-300 font-mono text-xs flex-1">{net.url}</span>
                        <span className="text-neutral-500 text-[10px]">{net.timestamp}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-neutral-600">No failed network requests attached.</span>
                  )}
                </div>
              </div>

              {/* Bank-Grade Decrypted Payload */}
              {ticket.telemetry?.encrypted_sensitive_data && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <h4 className="text-xs font-mono uppercase text-emerald-400 tracking-wider">
                      AES-256-GCM Decrypted Diagnostic Context
                    </h4>
                  </div>
                  <pre className="bg-[#09090b] border border-emerald-900/60 p-3 font-mono text-xs text-emerald-300/90 overflow-x-auto">
                    {ticket.telemetry.encrypted_sensitive_data}
                  </pre>
                </div>
              )}

            </div>
          ) : (
            /* Timeline & Quarantine View */
            <div className="space-y-6">
              <div className="space-y-3">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className={`p-4 border ${
                      ev.is_internal_only
                        ? 'border-amber-900/60 bg-amber-950/20'
                        : 'border-[#27272a] bg-[#09090b]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-white">{ev.author_name}</span>
                        <span className="font-mono text-[10px] text-neutral-400 uppercase">({ev.author_role})</span>
                        {ev.is_internal_only && (
                          <span className="flex items-center space-x-1 text-[10px] font-mono text-amber-400 bg-amber-950 border border-amber-800 px-1.5 py-0.2">
                            <Lock className="w-2.5 h-2.5" />
                            <span>INTERNAL ONLY (QUARANTINED FROM CLIENT)</span>
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-neutral-500">
                        {new Date(ev.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-200 leading-relaxed font-sans">{ev.content}</p>
                  </div>
                ))}
              </div>

              {/* Comment Input */}
              <form onSubmit={handleSendComment} className="border border-[#27272a] bg-[#09090b] p-3 space-y-3">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={
                    isClientRole
                      ? 'Reply to engineering team...'
                      : isInternalNote
                      ? 'Write private developer note (hidden from client)...'
                      : 'Write message visible to client...'
                  }
                  rows={3}
                  className="w-full bg-[#121215] border border-[#27272a] text-xs text-white p-2.5 font-mono focus:outline-none focus:border-indigo-500 resize-none"
                />

                <div className="flex items-center justify-between">
                  {!isClientRole && (
                    <label className="flex items-center space-x-2 cursor-pointer text-xs font-mono text-neutral-300">
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                        className="rounded-none border-[#27272a] bg-[#121215] text-indigo-600 focus:ring-0"
                      />
                      <span className={isInternalNote ? 'text-amber-400 font-bold' : 'text-neutral-400'}>
                        {isInternalNote ? 'Private Internal Note' : 'Public Client Update'}
                      </span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || !newComment.trim()}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-medium flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'POSTING...' : 'SEND EVENT'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
