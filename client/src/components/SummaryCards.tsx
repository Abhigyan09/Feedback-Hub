import React, { useMemo } from 'react';
import { AlertCircle, UserPlus, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Ticket } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';
import { safeNumber, safeArray } from '../utils/edgeCaseHelpers';

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
  const safeTickets = safeArray<Ticket>(tickets);
  const safeOpen = safeNumber(openCount, 0);
  const safeUnassigned = safeNumber(unassignedCount, 0);
  const safeUrgent = safeNumber(urgentCount, 0);
  const safeResolved = safeNumber(resolvedCount, 0);

  // Single-pass triage breakdown calculation for efficiency with large ticket volumes
  const { inDevCount, newTriageCount, unassignedUrgent } = useMemo(() => {
    let inDev = 0;
    let newTriage = 0;
    let unassignedUrg = 0;

    for (let i = 0; i < safeTickets.length; i++) {
      const t = safeTickets[i];
      const normStatus = normalizeStatus(t.status);
      if (normStatus === 'In Dev') inDev++;
      if (normStatus === 'Open') newTriage++;

      if (!t.assigned_to) {
        const normSev = normalizeSeverity(t.severity);
        if (normSev === 'Urgent' || normSev === 'High') {
          unassignedUrg++;
        }
      }
    }

    return { inDevCount: inDev, newTriageCount: newTriage, unassignedUrgent: unassignedUrg };
  }, [safeTickets]);

  const cards = [
    {
      id: 'OPEN' as const,
      label: 'Open',
      count: safeOpen,
      sublabel: safeOpen > 0 
        ? (newTriageCount > 0 ? 'Pending triage' : inDevCount > 0 ? 'In Dev triage' : 'Active triage') 
        : 'Queue clear',
      dotColor: safeOpen > 0 ? 'bg-teal-400' : 'bg-emerald-400',
      substateText: safeOpen > 0 
        ? (inDevCount > 0 ? `(${inDevCount} in dev)` : newTriageCount > 0 ? `(${newTriageCount} new)` : null)
        : null,
      icon: AlertCircle,
      iconBg: 'bg-purple-50 text-purple-600 border border-purple-100',
      activeBorder: 'ring-2 ring-purple-600 border-purple-300'
    },
    {
      id: 'UNASSIGNED' as const,
      label: 'Unassigned',
      count: safeUnassigned,
      sublabel: safeUnassigned > 0 
        ? (unassignedUrgent > 0 ? 'P0/P1 Urgent' : 'P2/P3 Standard') 
        : 'All assigned',
      dotColor: safeUnassigned > 0 
        ? (unassignedUrgent > 0 ? 'bg-amber-500' : 'bg-slate-400') 
        : 'bg-emerald-400',
      substateText: safeUnassigned > 0 
        ? (unassignedUrgent > 0 ? `(${unassignedUrgent} urgent)` : null)
        : null,
      icon: UserPlus,
      iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
      activeBorder: 'ring-2 ring-amber-500 border-amber-300'
    },
    {
      id: 'URGENT' as const,
      label: 'Urgent',
      count: safeUrgent,
      sublabel: safeUrgent > 0 ? 'Critical alerts' : 'No critical alerts',
      dotColor: safeUrgent > 0 ? 'bg-rose-500' : 'bg-teal-400',
      substateText: safeUrgent > 0 
        ? (unassignedUrgent > 0 ? `(${unassignedUrgent} unassigned)` : null)
        : null,
      icon: ShieldAlert,
      iconBg: 'bg-rose-50 text-rose-600 border border-rose-100',
      activeBorder: 'ring-2 ring-rose-500 border-rose-300'
    },
    {
      id: 'RESOLVED' as const,
      label: 'Resolved',
      count: safeResolved,
      sublabel: safeResolved > 0 ? 'Verified & closed' : 'Awaiting resolutions',
      dotColor: safeResolved > 0 ? 'bg-emerald-500' : 'bg-slate-300',
      substateText: safeResolved > 0 ? '(closed)' : null,
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
            className={`bg-white rounded-[12px] p-5 sm:p-6 border transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs flex flex-col justify-between min-h-[115px] font-poppins ${
              isActive
                ? `${card.activeBorder} bg-blue-50/20 shadow-blue-100`
                : 'border-slate-200/80 hover:border-blue-400'
            }`}
          >
            {/* Top row: Label and Soft Icon badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-slate-800 tracking-tight">
                  {card.label}
                </span>
                {isActive && (
                  <span className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-[6px]">
                    Filtered
                  </span>
                )}
              </div>

              <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center ${card.iconBg}`}>
                <IconComponent className="w-4 h-4" />
              </div>
            </div>

            {/* Bottom Row: Big Bold Count + Rounded Indicator + Sublabel + Far Right Count in Parentheses */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-baseline space-x-3">
                <span className="text-2xl sm:text-3xl font-medium font-poppins text-slate-900 leading-none tracking-tight">
                  {card.count}
                </span>
                <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-medium">
                  <span className={`w-2 h-2 rounded-full ${card.dotColor} flex-shrink-0`} />
                  <span>{card.sublabel}</span>
                </div>
              </div>

              {card.substateText && (
                <span className="font-poppins text-xs text-slate-400 font-medium">
                  {card.substateText}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
};
