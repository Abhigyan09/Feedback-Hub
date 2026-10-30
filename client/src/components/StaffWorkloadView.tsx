import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
  Users, 
  Shield, 
  Sparkles, 
  RefreshCw, 
  Plus, 
  Search, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Zap, 
  Layers, 
  ArrowUpDown, 
  Check, 
  UserCheck, 
  PhoneCall, 
  Mail, 
  SlidersHorizontal,
  ChevronRight,
  ExternalLink,
  Cpu,
  Trash2,
  Lock,
  UserPlus,
  ArrowRight
} from 'lucide-react';
import { TeamMember, Ticket, TicketStatus, UserRole, RolePermissionsMatrix } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';
import { hasRolePermission } from '../constants/permissions';
import { useAuth } from '../context/AuthContext';

interface StaffWorkloadViewProps {
  currentTenantId: string;
  currentRole: UserRole;
  teamMembers: TeamMember[];
  tickets: Ticket[];
  permissionsMatrix?: RolePermissionsMatrix | null;
  onSelectTicket: (ticket: Ticket) => void;
  onUpdateStatus?: (ticketId: string, status: TicketStatus) => void;
  onAssignTicket?: (ticketId: string, memberId: string, memberName: string) => void;
  onRefresh?: () => void;
  onStaffUpdated?: () => void;
}

