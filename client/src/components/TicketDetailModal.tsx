import React, { useState, useEffect } from 'react';
import { Ticket, TicketEvent, UserRole, TicketCategory, TicketSeverity, TicketStatus, RolePermissionsMatrix } from '../types';
import { hasRolePermission } from '../constants/permissions';
import { 
  X, 
  Terminal, 
  MessageSquare, 
  Shield, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  Send, 
  AlertTriangle, 
  Globe, 
  Pencil, 
  Trash2, 
  Save, 
  ArrowLeft,
  UserCheck,
  User
} from 'lucide-react';

export const DEVELOPER_ROSTER = [
  { id: '', name: 'Unassigned' },
  { id: 'user-dev-01', name: 'Rahul Sharma (Senior Backend Dev)' },
  { id: 'user-dev-02', name: 'Priya Nair (Frontend Platform Dev)' },
  { id: 'user-dev-03', name: 'Amit Patel (Full-Stack Reliability Dev)' },
  { id: 'user-lead-01', name: 'Vikram Mehta (API Squad Lead)' }
];

interface TicketDetailModalProps {
  ticket: Ticket | null;
  onClose: () => void;
  currentRole: UserRole;
  accessToken: string | null;
  onUpdateStatus: (ticketId: string, newStatus: string, note?: string) => Promise<void>;
  onAddEvent: (ticketId: string, content: string, isInternalOnly: boolean) => Promise<void>;
  onUpdateTicket?: (ticketId: string, updatedFields: Partial<Ticket>) => Promise<void>;
  onDeleteTicket?: (ticketId: string) => Promise<void>;
  permissionsMatrix?: RolePermissionsMatrix | null;
  teamMembers?: Array<{ id: string; name: string; role?: string }>;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  onClose,
  currentRole,
  accessToken,
  onUpdateStatus,
  onAddEvent,
  onUpdateTicket,
  onDeleteTicket,
  permissionsMatrix,
  teamMembers
}) => {
  const activeRoster = React.useMemo(() => {
    if (teamMembers && teamMembers.length > 0) {
      return [
        { id: '', name: 'Unassigned' },
        ...teamMembers.map(m => ({ id: m.id, name: m.role ? `${m.name} (${m.role})` : m.name }))
      ];
    }
    return DEVELOPER_ROSTER;
  }, [teamMembers]);
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'TIMELINE'>('TELEMETRY');
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Mode States
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<TicketCategory>('BUG');
  const [editSeverity, setEditSeverity] = useState<TicketSeverity>('MEDIUM');
  const [editStatus, setEditStatus] = useState<TicketStatus>('OPEN');
  const [editSquad, setEditSquad] = useState('FRONTEND_PORTAL');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [editAssignedToName, setEditAssignedToName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete Confirmation State
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load ticket details and events from backend
  useEffect(() => {
    if (!ticket) return;

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Initialize edit fields
    setEditTitle(ticket.title);
    setEditDescription(ticket.description);
    setEditCategory(ticket.category);
    setEditSeverity(ticket.severity);
    setEditStatus(ticket.status);
    setEditSquad(ticket.assigned_squad || 'FRONTEND_PORTAL');
    setEditAssignedTo(ticket.assigned_to || '');
    setEditAssignedToName(ticket.assigned_to_name || '');
    setIsEditing(false);
    setIsConfirmingDelete(false);

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

  // Dynamic RBAC Permission Checks
  const canEditTicket = hasRolePermission(permissionsMatrix, currentRole, 'tickets:edit');
  const canDeleteTicket = hasRolePermission(permissionsMatrix, currentRole, 'tickets:delete');
  const canAssign = hasRolePermission(permissionsMatrix, currentRole, 'tickets:assign');
  const canChangeStatus = hasRolePermission(permissionsMatrix, currentRole, 'tickets:change_status');
  const canPostInternalNotes = hasRolePermission(permissionsMatrix, currentRole, 'tickets:create_internal_notes');
  const canViewInternalNotes = hasRolePermission(permissionsMatrix, currentRole, 'tickets:view_internal_notes');
  const canViewTechnicalTelemetry = hasRolePermission(permissionsMatrix, currentRole, 'tickets:view_telemetry_internal');

  const isClientRole = currentRole === 'client_user';


  const roleAuthorNames: Record<UserRole, string> = {
    super_admin: 'Alex Turner (Super Admin)',
    tenant_admin: 'Elena Rostova (Tenant Admin)',
    squad_lead: 'Vikram Mehta (API Squad Lead)',
    developer: 'Rahul Sharma (Dev)',
    support_agent: 'Marcus Chen (Support)',
    client_user: 'Sarah Jenkins (Client)'
  };

  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const internalFlag = canPostInternalNotes ? isInternalNote : false;
      await onAddEvent(ticket.id, newComment, internalFlag);
      // Optimistic append
      setEvents(prev => [
        ...prev,
        {
          id: `ev-${Date.now()}`,
          ticket_id: ticket.id,
          tenant_id: ticket.tenant_id,
          author_name: roleAuthorNames[currentRole] || 'System User',
          author_role: currentRole,
          event_type: internalFlag ? 'DEV_NOTE' : 'CLIENT_REPLY',
          content: newComment,
          is_internal_only: internalFlag,
          created_at: new Date().toISOString()
        }
      ]);
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateTicket) return;

    setIsSavingEdit(true);
    try {
      await onUpdateTicket(ticket.id, {
        title: editTitle,
        description: editDescription,
        category: editCategory,
        severity: editSeverity,
        status: editStatus,
        assigned_squad: editSquad,
        assigned_to: editAssignedTo || undefined,
        assigned_to_name: editAssignedToName || undefined
      });
      setIsEditing(false);
    } catch (err: any) {
      alert('Failed to save changes: ' + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!onDeleteTicket) return;
    setIsDeleting(true);
    try {
      await onDeleteTicket(ticket.id);
      onClose();
    } catch (err: any) {
      alert('Failed to delete ticket: ' + err.message);
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl rounded-none animate-in fade-in zoom-in-95 duration-150 text-slate-900">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50">
          <div className="space-y-1.5 flex-1 pr-4">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5">
                {ticket.short_code}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 border border-purple-200 bg-purple-50/50 text-purple-800">
                {ticket.category}
                {ticket.category === 'RATING' && ticket.rating && ` (${ticket.rating}★)`}
              </span>
              <span className="text-xs font-mono text-slate-500">[{ticket.product_name || 'Product'}]</span>
              {ticket.domain_origin && (
                <span className="text-xs font-mono text-slate-600 flex items-center space-x-1 border border-slate-200 bg-white px-1.5 py-0.5">
                  <Globe className="w-3 h-3 text-slate-400" />
                  <span>{ticket.domain_origin}</span>
                </span>
              )}
              <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5">[{ticket.assigned_squad}]</span>
              <span className="text-xs font-mono px-2 py-0.5 border border-blue-200 bg-blue-50 text-blue-700 flex items-center space-x-1">
                <User className="w-3 h-3 text-blue-500" />
                <span>{ticket.assigned_to_name ? ticket.assigned_to_name.split(' (')[0] : 'Unassigned'}</span>
              </span>
              <span className="text-xs font-mono px-2 py-0.5 border border-slate-300 bg-slate-100 text-slate-800 font-semibold">
                STATUS: {ticket.status}
              </span>
            </div>

            {!isEditing && (
              <h2 className="text-lg font-bold text-slate-900">{ticket.title}</h2>
            )}
          </div>

          {/* Action Buttons (Edit, Delete, Close) */}
          <div className="flex items-center space-x-2 shrink-0">
            {!isEditing && !isConfirmingDelete && (
              <>
                {canEditTicket && (
                  <button
                    onClick={() => setIsEditing(true)}
                    title="Edit Ticket Details"
                    className="px-2.5 py-1 text-xs font-mono border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 bg-white flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Pencil className="w-3 h-3 text-purple-600" />
                    <span>Edit</span>
                  </button>
                )}
                {canDeleteTicket && (
                  <button
                    onClick={() => setIsConfirmingDelete(true)}
                    title="Delete Ticket"
                    className="px-2.5 py-1 text-xs font-mono border border-red-200 hover:border-red-300 text-red-600 hover:text-red-700 bg-red-50 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Delete Confirmation Bar */}
        {isConfirmingDelete && (
          <div className="bg-red-50 border-b border-red-200 p-3 px-5 flex items-center justify-between text-xs font-mono text-red-800">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Permanently delete ticket <strong>{ticket.short_code}</strong>? This cannot be undone.</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="px-3 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        {/* EDIT FORM (When isEditing === true) */}
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto flex-1 space-y-4 font-mono text-xs bg-white">
            <div className="space-y-1">
              <label className="text-slate-600 uppercase text-[11px] font-semibold">Ticket Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className="w-full bg-white border border-slate-300 p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-slate-600 uppercase text-[11px] font-semibold">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 p-2 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="BUG">BUG</option>
                  <option value="IDEA">IDEA</option>
                  <option value="HELP">HELP</option>
                  <option value="RATING">RATING</option>
                  <option value="API_FAILURE">API FAILURE</option>
                  <option value="UI_GLITCH">UI GLITCH</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 uppercase text-[11px] font-semibold">Severity</label>
                <select
                  value={editSeverity}
                  onChange={(e) => setEditSeverity(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 p-2 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT (P0)</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 uppercase text-[11px] font-semibold">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 p-2 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="OPEN">OPEN</option>
                  <option value="TRIAGED">TRIAGED</option>
                  <option value="IN_DEV">IN_DEV</option>
                  <option value="IN_QA">IN_QA</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 uppercase text-[11px] font-semibold">Assigned Squad</label>
                <select
                  value={editSquad}
                  onChange={(e) => setEditSquad(e.target.value)}
                  className="w-full bg-white border border-slate-300 p-2 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs cursor-pointer"
                >
                  <option value="CORE_ENGINEERING_SQUAD">CORE_ENGINEERING_SQUAD</option>
                  <option value="PAYMENT_CORE_API">PAYMENT_CORE_API</option>
                  <option value="FRONTEND_PORTAL">FRONTEND_PORTAL</option>
                  <option value="PRODUCT_DESIGN_SQUAD">PRODUCT_DESIGN_SQUAD</option>
                  <option value="CLIENT_SUPPORT_SQUAD">CLIENT_SUPPORT_SQUAD</option>
                  <option value="CUSTOMER_SUCCESS_SQUAD">CUSTOMER_SUCCESS_SQUAD</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 uppercase text-[11px] font-semibold">Assigned Developer</label>
                <select
                  value={editAssignedTo}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const dev = activeRoster.find(d => d.id === selectedId);
                    setEditAssignedTo(selectedId);
                    setEditAssignedToName(dev && dev.id ? dev.name : '');
                  }}
                  className="w-full bg-white border border-slate-300 p-2 text-indigo-700 font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                >
                  {activeRoster.map(dev => (
                    <option key={dev.id} value={dev.id} className="bg-white text-slate-900">
                      {dev.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-600 uppercase text-[11px] font-semibold">Report Description / Details</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                required
                className="w-full bg-white border border-slate-300 p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-1.5 border border-slate-300 hover:border-slate-400 text-slate-700 bg-white cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="px-4 py-1.5 bg-[#0066FF] hover:bg-blue-600 text-white font-medium flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Tab Switcher & Status Controls */}
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveTab('TELEMETRY')}
                  className={`px-3 py-1.5 text-xs font-mono border transition-all flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'TELEMETRY'
                      ? 'bg-white text-slate-900 border-slate-300 font-bold shadow-2xs'
                      : 'bg-transparent text-slate-500 border-transparent hover:border-slate-200 hover:text-slate-800'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-purple-600" />
                  <span>TELEMETRY & LOGS</span>
                </button>

                <button
                  onClick={() => setActiveTab('TIMELINE')}
                  className={`px-3 py-1.5 text-xs font-mono border transition-all flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'TIMELINE'
                      ? 'bg-white text-slate-900 border-slate-300 font-bold shadow-2xs'
                      : 'bg-transparent text-slate-500 border-transparent hover:border-slate-200 hover:text-slate-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
                  <span>TIMELINE & NOTES ({events.length})</span>
                </button>
              </div>

              {/* Status & Developer Quick Assignment */}
              {(canAssign || canChangeStatus) && (
                <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                  
                  {/* Developer Assignment Dropdown */}
                  {canAssign && (
                    <div className="flex items-center space-x-1.5 bg-white border border-slate-200 px-2 py-1 shadow-2xs">
                      <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                      <span className="text-[11px] font-mono text-slate-500 uppercase font-semibold">ASSIGN:</span>
                      <select
                        value={ticket.assigned_to || ''}
                        onChange={async (e) => {
                          const selectedId = e.target.value;
                          const dev = activeRoster.find(d => d.id === selectedId);
                          if (onUpdateTicket) {
                            await onUpdateTicket(ticket.id, {
                              assigned_to: selectedId || undefined,
                              assigned_to_name: dev && dev.id ? dev.name : undefined,
                              status: ticket.status === 'OPEN' && selectedId ? 'IN_DEV' : ticket.status
                            });
                          }
                        }}
                        className="bg-transparent text-indigo-700 text-xs font-mono font-semibold focus:outline-none cursor-pointer"
                      >
                        {activeRoster.map(dev => (
                          <option key={dev.id} value={dev.id} className="bg-white text-slate-900">
                            {dev.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Status Advancement Buttons */}
                  {canChangeStatus && (
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-mono text-slate-500 font-semibold">STATUS:</span>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(ticket.id, 'TRIAGED', 'Status changed to TRIAGED.')}
                        className={`px-2 py-0.5 text-xs font-mono border transition-colors cursor-pointer shadow-2xs font-semibold ${
                          ticket.status === 'TRIAGED' ? 'bg-blue-600 text-white border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                        }`}
                      >
                        TRIAGED
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(ticket.id, 'IN_DEV', 'Dev squad started active investigation.')}
                        className={`px-2 py-0.5 text-xs font-mono border transition-colors cursor-pointer shadow-2xs font-semibold ${
                          ticket.status === 'IN_DEV' ? 'bg-purple-600 text-white border-purple-700' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                        }`}
                      >
                        IN_DEV
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(ticket.id, 'RESOLVED', 'Incident resolved and verified.')}
                        className={`px-2 py-0.5 text-xs font-mono border transition-colors cursor-pointer shadow-2xs font-semibold ${
                          ticket.status === 'RESOLVED' ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        RESOLVED
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tab Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-white">
              {activeTab === 'TELEMETRY' ? (
                <div className="space-y-6">
                  
                  {/* Description */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-mono uppercase text-slate-500 tracking-wider font-semibold">Report Details</h4>
                    <p className="text-sm text-slate-800 bg-slate-50 p-4 border border-slate-200 leading-relaxed">
                      {ticket.description}
                    </p>
                  </div>

                  {/* Rating Display if RATING Category */}
                  {ticket.rating && (
                    <div className="p-4 border border-amber-200 bg-amber-50 flex items-center space-x-3">
                      <div className="flex items-center space-x-1 text-amber-500">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span key={s} className={`text-lg ${s <= ticket.rating! ? 'opacity-100' : 'opacity-30'}`}>★</span>
                        ))}
                      </div>
                      <span className="text-xs font-mono text-amber-900 font-bold">
                        Client Satisfaction Score: {ticket.rating}/5
                      </span>
                    </div>
                  )}

                  {/* Attached Screenshot Preview if present */}
                  {(ticket.screenshot_url || ticket.telemetry?.screenshot_url) && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono uppercase text-slate-500 tracking-wider font-semibold flex items-center space-x-2">
                        <span>Attached User Screenshot</span>
                      </h4>
                      <div className="border border-slate-200 bg-slate-50 p-3">
                        <img 
                          src={ticket.screenshot_url || ticket.telemetry?.screenshot_url} 
                          alt="Client attached screenshot" 
                          className="max-h-72 object-contain border border-slate-300"
                        />
                      </div>
                    </div>
                  )}

                  {/* Environment Information (Safe for all roles) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 border border-slate-200 bg-slate-50 space-y-1">
                      <span className="text-[11px] font-mono text-slate-500 uppercase font-semibold">Page URL</span>
                      <p className="text-xs font-mono text-slate-800 truncate">
                        {ticket.telemetry?.page_url || 'https://client-app.com/dashboard'}
                      </p>
                    </div>
                    <div className="p-3 border border-slate-200 bg-slate-50 space-y-1">
                      <span className="text-[11px] font-mono text-slate-500 uppercase font-semibold">User Agent & Viewport</span>
                      <p className="text-xs font-mono text-slate-800 truncate">
                        {ticket.telemetry?.viewport_dimensions || '1920x1080'} • {ticket.telemetry?.app_version || 'v1.0.0'}
                      </p>
                    </div>
                  </div>

                  {/* Client User Quarantine Notice */}
                  {!canViewTechnicalTelemetry && (
                    <div className="p-4 border border-indigo-200 bg-indigo-50/50 flex items-start space-x-3 text-xs font-mono text-slate-700">
                      <Shield className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-slate-900 uppercase">Protected Client Scope</p>
                        <p className="text-slate-600 font-sans">
                          Internal application stack traces, AES-256 decryption context, and engineering console diagnostics are quarantined to authorized engineering and lead roles.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Console Logs (Engineering Only) */}
                  {canViewTechnicalTelemetry && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-mono uppercase text-slate-500 tracking-wider font-semibold flex items-center space-x-1.5">
                          <Terminal className="w-3.5 h-3.5 text-purple-600" />
                          <span>Captured Browser Console Logs</span>
                        </h4>
                        <span className="text-[10px] font-mono text-slate-400">AUTO-EXTRACTED BY SDK</span>
                      </div>
                      
                      <div className="bg-[#0f172a] border border-slate-700 p-3 font-mono text-xs text-slate-200 space-y-1.5 max-h-40 overflow-y-auto">
                        {ticket.telemetry?.console_logs && ticket.telemetry.console_logs.length > 0 ? (
                          ticket.telemetry.console_logs.map((log, idx) => (
                            <div key={idx} className="flex items-start space-x-2">
                              <span className="text-slate-500 text-[10px]">[{log.timestamp}]</span>
                              <span className={`text-[10px] uppercase font-bold ${log.type === 'error' ? 'text-red-400' : 'text-blue-400'}`}>
                                [{log.type}]
                              </span>
                              <span className="flex-1 text-slate-200">{log.message}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500">No client console errors recorded.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Network Error Inspector (Engineering & Support) */}
                  {(canViewTechnicalTelemetry || currentRole === 'support_agent') && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono uppercase text-slate-500 tracking-wider font-semibold flex items-center space-x-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                        <span>Failed API Requests (4xx / 5xx)</span>
                      </h4>
                      
                      <div className="bg-slate-50 border border-slate-200 p-3 font-mono text-xs text-slate-800 space-y-1.5">
                        {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 ? (
                          ticket.telemetry.network_errors.map((net, idx) => (
                            <div key={idx} className="flex items-center space-x-3 p-1.5 bg-red-50 border border-red-200">
                              <span className="px-1.5 py-0.5 bg-red-600 text-white text-[10px] font-bold">
                                HTTP {net.status}
                              </span>
                              <span className="text-red-800 font-mono text-xs flex-1">{net.url}</span>
                              <span className="text-slate-400 text-[10px]">{net.timestamp}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400">No failed network requests attached.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bank-Grade Decrypted Payload (Engineering & Admin Only) */}
                  {canViewTechnicalTelemetry && ticket.telemetry?.encrypted_sensitive_data && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-600" />
                        <h4 className="text-xs font-mono uppercase text-emerald-700 tracking-wider font-semibold">
                          AES-256-GCM Decrypted Diagnostic Context
                        </h4>
                      </div>
                      <pre className="bg-emerald-50 border border-emerald-200 p-3 font-mono text-xs text-emerald-900 whitespace-pre-wrap break-all max-w-full">
                        {ticket.telemetry.encrypted_sensitive_data}
                      </pre>
                    </div>
                  )}

                </div>
              ) : (
                /* Timeline & Quarantine View */
                <div className="space-y-6">
                  
                  {/* Timeline Stream */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-mono uppercase text-slate-500 tracking-wider font-semibold">
                      Audit Trail & Incident Timeline
                    </h4>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {events.filter(ev => !ev.is_internal_only || canViewInternalNotes).length === 0 ? (
                        <p className="text-xs font-mono text-slate-400">No events recorded yet.</p>
                      ) : (
                        events.filter(ev => !ev.is_internal_only || canViewInternalNotes).map((ev) => (
                          <div
                            key={ev.id}
                            className={`p-3 border text-xs font-mono space-y-1 ${
                              ev.is_internal_only
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-slate-50 border-slate-200 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold flex items-center space-x-1.5">
                                <span>{ev.author_name}</span>
                                <span className="text-[10px] text-slate-500 font-normal">[{ev.author_role}]</span>
                                {ev.is_internal_only && (
                                  <span className="px-1 py-0.2 bg-amber-100 text-amber-800 text-[9px] uppercase font-bold flex items-center space-x-1 border border-amber-200">
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>INTERNAL DEV ONLY</span>
                                  </span>
                                )}
                              </span>
                              <span className="text-slate-400 text-[10px]">{new Date(ev.created_at).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-slate-700 font-sans">{ev.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Add Event Form */}
                  <form onSubmit={handleSendComment} className="space-y-3 pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase text-slate-500 font-semibold">Post Timeline Update</span>
                      {canPostInternalNotes && (
                        <label className="flex items-center space-x-2 text-xs font-mono text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isInternalNote}
                            onChange={(e) => setIsInternalNote(e.target.checked)}
                            className="bg-white border-slate-300 text-purple-600 focus:ring-0"
                          />
                          <span>Internal Dev Note (Quarantined from Client)</span>
                        </label>
                      )}
                    </div>

                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={
                          isClientRole
                            ? 'Reply to engineering team...'
                            : isInternalNote
                            ? 'Add internal developer investigation note...'
                            : 'Post update visible to enterprise client...'
                        }
                        className="flex-1 bg-white border border-slate-300 text-xs font-mono p-2.5 text-slate-900 focus:outline-none focus:border-indigo-500 shadow-2xs"
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting || !newComment.trim()}
                        className="px-4 py-2 bg-[#0066FF] hover:bg-blue-600 text-white text-xs font-mono font-medium flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>POST</span>
                      </button>
                    </div>
                  </form>

                </div>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
};
