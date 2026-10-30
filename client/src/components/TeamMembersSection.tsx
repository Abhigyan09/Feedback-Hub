import React from 'react';
import { TeamMember } from '../types';
import { Users, ArrowRight } from 'lucide-react';

interface TeamMembersSectionProps {
  members: TeamMember[];
  openTicketCounts: Record<string, number>;
  selectedAssigneeId: string | null;
  onSelectAssignee: (memberId: string | null) => void;
  onNavigateToStaffModule?: () => void;
}

export const TeamMembersSection: React.FC<TeamMembersSectionProps> = ({
  members,
  openTicketCounts,
  selectedAssigneeId,
  onSelectAssignee,
  onNavigateToStaffModule
}) => {
  return (
    <section aria-labelledby="squad-members-heading" className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100 flex-shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <h2 id="squad-members-heading" className="text-sm font-bold text-slate-900 tracking-tight">
            Assigned Squad Members & Active Load
          </h2>
          <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-sm font-semibold">
            {members.length} Active
          </span>
        </div>
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-slate-400 hidden sm:inline">
            Click any teammate to filter workload
          </span>
          {onNavigateToStaffModule && (
            <button
              type="button"
              onClick={onNavigateToStaffModule}
              className="text-purple-700 hover:text-purple-900 font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <span>Full Workload Module</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Teammates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {members.map((member) => {
          const openCount = openTicketCounts[member.id] || 0;
          const isSelected = selectedAssigneeId === member.id;

          return (
            <div
              key={member.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectAssignee(isSelected ? null : member.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectAssignee(isSelected ? null : member.id);
                }
              }}
              aria-label={`${member.name}, ${member.role}. Has ${openCount} open tickets. ${isSelected ? 'Currently filtered. Click to clear.' : 'Click to filter.'}`}
              className={`bg-white rounded-md p-3.5 border transition-all duration-200 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-xs flex items-center justify-between gap-3 select-none card-subtle ${
                isSelected
                  ? 'ring-2 ring-purple-600 border-purple-300 bg-purple-50/20 shadow-purple-100'
                  : 'border-slate-200/90 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                {/* Avatar with status indicator */}
                <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-md border flex items-center justify-center font-bold text-xs shadow-2xs ${member.color}`}>
                    {member.avatarInitials}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      member.status === 'ON_CALL'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-emerald-500'
                    }`}
                    title={member.status === 'ON_CALL' ? 'On Call Lead' : 'Active'}
                  />
                </div>

                {/* Details */}
                <div className="min-w-0">
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-xs font-bold text-slate-800 truncate leading-tight">
                      {member.name}
                    </h3>
                    {member.status === 'ON_CALL' && (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded-sm flex-shrink-0">
                        ON-CALL
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {member.role}
                  </p>
                </div>
              </div>

              {/* Open ticket count badge */}
              <div className="flex flex-col items-end flex-shrink-0">
                <div className="border border-purple-200/80 bg-purple-50/50 px-2 py-0.5 rounded-sm flex items-center space-x-1">
                  <span className="text-xs text-slate-400 font-mono">
                    Open:
                  </span>
                  <span className="font-mono text-xs font-bold text-purple-700">
                    {openCount}
                  </span>
                </div>
                {isSelected && (
                  <span className="text-[9px] font-bold text-purple-700 uppercase tracking-tight mt-0.5">
                    Filtered
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
