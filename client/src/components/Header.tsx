import React, { useState, useEffect } from 'react';
import { AuthenticatedUser, Tenant, UserRole } from '../types';
import { 
  Building2, 
  Shield, 
  Sun, 
  Sparkles, 
  Plus, 
  Bell, 
  LogOut,
  Layers
} from 'lucide-react';

export interface HeaderProps {
  user?: AuthenticatedUser;
  currentTenantId?: string;
  currentRole?: UserRole;
  tenants?: Tenant[];
  isConnected?: boolean;
  onTenantChange?: (tenantId: string) => void;
  onRoleChange?: (role: UserRole) => void;
  onOpenWidgetSimulator: () => void;
  onNewIncidentClick?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  currentTenantId = 'tenant-acme-corp-001',
  currentRole = 'developer',
  tenants,
  isConnected,
  onTenantChange,
  onRoleChange,
  onOpenWidgetSimulator,
  onNewIncidentClick,
  onLogout
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const dayName = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
      const monthName = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
      const dateNum = now.getDate();
      setCurrentTime(`${hours}:${minutes} ${dayName}, ${monthName} ${dateNum}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeTenantName = user?.tenant_name || user?.tenant_slug || (tenants?.find(t => t.id === currentTenantId)?.name) || 'Acme Payments Inc.';
  const displayName = user?.full_name || (
    currentRole === 'super_admin' ? 'Alex Turner' :
    currentRole === 'tenant_admin' ? 'Elena Rostova' :
    currentRole === 'squad_lead' ? 'Vikram Mehta' :
    currentRole === 'developer' ? 'Rahul Sharma' :
    currentRole === 'support_agent' ? 'Marcus Chen' : 'Sarah Jenkins'
  );
  const displayRole = user?.role || currentRole;
  const displayInitials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="border-b border-slate-200 bg-white shadow-xs sticky top-0 z-40 select-none w-full shrink-0">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 w-full">
        
        {/* Left Side: Brand, Tenant Selector, Role Selector */}
        <div className="flex items-center space-x-2.5 py-1 min-w-0">
          
          {/* Brand Square Logo */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <div className="w-8 h-8 bg-[#6366F1] flex items-center justify-center font-mono font-bold text-white text-xs tracking-wider shadow-sm">
              FH
            </div>
            <span className="text-slate-400 font-mono text-xs hidden sm:inline">›</span>
          </div>

          {/* Tenant Switcher Dropdown */}
          <div className="relative shrink min-w-0">
            <div className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 font-medium transition-colors shadow-2xs">
              <Building2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              {onTenantChange ? (
                <select
                  value={currentTenantId}
                  onChange={(e) => onTenantChange(e.target.value)}
                  className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[170px] md:max-w-[210px] truncate"
                >
                  {tenants && tenants.length > 0 ? (
                    tenants.map(t => (
                      <option key={t.id} value={t.id} className="bg-white text-slate-900">{t.name}</option>
                    ))
                  ) : (
                    <>
                      <option value="tenant-acme-corp-001" className="bg-white text-slate-900">Acme Payments Inc.</option>
                      <option value="tenant-medsync-002" className="bg-white text-slate-900">MedSync Healthcare</option>
                    </>
                  )}
                </select>
              ) : (
                <span className="text-xs font-semibold text-slate-800 uppercase tracking-tight truncate max-w-[170px]">
                  {activeTenantName}
                </span>
              )}
            </div>
          </div>

          {/* Role Switcher Dropdown */}
          {onRoleChange && (
            <div className="relative shrink min-w-0">
              <div className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 font-medium transition-colors shadow-2xs">
                <Shield className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <select
                  value={currentRole}
                  onChange={(e) => onRoleChange(e.target.value as UserRole)}
                  className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[160px] md:max-w-[200px] truncate"
                >
                  <option value="developer" className="bg-white text-slate-900">Developer (Rahul Sharma)</option>
                  <option value="squad_lead" className="bg-white text-slate-900">Squad Lead (Vikram Mehta)</option>
                  <option value="tenant_admin" className="bg-white text-slate-900">Tenant Admin (Elena Rostova)</option>
                  <option value="support_agent" className="bg-white text-slate-900">Support Agent (Marcus Chen)</option>
                  <option value="client_user" className="bg-white text-slate-900">Client User (Sarah Jenkins)</option>
                  <option value="super_admin" className="bg-white text-slate-900">Super Admin (Alex Turner)</option>
                </select>
              </div>
            </div>
          )}

          {/* WebSocket Status Indicator */}
          {isConnected !== undefined && (
            <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 border border-slate-200 bg-slate-50 text-[11px] font-mono">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]' : 'bg-amber-500'} animate-pulse`} />
              <span className="text-slate-600">{isConnected ? 'SOCKET LIVE' : 'CONNECTING'}</span>
            </div>
          )}

          {/* 100.00% SLA Healthy Square Badge */}
          <div className="hidden 2xl:flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50/90 border border-amber-200 text-amber-800 text-xs font-mono font-semibold shrink-0">
            <Sun className="w-3.5 h-3.5 text-amber-600" />
            <span>100.00% SLA HEALTHY</span>
          </div>

        </div>

        {/* Right Side: Action Buttons, Notification Bell, User Profile, Logout */}
        <div className="flex items-center space-x-2.5 shrink-0">
          
          {/* Simulate Telemetry Button */}
          <button
            onClick={onOpenWidgetSimulator}
            className="hidden xl:flex items-center space-x-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100/80 text-purple-700 border border-purple-200 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Simulate Telemetry</span>
          </button>

          {/* + New Incident Button */}
          <button
            onClick={onNewIncidentClick || onOpenWidgetSimulator}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Incident</span>
          </button>

          {/* Notification Bell */}
          <button 
            type="button"
            className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 transition-colors cursor-pointer shadow-2xs"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>

          {/* User Profile Info Badge */}
          <div className="flex items-center space-x-2 pl-1 border-l border-slate-200">
            <div className="w-8 h-8 bg-purple-600 text-white font-bold font-mono text-xs flex items-center justify-center shrink-0 shadow-2xs">
              {displayInitials}
            </div>
            <div className="hidden lg:block leading-tight text-left max-w-[150px] xl:max-w-[200px]">
              <span className="block text-xs font-bold text-slate-900 truncate">
                {displayName}
              </span>
              <span className="block text-[10px] text-purple-600 font-mono truncate uppercase">
                {displayRole}
              </span>
            </div>
          </div>

          {/* Sign Out Button */}
          {onLogout && (
            <button
              id="header-logout-btn"
              onClick={onLogout}
              title="Sign out of your session"
              className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-mono font-medium transition-colors shadow-2xs cursor-pointer active:scale-[0.98]"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          )}

        </div>

      </div>
    </header>
  );
};
