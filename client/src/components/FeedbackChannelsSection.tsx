import React from 'react';
import { Ticket } from '../types';
import { Bug, Lightbulb, HelpCircle, Star, ArrowRight, Sparkles } from 'lucide-react';

interface FeedbackChannelsSectionProps {
  tickets: Ticket[];
  activeCategoryFilter?: string;
  onSelectCategory: (category: string) => void;
}

export const FeedbackChannelsSection: React.FC<FeedbackChannelsSectionProps> = ({
  tickets,
  activeCategoryFilter = 'ALL',
  onSelectCategory
}) => {
  // 1. Bug statistics
  const bugs = tickets.filter(t => t.category === 'BUG' || t.category === 'API_FAILURE' || t.category === 'UI_GLITCH');
  const openBugs = bugs.filter(t => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;

  // 2. Ideas statistics
  const ideas = tickets.filter(t => t.category === 'IDEA' || t.category === 'FEATURE_REQUEST');
  const openIdeas = ideas.filter(t => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;

  // 3. Help statistics
  const helpTickets = tickets.filter(t => t.category === 'HELP');
  const openHelp = helpTickets.filter(t => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;

  // 4. Rating statistics
  const ratingTickets = tickets.filter(t => t.category === 'RATING' || (t.rating && Number(t.rating) > 0));
  const avgRating = ratingTickets.length > 0
    ? (ratingTickets.reduce((acc, t) => acc + (Number(t.rating) || 5), 0) / ratingTickets.length).toFixed(1)
    : '5.0';
  const satisfiedCount = ratingTickets.filter(t => (Number(t.rating) || 5) >= 4).length;
  const csatPct = ratingTickets.length > 0 ? Math.round((satisfiedCount / ratingTickets.length) * 100) : 100;

  const channels = [
    {
      id: 'BUG',
      title: 'Bug Reports',
      subtitle: 'Technical defects & crashes',
      count: bugs.length,
      detail: `${openBugs} active in triage`,
      icon: Bug,
      iconBg: 'bg-rose-50 text-rose-600 border border-rose-200',
      activeBorder: 'ring-2 ring-rose-500 border-rose-400 bg-rose-50/20',
      tag: 'Engineering Queue',
      tagColor: 'bg-rose-50 text-rose-700 border-rose-200'
    },
    {
      id: 'IDEA',
      title: 'Feature Ideas',
      subtitle: 'User suggestions & requests',
      count: ideas.length,
      detail: `${openIdeas} under review`,
      icon: Lightbulb,
      iconBg: 'bg-blue-50 text-blue-600 border border-blue-200',
      activeBorder: 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/20',
      tag: 'Product Design',
      tagColor: 'bg-blue-50 text-blue-700 border-blue-200'
    },
    {
      id: 'HELP',
      title: 'Help Inquiries',
      subtitle: 'Customer assistance requests',
      count: helpTickets.length,
      detail: `${openHelp} awaiting reply`,
      icon: HelpCircle,
      iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
      activeBorder: 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/20',
      tag: 'Client Support',
      tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    },
    {
      id: 'RATING',
      title: 'Experience Ratings',
      subtitle: 'CSAT scores & feedback',
      count: ratingTickets.length,
      detail: `${avgRating} ★ (${csatPct}% positive)`,
      icon: Star,
      iconBg: 'bg-amber-50 text-amber-600 border border-amber-200',
      activeBorder: 'ring-2 ring-amber-500 border-amber-400 bg-amber-50/20',
      tag: 'Customer Success',
      tagColor: 'bg-amber-50 text-amber-700 border-amber-200'
    }
  ];

  return (
    <section aria-label="Feedback Channels & Triage Modules" className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
            Feedback Channels & Triage Streams
          </h3>
        </div>
        {activeCategoryFilter !== 'ALL' && (
          <button
            type="button"
            onClick={() => onSelectCategory('ALL')}
            className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 cursor-pointer flex items-center space-x-1"
          >
            <span>Clear Filter ({activeCategoryFilter})</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {channels.map((ch) => {
          const Icon = ch.icon;
          const isActive = activeCategoryFilter === ch.id;

          return (
            <div
              key={ch.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectCategory(isActive ? 'ALL' : ch.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCategory(isActive ? 'ALL' : ch.id);
                }
              }}
              className={`bg-white border rounded-xl p-4 transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-sm ${
                isActive 
                  ? ch.activeBorder 
                  : 'border-slate-200/90 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ch.iconBg}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 leading-tight">
                      {ch.title}
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]">
                      {ch.subtitle}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${ch.tagColor}`}>
                  {ch.count}
                </span>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-600 font-mono">
                  {ch.detail}
                </span>
                <span className={`text-[10px] font-semibold flex items-center space-x-1 ${
                  isActive ? 'text-indigo-600 font-bold' : 'text-slate-400 group-hover:text-slate-600'
                }`}>
                  <span>{isActive ? 'Active Filter' : 'Filter'}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

