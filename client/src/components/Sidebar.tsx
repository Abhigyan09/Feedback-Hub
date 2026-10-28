import React from 'react';
import { 
  LayoutDashboard, 
  Layers, 
  CheckCircle2, 
  Settings as SettingsIcon, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

export type SidebarView = 'dashboard' | 'total-tickets' | 'resolved-tickets' | 'settings';

interface SidebarProps {
  currentView?: SidebarView;
  onSelectView?: (view: SidebarView) => void;
  totalTicketsCount?: number;
  resolvedTicketsCount?: number;
  onLogout?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  activeTab?: string;
  openCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView = 'dashboard',
  onSelectView = () => {},
  totalTicketsCount = 0,
  resolvedTicketsCount = 0,
  onLogout = () => {},
  isCollapsed = false,
  onToggleCollapse = () => {},
  activeTab,
  openCount
}) => {
  const effectiveView = (activeTab as SidebarView) || currentView;
  const effectiveTicketsCount = openCount !== undefined ? openCount : totalTicketsCount;

  const menuItems = [
    {
      id: 'dashboard' as SidebarView,
      index: '01',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'total-tickets' as SidebarView,
      index: '02',
      label: 'Total Tickets',
      icon: Layers,
      badge: effectiveTicketsCount
    },
    {
      id: 'resolved-tickets' as SidebarView,
      index: '03',
      label: 'Tickets Resolved',
      icon: CheckCircle2,
      badge: resolvedTicketsCount
    },
    {
      id: 'settings' as SidebarView,
      index: '04',
      label: 'Settings',
      icon: SettingsIcon,
      badge: null
    }
  ];

  return (
    <aside 
      className={`sticky top-0 h-screen bg-[#0B112C] border-r border-[#152042] flex flex-col justify-between transition-all duration-300 ease-in-out select-none z-30 shrink-0 overflow-y-auto ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Header / Brand */}
      <div>
        <div className="h-16 border-b border-[#152042] px-4 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            {/* Logo Box (Strictly Square) */}
            <div className="w-8 h-8 bg-[#6366F1] flex items-center justify-center font-mono font-bold text-white text-xs shrink-0 shadow-sm">
              FH
            </div>

            {!isCollapsed && (
              <div className="leading-tight truncate animate-in fade-in duration-200">
                <span className="font-bold text-white text-sm tracking-wide">FEEDBACK-HUB</span>
                <p className="text-[10px] font-mono text-indigo-400 tracking-wider uppercase font-semibold">
                  ENTERPRISE BRIDGE
                </p>
              </div>
            )}
          </div>

          {/* Collapse Toggle Button */}
          <button
            onClick={onToggleCollapse}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-7 h-7 bg-[#152042] hover:bg-[#1E2D5A] text-slate-400 hover:text-white border border-[#23356D] flex items-center justify-center transition-colors cursor-pointer"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Section */}
        <nav className="p-3 space-y-1.5 mt-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = effectiveView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-[#0066FF] text-white shadow-md shadow-blue-600/30 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-[#152042]'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Item index */}
                  <span
                    className={`font-mono text-[11px] ${
                      isActive ? 'text-blue-100 font-bold' : 'text-slate-500 group-hover:text-slate-400'
                    }`}
                  >
                    {item.index}
                  </span>

                  {/* Icon */}
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />

                  {/* Label */}
                  {!isCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </div>

                {/* Badge count if present */}
                {!isCollapsed && item.badge !== null && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono font-semibold ${
                      isActive 
                        ? 'bg-blue-700/90 text-white' 
                        : 'bg-[#152042] text-slate-300 border border-[#23356D]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section (System & Logout) */}
      <div className="p-3 border-t border-[#152042]">
        {!isCollapsed && (
          <div className="px-3 pb-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest font-semibold">
              SYSTEM
            </span>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className={`w-full flex items-center space-x-3 px-3 py-2.5 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 transition-all cursor-pointer ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Logout"
        >
          <LogOut className="w-4 h-4 shrink-0 text-rose-400" />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};