export const StaffWorkloadView: React.FC<StaffWorkloadViewProps> = ({
  currentTenantId,
  currentRole,
  teamMembers,
  tickets,
  permissionsMatrix,
  onSelectTicket,
  onUpdateStatus,
  onAssignTicket,
  onRefresh,
  onStaffUpdated
}) => {
  const { authFetch } = useAuth();
  // Local staff list state for instant optimistic responsiveness
  const [staffList, setStaffList] = useState<TeamMember[]>(teamMembers);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'ACTIVE_LOAD' | 'IDLE' | 'ON_CALL'>('ALL');
  const [sortBy, setSortBy] = useState<'LOAD_DESC' | 'NAME_ASC' | 'ROLE'>('LOAD_DESC');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('developer');
  const [newStaffSquad, setNewStaffSquad] = useState('Core Platform & API Squad');
  const [newStaffStatus, setNewStaffStatus] = useState<'ONLINE' | 'ON_CALL' | 'AWAY'>('ONLINE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Feedback banners
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  // Ref for auto-scrolling to queue
  const queueSectionRef = useRef<HTMLDivElement>(null);

  // Sync staffList whenever parent teamMembers updates
  useEffect(() => {
    if (teamMembers && teamMembers.length > 0) {
      setStaffList(teamMembers);
    }
  }, [teamMembers]);

  // Dynamic RBAC checks
  const isAdminOrLead = ['super_admin', 'tenant_admin', 'squad_lead'].includes(currentRole);
  const canAssign = hasRolePermission(permissionsMatrix, currentRole, 'tickets:assign');
  const canChangeStatus = hasRolePermission(permissionsMatrix, currentRole, 'tickets:change_status');

  // Direct fetch from /api/v1/tenants/staff to guarantee synchronization
  const fetchStaffData = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v1/tenants/staff?_t=${Date.now()}`, {
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.staff && Array.isArray(data.staff)) {
          const colorList = [
            'bg-purple-100 text-purple-700 border-purple-300',
            'bg-indigo-100 text-indigo-700 border-indigo-300',
            'bg-violet-100 text-violet-700 border-violet-300',
            'bg-blue-100 text-blue-700 border-blue-300',
            'bg-emerald-100 text-emerald-700 border-emerald-300',
            'bg-amber-100 text-amber-700 border-amber-300',
          ];
          const mapped: TeamMember[] = data.staff.map((u: any, idx: number) => ({
            id: u.id,
            name: u.name,
            role: u.role,
            email: u.email,
            avatarInitials: u.avatarInitials,
            status: u.status,
            squad: u.squad,
            color: colorList[idx % colorList.length],
            openCount: u.open_load,
            resolvedCount: u.resolved_load
          }));
          setStaffList(mapped);
        }
      }
    } catch (err) {
      console.warn('Error fetching live staff members:', err);
    }
  }, [currentTenantId, currentRole]);

  // Compute live ticket counts per member
  const memberMetrics = useMemo(() => {
    const metrics: Record<string, {
      open: Ticket[];
      resolved: Ticket[];
      urgent: Ticket[];
      openCount: number;
      resolvedCount: number;
      urgentCount: number;
    }> = {};

    staffList.forEach(m => {
      const assigned = tickets.filter(t => t.assigned_to === m.id);
      const open = assigned.filter(t => normalizeStatus(t.status) !== 'Resolved');
      const resolved = assigned.filter(t => normalizeStatus(t.status) === 'Resolved');
      const urgent = open.filter(t => normalizeSeverity(t.severity) === 'Urgent');

      metrics[m.id] = {
        open,
        resolved,
        urgent,
        openCount: open.length,
        resolvedCount: resolved.length,
        urgentCount: urgent.length
      };
    });

    return metrics;
  }, [staffList, tickets]);

  // Unassigned open tickets
  const unassignedTickets = useMemo(() => {
    return tickets.filter(
      t => (!t.assigned_to || t.assigned_to === '') && normalizeStatus(t.status) !== 'Resolved'
    );
  }, [tickets]);

  // Overall statistics
  const totalOpenTickets = useMemo(() => {
    return tickets.filter(t => normalizeStatus(t.status) !== 'Resolved').length;
  }, [tickets]);

  const onCallLead = useMemo(() => {
    return staffList.find(m => m.status === 'ON_CALL') || staffList[0];
  }, [staffList]);

  const avgLoad = staffList.length > 0 
    ? (totalOpenTickets / staffList.length).toFixed(1) 
    : '0';

  // Filter and Sort Team Members
  const filteredMembers = useMemo(() => {
    return staffList.filter(m => {
      const counts = memberMetrics[m.id] || { openCount: 0 };
      
      // Filter tab
      if (filterType === 'ACTIVE_LOAD' && counts.openCount === 0) return false;
      if (filterType === 'IDLE' && counts.openCount > 0) return false;
      if (filterType === 'ON_CALL' && m.status !== 'ON_CALL') return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = m.name.toLowerCase().includes(query);
        const matchRole = m.role.toLowerCase().includes(query);
        const matchEmail = m.email.toLowerCase().includes(query);
        const matchSquad = (m.squad || '').toLowerCase().includes(query);
        return matchName || matchRole || matchEmail || matchSquad;
      }

      return true;
    }).sort((a, b) => {
      const loadA = memberMetrics[a.id]?.openCount || 0;
      const loadB = memberMetrics[b.id]?.openCount || 0;
      if (sortBy === 'LOAD_DESC') return loadB - loadA;
      if (sortBy === 'NAME_ASC') return a.name.localeCompare(b.name);
      if (sortBy === 'ROLE') return a.role.localeCompare(b.role);
      return 0;
    });
  }, [staffList, memberMetrics, filterType, searchQuery, sortBy]);

  // Selected member and their assigned tickets
  const activeMember = useMemo(() => {
    if (!selectedMemberId) return null;
    return staffList.find(m => m.id === selectedMemberId) || null;
  }, [staffList, selectedMemberId]);

  const activeMemberTickets = useMemo(() => {
    if (!selectedMemberId) return [];
    return tickets.filter(t => t.assigned_to === selectedMemberId);
  }, [tickets, selectedMemberId]);

  // Handle Refresh Action
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchStaffData(),
        onRefresh ? onRefresh() : Promise.resolve()
      ]);
      setActionSuccess('Squad and workload capacity refreshed.');
      setTimeout(() => setActionSuccess(null), 3000);
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle View Queue with smooth auto-scroll
  const handleToggleMemberQueue = (memberId: string) => {
    if (selectedMemberId === memberId) {
      setSelectedMemberId(null);
    } else {
      setSelectedMemberId(memberId);
      setTimeout(() => {
        queueSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  };

  // Auto-Rebalance Workload via Backend API
  const handleRebalanceWorkload = async () => {
    if (!isAdminOrLead) {
      setActionError("Only Squad Leads and Administrators have authority to rebalance squad workload.");
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    setIsRebalancing(true);
    setActionError(null);
    try {
      const res = await authFetch('/api/v1/tenants/staff/rebalance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      const data = await res.json();
      if (res.ok) {
        setActionSuccess(data.message || 'Workload balanced successfully across active staff.');
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchStaffData();
        onRefresh?.();
        onStaffUpdated?.();
      } else {
        setActionError(data.error || 'Failed to rebalance workload.');
        setTimeout(() => setActionError(null), 4000);
      }
    } catch (err: any) {
      setActionError('Network error: ' + err.message);
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setIsRebalancing(false);
    }
  };

  // Toggle On-Call Status for a Member with instant optimistic update
  const handleToggleOnCall = async (member: TeamMember) => {
    if (!isAdminOrLead) {
      setActionError("Only Squad Leads and Administrators can designate on-call status.");
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    const nextStatus = member.status === 'ON_CALL' ? 'ONLINE' : 'ON_CALL';
    
    // 1. Optimistic local update
    setStaffList(prev => prev.map(m => {
      if (m.id === member.id) {
        return { ...m, status: nextStatus };
      }
      if (nextStatus === 'ON_CALL' && m.status === 'ON_CALL') {
        return { ...m, status: 'ONLINE' };
      }
      return m;
    }));

    try {
      const res = await authFetch(`/api/v1/tenants/staff/${member.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        setActionSuccess(`Status for '${member.name}' updated to ${nextStatus}.`);
        setTimeout(() => setActionSuccess(null), 3000);
        await fetchStaffData();
        onRefresh?.();
        onStaffUpdated?.();
      } else {
        const err = await res.json();
        setActionError(err.error || 'Failed to update on-call status');
        setTimeout(() => setActionError(null), 4000);
        await fetchStaffData(); // revert
      }
    } catch (err: any) {
      setActionError('Error: ' + err.message);
      await fetchStaffData(); // revert
    }
  };

  // Delete / Remove Staff Member
  const handleDeleteStaffMember = async (member: TeamMember) => {
    if (!isAdminOrLead) {
      setActionError("Only Squad Leads and Administrators can remove staff members.");
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    if (!window.confirm(`Are you sure you want to remove '${member.name}' from the squad? Any open assigned incidents will be returned to the unassigned backlog.`)) {
      return;
    }

    setDeletingMemberId(member.id);
    // Optimistic removal
    setStaffList(prev => prev.filter(m => m.id !== member.id));
    if (selectedMemberId === member.id) {
      setSelectedMemberId(null);
    }

    try {
      const res = await authFetch(`/api/v1/tenants/staff/${member.id}`, {
        method: 'DELETE',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      const data = await res.json();
      if (res.ok) {
        setActionSuccess(data.message || `Staff member '${member.name}' removed successfully.`);
        setTimeout(() => setActionSuccess(null), 4000);
        await fetchStaffData();
        onRefresh?.();
        onStaffUpdated?.();
      } else {
        setActionError(data.error || 'Failed to remove staff member.');
        setTimeout(() => setActionError(null), 4000);
        await fetchStaffData(); // revert
      }
    } catch (err: any) {
      setActionError('Error: ' + err.message);
      await fetchStaffData();
    } finally {
      setDeletingMemberId(null);
    }
  };

  // Handle Adding New Staff Member
  const handleAddStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffEmail.trim()) {
      setActionError('Please provide both full name and a valid corporate email.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await authFetch('/api/v1/tenants/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          full_name: newStaffName.trim(),
          email: newStaffEmail.trim(),
          role: newStaffRole,
          squad: newStaffSquad.trim(),
          status: newStaffStatus
        })
      });

      const data = await res.json();
      if (res.ok) {
        const colorList = [
          'bg-purple-100 text-purple-700 border-purple-300',
          'bg-indigo-100 text-indigo-700 border-indigo-300',
          'bg-violet-100 text-violet-700 border-violet-300',
          'bg-blue-100 text-blue-700 border-blue-300',
          'bg-emerald-100 text-emerald-700 border-emerald-300',
        ];
        const newMember: TeamMember = {
          id: data.user?.id || `user-${Date.now()}`,
          name: newStaffName.trim(),
          role: newStaffRole === 'squad_lead' ? 'Squad Lead & Arch' : newStaffRole === 'developer' ? 'Senior Engineer' : 'Tenant Administrator',
          email: newStaffEmail.trim(),
          avatarInitials: newStaffName.trim().slice(0, 2).toUpperCase(),
          status: newStaffStatus,
          squad: newStaffSquad.trim(),
          color: colorList[staffList.length % colorList.length]
        };

        // Optimistically append
        setStaffList(prev => [...prev, newMember]);
        setActionSuccess(`New staff member '${newStaffName}' registered in squad registry.`);
        setTimeout(() => setActionSuccess(null), 5000);
        setIsAddModalOpen(false);
        setNewStaffName('');
        setNewStaffEmail('');
        
        await fetchStaffData();
        onRefresh?.();
        onStaffUpdated?.();
      } else {
        setActionError(data.error || 'Failed to register staff member.');
      }
    } catch (err: any) {
      setActionError('Network error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick assign ticket directly from UI
  const handleQuickAssign = (ticketId: string, memberId: string) => {
    const target = staffList.find(m => m.id === memberId);
    if (!target) return;
    onAssignTicket?.(ticketId, target.id, target.name);
    setActionSuccess(`Incident assigned to ${target.name}.`);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  // Quick mark resolved from table
  const handleQuickResolve = (ticketId: string, ticketCode?: string) => {
    onUpdateStatus?.(ticketId, 'RESOLVED');
    setActionSuccess(`Incident ${ticketCode || ticketId.slice(0, 8)} marked as Resolved.`);
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const hasActiveFilters = Boolean(searchQuery.trim()) || filterType !== 'ALL' || sortBy !== 'LOAD_DESC';

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterType('ALL');
    setSortBy('LOAD_DESC');
  };

  return (
    <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 w-full animate-in fade-in duration-150">
      
      {/* 1. Header Box matching Total Tickets & Resolved Tickets style */}
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center flex-wrap gap-2.5">
            <h2 className="text-lg font-bold text-slate-900 font-mono uppercase tracking-wide flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
                <Users className="w-4 h-4" />
              </div>
              <span>Assigned Staff Members & Active Load</span>
            </h2>
            <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-purple-50 border border-purple-200 text-purple-700 rounded-md">
              {staffList.length} Active Staff
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-slate-100 border border-slate-200 text-slate-700 rounded-md">
              {totalOpenTickets} Open Tickets
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md">
              {avgLoad} Avg Load
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">
            Real-time engineering squad capacity, live incident allocation, SLA stress tracking, and on-call on-duty dispatch.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5 shrink-0 flex-wrap gap-y-2">
          {isAdminOrLead ? (
            <button
              type="button"
              id="add-staff-member-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 bg-[#6366F1] hover:bg-indigo-700 text-white text-xs font-bold font-mono flex items-center space-x-1.5 rounded-md transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Staff Member</span>
            </button>
          ) : (
            <div 
              title="Requires Squad Lead or Administrator role to add staff"
              className="px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-400 text-xs font-mono font-medium flex items-center space-x-1.5 rounded-md cursor-not-allowed select-none"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin / Lead Only</span>
            </div>
          )}

          <button
            type="button"
            id="auto-balance-load-btn"
            onClick={handleRebalanceWorkload}
            disabled={isRebalancing || !isAdminOrLead}
            title={isAdminOrLead ? "Automatically distribute unassigned tickets across available engineers" : "Requires Squad Lead authority"}
            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-mono font-semibold flex items-center space-x-1.5 rounded-md transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap className={`w-3.5 h-3.5 text-purple-600 ${isRebalancing ? 'animate-spin' : ''}`} />
            <span>{isRebalancing ? 'Balancing...' : 'Auto-Balance Load'}</span>
          </button>

          <button
            type="button"
            id="refresh-staff-btn"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-mono font-medium flex items-center space-x-1.5 rounded-md transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center justify-between shadow-2xs animate-in fade-in rounded-md card-subtle">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{actionSuccess}</span>
          </div>
          <button 
            type="button"
            onClick={() => setActionSuccess(null)} 
            className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono flex items-center justify-between shadow-2xs animate-in fade-in rounded-md card-subtle">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{actionError}</span>
          </div>
          <button 
            type="button"
            onClick={() => setActionError(null)} 
            className="text-rose-600 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Top 4 Capacity KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        
        {/* Metric 1: Total Staff */}
        <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-1 rounded-md card-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
            <span className="uppercase font-semibold">Active Engineers</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {staffList.length}
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              100% Online
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {staffList.filter(m => m.role.toLowerCase().includes('lead')).length} Squad Lead • {staffList.filter(m => !m.role.toLowerCase().includes('lead')).length} Developers
          </p>
        </div>

        {/* Metric 2: Open Workload */}
        <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-1 rounded-md card-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
            <span className="uppercase font-semibold">Total Active Workload</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-indigo-700">
              {totalOpenTickets}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              incidents in flight
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Average capacity: {avgLoad} tickets / engineer
          </p>
        </div>

        {/* Metric 3: On-Call Lead */}
        <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-1 rounded-md card-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
            <span className="uppercase font-semibold">Primary On-Call</span>
            <PhoneCall className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-bold text-slate-900 truncate">
              {onCallLead?.name.replace(/\s*\([^)]*\)$/, '') || 'On-Call Engineer'}
            </span>
          </div>
          <p className="text-[11px] text-amber-700 font-mono font-medium truncate">
            {onCallLead?.email || 'oncall@feedbackhub.io'}
          </p>
        </div>

        {/* Metric 4: Unassigned Ingestion Queue */}
        <div className="bg-white border border-slate-200 p-4 shadow-2xs space-y-1 rounded-md card-subtle">
          <div className="flex items-center justify-between text-slate-500 text-xs font-mono">
            <span className="uppercase font-semibold">Unassigned Ingestion</span>
            <AlertCircle className={`w-4 h-4 ${unassignedTickets.length > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-bold font-mono ${unassignedTickets.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {unassignedTickets.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              pending assignment
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            {unassignedTickets.length === 0 ? 'All queue incidents assigned' : 'Requires squad allocation'}
          </p>
        </div>

      </div>

      {/* 3. Search & Filter Bar (Clean 2-tier Bank-Grade Layout) */}
      <div className="bg-white border border-slate-200 p-3.5 shadow-2xs space-y-3 rounded-md card-subtle">
        
        {/* Row 1: Dedicated Search Box on left, Sort and Reset on right */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name, email, role, or squad..."
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs pl-9 pr-8 py-2 rounded-md placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white transition-all font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right side: Sort Selector & Clear Filters */}
          <div className="flex items-center space-x-2.5 shrink-0 self-end sm:self-auto font-mono">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
            <div className="flex items-center space-x-1.5">
              <span className="text-[11px] text-slate-400 font-semibold uppercase">Sort:</span>
              <div className="relative flex items-center">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="border border-slate-200 bg-slate-50 hover:bg-white text-slate-800 pl-8 pr-3 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-600 cursor-pointer rounded-md transition-colors"
                >
                  <option value="LOAD_DESC">Active Load (High → Low)</option>
                  <option value="NAME_ASC">Alphabetical (A → Z)</option>
                  <option value="ROLE">Role Hierarchy</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Segmented Filter Controls & Results Counter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-slate-100">
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none font-mono">
            <span className="text-[11px] text-slate-400 font-semibold uppercase shrink-0">Filter:</span>
            <div className="inline-flex items-center p-0.5 bg-slate-100 border border-slate-200/80 rounded-md gap-0.5 shrink-0">
              {[
                { id: 'ALL' as const, label: 'ALL', count: staffList.length },
                { id: 'ACTIVE_LOAD' as const, label: 'ACTIVE LOAD (>0)', count: staffList.filter(m => (memberMetrics[m.id]?.openCount || 0) > 0).length },
                { id: 'IDLE' as const, label: 'AVAILABLE (0 LOAD)', count: staffList.filter(m => (memberMetrics[m.id]?.openCount || 0) === 0).length },
                { id: 'ON_CALL' as const, label: 'ON-CALL ONLY', count: staffList.filter(m => m.status === 'ON_CALL').length },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterType(f.id)}
                  className={`px-3 py-1 text-xs uppercase transition-all cursor-pointer whitespace-nowrap rounded-md font-mono ${
                    filterType === f.id
                      ? 'bg-slate-900 text-white font-bold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-medium'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-400 shrink-0">
            Showing <span className="font-bold text-slate-700">{filteredMembers.length}</span> of <span className="font-bold text-slate-700">{staffList.length}</span> engineers
          </div>
        </div>

      </div>

      {/* 4. Staff Member Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredMembers.map((member) => {
          const metrics = memberMetrics[member.id] || { openCount: 0, resolvedCount: 0, urgentCount: 0 };
          const isSelected = selectedMemberId === member.id;
          const isOnCall = member.status === 'ON_CALL';
          const isDeleting = deletingMemberId === member.id;

          // Color capacity threshold: 0-2 = low/optimal (emerald), 3-5 = moderate (amber), 6+ = high (rose)
          const loadBadgeColor = metrics.openCount === 0 
            ? 'bg-slate-100 text-slate-600 border-slate-200' 
            : metrics.openCount <= 2 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : metrics.openCount <= 5 
            ? 'bg-amber-50 text-amber-700 border-amber-200' 
            : 'bg-rose-50 text-rose-700 border-rose-200 font-bold';

          return (
            <div
              key={member.id}
              onClick={() => handleToggleMemberQueue(member.id)}
              className={`bg-white border p-4 transition-all duration-150 cursor-pointer select-none flex flex-col justify-between space-y-3.5 shadow-2xs hover:shadow-md rounded-md card-subtle ${
                isSelected
                  ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/10'
                  : 'border-slate-200/90 hover:border-slate-300'
              } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
            >
              {/* Card Top: Avatar, Name, Role, On-Call Pill */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start space-x-3 min-w-0">
                  {/* Avatar Initials with Status Dot */}
                  <div className="relative shrink-0">
                    <div className={`w-10 h-10 border flex items-center justify-center font-bold text-xs font-mono shadow-2xs rounded-md ${member.color}`}>
                      {member.avatarInitials}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                        isOnCall
                          ? 'bg-amber-500 animate-pulse'
                          : member.status === 'AWAY'
                          ? 'bg-slate-400'
                          : 'bg-emerald-500'
                      }`}
                      title={isOnCall ? 'On-Call Engineer' : 'Active'}
                    />
                  </div>

                  {/* Name, Role & Email */}
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <h3 className="text-xs font-bold text-slate-900 truncate">
                        {member.name}
                      </h3>
                      {isOnCall && (
                        <span className="text-[9px] font-mono font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-md shrink-0">
                          ON-CALL
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {member.role}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">
                      {member.email}
                    </p>
                  </div>
                </div>

                {/* Open Ticket Count Pill */}
                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-center space-x-1 font-mono">
                    <span className="text-[11px] text-slate-400">Open:</span>
                    <span className={`px-2 py-0.5 text-xs font-bold font-mono border rounded-md ${loadBadgeColor}`}>
                      {metrics.openCount}
                    </span>
                  </div>
                  {metrics.urgentCount > 0 && (
                    <span className="text-[9px] font-mono font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md mt-1">
                      {metrics.urgentCount} Urgent
                    </span>
                  )}
                </div>
              </div>

              {/* Workload Capacity Bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Capacity Stress</span>
                  <span>{metrics.openCount} / 6 max</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 overflow-hidden rounded-full">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      metrics.openCount === 0 
                        ? 'bg-slate-300 w-0' 
                        : metrics.openCount <= 2 
                        ? 'bg-emerald-500' 
                        : metrics.openCount <= 4 
                        ? 'bg-amber-500' 
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.round((metrics.openCount / 6) * 100))}%` }}
                  />
                </div>
              </div>

              {/* Card Footer: Quick Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span className="truncate text-slate-400 max-w-[120px] sm:max-w-[150px]">
                  {member.squad || 'Core Engineering Squad'}
                </span>

                <div className="flex items-center space-x-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {isAdminOrLead && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleToggleOnCall(member)}
                        title={isOnCall ? "Switch to standard online status" : "Designate as primary on-call lead"}
                        className={`px-2 py-0.5 border text-[10px] cursor-pointer rounded-md transition-colors ${
                          isOnCall 
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 font-bold'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {isOnCall ? 'End On-Call' : 'Set On-Call'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteStaffMember(member)}
                        title="Remove member from squad registry"
                        className="p-1 border border-slate-200 hover:border-rose-300 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleMemberQueue(member.id)}
                    className="px-2 py-0.5 border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold cursor-pointer rounded-md transition-colors"
                  >
                    {isSelected ? 'Collapse' : `View Queue (${metrics.openCount})`}
                  </button>
                </div>
              </div>

            </div>
          );
        })}
      </div>

      {/* 5. Detailed Assigned Workload Drawer / Table for Selected Member */}
      {activeMember && (
        <section 
          ref={queueSectionRef}
          aria-labelledby="member-workload-heading" 
          className="bg-white border border-slate-200 rounded-md card-subtle p-5 space-y-4 shadow-2xs animate-in fade-in slide-in-from-top-1"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-md border flex items-center justify-center font-bold text-xs font-mono ${activeMember.color}`}>
                {activeMember.avatarInitials}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 id="member-workload-heading" className="text-sm font-bold text-slate-900 font-mono">
                    Assigned Incident Queue: {activeMember.name}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 border border-indigo-200 text-indigo-700">
                    {activeMemberTickets.length} Incidents Total
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {activeMember.role} • {activeMember.email} • Status: {activeMember.status} • Squad: {activeMember.squad || 'Core'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedMemberId(null)}
              className="text-xs text-slate-500 hover:text-slate-800 rounded-md px-2 py-1 hover:bg-slate-100 flex items-center space-x-1 cursor-pointer font-mono"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Queue</span>
            </button>
          </div>

          {activeMemberTickets.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-md card-subtle space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-xs font-bold text-slate-800 font-mono">
                {activeMember.name} is fully caught up with zero active backlog tickets!
              </p>
              <p className="text-[11px] text-slate-400">
                You can assign incoming tickets to this engineer from the triage queue or using the auto-balancer.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-md overflow-x-auto card-subtle">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                    <th className="p-2.5 font-bold">INCIDENT ID & SHORT CODE</th>
                    <th className="p-2.5 font-bold">SEVERITY</th>
                    <th className="p-2.5 font-bold">CATEGORY</th>
                    <th className="p-2.5 font-bold">SUMMARY TITLE</th>
                    <th className="p-2.5 font-bold">STATUS</th>
                    <th className="p-2.5 font-bold">REASSIGN TO</th>
                    <th className="p-2.5 font-bold">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {activeMemberTickets.map((t) => {
                    const normStatus = normalizeStatus(t.status);
                    const normSeverity = normalizeSeverity(t.severity);

                    return (
                      <tr 
                        key={t.id} 
                        onClick={() => onSelectTicket(t)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200">
                            {t.short_code || t.id.slice(0, 8)}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                            normSeverity === 'Urgent' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                            normSeverity === 'High' ? 'bg-amber-50 text-amber-700 border-amber-300' :
                            normSeverity === 'Medium' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                            'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                            {t.severity}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-slate-600">
                          {t.category}
                        </td>
                        <td className="p-2.5 text-slate-900 font-bold max-w-md truncate">
                          {t.title}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            normStatus === 'Resolved' 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {canAssign ? (
                            <select
                              value={t.assigned_to || ''}
                              onChange={(e) => handleQuickAssign(t.id, e.target.value)}
                              className="text-[11px] font-mono border border-slate-200 rounded-md bg-white px-1.5 py-1 text-slate-700 focus:outline-none focus:border-indigo-600 cursor-pointer"
                            >
                              <option value="">-- Reassign --</option>
                              {staffList.map(sm => (
                                <option key={sm.id} value={sm.id}>
                                  {sm.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">-</span>
                          )}
                        </td>
                        <td className="p-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center space-x-1.5">
                            {canChangeStatus && normStatus !== 'Resolved' && (
                              <button
                                type="button"
                                onClick={() => handleQuickResolve(t.id, t.short_code)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                              >
                                Mark Resolved
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onSelectTicket(t)}
                              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md text-[10px] text-slate-700 cursor-pointer transition-colors"
                            >
                              Inspect Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 6. Unassigned Ingestion Backlog Section if any tickets exist */}
      {unassignedTickets.length > 0 && (
        <section aria-labelledby="unassigned-heading" className="bg-white border border-amber-200 rounded-md card-subtle p-5 space-y-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-100 pb-3">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <h3 id="unassigned-heading" className="text-xs font-bold text-amber-900 font-mono uppercase tracking-wide">
                Unassigned Ingestion Queue ({unassignedTickets.length} Incidents Awaiting Squad Allocation)
              </h3>
            </div>

            {isAdminOrLead && (
              <button
                type="button"
                onClick={handleRebalanceWorkload}
                disabled={isRebalancing}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-mono font-bold cursor-pointer transition-colors shadow-xs flex items-center space-x-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Auto-Assign All Unassigned</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unassignedTickets.slice(0, 6).map((ticket) => (
              <div 
                key={ticket.id}
                className="p-3 border border-amber-200/80 bg-amber-50/20 hover:bg-amber-50/40 rounded-md transition-colors space-y-2 select-none"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-amber-800 bg-amber-100/70 px-1.5 py-0.5 rounded-md border border-amber-300">
                    {ticket.short_code || ticket.id.slice(0, 8)}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-rose-700 uppercase bg-rose-50 border border-rose-200 px-1 py-0.2 rounded-md">
                    {ticket.severity}
                  </span>
                </div>
                
                <p 
                  onClick={() => onSelectTicket(ticket)}
                  className="text-xs font-bold text-slate-800 truncate cursor-pointer hover:text-indigo-600"
                >
                  {ticket.title}
                </p>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1.5 border-t border-amber-100 gap-2">
                  <span className="truncate">{ticket.category}</span>
                  {canAssign ? (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleQuickAssign(ticket.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="text-[10px] font-mono border border-amber-300 bg-white text-slate-800 px-1 py-0.5 rounded-md cursor-pointer focus:outline-none"
                    >
                      <option value="">+ Assign...</option>
                      {staffList.map(sm => (
                        <option key={sm.id} value={sm.id}>
                          {sm.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectTicket(ticket)}
                      className="text-amber-700 font-medium hover:underline cursor-pointer rounded-md px-1"
                    >
                      Inspect
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. Modal: Add New Staff Member */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-md card-subtle shadow-xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 bg-purple-50 text-purple-600 flex items-center justify-center rounded-md border border-purple-200">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wide">
                  Register New Squad Member
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-md hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStaffMember} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-700 font-bold block uppercase text-[10px]">
                  Full Name & Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. Alex Zhang (Senior Systems Engineer)"
                  className="w-full border border-slate-300 rounded-md p-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-700 font-bold block uppercase text-[10px]">
                  Corporate Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="e.g. alex.zhang@feedbackhub.io"
                  className="w-full border border-slate-300 rounded-md p-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-slate-700 font-bold block uppercase text-[10px]">
                    Role Hierarchy
                  </label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                    className="w-full border border-slate-300 rounded-md p-2 text-xs text-slate-900 bg-white focus:border-indigo-600 focus:outline-none cursor-pointer"
                  >
                    <option value="developer">Developer</option>
                    <option value="squad_lead">Squad Lead</option>
                    <option value="tenant_admin">Tenant Admin</option>
                    <option value="support_agent">Support Agent</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-700 font-bold block uppercase text-[10px]">
                    Initial Status
                  </label>
                  <select
                    value={newStaffStatus}
                    onChange={(e) => setNewStaffStatus(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-md p-2 text-xs text-slate-900 bg-white focus:border-indigo-600 focus:outline-none cursor-pointer"
                  >
                    <option value="ONLINE">ONLINE</option>
                    <option value="ON_CALL">ON-CALL</option>
                    <option value="AWAY">AWAY</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-700 font-bold block uppercase text-[10px]">
                  Assigned Engineering Squad
                </label>
                <input
                  type="text"
                  value={newStaffSquad}
                  onChange={(e) => setNewStaffSquad(e.target.value)}
                  placeholder="e.g. Core Platform & API Squad"
                  className="w-full border border-slate-300 rounded-md p-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#6366F1] hover:bg-indigo-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Add Squad Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
};
