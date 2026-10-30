import React, { useState, useMemo, useEffect } from 'react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  Flame, 
  AlertTriangle, 
  ShieldAlert, 
  Bug, 
  Cpu, 
  Layers, 
  Clock, 
  ChevronRight,
  Check,
  Radio
} from 'lucide-react';
import { Ticket } from '../types';
import { formatTimeAgo, normalizeSeverity, normalizeStatus } from '../utils/formatters';

export interface NotificationItem {
  id: string;
  ticket: Ticket;
  title: string;
  description: string;
  shortCode: string;
  timestamp: string;
  timeAgo: string;
  isRead: boolean;
  severity: string;
  status: string;
  type: 'sla_breached' | 'urgent' | 'security' | 'performance' | 'bug' | 'general';
  squad: string;
  assignee?: string;
  slaWarning?: string;
}

interface NotificationPanelProps {
  tickets: Ticket[];
  unreadCount: number;
  readNotificationIds: Set<string>;
  onMarkAsRead: (ticketId: string) => void;
  onMarkAllAsRead: () => void;
  onSelectTicket: (ticket: Ticket) => void;
  onViewAllTickets?: () => void;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  tickets,
  unreadCount,
  readNotificationIds,
  onMarkAsRead,
  onMarkAllAsRead,
  onSelectTicket,
  onViewAllTickets,
  onClose
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Construct structured notifications from real live tickets
  const notifications: NotificationItem[] = useMemo(() => {
    const now = Date.now();

    return tickets.map((ticket) => {
      let type: NotificationItem['type'] = 'general';
      let slaWarning: string | undefined;

      // Detect SLA conditions
      if (ticket.sla_due_at) {
        const due = new Date(ticket.sla_due_at).getTime();
        const diff = due - now;
        if (diff <= 0) {
          type = 'sla_breached';
          const overdueMins = Math.floor(Math.abs(diff) / 60000);
          slaWarning = overdueMins > 60 ? `${Math.floor(overdueMins / 60)}h overdue` : `${overdueMins}m overdue`;
        } else if (diff <= 2 * 60 * 60 * 1000) {
          const minsLeft = Math.floor(diff / 60000);
          slaWarning = `Due in ${minsLeft}m`;
        }
      }

      // Assign type if not SLA breached
      if (type !== 'sla_breached') {
        if (ticket.category === 'SECURITY') {
          type = 'security';
        } else if (ticket.severity === 'CRITICAL' || ticket.severity === 'URGENT') {
          type = 'urgent';
        } else if (ticket.category === 'PERFORMANCE') {
          type = 'performance';
        } else if (ticket.category === 'BUG' || ticket.category === 'UI_GLITCH' || ticket.category === 'API_FAILURE') {
          type = 'bug';
        }
      }

      const isResolved = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';
      const isRead = readNotificationIds.has(ticket.id) || isResolved;

      return {
        id: ticket.id,
        ticket,
        title: ticket.title,
        description: ticket.description || 'No description provided for this incident report.',
        shortCode: ticket.short_code || 'INC-000',
        timestamp: ticket.updated_at || ticket.created_at,
        timeAgo: formatTimeAgo(ticket.updated_at || ticket.created_at),
        isRead,
        severity: normalizeSeverity(ticket.severity),
        status: normalizeStatus(ticket.status),
        type,
        squad: ticket.assigned_squad || 'UNASSIGNED',
        assignee: ticket.assigned_to_name,
        slaWarning
      };
    }).sort((a, b) => {
      // Sort unread first if tied, then by timestamp descending
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });
  }, [tickets, readNotificationIds]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter(n => !n.isRead);
    }
    return notifications;
  }, [notifications, filter]);

  // Visual icon and badge styling per notification type
  const getNotificationIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'sla_breached':
        return {
          Icon: Flame,
          badgeClass: 'bg-rose-50 text-rose-600 border-rose-200'
        };
      case 'urgent':
        return {
          Icon: AlertTriangle,
          badgeClass: 'bg-red-50 text-red-600 border-red-200'
        };
      case 'security':
        return {
          Icon: ShieldAlert,
          badgeClass: 'bg-purple-50 text-purple-600 border-purple-200'
        };
      case 'performance':
        return {
          Icon: Cpu,
          badgeClass: 'bg-amber-50 text-amber-600 border-amber-200'
        };
      case 'bug':
        return {
          Icon: Bug,
          badgeClass: 'bg-indigo-50 text-indigo-600 border-indigo-200'
        };
      default:
        return {
          Icon: Bell,
          badgeClass: 'bg-slate-50 text-slate-600 border-slate-200'
        };
    }
  };

  const handleItemClick = (item: NotificationItem) => {
    onMarkAsRead(item.id);
    onSelectTicket(item.ticket);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop only - on desktop (sm:), hover & mousedown handle close smoothly without an event-blocking overlay */}
      <div 
        className="sm:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-50 transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Notification Panel Container */}
      <div 
        className="fixed sm:absolute top-16 sm:top-full left-3 right-3 sm:left-auto sm:right-0 sm:mt-2 w-auto sm:w-[420px] max-w-[440px] max-h-[82vh] sm:max-h-[580px] bg-white border border-slate-200 shadow-2xl z-[60] animate-in fade-in slide-in-from-top-2 duration-150 rounded-xl flex flex-col overflow-hidden text-left font-sans select-none before:content-[''] before:absolute before:-top-3 before:left-0 before:right-0 before:h-3"
        role="dialog"
        aria-label="Notifications panel"
      >
        {/* Panel Header */}
        <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center border border-purple-200">
              <Bell className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-slate-900 tracking-tight flex items-center space-x-1.5">
                <span>Alerts & Notifications</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-red-100 border border-red-200 text-red-700 text-[10px] font-mono font-medium rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </h3>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                title="Mark all notifications as read"
                className="text-[11px] text-purple-700 hover:text-purple-900 font-medium flex items-center space-x-1 px-2.5 py-1 rounded-md hover:bg-purple-100/70 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications panel"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="px-4 pt-2.5 pb-2 border-b border-slate-100 flex items-center justify-between text-xs font-medium shrink-0 bg-white">
          <div className="flex items-center space-x-1 bg-slate-100/80 p-0.5 rounded-md border border-slate-200/60">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center space-x-1.5 ${
                filter === 'unread'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
              <span className="font-mono text-[11px] text-slate-500">({unreadCount})</span>
            </button>
          </div>

          <div className="flex items-center space-x-1 text-[11px] text-slate-400 font-mono">
            <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
            <span>Live Sync</span>
          </div>
        </div>

        {/* Scrollable Notifications List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[380px] bg-[#fafbfd]">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-3 bg-white">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-slate-900 uppercase font-mono tracking-wide">
                  {filter === 'unread' ? 'All Caught Up!' : 'No Notifications'}
                </h4>
                <p className="text-[11px] text-slate-500 max-w-[260px] mx-auto leading-relaxed">
                  {filter === 'unread' 
                    ? 'All active incident alerts and client requests have been acknowledged.' 
                    : 'There are currently zero incident reports or telemetry tickets in this workspace.'}
                </p>
              </div>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const { Icon, badgeClass } = getNotificationIcon(item.type);

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemClick(item);
                    }
                  }}
                  className={`p-3.5 transition-colors cursor-pointer group text-left relative flex items-start space-x-3 ${
                    item.isRead 
                      ? 'bg-white hover:bg-slate-50/80 opacity-80 hover:opacity-100' 
                      : 'bg-purple-50/20 hover:bg-purple-50/40 border-l-2 border-l-purple-600'
                  }`}
                >
                  {/* Left Icon Badge */}
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border mt-0.5 shadow-2xs ${badgeClass}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Header Row: Short Code, Badges, Time */}
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="font-mono text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-md">
                          {item.shortCode}
                        </span>
                        
                        <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-md border ${
                          item.severity === 'Urgent' 
                            ? 'bg-red-50 text-red-700 border-red-200 font-semibold' 
                            : item.severity === 'High' 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {item.severity}
                        </span>

                        <span className="text-[10px] text-slate-500 font-mono">
                          • {item.status}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.timeAgo}
                        </span>
                        {!item.isRead && (
                          <span 
                            className="w-2 h-2 rounded-full bg-purple-600 shrink-0" 
                            title="Unread notification"
                          />
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="text-xs font-medium text-slate-900 group-hover:text-purple-700 transition-colors line-clamp-1 leading-snug">
                      {item.title}
                    </h4>

                    {/* Message Preview */}
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>

                    {/* Bottom Metadata: Squad, Assignee & SLA Warning */}
                    <div className="flex items-center justify-between pt-1 gap-2 text-[10px] text-slate-500 flex-wrap">
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-slate-600 font-mono">
                          {item.squad.replace('_', ' ')}
                        </span>
                        {item.assignee && (
                          <>
                            <span>•</span>
                            <span className="text-slate-600 font-medium truncate max-w-[120px]">
                              {item.assignee}
                            </span>
                          </>
                        )}
                      </div>

                      {item.slaWarning && (
                        <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md font-mono text-[10px] font-medium border ${
                          item.type === 'sla_breached' 
                            ? 'bg-rose-50 text-rose-700 border-rose-200' 
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          <Clock className="w-2.5 h-2.5" />
                          <span>{item.slaWarning}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Direct Mark-As-Read Action button on item */}
                  {!item.isRead && (
                    <button
                      type="button"
                      title="Mark as read"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsRead(item.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200/70 text-slate-400 hover:text-purple-700 rounded-md transition-all cursor-pointer shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Panel Footer */}
        <div className="px-4 py-2.5 bg-slate-50/90 border-t border-slate-200/80 flex items-center justify-between text-xs font-medium text-slate-600 shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">
            {filteredNotifications.length} of {notifications.length} incidents
          </span>
          {onViewAllTickets && (
            <button
              type="button"
              onClick={() => {
                onViewAllTickets();
                onClose();
              }}
              className="text-[11px] text-purple-700 hover:text-purple-900 font-medium flex items-center space-x-1 cursor-pointer transition-colors px-2 py-1 rounded-md hover:bg-purple-50"
            >
              <span>View Total Tickets</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </>
  );
};

