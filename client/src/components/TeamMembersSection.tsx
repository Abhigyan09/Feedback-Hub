import React from 'react';
import { TeamMember } from '../types';
import { Users, Shield, ArrowRight, Radio } from 'lucide-react';

interface TeamMembersSectionProps {
  members: TeamMember[];
  openTicketCounts: Record<string, number>;
  selectedAssigneeId: string | null;
  onSelectAssignee: (memberId: string | null) => void;
}

export const TeamMembersSection: React.FC<TeamMembersSectionProps> = ({
  members,
  openTicketCounts,
  selectedAssigneeId,
  onSelectAssignee
}) => {
  return (
    <section aria-labelledby="squad-members-heading" className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-[2px] bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
            <Users className="w-3.5 h-3.5" />
          </div>
          <h2 id="squad-members-heading" className="text-sm font-bold text-slate-800 tracking-tight">
            Assigned Squad Members & Active Load
          </h2>
          <span className="text-xs text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-[2px] font-medium">
            {members.length} Active
          </span>
        </div>
        <span className="text-xs text-slate-400">
          Click any teammate to filter workload
        </span>
      </div>

      {/* 3 Teammates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              className={`bg-white rounded-[2px] p-4.5 border transition-all duration-200 cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-md flex items-center justify-between gap-3 select-none ${
                isSelected
                  ? 'ring-2 ring-purple-600 border-purple-300 bg-purple-50/20 shadow-purple-100'
                  : 'border-slate-200/80 hover:border-purple-300'
              }`}
            >
              <div className="flex items-center space-x-3.5 min-w-0">
                {/* Avatar with status indicator */}
                <div className="relative flex-shrink-0">
                  <div className={`w-11 h-11 rounded-[2px] border flex items-center justify-center font-bold text-sm shadow-2xs ${member.color}`}>
                    {member.avatarInitials}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                      member.status === 'ON_CALL'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-emerald-500'
                    }`}
                    title={member.status === 'ON_CALL' ? 'On Call Lead' : 'Active'}
                  />
                </div>

                {/* Details */}
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-slate-800 truncate leading-tight">
                      {member.name}
                    </h3>
                    {member.status === 'ON_CALL' && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded-[2px]">
                        ON-CALL
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {member.role}
                  </p>
                </div>
              </div>

              {/* Open ticket count badge */}
              <div className="flex flex-col items-end flex-shrink-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                    Open:
                  </span>
                  <span className="font-mono text-sm font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-[2px] shadow-2xs">
                    {openCount}
                  </span>
                </div>
                {isSelected && (
                  <span className="text-[10px] font-bold text-purple-700 uppercase tracking-tight mt-1">
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
