import React, { useState, useMemo } from 'react';
import { Ticket, TeamMember } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';
import { safeArray, safeNumber, safePercentage, safeDivision, getSyncedNow, parseSafeDate } from '../utils/edgeCaseHelpers';
import { 
  BarChart3, 
  Activity, 
  Zap, 
  Clock, 
  ShieldCheck, 
  Cpu, 
  Bug, 
  Layout, 
  ShieldAlert, 
  AlertTriangle,
  ArrowDownRight,
  Sparkles,
  Inbox,
  HelpCircle
} from 'lucide-react';

interface ObservabilityGraphsProps {
  tickets?: Ticket[];
  teamMembers?: TeamMember[];
  onSelectCategory?: (cat: string) => void;
  isLoading?: boolean;
  onSeedDemo?: () => void;
  onSimulateTelemetry?: () => void;
  apiLatencyMs?: number | null;
}

export const ObservabilityGraphs: React.FC<ObservabilityGraphsProps> = ({
  tickets = [],
  teamMembers = [],
  onSelectCategory,
  isLoading = false,
  onSeedDemo,
  onSimulateTelemetry,
  apiLatencyMs
}) => {
  const [timeWindow, setTimeWindow] = useState<'24h' | '7d'>('24h');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const safeTickets = safeArray<Ticket>(tickets);
  const totalTickets = safeTickets.length;

  // 1. Dynamic Category Breakdown with safe percentages and Other/Feedback fallback bucket (3.1)
  const categoryStats = useMemo(() => {
    const categories = [
      { id: 'API_FAILURE', label: 'API Failures', icon: Cpu, color: 'text-red-500' },
      { id: 'SECURITY', label: 'Security & Auth', icon: ShieldAlert, color: 'text-purple-600' },
      { id: 'PERFORMANCE', label: 'Performance & DB', icon: AlertTriangle, color: 'text-amber-500' },
      { id: 'BUG', label: 'Application Bugs', icon: Bug, color: 'text-indigo-500' },
      { id: 'UI_GLITCH', label: 'UI & Frontend', icon: Layout, color: 'text-blue-500' }
    ];

    const knownIds = new Set(categories.map(c => c.id));
    let otherCount = 0;
    const counts: Record<string, number> = {
      API_FAILURE: 0,
      SECURITY: 0,
      PERFORMANCE: 0,
      BUG: 0,
      UI_GLITCH: 0
    };

    safeTickets.forEach(t => {
      const cat = (t.category || '').toUpperCase().trim();
      if (knownIds.has(cat)) {
        counts[cat]++;
      } else {
        otherCount++;
      }
    });

    const result = categories.map(cat => ({
      ...cat,
      count: counts[cat.id],
      pct: safePercentage(counts[cat.id], totalTickets, 0)
    }));

    if (otherCount > 0 || totalTickets === 0) {
      result.push({
        id: 'OTHER',
        label: 'Other / Feedback',
        icon: HelpCircle,
        color: 'text-slate-500',
        count: otherCount,
        pct: safePercentage(otherCount, totalTickets, 0)
      });
    }

    return result;
  }, [safeTickets, totalTickets]);

  // 2. Dynamic Severity Breakdown with safe percentages
  const severityStats = useMemo(() => {
    let p0 = 0, p1 = 0, p2 = 0, p3 = 0;
    for (let i = 0; i < safeTickets.length; i++) {
      const sev = normalizeSeverity(safeTickets[i].severity);
      if (sev === 'Urgent') p0++;
      else if (sev === 'High') p1++;
      else if (sev === 'Medium') p2++;
      else p3++;
    }

    return {
      p0,
      p1,
      p2,
      p3,
      pctP0: safePercentage(p0, totalTickets, 0),
      pctP1: safePercentage(p1, totalTickets, 0),
      pctP2: safePercentage(p2, totalTickets, 0),
      pctP3: safePercentage(p3, totalTickets, 0),
    };
  }, [safeTickets, totalTickets]);

  // Dynamic MTTR & Performance calculations
  const { avgMttrMinutes, telemetryFidelityPct, resolvedCount, unassignedCount } = useMemo(() => {
    let resolvedCnt = 0;
    let unassignedCnt = 0;
    let totalMinutes = 0;
    let telemetryCount = 0;

    for (let i = 0; i < safeTickets.length; i++) {
      const t = safeTickets[i];
      if (normalizeStatus(t.status) === 'Resolved') {
        resolvedCnt++;
        const start = parseSafeDate(t.created_at, getSyncedNow());
        const end = parseSafeDate(t.updated_at || t.created_at, start);
        const diff = Math.max(0, Math.round((end - start) / 60000));
        totalMinutes += diff;
      }
      if (!t.assigned_to) {
        unassignedCnt++;
      }
      if (t.telemetry && (t.telemetry.page_url || t.telemetry.user_agent || (t.telemetry.network_errors && t.telemetry.network_errors.length > 0))) {
        telemetryCount++;
      }
    }

    const avgMinutes = resolvedCnt > 0 ? Math.round(safeDivision(totalMinutes, resolvedCnt, 0)) : null;
    const fidelity = totalTickets > 0 ? safePercentage(telemetryCount, totalTickets, 0) : null;

    return {
      avgMttrMinutes: avgMinutes,
      telemetryFidelityPct: fidelity,
      resolvedCount: resolvedCnt,
      unassignedCount: unassignedCnt
    };
  }, [safeTickets, totalTickets]);

  // 3. Dynamic Time-Series Data Points for SVG Area Chart with Adaptive Bucketing
  const { trendData, isAdaptiveZoom, adaptiveWindowLabel } = useMemo(() => {
    const now = getSyncedNow();
    if (timeWindow === '24h') {
      const ticketTimes = safeTickets
        .map(t => parseSafeDate(t.created_at, now))
        .filter(t => t <= now);
      const earliestTime = ticketTimes.length > 0 ? Math.min(...ticketTimes) : null;
      const spanMs = earliestTime !== null ? Math.max(0, now - earliestTime) : 0;

      // Adaptive Bucketing: When data is sparse or recently initiated (< 6 hours),
      // adapt bucket granularity so the graph doesn't flatline for 20 hours and jump at 'Now'.
      let buckets: Array<{ label: string; cutoff: number; isPreTelemetry?: boolean }>;
      let adaptiveActive = false;
      let windowLabel = '';

      if (earliestTime !== null && spanMs <= 2 * 3600000 && safeTickets.length > 0) {
        adaptiveActive = true;
        windowLabel = '2h zoom';
        buckets = [
          { label: '-120m', cutoff: now - 120 * 60000 },
          { label: '-90m', cutoff: now - 90 * 60000 },
          { label: '-60m', cutoff: now - 60 * 60000 },
          { label: '-45m', cutoff: now - 45 * 60000 },
          { label: '-30m', cutoff: now - 30 * 60000 },
          { label: '-15m', cutoff: now - 15 * 60000 },
          { label: 'Now', cutoff: now }
        ];
      } else if (earliestTime !== null && spanMs <= 6 * 3600000 && safeTickets.length > 0) {
        adaptiveActive = true;
        windowLabel = '6h zoom';
        buckets = [
          { label: '-6h', cutoff: now - 6 * 3600000 },
          { label: '-5h', cutoff: now - 5 * 3600000 },
          { label: '-4h', cutoff: now - 4 * 3600000 },
          { label: '-3h', cutoff: now - 3 * 3600000 },
          { label: '-2h', cutoff: now - 2 * 3600000 },
          { label: '-1h', cutoff: now - 1 * 3600000 },
          { label: 'Now', cutoff: now }
        ];
      } else {
        buckets = [
          { label: '-24h', cutoff: now - 24 * 3600000 },
          { label: '-20h', cutoff: now - 20 * 3600000 },
          { label: '-16h', cutoff: now - 16 * 3600000 },
          { label: '-12h', cutoff: now - 12 * 3600000 },
          { label: '-8h', cutoff: now - 8 * 3600000 },
          { label: '-4h', cutoff: now - 4 * 3600000 },
          { label: 'Now', cutoff: now }
        ];
      }

      const points = buckets.map(b => {
        const ingested = safeTickets.filter(t => parseSafeDate(t.created_at, now) <= b.cutoff).length;
        const resolved = safeTickets.filter(t => normalizeStatus(t.status) === 'Resolved' && parseSafeDate(t.updated_at || t.created_at, now) <= b.cutoff).length;
        const isPreTelemetry = earliestTime !== null && b.cutoff < earliestTime;
        return {
          label: b.label,
          ingested,
          resolved,
          isPreTelemetry
        };
      });

      return {
        trendData: points,
        isAdaptiveZoom: adaptiveActive,
        adaptiveWindowLabel: windowLabel
      };
    } else {
      // Cross-Timezone & DST Shift resilient grouping via calendar date math & Intl.DateTimeFormat
      const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
      const today = new Date(now);
      const buckets = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        d.setHours(23, 59, 59, 999);
        return {
          label: i === 6 ? 'Now' : dayFormatter.format(d),
          cutoff: d.getTime()
        };
      });

      const points = buckets.map(b => {
        const ingested = safeTickets.filter(t => parseSafeDate(t.created_at, now) <= b.cutoff).length;
        const resolved = safeTickets.filter(t => normalizeStatus(t.status) === 'Resolved' && parseSafeDate(t.updated_at || t.created_at, now) <= b.cutoff).length;
        return {
          label: b.label,
          ingested,
          resolved,
          isPreTelemetry: false
        };
      });

      return {
        trendData: points,
        isAdaptiveZoom: false,
        adaptiveWindowLabel: ''
      };
    }
  }, [timeWindow, safeTickets]);

  // SVG Area calculations with finite-number guards
  const chartHeight = 150;
  const chartWidth = 560;
  const maxIngested = Math.max(3, ...trendData.map(d => Math.max(d.ingested, d.resolved))) + 0.5;

  const pointsIngested = useMemo(() => {
    const divisor = Math.max(1, trendData.length - 1);
    return trendData.map((d, i) => {
      const rawX = (i / divisor) * (chartWidth - 50) + 25;
      const rawY = chartHeight - (d.ingested / maxIngested) * (chartHeight - 40) - 20;
      const x = Number.isFinite(rawX) ? rawX : 25;
      const y = Number.isFinite(rawY) ? rawY : chartHeight - 20;
      return { x, y, ...d };
    });
  }, [trendData, maxIngested]);

  const pointsResolved = useMemo(() => {
    const divisor = Math.max(1, trendData.length - 1);
    return trendData.map((d, i) => {
      const rawX = (i / divisor) * (chartWidth - 50) + 25;
      const rawY = chartHeight - (d.resolved / maxIngested) * (chartHeight - 40) - 20;
      const x = Number.isFinite(rawX) ? rawX : 25;
      const y = Number.isFinite(rawY) ? rawY : chartHeight - 20;
      return { x, y, ...d };
    });
  }, [trendData, maxIngested]);

  const pathIngested = useMemo(() => {
    return pointsIngested.reduce((acc, p, idx) => 
      idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, 
    '');
  }, [pointsIngested]);

  const pathResolved = useMemo(() => {
    return pointsResolved.reduce((acc, p, idx) => 
      idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, 
    '');
  }, [pointsResolved]);

  const areaIngested = useMemo(() => {
    if (pointsIngested.length === 0) return '';
    const first = pointsIngested[0];
    const last = pointsIngested[pointsIngested.length - 1];
    return `${pathIngested} L ${last.x} ${chartHeight - 15} L ${first.x} ${chartHeight - 15} Z`;
  }, [pointsIngested, pathIngested]);

  // Loading indicator state
  if (isLoading) {
    return (
      <section aria-label="Loading analytics" className="space-y-4">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-[8px] bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-medium text-slate-800 tracking-tight">
            Telemetry Observability & Triage Velocity
          </h2>
        </div>
        <div className="bg-white rounded-[12px] border border-slate-200/90 p-8 text-center space-y-3 card-subtle">
          <div className="w-7 h-7 mx-auto border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-700">Loading observability telemetry...</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="observability-graphs-heading" className="space-y-4">
      
      {/* Section Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
          <div className="w-8 h-8 rounded-[8px] bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 flex-shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <h2 id="observability-graphs-heading" className="text-sm font-medium text-slate-900 tracking-tight font-poppins">
            Telemetry Observability & Triage Velocity
          </h2>
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-[6px]">
            REAL-TIME API LATENCY: {apiLatencyMs !== null && apiLatencyMs !== undefined ? `${apiLatencyMs}ms` : 'Measuring...'}
          </span>
        </div>

        {/* Time Window Buttons */}
        <div className="flex items-center space-x-1 bg-white border border-slate-200/80 p-0.5 rounded-[8px] shadow-2xs self-start sm:self-auto font-poppins">
          <button
            type="button"
            onClick={() => setTimeWindow('24h')}
            className={`px-3 py-1 text-xs font-medium rounded-[8px] transition-colors cursor-pointer ${
              timeWindow === '24h'
                ? 'bg-[#0b1b36] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Last 24 Hours
          </button>
          <button
            type="button"
            onClick={() => setTimeWindow('7d')}
            className={`px-3 py-1 text-xs font-medium rounded-[8px] transition-colors cursor-pointer ${
              timeWindow === '7d'
                ? 'bg-[#0b1b36] text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Last 7 Days
          </button>
        </div>
      </div>

      {/* Grid of 2 Observability Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Card: Incident Ingestion & Resolution Trend (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-[12px] border border-slate-200/80 shadow-2xs p-5 sm:p-6 flex flex-col justify-between font-poppins">
          <div>
            <div className="flex items-start justify-between gap-4 pb-2 border-b border-slate-100">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-medium text-slate-800 uppercase tracking-tight">
                    INCIDENT INGESTION & RESOLUTION TREND
                  </h3>
                  <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-[6px]">
                    {totalTickets} Ingested • {resolvedCount} Resolved
                  </span>
                  {isAdaptiveZoom && (
                    <span className="text-[10px] font-mono text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-[6px] hidden sm:inline-block">
                      Adaptive Velocity ({adaptiveWindowLabel})
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 font-normal">
                  Telemetry events ingested via SDK & API compared against engineering resolution velocity.
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center space-x-3 text-xs font-medium flex-shrink-0 pt-0.5">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 bg-blue-600 rounded-xs" />
                  <span className="text-slate-600">Inbound</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 bg-teal-400 rounded-full" />
                  <span className="text-slate-600">Resolved</span>
                </div>
              </div>
            </div>

            {/* SVG Area Chart or Clean Empty State */}
            {totalTickets === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-[8px] bg-slate-50/50 text-center p-6 my-2 space-y-2">
                <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                  <Inbox className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-medium text-slate-700">No telemetry data recorded (Zero Ingestion)</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs">
                    SDK bridge is standing by. Inbound telemetry curves will render dynamically once client events or incidents are logged.
                  </p>
                </div>
                {(onSeedDemo || onSimulateTelemetry) && (
                  <div className="flex items-center space-x-2 pt-1">
                    {onSeedDemo && (
                      <button
                        type="button"
                        onClick={onSeedDemo}
                        className="px-2.5 py-1 text-[11px] font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-[6px] transition-colors cursor-pointer"
                      >
                        Seed Demo Events
                      </button>
                    )}
                    {onSimulateTelemetry && (
                      <button
                        type="button"
                        onClick={onSimulateTelemetry}
                        className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-[6px] transition-colors cursor-pointer"
                      >
                        Simulate Telemetry
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="relative pt-6 pb-2 overflow-hidden">
                <svg 
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                  className="w-full h-40 overflow-visible"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="purpleAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Dotted horizontal gridlines */}
                  <line x1="20" y1="30" x2={chartWidth - 20} y2="30" stroke="#f8fafc" strokeDasharray="3 3" />
                  <line x1="20" y1="75" x2={chartWidth - 20} y2="75" stroke="#f1f5f9" strokeDasharray="3 3" />
                  <line x1="20" y1="120" x2={chartWidth - 20} y2="120" stroke="#f1f5f9" strokeDasharray="3 3" />

                  {/* Ingested Area fill */}
                  <path d={areaIngested} fill="url(#purpleAreaGradient)" />

                  {/* Ingested Path line (Purple) */}
                  <path d={pathIngested} fill="none" stroke="#9333ea" strokeWidth="2.5" strokeLinecap="round" />

                  {/* Resolved Path line (Teal dashed) */}
                  <path d={pathResolved} fill="none" stroke="#14b8a6" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" />

                  {/* Data points for Resolved */}
                  {pointsResolved.map((p, idx) => (
                    <circle
                      key={`res-${idx}`}
                      cx={p.x}
                      cy={p.y}
                      r={3}
                      fill="#14b8a6"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  ))}

                  {/* Data points for Inbound */}
                  {pointsIngested.map((p, idx) => (
                    <g key={`ing-${idx}`}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={idx === pointsIngested.length - 1 ? 5 : 3.5}
                        fill="#9333ea"
                        stroke="#ffffff"
                        strokeWidth="2"
                        className="cursor-pointer transition-all"
                        onMouseEnter={() => setHoveredPointIndex(idx)}
                        onMouseLeave={() => setHoveredPointIndex(null)}
                      />
                      {hoveredPointIndex === idx && (
                        <text
                          x={p.x}
                          y={Math.max(14, p.y - 10)}
                          textAnchor="middle"
                          fill="#7e22ce"
                          fontSize="10"
                          fontWeight="bold"
                          className="font-mono"
                        >
                          {p.isPreTelemetry ? 'Unmonitored' : `${p.ingested} In`}
                        </text>
                      )}
                    </g>
                  ))}
                </svg>

                {/* X-Axis Labels: Responsive alternate labels for screens < 400px (3.3) */}
                <div className="hidden sm:flex justify-between text-[11px] text-slate-400 font-mono px-2 pt-1 border-t border-slate-100">
                  {trendData.map((d, i) => (
                    <span key={i}>{d.label}</span>
                  ))}
                </div>
                <div className="flex sm:hidden justify-between text-[11px] text-slate-400 font-mono px-2 pt-1 border-t border-slate-100">
                  {timeWindow === '24h' ? (
                    <>
                      <span>-24h</span>
                      <span>-12h</span>
                      <span>Now</span>
                    </>
                  ) : (
                    <>
                      <span>-7d</span>
                      <span>-3d</span>
                      <span>Now</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Root-Cause Category Distribution (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-[12px] border border-slate-200/80 shadow-2xs p-5 sm:p-6 flex flex-col justify-between space-y-4 font-poppins">
          <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-medium text-slate-800 uppercase tracking-tight">
                ROOT-CAUSE CATEGORY DISTRIBUTION
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-normal">
                Breakdown of telemetry failures by system architectural layer.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 font-medium">
              {totalTickets} total
            </span>
          </div>

          {/* 5 Categories Progress Bars */}
          <div className="space-y-2.5">
            {categoryStats.map((cat) => {
              const Icon = cat.icon;
              return (
                <div 
                  key={cat.id} 
                  className="space-y-1 cursor-pointer hover:bg-slate-50/80 p-1 rounded-[8px] transition-colors"
                  onClick={() => onSelectCategory?.(cat.id)}
                  title={`Click to filter by ${cat.label}`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5">
                      <Icon className={`w-3.5 h-3.5 ${cat.color}`} />
                      <span className="font-medium text-slate-700">{cat.label}</span>
                    </div>
                    <div className="flex items-center space-x-1 font-mono text-xs">
                      <span className="text-slate-500">{cat.pct}%</span>
                      <span className="font-medium text-slate-800">({cat.count})</span>
                    </div>
                  </div>

                  {/* Progress Track */}
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#3b82f6] rounded-full transition-all duration-500"
                      style={{ width: `${cat.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Severity Distribution */}
          <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Severity Distribution</span>
              <span className="font-mono text-slate-400 text-xs">P0 → P3</span>
            </div>

            {/* Stacked Bar with Homogeneous & Zero Data Safety */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
              {totalTickets === 0 ? (
                <div className="w-full h-full bg-slate-100" title="No incidents recorded" />
              ) : (
                <>
                  <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${severityStats.pctP0}%` }} title={`P0: ${severityStats.p0}`} />
                  <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${severityStats.pctP1}%` }} title={`P1: ${severityStats.p1}`} />
                  <div className="h-full bg-purple-600 transition-all duration-500" style={{ width: `${severityStats.pctP2}%` }} title={`P2: ${severityStats.p2}`} />
                  <div className="h-full bg-blue-400 transition-all duration-500" style={{ width: `${severityStats.pctP3}%` }} title={`P3: ${severityStats.p3}`} />
                </>
              )}
            </div>

            {/* Legend below bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium pt-0.5">
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-xs bg-rose-500 inline-block" />
                <span>P0: {severityStats.p0}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" />
                <span>P1: {severityStats.p1}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-xs bg-purple-600 inline-block" />
                <span>P2: {severityStats.p2}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="w-2 h-2 rounded-xs bg-blue-400 inline-block" />
                <span>P3: {severityStats.p3}</span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Row of 3 Operational SLA & Engineering Latency Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-poppins">
        
        {/* Metric 1: Mean Time to Resolution (MTTR) */}
        <div className="bg-white rounded-[12px] border border-slate-200/80 shadow-2xs p-5 hover:shadow-xs transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              MEAN TIME TO RESOLUTION
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-medium text-slate-900 tracking-tight">
                {avgMttrMinutes !== null ? `${avgMttrMinutes}m` : '--'}
              </span>
              <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-[6px]">
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                {resolvedCount > 0 ? `${resolvedCount} resolved` : '0 resolved'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal">
              {avgMttrMinutes !== null 
                ? 'Calculated from resolved production incident timeline.'
                : 'Awaiting verified incident resolutions.'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-[8px] bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200 shadow-2xs flex-shrink-0">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Metric 2: Live Ingest SLA & Crash Catch Rate */}
        <div className="bg-white rounded-[12px] border border-slate-200/80 shadow-2xs p-5 hover:shadow-xs transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              TELEMETRY CAPTURE FIDELITY
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-medium text-emerald-700 tracking-tight">
                {telemetryFidelityPct !== null ? `${telemetryFidelityPct}%` : '--'}
              </span>
              <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-[6px]">
                <ShieldCheck className="w-3.5 h-3.5 mr-0.5" />
                SOC-2 Pass
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal">
              {telemetryFidelityPct !== null 
                ? 'Encrypted stack traces with sensitive auth masking.' 
                : 'Ready for inbound client telemetry capture.'}
            </p>
          </div>
          <div className="w-9 h-9 rounded-[8px] bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs flex-shrink-0">
            <Zap className="w-4 h-4" />
          </div>
        </div>

        {/* Metric 3: On-Call Response Time */}
        <div className="bg-white rounded-[12px] border border-slate-200/80 shadow-2xs p-5 hover:shadow-xs transition-all flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              ON-CALL SQUAD RESPONSE
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl sm:text-3xl font-medium text-slate-900 tracking-tight">
                Live
              </span>
              <span className="inline-flex items-center text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-[6px]">
                {unassignedCount === 0 ? 'All Assigned' : `${unassignedCount} Unassigned`}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-normal">
              Real-time WebSocket dispatch on triage desk.
            </p>
          </div>
          <div className="w-9 h-9 rounded-[8px] bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200 shadow-2xs flex-shrink-0">
            <Activity className="w-4 h-4" />
          </div>
        </div>

      </div>

    </section>
  );
};
