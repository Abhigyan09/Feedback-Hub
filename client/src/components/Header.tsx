import React, { useState, useEffect } from 'react';
import { Tenant, UserRole } from '../types';
import { 
  Building2, 
  Shield, 
  Sun, 
  Clock, 
  Sparkles, 
  Plus, 
  Bell, 
  ChevronDown 
} from 'lucide-react';

interface HeaderProps {
  currentTenantId: string;
  onTenantChange: (tenantId: string) => void;
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  isConnected: boolean;
  onOpenWidgetSimulator: () => void;
  tenants?: Tenant[];
}

export const Header: React.FC<HeaderProps> = ({
  currentTenantId,
  onTenantChange,
  currentRole,
  onRoleChange,
  isConnected,
  onOpenWidgetSimulator,
  tenants
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

  return (
    <header className="border-b border-slate-200 bg-white shadow-xs sticky top-0 z-40 select-none">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Left Side: Brand, Tenant Selector, Role Selector, SLA & Time Badges */}
        <div className="flex items-center space-x-3 overflow-x-auto py-1 scrollbar-none">
          
          {/* Brand Square Logo */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <div className="w-8 h-8 bg-[#6366F1] flex items-center justify-center font-mono font-bold text-white text-xs tracking-wider shadow-sm">
              FH
            </div>
            <span className="text-slate-400 font-mono text-xs">›</span>
          </div>

          {/* Tenant Switcher Dropdown */}
          <div className="relative shrink-0">
            <div className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-medium transition-colors shadow-2xs">
              <Building2 className="w-3.5 h-3.5 text-purple-600" />
              <select
                value={currentTenantId}
                onChange={(e) => onTenantChange(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer pr-1"
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
            </div>
          </div>

          {/* Role Switcher Dropdown */}
          <div className="relative shrink-0">
            <div className="flex items-center space-x-1.5 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 text-xs text-slate-800 font-medium transition-colors shadow-2xs">
              <Shield className="w-3.5 h-3.5 text-purple-600" />
              <select
                value={currentRole}
                onChange={(e) => onRoleChange(e.target.value as UserRole)}
                className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer pr-1"
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

          {/* 100.00% SLA Healthy Square Badge */}
          <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50/90 border border-amber-200 text-amber-800 text-xs font-mono font-semibold shrink-0">
            <Sun className="w-3.5 h-3.5 text-amber-600" />
            <span>100.00% SLA HEALTHY</span>
          </div>

          {/* Date & Time Square Badge */}
          <div className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1 bg-purple-50/90 border border-purple-200 text-purple-800 text-xs font-mono font-semibold shrink-0">
            <Clock className="w-3.5 h-3.5 text-purple-600" />
            <span>{currentTime || '22:55 MON, OCT 26'}</span>
          </div>

        </div>

        {/* Right Side: Action Buttons, Notification Bell, User Profile */}
        <div className="flex items-center space-x-3 shrink-0">
          
          {/* Simulate Telemetry Button */}
          <button
            onClick={onOpenWidgetSimulator}
            className="hidden sm:flex items-center space-x-1.5 px-3.5 py-1.5 bg-purple-50 hover:bg-purple-100/80 text-purple-700 border border-purple-200 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Simulate Telemetry</span>
          </button>

          {/* + New Incident Button */}
          <button
            onClick={onOpenWidgetSimulator}
            className="flex items-center space-x-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
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
              {currentRole === 'super_admin' ? 'AT' :
               currentRole === 'tenant_admin' ? 'ER' :
               currentRole === 'squad_lead' ? 'VM' :
               currentRole === 'developer' ? 'RS' :
               currentRole === 'support_agent' ? 'MC' : 'SJ'}
            </div>
            <div className="hidden md:block leading-tight text-left">
              <span className="block text-xs font-bold text-slate-900 truncate">
                {currentRole === 'super_admin' ? 'Alex Turner (Super Admin)' :
                 currentRole === 'tenant_admin' ? 'Elena Rostova (Tenant Admin)' :
                 currentRole === 'squad_lead' ? 'Vikram Mehta (API Squad Lead)' :
                 currentRole === 'developer' ? 'Rahul Sharma (Dev)' :
                 currentRole === 'support_agent' ? 'Marcus Chen (Support)' : 'Sarah Jenkins (Client)'}
              </span>
              <span className="block text-[10px] text-slate-500 font-mono truncate">
                {currentRole === 'super_admin' ? 'Platform Administrator' :
                 currentRole === 'tenant_admin' ? 'Tenant Security & Org Admin' :
                 currentRole === 'squad_lead' ? 'Engineering Lead & Arch' :
                 currentRole === 'developer' ? 'Senior Backend Dev' :
                 currentRole === 'support_agent' ? 'Customer Support Specialist' : 'Client Operations Director'}
              </span>
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
