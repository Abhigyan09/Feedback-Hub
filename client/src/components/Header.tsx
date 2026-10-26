import React from 'react';
import { UserRole } from '../types';
import { Shield, Layers, Radio, Sparkles, Terminal } from 'lucide-react';

interface HeaderProps {
  currentTenantId: string;
  onTenantChange: (tenantId: string) => void;
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  isConnected: boolean;
  onOpenWidgetSimulator: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTenantId,
  onTenantChange,
  currentRole,
  onRoleChange,
  isConnected,
  onOpenWidgetSimulator
}) => {
  return (
    <header className="border-b border-[#27272a] bg-[#09090b]/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-none flex items-center justify-center font-mono font-bold text-white text-base border border-indigo-500 shadow-sm">
            FH
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-white text-sm">FEEDBACK-HUB</span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono border border-indigo-800 bg-indigo-950/60 text-indigo-300">
                ENTERPRISE
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 font-mono">Dev Squad & Client Incident Bridge</p>
          </div>
        </div>

        {/* Multi-Tenant & RBAC Live Switcher Controls */}
        <div className="flex items-center space-x-4">
          
          {/* Live WebSocket Status */}
          <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 border border-[#27272a] bg-[#121215] text-[11px] font-mono">
            <span className={`w-2 h-2 ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'} animate-pulse`} />
            <span className="text-neutral-300">{isConnected ? 'SOCKET LIVE' : 'SYNCING'}</span>
          </div>

          {/* Tenant Switcher */}
          <div className="flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={currentTenantId}
              onChange={(e) => onTenantChange(e.target.value)}
              className="bg-[#121215] border border-[#27272a] text-neutral-200 text-xs px-2.5 py-1.5 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="tenant-acme-corp-001">Acme Payments Inc.</option>
              <option value="tenant-medsync-002">MedSync Healthcare</option>
            </select>
          </div>

          {/* Active Role Selector (RBAC Demo) */}
          <div className="flex items-center space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            <select
              value={currentRole}
              onChange={(e) => onRoleChange(e.target.value as UserRole)}
              className="bg-[#121215] border border-[#27272a] text-indigo-300 text-xs px-2.5 py-1.5 font-mono font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="developer">Developer (Full Tech View)</option>
              <option value="squad_lead">Squad Lead (Triage & Assign)</option>
              <option value="client_user">Client User (Quarantined View)</option>
            </select>
          </div>

          {/* Trigger Widget Simulator */}
          <button
            onClick={onOpenWidgetSimulator}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-white text-neutral-900 text-xs font-medium border border-neutral-300 shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Simulate Client Widget</span>
          </button>

        </div>

      </div>
    </header>
  );
};
