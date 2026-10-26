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
import { UserRole } from '../types';

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
      const day = now.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
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

  // Dynamic SLA metric
  const slaScore = totalTickets > 0 
    ? Math.max(90, 100 - (urgentTickets / totalTickets) * 5).toFixed(2)
    : '100.00';

  return (
    <header className="bg-white border-b border-slate-200/90 sticky top-0 z-40 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-3">
          
          {/* Left section: Dynamic Tenant & Role selector pill & Live status pills */}
          <div className="flex items-center space-x-2.5 min-w-0">
            
            {/* Dynamic Tenant Selector Dropdown */}
            <div className="relative" ref={tenantMenuRef}>
              <button
                type="button"
                onClick={() => setIsTenantMenuOpen(prev => !prev)}
                className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-[2px] cursor-pointer transition-colors shadow-2xs group text-left"
                aria-label="Select Active Tenant"
              >
                <Building2 className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-semibold text-slate-800 truncate max-w-[130px] sm:max-w-[180px]">
                    {activeTenant.name}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
                </div>
              </button>

              {isTenantMenuOpen && (
                <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-[2px] shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
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
                        <span className="w-2 h-2 rounded-full bg-purple-600 flex-shrink-0 ml-2" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Role Switcher Pill */}
            <div className="relative hidden sm:block" ref={roleMenuRef}>
              <button
                type="button"
                onClick={() => setIsRoleMenuOpen(prev => !prev)}
                className="flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-[2px] cursor-pointer text-xs transition-colors shadow-2xs"
                title="Switch Active RBAC Role"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span className="font-semibold text-slate-700 capitalize text-[11px]">
                  {currentRole.replace('_', ' ')}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isRoleMenuOpen && (
                <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-200 rounded-[2px] shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Test RBAC Role
                  </div>
                  {(['developer', 'squad_lead', 'client_user', 'tenant_admin'] as UserRole[]).map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        onSelectRole(role);
                        setIsRoleMenuOpen(false);
                      }}
                      className={`w-full text-left px-3.5 py-2 text-xs capitalize flex items-center justify-between hover:bg-indigo-50 transition-colors ${
                        role === currentRole ? 'bg-indigo-50/70 font-bold text-indigo-700' : 'text-slate-700 font-medium'
                      }`}
                    >
                      <span>{role.replace('_', ' ')}</span>
                      {role === currentRole && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dynamic SLA / Health Pill */}
            <div className="hidden md:flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-[2px] text-xs text-slate-600 shadow-2xs">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-semibold text-slate-800 text-[11px] font-mono">{slaScore}% SLA</span>
              <span className="text-emerald-600 text-[10px] font-bold">HEALTHY</span>
            </div>

            {/* Live Time Pill */}
            <div className="hidden lg:flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-[2px] text-xs text-slate-600 shadow-2xs font-mono">
              <Clock className="w-3.5 h-3.5 text-purple-600" />
              <span className="font-medium text-slate-700 text-[11px]">{currentTime || 'LIVE CLOCK'}</span>
            </div>

          </div>

          {/* Right section: Action buttons, Alerts, User Pill */}
          <div className="flex items-center space-x-2 sm:space-x-2.5 flex-shrink-0">
            
            {/* Simulate Telemetry Button */}
            {onOpenSimulator && (
              <button
                type="button"
                onClick={onOpenSimulator}
                title="Simulate Embedded Client SDK Telemetry"
                className="hidden md:flex items-center space-x-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-[2px] text-xs font-semibold shadow-2xs transition-colors"
              >
                <Cpu className="w-3.5 h-3.5 text-purple-600" />
                <span>Simulate Telemetry</span>
              </button>
            )}

            {/* Primary Navy Blue 'New Incident' Button */}
            <button
              type="button"
              onClick={onNewIncidentClick}
              className="bg-[#0b1b36] hover:bg-[#12284c] text-white px-3.5 sm:px-4 py-2 rounded-[2px] text-xs font-semibold flex items-center space-x-1.5 shadow-sm hover:shadow transition-all active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="font-medium tracking-tight">New Incident</span>
            </button>

            {/* Notification Bell */}
            <button
              type="button"
              title="Alerts and Notifications"
              className="relative p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-[2px] text-slate-600 transition-colors"
            >
              <Bell className="w-4 h-4 text-slate-600" />
              {totalOpenTickets > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {totalOpenTickets}
                </span>
              )}
            </button>

            {/* Dynamic User Profile Pill */}
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 hover:border-purple-200 pl-1.5 pr-3 py-1 rounded-[2px] cursor-pointer transition-colors shadow-2xs">
              <div className="w-7 h-7 rounded-[2px] bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                {user.initials}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {user.name}
                </span>
                <span className="text-[10px] text-purple-600 font-medium leading-none">
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
