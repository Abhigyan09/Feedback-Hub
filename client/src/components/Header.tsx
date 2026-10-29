import React from 'react';
import { AuthenticatedUser } from '../types';
import { Shield, Layers, Radio, Sparkles, LogOut, User } from 'lucide-react';

interface HeaderProps {
  user: AuthenticatedUser;
  isConnected: boolean;
  onOpenWidgetSimulator: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  isConnected,
  onOpenWidgetSimulator,
  onLogout
}) => {
  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'super_admin':
      case 'tenant_admin':
        return 'text-amber-400 border-amber-800/80 bg-amber-950/40';
      case 'squad_lead':
      case 'developer':
        return 'text-indigo-400 border-indigo-800/80 bg-indigo-950/40';
      case 'support_agent':
        return 'text-blue-400 border-blue-800/80 bg-blue-950/40';
      default:
        return 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40';
    }
  };

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

        {/* Verified User & Actions */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          
          {/* Live WebSocket Status */}
          <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 border border-[#27272a] bg-[#121215] text-[11px] font-mono">
            <span className={`w-2 h-2 ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'} animate-pulse`} />
            <span className="text-neutral-300">{isConnected ? 'SOCKET LIVE' : 'SYNCING'}</span>
          </div>

          {/* Verified Tenant Scope Badge */}
          <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 border border-[#27272a] bg-[#121215] text-xs font-mono">
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-400">TENANT:</span>
            <span className="text-indigo-400 font-bold uppercase">
              {user.tenant_name || user.tenant_slug || user.tenant_id}
            </span>
          </div>

          {/* Verified User & Role Identity */}
          <div className="flex items-center space-x-2 px-2.5 py-1 border border-[#27272a] bg-[#121215]">
            <div className="w-6 h-6 bg-indigo-950 border border-indigo-700/60 flex items-center justify-center text-indigo-300 text-xs font-mono font-bold">
              {user.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-neutral-200 leading-none">{user.full_name || user.email}</p>
              <p className="text-[10px] text-neutral-400 font-mono leading-none mt-0.5">{user.email}</p>
            </div>
            <span className={`px-1.5 py-0.5 text-[10px] font-mono border font-semibold uppercase ${getRoleBadgeStyle(user.role)}`}>
              [{user.role}]
            </span>
          </div>

          {/* Trigger Widget Simulator */}
          <button
            onClick={onOpenWidgetSimulator}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-white text-neutral-900 text-xs font-medium border border-neutral-300 shadow-sm transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Simulate Widget</span>
          </button>

          {/* Logout Button */}
          <button
            id="header-logout-btn"
            onClick={onLogout}
            title="Sign out of your session"
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-300 text-xs font-mono transition-all active:scale-[0.98]"
          >
            <LogOut className="w-3.5 h-3.5 text-red-400" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>

        </div>

      </div>
    </header>
  );
};
