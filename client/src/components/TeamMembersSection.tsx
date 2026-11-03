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
    <section aria-labelledby="squad-members-heading" className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between font-poppins">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-[8px] bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <h2 id="squad-members-heading" className="text-sm font-medium text-slate-900 tracking-tight">
            Assigned Squad Members & Active Load
          </h2>
          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 rounded-[6px] font-medium">
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
              className="text-blue-700 hover:text-blue-900 font-medium flex items-center space-x-1 cursor-pointer transition-colors"
            >
              <span>Full Workload Module</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Teammates Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 font-poppins">
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
              className={`bg-white rounded-[12px] p-4 border transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-between gap-3 select-none ${
                isSelected
                  ? 'ring-2 ring-blue-600 border-blue-300 bg-blue-50/20 shadow-blue-100'
                  : 'border-slate-200/80 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                {/* Avatar with status indicator */}
                <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center font-medium text-xs shadow-2xs ${member.color}`}>
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
                    <h3 className="text-xs font-medium text-slate-900 truncate leading-tight">
                      {member.name}
                    </h3>
                    {member.status === 'ON_CALL' && (
                      <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-[6px] flex-shrink-0">
                        ON-CALL
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5 font-normal">
                    {member.role}
                  </p>
                </div>
              </div>

              {/* Open ticket count badge */}
              <div className="flex flex-col items-end flex-shrink-0">
                <div className="border border-blue-200/80 bg-blue-50/50 px-2 py-0.5 rounded-[6px] flex items-center space-x-1">
                  <span className="text-xs text-slate-400">
                    Open:
                  </span>
                  <span className="text-xs font-medium text-blue-700">
                    {openCount}
                  </span>
                </div>
                {isSelected && (
                  <span className="text-[9px] font-medium text-purple-700 uppercase tracking-tight mt-0.5 font-poppins">
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
