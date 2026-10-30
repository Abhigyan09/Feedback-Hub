import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  ChevronDown, 
  Clock, 
  Sun, 
  Plus, 
  Bell, 
  Power,
  Cpu,
  Sparkles,
  ShieldCheck,
  User,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { UserRole, Ticket, RolePermissionsMatrix } from '../types';
import { normalizeStatus } from '../utils/formatters';
import { hasRolePermission } from '../constants/permissions';

export interface HeaderUser {
  name: string;
  role: string;
  initials: string;
  email: string;
}

export interface TenantOption {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface DashboardHeaderProps {
  tenants: TenantOption[];
  currentTenantId: string;
  onSelectTenant: (tenantId: string) => void;
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  user: HeaderUser;
  totalOpenTickets: number;
  totalTickets: number;
  urgentTickets: number;
  tickets?: Ticket[];
  permissionsMatrix?: RolePermissionsMatrix | null;
  onNewIncidentClick?: () => void;
  onOpenSimulator?: () => void;
  onSeedDemo?: () => void;
  onClearTickets?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  tenants,
  currentTenantId,
  onSelectTenant,
  currentRole,
  onSelectRole,
  user,
  totalOpenTickets,
  totalTickets,
  urgentTickets,
  tickets = [],
  permissionsMatrix,
  onNewIncidentClick,
  onOpenSimulator,
  onSeedDemo,
  onClearTickets
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  const tenantMenuRef = useRef<HTMLDivElement>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (tenantMenuRef.current && !tenantMenuRef.current.contains(e.target as Node)) {
        setIsTenantMenuOpen(false);
      }
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as Node)) {
        setIsRoleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Live dynamic clock
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const day = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit' }).toUpperCase();
      setCurrentTime(`${hours}:${mins} ${day}`);
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeTenant = tenants.find(t => t.id === currentTenantId) || {
    id: currentTenantId,
    name: 'Acme Payments Inc.',
    slug: 'acme-payments',
    plan: 'ENTERPRISE'
  };

  // 100% Dynamic SLA calculation based on real ticket SLA breaches
  const breachedCount = (tickets || []).filter(
    t => t.sla_due_at && new Date(t.sla_due_at).getTime() < Date.now() && normalizeStatus(t.status) !== 'Resolved'
  ).length;

  const numericSla = totalTickets > 0
    ? Math.max(0, Math.min(100, Math.round(((totalTickets - breachedCount) / totalTickets) * 10000) / 100))
    : 100;
  const slaScore = numericSla.toFixed(2);
  const slaStatusLabel = numericSla >= 99 ? 'HEALTHY' : numericSla >= 90 ? 'WARNING' : 'BREACHED';
  const slaStatusColor = numericSla >= 99 ? 'text-emerald-600' : numericSla >= 90 ? 'text-amber-600' : 'text-red-600 font-bold';
  // Dynamic RBAC Permission Checks
  const canCreateTicket = hasRolePermission(permissionsMatrix, currentRole, 'tickets:create');

  return (
    <header className="sticky top-0 bg-white border-b border-slate-200/90 shadow-xs shrink-0 w-full z-20">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-2 sm:gap-3 overflow-visible">
          
          {/* Left section: Dynamic Tenant & Role selector pill & Live status pills */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 md:space-x-2.5 min-w-0">
            
            {/* Dynamic Tenant Selector Dropdown */}
            <div className="relative shrink-0" ref={tenantMenuRef}>
              <button
                type="button"
                onClick={() => setIsTenantMenuOpen(prev => !prev)}
                className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 sm:px-3 py-1.5 rounded-md cursor-pointer transition-colors shadow-2xs group text-left whitespace-nowrap"
                aria-label="Select Active Tenant"
              >
                <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 shrink-0" />
                <div className="flex items-center space-x-1 min-w-0">
                  <span className="text-xs font-semibold text-slate-800 truncate max-w-[110px] sm:max-w-[140px] md:max-w-[170px] xl:max-w-[190px]">
                    {activeTenant.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 shrink-0" />
                </div>
              </button>

              {isTenantMenuOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-md shadow-xl py-1 z-50 animate-in fade-in slide-from-top-2 duration-150">
                  <div className="px-3 py-2 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Switch Workspace Tenant
                  </div>
                  {tenants.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectTenant(t.id);
                        setIsTenantMenuOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between hover:bg-purple-50 transition-colors ${
                        t.id === currentTenantId ? 'bg-purple-50/70 font-bold text-purple-700' : 'text-slate-700 font-medium'
                      }`}
                    >
                      <div className="truncate">
                        <div>{t.name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{t.plan}</div>
                      </div>
                      {t.id === currentTenantId && (
                        <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Role Switcher Pill */}
            <div className="relative hidden sm:block shrink-0" ref={roleMenuRef}>
              <button
                type="button"
                onClick={() => setIsRoleMenuOpen(prev => !prev)}
                className="flex items-center space-x-1 sm:space-x-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2 sm:px-2.5 py-1.5 rounded-md cursor-pointer text-xs transition-colors shadow-2xs whitespace-nowrap"
                title="Switch Active RBAC Role"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="font-semibold text-slate-700 capitalize text-[11px] whitespace-nowrap">
                  {currentRole.replace('_', ' ')}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {isRoleMenuOpen && (
                <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-md shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Test RBAC Role
                  </div>
                  {[
                    { role: 'super_admin' as UserRole, label: 'Super Admin' },
                    { role: 'tenant_admin' as UserRole, label: 'Tenant Admin' },
                    { role: 'squad_lead' as UserRole, label: 'Squad Lead' },
                    { role: 'developer' as UserRole, label: 'Developer' },
                    { role: 'support_agent' as UserRole, label: 'Support Agent' },
                    { role: 'client_user' as UserRole, label: 'Client User' }
                  ].map(({ role, label }) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        onSelectRole(role);
                        setIsRoleMenuOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-indigo-50 transition-colors ${
                        role === currentRole ? 'bg-indigo-50/70 font-bold text-indigo-700' : 'text-slate-700 font-medium'
                      }`}
                    >
                      <span>{label}</span>
                      {role === currentRole && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dynamic SLA / Health Pill */}
            <div className="hidden xl:flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2 sm:px-2.5 py-1.5 rounded-md text-xs text-slate-600 shadow-2xs whitespace-nowrap shrink-0">
              <Sun className={`w-3.5 h-3.5 shrink-0 ${numericSla >= 99 ? 'text-amber-500' : numericSla >= 90 ? 'text-amber-600' : 'text-red-500'}`} />
              <span className="font-semibold text-slate-800 text-[11px] font-mono whitespace-nowrap">{slaScore}% SLA</span>
              <span className={`text-[10px] font-bold whitespace-nowrap hidden 2xl:inline ${slaStatusColor}`}>{slaStatusLabel}</span>
            </div>

            {/* Live Time Pill */}
            <div className="hidden xl:flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2 sm:px-2.5 py-1.5 rounded-md text-xs text-slate-600 shadow-2xs font-mono whitespace-nowrap shrink-0">
              <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="font-medium text-slate-700 text-[11px] whitespace-nowrap hidden 2xl:inline">
                {currentTime || 'LIVE CLOCK'}
              </span>
              <span className="font-medium text-slate-700 text-[11px] whitespace-nowrap inline 2xl:hidden">
                {currentTime ? currentTime.split(' ')[0] : 'LIVE'}
              </span>
            </div>

          </div>

          {/* Right section: Primary Actions, Alerts, User Pill */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 md:space-x-2.5 shrink-0 ml-auto">
            
            {/* Primary Navy Blue 'New Incident' Button */}
            {canCreateTicket ? (
              <button
                type="button"
                onClick={onNewIncidentClick}
                className="bg-[#0b1b36] hover:bg-[#12284c] text-white px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-md text-xs font-semibold flex items-center space-x-1.5 shadow-sm hover:shadow transition-all active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="font-medium tracking-tight whitespace-nowrap">New Incident</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                title="Your active role lacks 'tickets:create' authority"
                className="bg-slate-200 text-slate-400 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-md text-xs font-semibold flex items-center space-x-1.5 shadow-none cursor-not-allowed whitespace-nowrap shrink-0 opacity-60"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span className="font-medium tracking-tight whitespace-nowrap">New Incident</span>
              </button>
            )}

            {/* Notification Bell */}
            <button
              type="button"
              title="Alerts and Notifications"
              className="relative p-1.5 sm:p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md text-slate-600 transition-colors shrink-0 cursor-pointer shadow-2xs"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {totalOpenTickets > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {totalOpenTickets > 99 ? '99+' : totalOpenTickets}
                </span>
              )}
            </button>

            {/* Dynamic User Profile Pill */}
            <div 
              className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-purple-200 pl-1.5 pr-2.5 sm:pr-3 py-1 rounded-md cursor-pointer transition-colors shadow-2xs shrink-0 max-w-[200px] sm:max-w-[240px]"
              title={`${user.name} • ${user.role} (${user.email})`}
            >
              <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                {user.initials}
              </div>
              <div className="hidden sm:flex flex-col text-left min-w-0">
                <span className="text-xs font-semibold text-slate-800 leading-tight whitespace-nowrap truncate max-w-[105px] md:max-w-[130px] lg:max-w-[155px] 2xl:max-w-[185px]">
                  {user.name}
                </span>
                <span className="text-[10px] text-purple-600 font-medium leading-none whitespace-nowrap truncate max-w-[105px] md:max-w-[130px] lg:max-w-[155px] 2xl:max-w-[185px]">
                  {user.role}
                </span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </header>
  );
};
