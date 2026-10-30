import React from 'react';
import { AlertCircle, UserPlus, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Ticket } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';

interface SummaryCardsProps {
  tickets?: Ticket[];
  openCount: number;
  unassignedCount: number;
  urgentCount: number;
  resolvedCount: number;
  activeFilterType?: 'OPEN' | 'UNASSIGNED' | 'URGENT' | 'RESOLVED' | null;
  onCardClick?: (type: 'OPEN' | 'UNASSIGNED' | 'URGENT' | 'RESOLVED') => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  tickets = [],
  openCount,
  unassignedCount,
  urgentCount,
  resolvedCount,
  activeFilterType,
  onCardClick
}) => {
  // Real dynamic breakdown calculations
  const inDevCount = tickets.filter(t => normalizeStatus(t.status) === 'In Dev').length;
  const newTriageCount = tickets.filter(t => normalizeStatus(t.status) === 'Open').length;

  const unassignedUrgent = tickets.filter(
    t => !t.assigned_to && (normalizeSeverity(t.severity) === 'Urgent' || normalizeSeverity(t.severity) === 'High')
  ).length;

  const cards = [
    {
      id: 'OPEN' as const,
      label: 'Open',
      count: openCount,
      sublabel: openCount > 0 
        ? (newTriageCount > 0 ? 'Pending triage' : inDevCount > 0 ? 'In Dev triage' : 'Active triage') 
        : 'Queue clear',
      dotColor: openCount > 0 ? 'bg-teal-400' : 'bg-emerald-400',
      parenthesisCount: openCount,
      icon: AlertCircle,
      iconBg: 'bg-purple-50 text-purple-600 border border-purple-100',
      activeBorder: 'ring-2 ring-purple-600 border-purple-300'
    },
    {
      id: 'UNASSIGNED' as const,
      label: 'Unassigned',
      count: unassignedCount,
      sublabel: unassignedCount > 0 
        ? (unassignedUrgent > 0 ? 'P0/P1 Urgent' : 'P2/P3 Standard') 
        : 'All assigned',
      dotColor: unassignedCount > 0 
        ? (unassignedUrgent > 0 ? 'bg-amber-500' : 'bg-slate-400') 
        : 'bg-emerald-400',
      parenthesisCount: unassignedCount,
      icon: UserPlus,
      iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
      activeBorder: 'ring-2 ring-amber-500 border-amber-300'
    },
    {
      id: 'URGENT' as const,
      label: 'Urgent',
      count: urgentCount,
      sublabel: urgentCount > 0 ? 'Critical alerts' : 'No critical alerts',
      dotColor: urgentCount > 0 ? 'bg-rose-500' : 'bg-teal-400',
      parenthesisCount: urgentCount,
      icon: ShieldAlert,
      iconBg: 'bg-rose-50 text-rose-600 border border-rose-100',
      activeBorder: 'ring-2 ring-red-500 border-red-300'
    },
    {
      id: 'RESOLVED' as const,
      label: 'Resolved',
      count: resolvedCount,
      sublabel: resolvedCount > 0 ? 'Verified & closed' : 'Awaiting resolutions',
      dotColor: resolvedCount > 0 ? 'bg-emerald-500' : 'bg-slate-300',
      parenthesisCount: resolvedCount,
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      activeBorder: 'ring-2 ring-emerald-500 border-emerald-300'
    }
  ];

  return (
    <section aria-label="Incident Summary Cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const IconComponent = card.icon;
        const isActive = activeFilterType === card.id;

        return (
          <div
            key={card.id}
            role="button"
            tabIndex={0}
            onClick={() => onCardClick?.(card.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCardClick?.(card.id);
              }
            }}
            aria-label={`${card.label} tickets count: ${card.count}. Click to filter table.`}
            className={`bg-white rounded-md p-5 border transition-all duration-200 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-xs flex flex-col justify-between min-h-[105px] card-subtle ${
              isActive
                ? `${card.activeBorder} bg-purple-50/20 shadow-purple-100`
                : 'border-slate-200/90 hover:border-purple-300'
            }`}
          >
            {/* Top row: Label and Soft Icon badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-slate-800 tracking-tight">
                  {card.label}
                </span>
                {isActive && (
                  <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded-sm">
                    Filtered
                  </span>
                )}
              </div>

              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${card.iconBg}`}>
                <IconComponent className="w-4 h-4" />
              </div>
            </div>

            {/* Bottom Row: Big Bold Count + Square Indicator + Sublabel + Far Right Count in Parentheses */}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-baseline space-x-3">
                <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 leading-none">
                  {card.count}
                </span>
                <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
                  <span className={`w-2 h-2 rounded-xs ${card.dotColor} flex-shrink-0`} />
                  <span>{card.sublabel}</span>
                </div>
              </div>

              <span className="font-mono text-xs text-slate-600 font-semibold">
                ({card.parenthesisCount})
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
};
