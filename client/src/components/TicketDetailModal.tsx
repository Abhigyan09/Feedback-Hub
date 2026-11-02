import React, { useState, useEffect, useMemo } from 'react';
import { Ticket, TicketEvent, UserRole, TicketCategory, TicketSeverity, TicketStatus, RolePermissionsMatrix } from '../types';
import { hasRolePermission } from '../constants/permissions';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from './CustomSelect';
import { safeArray, processLogTraces, downloadRawLog, isSafeImageUrl } from '../utils/edgeCaseHelpers';
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
  User,
  Download
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
  const { authFetch } = useAuth();
  const safeTeam = safeArray(teamMembers);
  const activeRoster = React.useMemo(() => {
    return [
      { id: '', name: 'Unassigned' },
      ...safeTeam.map(m => ({ id: m.id, name: m.role ? `${m.name} (${m.role})` : m.name }))
    ];
  }, [safeTeam]);
  const processedLogs = useMemo(
    () => processLogTraces(ticket?.telemetry?.console_logs),
    [ticket?.telemetry?.console_logs]
  );
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

  // Close modal on Escape key press (nested CustomSelect dropdowns stopPropagation so only dropdown closes first)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load ticket details and events from backend
  useEffect(() => {
    if (!ticket) return;

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

    authFetch(`/api/v1/tickets/${ticket.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.events) {
          setEvents(data.events);
        }
      })
      .catch(err => console.error('Failed to load events:', err));
  }, [ticket, currentRole, authFetch]);

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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200/90 w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl rounded-[12px] overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-slate-900 font-poppins">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200/80 flex items-start justify-between bg-slate-50/60">
          <div className="space-y-2 flex-1 pr-4">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-medium text-blue-700 bg-blue-50 border border-blue-200/70 px-2 py-0.5 rounded-[6px]">
                {ticket.short_code}
              </span>
              <span className="font-medium px-2 py-0.5 border border-slate-200 bg-white text-slate-700 rounded-[6px]">
                {ticket.category}
                {ticket.category === 'RATING' && ticket.rating && ` (${ticket.rating}★)`}
              </span>
              {ticket.product_name && (
                <span className="text-slate-500 font-normal">
                  {ticket.product_name}
                </span>
              )}
              {ticket.domain_origin && (
                <span className="text-slate-500 font-normal flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>{ticket.domain_origin}</span>
                </span>
              )}
              {ticket.assigned_squad && (
                <span className="text-slate-600 bg-slate-100 border border-slate-200/70 px-2 py-0.5 rounded-[6px] font-normal text-[11px]">
                  {ticket.assigned_squad.replace(/_/g, ' ')}
                </span>
              )}
              <span className="px-2 py-0.5 border border-indigo-200/80 bg-indigo-50/60 text-indigo-700 flex items-center gap-1 rounded-[6px] font-medium">
                <User className="w-3 h-3 text-indigo-500" />
                <span>{ticket.assigned_to_name ? ticket.assigned_to_name.split(' (')[0] : 'Unassigned'}</span>
              </span>
              <span className={`px-2 py-0.5 border font-medium rounded-[6px] ${
                ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : ticket.status === 'IN_DEV' || ticket.status === 'IN_QA'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : ticket.status === 'TRIAGED'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {ticket.status}
              </span>
              {!ticket.telemetry && (
                <span className="text-slate-600 bg-slate-100 border border-slate-200/70 px-2 py-0.5 rounded-[6px] font-normal text-[11px]">
                  Manual Ingest
                </span>
              )}
            </div>

            {!isEditing && (
              <h2 className="text-lg font-medium text-slate-900 tracking-tight leading-snug break-all" title={ticket.title}>
                {ticket.title}
              </h2>
            )}
          </div>

          {/* Action Buttons (Edit, Delete, Close) */}
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing && !isConfirmingDelete && (
              <>
                {canEditTicket && (
                  <button
                    onClick={() => setIsEditing(true)}
                    title="Edit Ticket Details"
                    className="px-2.5 py-1.5 text-xs font-medium border border-slate-200/80 hover:bg-slate-50 text-slate-700 bg-white flex items-center gap-1.5 rounded-[8px] transition-colors cursor-pointer shadow-2xs"
                  >
                    <Pencil className="w-3.5 h-3.5 text-blue-600" />
                    <span>Edit</span>
                  </button>
                )}
                {canDeleteTicket && (
                  <button
                    onClick={() => setIsConfirmingDelete(true)}
                    title="Delete Ticket"
                    className="px-2.5 py-1.5 text-xs font-medium border border-red-200/80 hover:bg-red-50 text-red-600 bg-red-50/50 flex items-center gap-1.5 rounded-[8px] transition-colors cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-[8px] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Delete Confirmation Bar */}
        {isConfirmingDelete && (
          <div className="bg-red-50 border-b border-red-200 p-3 px-5 flex items-center justify-between text-xs text-red-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Permanently delete ticket <strong>{ticket.short_code}</strong>? This cannot be undone.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsConfirmingDelete(false)}
                className="px-3 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-[8px] cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-medium rounded-[8px] cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}

        {/* EDIT FORM (When isEditing === true) */}
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto flex-1 space-y-4 text-xs bg-white">
            <div className="space-y-1">
              <label className="text-slate-600 font-medium text-xs">Ticket Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                className="w-full bg-white border border-slate-200 p-2.5 text-slate-900 rounded-[8px] focus:outline-none focus:border-blue-500 shadow-2xs text-xs font-normal"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-slate-600 font-medium text-xs">Category</label>
                <CustomSelect
                  fullWidth
                  value={editCategory}
                  onChange={(val: string) => setEditCategory(val as any)}
                  options={[
                    { value: 'BUG', label: 'BUG' },
                    { value: 'IDEA', label: 'IDEA' },
                    { value: 'HELP', label: 'HELP' },
                    { value: 'RATING', label: 'RATING' },
                    { value: 'API_FAILURE', label: 'API FAILURE' },
                    { value: 'UI_GLITCH', label: 'UI GLITCH' }
                  ]}
                  buttonClassName="w-full bg-white border border-slate-200 p-2 text-slate-900 rounded-[8px] shadow-2xs text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 font-medium text-xs">Severity</label>
                <CustomSelect
                  fullWidth
                  value={editSeverity}
                  onChange={(val: string) => setEditSeverity(val as any)}
                  options={[
                    { value: 'LOW', label: 'LOW' },
                    { value: 'MEDIUM', label: 'MEDIUM' },
                    { value: 'HIGH', label: 'HIGH' },
                    { value: 'URGENT', label: 'URGENT (P0)' },
                    { value: 'CRITICAL', label: 'CRITICAL' }
                  ]}
                  buttonClassName="w-full bg-white border border-slate-200 p-2 text-slate-900 rounded-[8px] shadow-2xs text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 font-medium text-xs">Status</label>
                <CustomSelect
                  fullWidth
                  value={editStatus}
                  onChange={(val: string) => setEditStatus(val as any)}
                  options={[
                    { value: 'OPEN', label: 'OPEN' },
                    { value: 'TRIAGED', label: 'TRIAGED' },
                    { value: 'IN_DEV', label: 'IN_DEV' },
                    { value: 'IN_QA', label: 'IN_QA' },
                    { value: 'RESOLVED', label: 'RESOLVED' },
                    { value: 'CLOSED', label: 'CLOSED' }
                  ]}
                  buttonClassName="w-full bg-white border border-slate-200 p-2 text-slate-900 rounded-[8px] shadow-2xs text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 font-medium text-xs">Assigned Squad</label>
                <CustomSelect
                  fullWidth
                  value={editSquad}
                  onChange={(val: string) => setEditSquad(val)}
                  options={[
                    { value: 'CORE_ENGINEERING_SQUAD', label: 'Core Engineering Squad' },
                    { value: 'PAYMENT_CORE_API', label: 'Payment Core API' },
                    { value: 'FRONTEND_PORTAL', label: 'Frontend Portal' },
                    { value: 'PRODUCT_DESIGN_SQUAD', label: 'Product Design Squad' },
                    { value: 'CLIENT_SUPPORT_SQUAD', label: 'Client Support Squad' },
                    { value: 'CUSTOMER_SUCCESS_SQUAD', label: 'Customer Success Squad' }
                  ]}
                  buttonClassName="w-full bg-white border border-slate-200 p-2 text-slate-900 rounded-[8px] shadow-2xs text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 font-medium text-xs">Assigned Developer</label>
                <CustomSelect
                  fullWidth
                  disabled={safeTeam.length === 0}
                  value={editAssignedTo}
                  onChange={(val: string) => {
                    const dev = activeRoster.find(d => d.id === val);
                    setEditAssignedTo(val);
                    setEditAssignedToName(dev && dev.id ? dev.name : '');
                  }}
                  options={
                    safeTeam.length === 0
                      ? [{ value: '', label: 'No engineers available' }]
                      : activeRoster.map(dev => ({ value: dev.id, label: dev.name }))
                  }
                  buttonClassName="w-full bg-white border border-slate-200 p-2 text-blue-700 font-medium rounded-[8px] shadow-2xs text-xs"
                />
              </div>
            </div>
<div className="space-y-1">
              <label className="text-slate-600 font-medium text-xs">Report Description / Details</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                required
                className="w-full bg-white border border-slate-200 p-2.5 text-slate-900 rounded-[8px] focus:outline-none focus:border-blue-500 resize-none leading-relaxed shadow-2xs text-xs font-normal"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 bg-white rounded-[8px] cursor-pointer shadow-2xs font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="px-4 py-1.5 bg-[#0066FF] hover:bg-blue-600 text-white font-medium flex items-center gap-1.5 rounded-[8px] disabled:opacity-50 cursor-pointer shadow-xs text-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingEdit ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Tab Switcher & Status Controls */}
            <div className="px-5 py-3 border-b border-slate-200/80 bg-slate-50/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Segmented Tab Switcher */}
              <div className="inline-flex p-1 bg-slate-100/90 border border-slate-200/70 rounded-[8px] space-x-1">
                <button
                  onClick={() => setActiveTab('TELEMETRY')}
                  className={`px-3 py-1.5 text-xs transition-all flex items-center gap-1.5 rounded-[8px] cursor-pointer ${
                    activeTab === 'TELEMETRY'
                      ? 'bg-white text-slate-900 font-medium border border-slate-200/60 shadow-2xs'
                      : 'bg-transparent text-slate-600 border border-transparent hover:text-slate-900 font-normal'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-600" />
                  <span>Telemetry & Logs</span>
                </button>

                <button
                  onClick={() => setActiveTab('TIMELINE')}
                  className={`px-3 py-1.5 text-xs transition-all flex items-center gap-1.5 rounded-[8px] cursor-pointer ${
                    activeTab === 'TIMELINE'
                      ? 'bg-white text-slate-900 font-medium border border-slate-200/60 shadow-2xs'
                      : 'bg-transparent text-slate-600 border border-transparent hover:text-slate-900 font-normal'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                  <span>Timeline & Notes ({events.length})</span>
                </button>
              </div>

              {/* Status & Developer Quick Assignment */}
              {(canAssign || canChangeStatus) && (
                <div className="flex items-center gap-3 flex-wrap">
                  
                  {/* Developer Assignment Dropdown */}
                  {canAssign && (
                    safeTeam.length === 0 ? (
                      <div
                        title="No squad engineers registered on the roster. Add staff in Staff Workload first."
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-[8px]"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-amber-600" />
                        <span>No engineers available (Add staff first)</span>
                      </div>
                    ) : (
                      <CustomSelect
                        icon={<UserCheck className="w-3.5 h-3.5 text-blue-600" />}
                        label="Assign"
                        value={ticket.assigned_to || ''}
                        onChange={async (selectedId) => {
                          const dev = activeRoster.find(d => d.id === selectedId);
                          if (onUpdateTicket) {
                            await onUpdateTicket(ticket.id, {
                              assigned_to: selectedId || undefined,
                              assigned_to_name: dev && dev.id ? dev.name : undefined,
                              status: ticket.status === 'OPEN' && selectedId ? 'IN_DEV' : ticket.status
                            });
                          }
                        }}
                        options={activeRoster.map(dev => ({ value: dev.id, label: dev.name }))}
                        buttonClassName="bg-white hover:bg-slate-50 border-slate-200/80 px-2.5 py-1 shadow-2xs"
                      />
                    )
                  )}

                  {/* Status Advancement Buttons */}
                  {canChangeStatus && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400 font-medium">Status:</span>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(ticket.id, 'TRIAGED', 'Status changed to TRIAGED.')}
                        className={`px-2.5 py-1 text-xs border transition-colors cursor-pointer rounded-[8px] font-medium ${
                          ticket.status === 'TRIAGED' ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Triaged
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(ticket.id, 'IN_DEV', 'Dev squad started active investigation.')}
                        className={`px-2.5 py-1 text-xs border transition-colors cursor-pointer rounded-[8px] font-medium ${
                          ticket.status === 'IN_DEV' ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        In Dev
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(ticket.id, 'RESOLVED', 'Incident resolved and verified.')}
                        className={`px-2.5 py-1 text-xs border transition-colors cursor-pointer rounded-[8px] font-medium ${
                          ticket.status === 'RESOLVED' ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Resolved
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tab Content Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-white">
              {activeTab === 'TELEMETRY' ? (
                <div className="space-y-5">
                  
                  {/* Description */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400">Report Details</h4>
                    <p className="text-sm text-slate-700 bg-slate-50/70 p-4 border border-slate-200/80 rounded-[12px] leading-relaxed font-normal">
                      {ticket.description}
                    </p>
                  </div>

                  {/* Rating Display if RATING Category */}
                  {ticket.rating && (
                    <div className="p-3.5 border border-amber-200/80 bg-amber-50/70 rounded-[12px] flex items-center gap-3">
                      <div className="flex items-center gap-1 text-amber-500">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span key={s} className={`text-base ${s <= ticket.rating! ? 'opacity-100' : 'opacity-30'}`}>★</span>
                        ))}
                      </div>
                      <span className="text-xs text-amber-900 font-medium">
                        Client Satisfaction Score: {ticket.rating}/5
                      </span>
                    </div>
                  )}

                  {/* Attached Screenshot Preview if present */}
                  {(ticket.screenshot_url || ticket.telemetry?.screenshot_url) && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <span>Attached User Screenshot</span>
                      </h4>
                      <div className="border border-slate-200/80 bg-slate-50/60 p-3 rounded-[12px]">
                        {isSafeImageUrl(ticket.screenshot_url || ticket.telemetry?.screenshot_url) ? (
                          <img 
                            src={ticket.screenshot_url || ticket.telemetry?.screenshot_url} 
                            alt="Client attached screenshot" 
                            className="max-h-72 object-contain border border-slate-200 rounded-[8px]"
                          />
                        ) : (
                          <div className="text-xs text-rose-500 italic p-2 bg-rose-50 border border-rose-200 rounded-[6px]">
                            Screenshot image URL blocked by security policy (invalid or unsafe protocol).
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Environment Information (Safe for all roles) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    <div className="p-3.5 border border-slate-200/80 bg-slate-50/60 rounded-[12px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Page URL</span>
                        {!ticket.telemetry?.page_url && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-normal">Manual Ingest</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 font-normal truncate" title={ticket.telemetry?.page_url ?? 'N/A'}>
                        {ticket.telemetry?.page_url ?? 'N/A'}
                      </p>
                    </div>
                    <div className="p-3.5 border border-slate-200/80 bg-slate-50/60 rounded-[12px] space-y-1">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">User Agent & Viewport</span>
                      <p className="text-xs text-slate-700 font-normal truncate" title={ticket.telemetry?.user_agent ?? 'Manual Ingest'}>
                        {ticket.telemetry?.viewport_dimensions ? `${ticket.telemetry.viewport_dimensions} • ` : ''}{ticket.telemetry?.app_version ? `${ticket.telemetry.app_version} • ` : ''}{ticket.telemetry?.user_agent ?? 'Manual Ingest'}
                      </p>
                    </div>
                  </div>

                  {/* Client User Quarantine Notice */}
                  {!canViewTechnicalTelemetry && (
                    <div className="p-4 border border-indigo-200/70 bg-indigo-50/40 rounded-[12px] flex items-start gap-3 text-xs text-slate-700">
                      <Shield className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">Protected Client Scope</p>
                        <p className="text-slate-600 font-normal leading-relaxed">
                          Internal application stack traces, AES-256 decryption context, and engineering console diagnostics are quarantined to authorized engineering and lead roles.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Console Logs (Engineering Only) with 50KB Truncation & Download Raw Log */}
                  {canViewTechnicalTelemetry && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-blue-600" />
                          <span>Captured Browser Console Logs</span>
                        </h4>
                        <div className="flex items-center space-x-2">
                          {processedLogs.rawText && (
                            <button
                              type="button"
                              onClick={() => downloadRawLog(processedLogs.rawText, `ticket-${ticket.short_code || ticket.id}-console.log`)}
                              className="inline-flex items-center space-x-1 text-[10px] text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-[6px] transition-colors cursor-pointer"
                              title="Download complete raw console log trace"
                            >
                              <Download className="w-3 h-3" />
                              <span>Download Raw Log</span>
                            </button>
                          )}
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-[6px]">
                            {ticket.telemetry ? 'AUTO-EXTRACTED BY SDK' : 'MANUAL INGEST'}
                          </span>
                        </div>
                      </div>

                      {processedLogs.isTruncated && (
                        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-[8px] flex items-center justify-between">
                          <span>⚠️ Large log trace truncated to the first 50KB for browser responsiveness (Total: {(processedLogs.totalBytes / 1024).toFixed(1)}KB).</span>
                          <button
                            type="button"
                            onClick={() => downloadRawLog(processedLogs.rawText, `ticket-${ticket.short_code || ticket.id}-console.log`)}
                            className="font-medium underline ml-2 hover:text-amber-900 cursor-pointer text-[10px]"
                          >
                            Download Full Log
                          </button>
                        </div>
                      )}
                      
                      <div className="bg-[#151c2c] border border-slate-800 p-3.5 font-mono text-xs text-slate-300 space-y-1.5 max-h-48 overflow-y-auto rounded-[12px]">
                        {processedLogs.rawText ? (
                          <pre className="text-slate-200 font-mono text-xs whitespace-pre-wrap break-all leading-relaxed">
                            {processedLogs.truncatedText}
                          </pre>
                        ) : (
                          <span className="text-slate-400 font-normal">No client console errors recorded.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Network Error Inspector (Engineering & Support) */}
                  {(canViewTechnicalTelemetry || currentRole === 'support_agent') && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span>Failed API Requests (4xx / 5xx)</span>
                      </h4>
                      
                      <div className="bg-slate-50/60 border border-slate-200/80 p-3 rounded-[12px] text-xs space-y-2">
                        {ticket.telemetry?.network_errors && ticket.telemetry.network_errors.length > 0 ? (
                          ticket.telemetry.network_errors.map((net, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-2 bg-red-50/70 border border-red-200/70 rounded-[8px]">
                              <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-medium rounded-[6px]">
                                HTTP {net.status}
                              </span>
                              <span className="text-red-900 font-mono text-xs flex-1">{net.url}</span>
                              <span className="text-slate-400 text-[10px]">{net.timestamp}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400 font-normal">No failed network requests attached.</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bank-Grade Decrypted Payload (Engineering & Admin Only) */}
                  {canViewTechnicalTelemetry && ticket.telemetry?.encrypted_sensitive_data && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-600" />
                        <h4 className="text-xs font-medium uppercase tracking-wider text-emerald-700">
                          AES-256-GCM Decrypted Diagnostic Context
                        </h4>
                      </div>
                      <pre className="bg-emerald-50/60 border border-emerald-200/80 p-3.5 font-mono text-xs text-emerald-950 whitespace-pre-wrap break-all max-w-full rounded-[12px]">
                        {ticket.telemetry.encrypted_sensitive_data}
                      </pre>
                    </div>
                  )}

                </div>
              ) : (
                /* Timeline & Quarantine View */
                <div className="space-y-5">
                  
                  {/* Timeline Stream */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Audit Trail & Incident Timeline
                    </h4>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {events.filter(ev => !ev.is_internal_only || canViewInternalNotes).length === 0 ? (
                        <p className="text-xs text-slate-400 font-normal">No events recorded yet.</p>
                      ) : (
                        events.filter(ev => !ev.is_internal_only || canViewInternalNotes).map((ev) => (
                          <div
                            key={ev.id}
                            className={`p-3.5 border text-xs space-y-1.5 rounded-[12px] ${
                              ev.is_internal_only
                                ? 'bg-amber-50/60 border-amber-200/80 text-amber-900'
                                : 'bg-slate-50/60 border-slate-200/80 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium flex items-center gap-2">
                                <span className="text-slate-900">{ev.author_name}</span>
                                <span className="text-[11px] text-slate-400 font-normal">({ev.author_role})</span>
                                {ev.is_internal_only && (
                                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium flex items-center gap-1 border border-amber-200/80 rounded-[6px]">
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>Internal Note</span>
                                  </span>
                                )}
                              </span>
                              <span className="text-slate-400 text-[11px]">{Number.isFinite(new Date(ev.created_at).getTime()) ? new Date(ev.created_at).toLocaleTimeString() : 'Just now'}</span>
                            </div>
                            <p className="text-slate-700 font-normal leading-relaxed">{ev.content}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Add Event Form */}
                  <form onSubmit={handleSendComment} className="space-y-3 pt-4 border-t border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Post Timeline Update</span>
                      {canPostInternalNotes && (
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isInternalNote}
                            onChange={(e) => setIsInternalNote(e.target.checked)}
                            className="bg-white border-slate-300 text-blue-600 focus:ring-0 rounded-[6px]"
                          />
                          <span className="font-normal">Internal Dev Note (Quarantined from Client)</span>
                        </label>
                      )}
                    </div>

                    <div className="flex gap-2">
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
                        className="flex-1 bg-white border border-slate-200 text-xs p-2.5 text-slate-900 focus:outline-none focus:border-blue-500 shadow-2xs rounded-[8px] font-normal"
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting || !newComment.trim()}
                        className="px-4 py-2 bg-[#0066FF] hover:bg-blue-600 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs rounded-[8px] transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Post</span>
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
