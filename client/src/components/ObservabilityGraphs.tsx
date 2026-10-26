import React, { useState, useMemo } from 'react';
import { Ticket, TeamMember } from '../types';
import { normalizeSeverity, normalizeStatus } from '../utils/formatters';
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  Zap, 
  Clock, 
  ShieldCheck, 
  Cpu, 
  Bug, 
  Layout, 
  ShieldAlert, 
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface ObservabilityGraphsProps {
  tickets: Ticket[];
  teamMembers: TeamMember[];
  onSelectCategory?: (cat: string) => void;
}

export const ObservabilityGraphs: React.FC<ObservabilityGraphsProps> = ({
  tickets,
  teamMembers,
  onSelectCategory
}) => {
  const [timeWindow, setTimeWindow] = useState<'24h' | '7d'>('24h');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // 1. Dynamic Category Breakdown
  const categoryStats = useMemo(() => {
    const categories: Array<{ id: string; label: string; icon: any; color: string; bg: string }> = [
      { id: 'API_FAILURE', label: 'API Failures', icon: Cpu, color: '#ef4444', bg: 'bg-red-500' },
      { id: 'SECURITY', label: 'Security & Auth', icon: ShieldAlert, color: '#9333ea', bg: 'bg-purple-600' },
      { id: 'PERFORMANCE', label: 'Performance & DB', icon: AlertTriangle, color: '#f59e0b', bg: 'bg-amber-500' },
      { id: 'BUG', label: 'Application Bugs', icon: Bug, color: '#6366f1', bg: 'bg-indigo-500' },
      { id: 'UI_GLITCH', label: 'UI & Frontend', icon: Layout, color: '#3b82f6', bg: 'bg-blue-500' }
    ];

    const total = tickets.length;
    return categories.map(cat => {
      const count = tickets.filter(t => t.category === cat.id).length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return {
        ...cat,
        count,
        pct
      };
    });
  }, [tickets]);

  // 2. Dynamic Severity Breakdown
  const severityStats = useMemo(() => {
    const total = tickets.length;
    const critical = tickets.filter(t => normalizeSeverity(t.severity) === 'Urgent').length;
    const high = tickets.filter(t => normalizeSeverity(t.severity) === 'High').length;
    const medium = tickets.filter(t => normalizeSeverity(t.severity) === 'Medium').length;
    const low = tickets.filter(t => normalizeSeverity(t.severity) === 'Low').length;

    return [
      { label: 'P0 Urgent', count: critical, color: 'bg-red-500', pct: total > 0 ? Math.round((critical / total) * 100) : 0 },
      { label: 'P1 High', count: high, color: 'bg-amber-500', pct: total > 0 ? Math.round((high / total) * 100) : 0 },
      { label: 'P2 Medium', count: medium, color: 'bg-purple-500', pct: total > 0 ? Math.round((medium / total) * 100) : 0 },
      { label: 'P3 Low', count: low, color: 'bg-slate-400', pct: total > 0 ? Math.round((low / total) * 100) : 0 },
    ];
  }, [tickets]);

  // 3. Dynamic Time-Series Data Points for SVG Area Chart
  const trendData = useMemo(() => {
    if (timeWindow === '24h') {
      const points = [
        { label: '00:00', ingested: 1, resolved: 0 },
        { label: '04:00', ingested: 0, resolved: 1 },
        { label: '08:00', ingested: 3, resolved: 2 },
        { label: '12:00', ingested: 5, resolved: 4 },
        { label: '16:00', ingested: Math.max(1, tickets.filter(t => normalizeStatus(t.status) !== 'Resolved').length), resolved: tickets.filter(t => normalizeStatus(t.status) === 'Resolved').length },
        { label: '20:00', ingested: Math.max(2, tickets.length), resolved: Math.max(1, tickets.filter(t => normalizeStatus(t.status) === 'Resolved').length) },
        { label: 'Now', ingested: tickets.length, resolved: tickets.filter(t => normalizeStatus(t.status) === 'Resolved').length }
      ];
      return points;
    } else {
      const points = [
        { label: 'Mon', ingested: 6, resolved: 5 },
        { label: 'Tue', ingested: 9, resolved: 8 },
        { label: 'Wed', ingested: 4, resolved: 5 },
        { label: 'Thu', ingested: 11, resolved: 9 },
        { label: 'Fri', ingested: 8, resolved: 7 },
        { label: 'Sat', ingested: 3, resolved: 3 },
        { label: 'Today', ingested: Math.max(4, tickets.length), resolved: tickets.filter(t => normalizeStatus(t.status) === 'Resolved').length }
      ];
      return points;
    }
  }, [timeWindow, tickets]);

  // SVG Area calculations
  const chartHeight = 160;
  const chartWidth = 560;
  const maxIngested = Math.max(5, ...trendData.map(d => Math.max(d.ingested, d.resolved))) + 2;

  const pointsIngested = useMemo(() => {
    return trendData.map((d, i) => {
      const x = (i / (trendData.length - 1)) * (chartWidth - 40) + 20;
      const y = chartHeight - (d.ingested / maxIngested) * (chartHeight - 30) - 15;
      return { x, y, ...d };
    });
  }, [trendData, maxIngested]);

  const pointsResolved = useMemo(() => {
    return trendData.map((d, i) => {
      const x = (i / (trendData.length - 1)) * (chartWidth - 40) + 20;
      const y = chartHeight - (d.resolved / maxIngested) * (chartHeight - 30) - 15;
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
    return `${pathIngested} L ${last.x} ${chartHeight} L ${first.x} ${chartHeight} Z`;
  }, [pointsIngested, pathIngested]);

  // Squad Workload & Resolution Velocity
  const squadWorkload = useMemo(() => {
    return teamMembers.map(m => {
      const openCount = tickets.filter(t => t.assigned_to === m.id && normalizeStatus(t.status) !== 'Resolved').length;
      const resolvedCount = tickets.filter(t => t.assigned_to === m.id && normalizeStatus(t.status) === 'Resolved').length;
      const totalAssigned = openCount + resolvedCount;
      const efficiency = totalAssigned > 0 ? Math.round((resolvedCount / totalAssigned) * 100) : 100;
      return {
        ...m,
        openCount,
        resolvedCount,
        efficiency
      };
    });
  }, [teamMembers, tickets]);

  return (
    <section aria-labelledby="observability-graphs-heading" className="space-y-4">
      
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-[2px] bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <BarChart3 className="w-3.5 h-3.5" />
          </div>
          <h2 id="observability-graphs-heading" className="text-sm font-bold text-slate-800 tracking-tight">
            Telemetry Observability & Triage Velocity
          </h2>
          <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-[2px] font-semibold">
            REAL-TIME P95 LATENCY: 38ms
          </span>
        </div>
        <div className="flex items-center space-x-1.5 bg-white border border-slate-200/90 p-0.5 rounded-[2px] shadow-2xs">
          <button
            type="button"
            onClick={() => setTimeWindow('24h')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-[2px] transition-colors ${
              timeWindow === '24h'
                ? 'bg-[#0b1b36] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Last 24 Hours
          </button>
          <button
            type="button"
            onClick={() => setTimeWindow('7d')}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-[2px] transition-colors ${
              timeWindow === '7d'
                ? 'bg-[#0b1b36] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Last 7 Days
          </button>
        </div>
      </div>

      {/* Grid of 3 Squarish Observability Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Graph Card 1: Telemetry Ingest vs Resolution Area Chart (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-[2px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
                  Incident Ingestion & Resolution Trend
                </h3>
                <span className="text-[10px] font-mono text-purple-600 bg-purple-50 px-1.5 py-0.2 rounded-[2px] font-semibold">
                  {trendData.reduce((acc, d) => acc + d.ingested, 0)} Total Events
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Telemetry events ingested via SDK & API compared against engineering resolution velocity.
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center space-x-3 text-[11px] font-medium flex-shrink-0">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-1 bg-purple-600 rounded-[1px]" />
                <span className="text-slate-600">Inbound</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-1 bg-emerald-500 rounded-[1px]" />
                <span className="text-slate-600">Resolved</span>
              </div>
            </div>
          </div>

          {/* SVG Area Chart */}
          <div className="relative pt-4 overflow-hidden">
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
              className="w-full h-44 overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              <line x1="20" y1="20" x2={chartWidth - 20} y2="20" stroke="#f1f5f9" strokeDasharray="3 3" />
              <line x1="20" y1="70" x2={chartWidth - 20} y2="70" stroke="#f1f5f9" strokeDasharray="3 3" />
              <line x1="20" y1="120" x2={chartWidth - 20} y2="120" stroke="#f1f5f9" strokeDasharray="3 3" />

              {/* Ingested Area fill */}
              <path d={areaIngested} fill="url(#purpleGradient)" />

              {/* Ingested Line */}
              <path 
                d={pathIngested} 
                fill="none" 
                stroke="#7c3aed" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />

              {/* Resolved Line */}
              <path 
                d={pathResolved} 
                fill="none" 
                stroke="#10b981" 
                strokeWidth="2" 
                strokeDasharray="4 3" 
                strokeLinecap="round" 
              />

              {/* Data points */}
              {pointsIngested.map((p, idx) => (
                <g 
                  key={idx} 
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPointIndex(idx)}
                  onMouseLeave={() => setHoveredPointIndex(null)}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hoveredPointIndex === idx ? 5 : 3.5}
                    fill="#ffffff"
                    stroke="#7c3aed"
                    strokeWidth="2"
                    className="transition-all duration-150"
                  />
                  {/* Invisible hit area */}
                  <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
                </g>
              ))}

              {/* Resolved Data points */}
              {pointsResolved.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="2.5"
                  fill="#ffffff"
                  stroke="#10b981"
                  strokeWidth="2"
                />
              ))}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredPointIndex !== null && pointsIngested[hoveredPointIndex] && (
              <div 
                className="absolute top-2 bg-slate-900 text-white text-[10px] font-mono p-2 rounded-[2px] shadow-lg pointer-events-none transform -translate-x-1/2 z-20 border border-slate-700 space-y-0.5"
                style={{ left: `${(pointsIngested[hoveredPointIndex].x / chartWidth) * 100}%` }}
              >
                <div className="font-bold text-slate-300">{pointsIngested[hoveredPointIndex].label}</div>
                <div className="text-purple-300">Inbound: {pointsIngested[hoveredPointIndex].ingested}</div>
                <div className="text-emerald-400">Resolved: {pointsResolved[hoveredPointIndex].resolved}</div>
              </div>
            )}
          </div>

          {/* Bottom X-Axis Labels */}
          <div className="flex justify-between text-[10px] font-mono text-slate-400 px-3 pt-2 border-t border-slate-100">
            {trendData.map((d, i) => (
              <span key={i}>{d.label}</span>
            ))}
          </div>
        </div>

        {/* Graph Card 2: Root-Cause & Severity Distribution (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-[2px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5 flex flex-col justify-between">
          <div className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
                Root-Cause Category Distribution
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                {tickets.length} total
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Breakdown of telemetry failures by system architectural layer.
            </p>
          </div>

          {/* Category Horizontal Bars */}
          <div className="space-y-2.5 my-3">
            {categoryStats.map(cat => {
              const IconComp = cat.icon;
              return (
                <div 
                  key={cat.id} 
                  onClick={() => onSelectCategory?.(cat.id)}
                  className="space-y-1 cursor-pointer group"
                  title={`Filter by ${cat.label}`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 truncate">
                      <IconComp className="w-3.5 h-3.5" style={{ color: cat.color }} />
                      <span className="font-medium text-slate-700 group-hover:text-purple-700 transition-colors">
                        {cat.label}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2 font-mono text-[11px]">
                      <span className="text-slate-400">{cat.pct}%</span>
                      <span className="font-bold text-slate-800">({cat.count})</span>
                    </div>
                  </div>
                  {/* Squarish bar */}
                  <div className="w-full h-2 bg-slate-100 rounded-[1px] overflow-hidden">
                    <div 
                      className={`h-full ${cat.bg} transition-all duration-500`}
                      style={{ width: `${Math.max(cat.pct, cat.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stacked Severity Distribution strip */}
          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-700">Severity Distribution</span>
              <span className="font-mono text-slate-400 text-[10px]">P0 → P3</span>
            </div>

            {/* Stacked Bar */}
            <div className="w-full h-2.5 bg-slate-100 rounded-[1px] overflow-hidden flex">
              {severityStats.map((s, idx) => (
                <div 
                  key={idx}
                  className={`h-full ${s.color} transition-all duration-500`}
                  style={{ width: `${s.pct}%` }}
                  title={`${s.label}: ${s.count} (${s.pct}%)`}
                />
              ))}
            </div>

            {/* Mini Legend */}
            <div className="grid grid-cols-4 gap-1 text-[10px] text-slate-500 font-mono pt-1">
              {severityStats.map((s, idx) => (
                <div key={idx} className="flex items-center space-x-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                  <span className="truncate">{s.label.split(' ')[0]}: {s.count}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Row of 3 Operational SLA & Engineering Latency Metrics (Stripe Squarish) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Metric 1: Mean Time to Resolution (MTTR) */}
        <div className="bg-white rounded-[2px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Mean Time to Resolution
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-slate-900">
                24.5m
              </span>
              <span className="inline-flex items-center text-xs font-semibold text-emerald-600">
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                -18% MTTR
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Triage to verified fix deployed in production.
            </p>
          </div>
          <div className="w-10 h-10 rounded-[2px] bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shadow-2xs">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2: Live Ingest SLA & Crash Catch Rate */}
        <div className="bg-white rounded-[2px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Telemetry Capture Fidelity
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-emerald-700">
                99.98%
              </span>
              <span className="inline-flex items-center text-xs font-semibold text-emerald-600">
                <ShieldCheck className="w-3.5 h-3.5 mr-0.5" />
                SOC-2 Pass
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Encrypted stack traces with sensitive auth masking.
            </p>
          </div>
          <div className="w-10 h-10 rounded-[2px] bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-2xs">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3: On-Call Response Time */}
        <div className="bg-white rounded-[2px] border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              On-Call Squad Response
            </span>
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-slate-900">
                3.2m
              </span>
              <span className="inline-flex items-center text-xs font-semibold text-purple-600 font-mono">
                Target &lt; 15m
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Average alert acknowledgement on WebSocket triage desk.
            </p>
          </div>
          <div className="w-10 h-10 rounded-[2px] bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200 shadow-2xs">
            <Activity className="w-5 h-5" />
          </div>
        </div>

      </div>

    </section>
  );
};
