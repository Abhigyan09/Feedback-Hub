import React from 'react';
import { AlertCircle, UserX, ShieldAlert, CheckCircle2 } from 'lucide-react';
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
  const totalCount = tickets.length;

  // Real dynamic breakdown calculations
  const inDevCount = tickets.filter(t => normalizeStatus(t.status) === 'In Dev').length;
  const inQaCount = tickets.filter(t => normalizeStatus(t.status) === 'In QA').length;
  const newTriageCount = tickets.filter(t => normalizeStatus(t.status) === 'Open').length;

  const unassignedUrgent = tickets.filter(
    t => !t.assigned_to && (normalizeSeverity(t.severity) === 'Urgent' || normalizeSeverity(t.severity) === 'High')
  ).length;
  const unassignedNormal = tickets.filter(
    t => !t.assigned_to && (normalizeSeverity(t.severity) === 'Medium' || normalizeSeverity(t.severity) === 'Low')
  ).length;

  const urgentCritical = tickets.filter(
    t => normalizeSeverity(t.severity) === 'Urgent' && (t.category === 'API_FAILURE' || t.category === 'SECURITY' || t.category === 'BUG')
  ).length;
  const urgentOther = tickets.filter(
    t => normalizeSeverity(t.severity) === 'Urgent' && !(t.category === 'API_FAILURE' || t.category === 'SECURITY' || t.category === 'BUG')
  ).length;

  const resolvedBug = tickets.filter(
    t => normalizeStatus(t.status) === 'Resolved' && t.category === 'BUG'
  ).length;
  const resolvedOther = tickets.filter(
    t => normalizeStatus(t.status) === 'Resolved' && t.category !== 'BUG'
  ).length;

  // Real dynamic gauge percentages
  const openGaugePercent = totalCount > 0 ? Math.min(100, Math.round((openCount / totalCount) * 100)) : 0;
  const unassignedGaugePercent = openCount > 0 ? Math.min(100, Math.round((unassignedCount / openCount) * 100)) : 0;
  const urgentGaugePercent = openCount > 0 ? Math.min(100, Math.round((urgentCount / openCount) * 100)) : 0;
  const resolvedGaugePercent = totalCount > 0 ? Math.min(100, Math.round((resolvedCount / totalCount) * 100)) : 0;

  const cards = [
    {
      id: 'OPEN' as const,
      label: 'Open',
      count: openCount,
      sublabel: 'Active incidents',
      gaugePercent: openGaugePercent,
      gaugeColor: '#8b5cf6', // purple
      icon: AlertCircle,
      iconBg: 'bg-purple-50 text-purple-600 border border-purple-100',
      activeBorder: 'ring-2 ring-purple-600 border-purple-300',
      breakdown: openCount > 0 ? [
        ...(inDevCount > 0 ? [{ label: 'In Dev triage', count: inDevCount, dot: 'bg-purple-500' }] : []),
        ...(inQaCount > 0 ? [{ label: 'In QA test', count: inQaCount, dot: 'bg-indigo-400' }] : []),
        ...(newTriageCount > 0 ? [{ label: 'Pending triage', count: newTriageCount, dot: 'bg-blue-400' }] : [])
      ] : [{ label: 'Queue clear', count: 0, dot: 'bg-emerald-400' }]
    },
    {
      id: 'UNASSIGNED' as const,
      label: 'Unassigned',
      count: unassignedCount,
      sublabel: 'Needs owner',
      gaugePercent: unassignedGaugePercent,
      gaugeColor: '#f59e0b', // amber
      icon: UserX,
      iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
      activeBorder: 'ring-2 ring-amber-500 border-amber-300',
      breakdown: unassignedCount > 0 ? [
        ...(unassignedUrgent > 0 ? [{ label: 'P0/P1 Urgent', count: unassignedUrgent, dot: 'bg-amber-500' }] : []),
        ...(unassignedNormal > 0 ? [{ label: 'P2/P3 Standard', count: unassignedNormal, dot: 'bg-slate-400' }] : [])
      ] : [{ label: 'All assigned', count: 0, dot: 'bg-emerald-400' }]
    },
    {
      id: 'URGENT' as const,
      label: 'Urgent',
      count: urgentCount,
      sublabel: 'P0 SLA incidents',
      gaugePercent: urgentGaugePercent,
      gaugeColor: '#ef4444', // red
      icon: ShieldAlert,
      iconBg: 'bg-red-50 text-red-600 border border-red-100',
      activeBorder: 'ring-2 ring-red-500 border-red-300',
      breakdown: urgentCount > 0 ? [
        ...(urgentCritical > 0 ? [{ label: 'Critical API/Sec', count: urgentCritical, dot: 'bg-red-500' }] : []),
        ...(urgentOther > 0 ? [{ label: 'Infra & Core', count: urgentOther, dot: 'bg-orange-500' }] : [])
      ] : [{ label: 'No critical alerts', count: 0, dot: 'bg-emerald-400' }]
    },
    {
      id: 'RESOLVED' as const,
      label: 'Resolved',
      count: resolvedCount,
      sublabel: 'Verified & closed',
      gaugePercent: resolvedGaugePercent,
      gaugeColor: '#10b981', // emerald
      icon: CheckCircle2,
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      activeBorder: 'ring-2 ring-emerald-500 border-emerald-300',
      breakdown: resolvedCount > 0 ? [
        ...(resolvedBug > 0 ? [{ label: 'Bugs Fixed', count: resolvedBug, dot: 'bg-emerald-500' }] : []),
        ...(resolvedOther > 0 ? [{ label: 'Other Resolved', count: resolvedOther, dot: 'bg-teal-400' }] : [])
      ] : [{ label: 'Awaiting resolutions', count: 0, dot: 'bg-slate-300' }]
    }
  ];

  return (
    <section aria-label="Incident Summary Cards" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const IconComponent = card.icon;
        const isActive = activeFilterType === card.id;

        // Circular gauge calculations
        const radius = 28;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (card.gaugePercent / 100) * circumference;

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
            className={`bg-white rounded-[2px] p-5 border transition-all duration-200 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md flex flex-col justify-between ${
              isActive
                ? `${card.activeBorder} bg-purple-50/20 shadow-purple-100`
                : 'border-slate-200/80 hover:border-purple-300'
            }`}
          >
            {/* Top row: Label and Soft Icon badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800 tracking-tight">
                  {card.label}
                </span>
                {isActive && (
                  <span className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-[2px]">
                    Active Filter
                  </span>
                )}
              </div>

              <div className={`w-8 h-8 rounded-[2px] flex items-center justify-center ${card.iconBg}`}>
                <IconComponent className="w-4 h-4" />
              </div>
            </div>

            {/* Middle & Bottom: Circular Gauge + Big Metric Number + Breakdown list */}
            <div className="mt-4 flex items-center justify-between gap-4">
              
              {/* Circular gauge with count inside */}
              <div className="relative w-18 h-18 flex items-center justify-center flex-shrink-0">
                <svg className="w-18 h-18 -rotate-90 transform" viewBox="0 0 72 72">
                  {/* Background Track */}
                  <circle
                    cx="36"
                    cy="36"
                    r={radius}
                    stroke="#f1f5f9"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  {/* Progress Arc */}
                  <circle
                    cx="36"
                    cy="36"
                    r={radius}
                    stroke={card.gaugeColor}
                    strokeWidth="7"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <span className="absolute text-xl font-bold font-mono text-slate-900">
                  {card.count}
                </span>
              </div>

              {/* Breakdown metrics list */}
              <div className="space-y-1.5 flex-1 min-w-0">
                {card.breakdown.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center space-x-1.5 truncate">
                      <span className={`w-2 h-2 rounded-full ${item.dot} flex-shrink-0`} />
                      <span className="text-[11px] truncate text-slate-500">{item.label}</span>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-slate-800 ml-1">
                      ({item.count})
                    </span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        );
      })}
    </section>
  );
};
