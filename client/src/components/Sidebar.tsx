import React from 'react';
import { 
  LayoutDashboard, 
  Activity, 
  AlertOctagon, 
  Cpu, 
  Webhook, 
  BarChart3, 
  Radio, 
  Users, 
  Settings, 
  LogOut,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  activeTab?: string;
  openCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab = 'dashboard', openCount = 0 }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Triage Desk', icon: LayoutDashboard, active: true },
    { id: 'incidents', label: 'Incidents', icon: AlertOctagon, badge: openCount > 0 ? String(openCount) : undefined },
    { id: 'telemetry', label: 'Telemetry', icon: Cpu },
    { id: 'webhooks', label: 'APIs & Webhooks', icon: Webhook },
    { id: 'analytics', label: 'SLAs & Health', icon: BarChart3 },
    { id: 'channels', label: 'Broadcasts', icon: Radio },
    { id: 'team', label: 'Squad', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside 
      className="hidden md:flex flex-col w-[76px] bg-[#0c162d] text-slate-400 border-r border-[#152345] justify-between py-3 flex-shrink-0 z-30 select-none"
      aria-label="Main Navigation Sidebar"
    >
      {/* Top: Brand Logo */}
      <div className="flex flex-col items-center space-y-4">
        <div className="relative group cursor-pointer">
          <div className="w-10 h-10 rounded-[2px] bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-900/30">
            FH
          </div>
          <div className="absolute -right-2 top-2.5 w-4 h-4 bg-[#142347] border border-[#203467] rounded-[2px] flex items-center justify-center text-[10px] text-slate-300">
            <ChevronRight className="w-2.5 h-2.5" />
          </div>
        </div>

        {/* Navigation Icons list */}
        <nav className="flex flex-col items-center space-y-1.5 w-full px-2" role="menu">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = item.active || activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                title={item.label}
                className={`w-full py-2.5 px-1 rounded-[2px] flex flex-col items-center justify-center space-y-1 transition-all relative group ${
                  isActive
                    ? 'bg-[#1e3a8a] text-white shadow-sm shadow-blue-900/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#152345]/60'
                }`}
              >
                <IconComponent className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span className={`text-[10px] font-medium leading-none tracking-tight text-center truncate max-w-full ${
                  isActive ? 'text-white font-semibold' : 'text-slate-400'
                }`}>
                  {item.label.split(' ')[0]}
                </span>
                
                {/* Badge if present */}
                {item.badge && !isActive && (
                  <span className="absolute top-1 right-2 min-w-4 h-4 px-1 bg-purple-500 text-white text-[9px] font-bold rounded-[2px] flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom: Logout / Exit Action */}
      <div className="flex flex-col items-center space-y-2 px-2">
        <button
          type="button"
          title="Sign Out"
          className="w-10 h-10 rounded-[2px] flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors"
          aria-label="Sign out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
