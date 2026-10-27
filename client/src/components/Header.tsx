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
            </div>
          </div>

          {/* Role Switcher Dropdown */}
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

          {/* 100.00% SLA Healthy Square Badge (Shown only on ultra-wide screens) */}
          <div className="hidden 2xl:flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50/90 border border-amber-200 text-amber-800 text-xs font-mono font-semibold shrink-0">
            <Sun className="w-3.5 h-3.5 text-amber-600" />
            <span>100.00% SLA HEALTHY</span>
          </div>

        </div>

        {/* Right Side: Action Buttons, Notification Bell, User Profile */}
        <div className="flex items-center space-x-2.5 shrink-0">
          
          {/* Simulate Telemetry Button (Shown on wide screens) */}
          <button
            onClick={onOpenWidgetSimulator}
            className="hidden xl:flex items-center space-x-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100/80 text-purple-700 border border-purple-200 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Simulate Telemetry</span>
          </button>

          {/* + New Incident Button */}
          <button
            onClick={onOpenWidgetSimulator}
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
              {currentRole === 'super_admin' ? 'AT' :
               currentRole === 'tenant_admin' ? 'ER' :
               currentRole === 'squad_lead' ? 'VM' :
               currentRole === 'developer' ? 'RS' :
               currentRole === 'support_agent' ? 'MC' : 'SJ'}
            </div>
            <div className="hidden lg:block leading-tight text-left max-w-[150px] xl:max-w-[200px]">
              <span className="block text-xs font-bold text-slate-900 truncate">
                {currentRole === 'super_admin' ? 'Alex Turner' :
                 currentRole === 'tenant_admin' ? 'Elena Rostova' :
                 currentRole === 'squad_lead' ? 'Vikram Mehta' :
                 currentRole === 'developer' ? 'Rahul Sharma' :
                 currentRole === 'support_agent' ? 'Marcus Chen' : 'Sarah Jenkins'}
              </span>
              <span className="block text-[10px] text-slate-500 font-mono truncate">
                {currentRole === 'super_admin' ? 'Super Admin' :
                 currentRole === 'tenant_admin' ? 'Tenant Admin' :
                 currentRole === 'squad_lead' ? 'Squad Lead' :
                 currentRole === 'developer' ? 'Developer' :
                 currentRole === 'support_agent' ? 'Support' : 'Client User'}
              </span>
            </div>
          </div>

        </div>

      </div>
    </header>
  );
};
