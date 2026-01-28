import React from 'react';
import { format } from 'date-fns';
import { Check, Clock, AlertCircle, MessageSquare, DollarSign, CheckCircle, Pencil } from 'lucide-react';
import { StatusHistoryEntry, RequestStatus, STATUS_CONFIG } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

interface StatusTimelineProps {
  history: StatusHistoryEntry[];
}

const getStatusIcon = (status: RequestStatus) => {
  switch (status) {
    case 'draft':
      return Clock;
    case 'submitted':
      return Check;
    case 'edited':
      return Pencil;
    case 'under_review':
      return Clock;
    case 'clarification_needed':
      return AlertCircle;
    case 'feasibility_confirmed':
      return CheckCircle;
    case 'in_costing':
      return DollarSign;
    case 'costing_complete':
      return CheckCircle;
    case 'closed':
      return Check;
    default:
      return Clock;
  }
};

const StatusTimeline: React.FC<StatusTimelineProps> = ({ history }) => {
  const { t } = useLanguage();

  return (
    <div className="bg-card rounded-lg border border-border p-4 md:p-6">
      <h3 className="font-semibold text-foreground mb-3 md:mb-4 text-sm md:text-base">{t.timeline.statusHistory}</h3>
      
      <div className="space-y-0">
        {history.map((entry, index) => {
          const Icon = getStatusIcon(entry.status);
          const config = STATUS_CONFIG[entry.status];
          const isLast = index === history.length - 1;
          const statusKey = entry.status as keyof typeof t.statuses;
          const label = t.statuses[statusKey] || config.label;
          
          return (
            <div key={entry.id} className="relative flex gap-3 md:gap-4">
              {/* Icon container with line */}
              <div className="relative flex flex-col items-center">
                {/* Icon */}
                <div className={cn(
                  "w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 relative z-10",
                  config.bgColor,
                  config.color
                )}>
                  <Icon size={12} className="md:hidden" />
                  <Icon size={16} className="hidden md:block" />
                </div>
                {/* Line connector */}
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-border min-h-3 md:min-h-4" />
                )}
              </div>
              
              {/* Content */}
              <div className={cn("pb-4 md:pb-6 min-w-0", isLast && "pb-0")}>
                <div className="flex flex-wrap items-center gap-1 md:gap-2">
                  <span className="font-medium text-foreground text-xs md:text-sm">{label}</span>
                  <span className="text-[10px] md:text-xs text-muted-foreground">
                    {format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
                <p className="text-xs md:text-sm text-muted-foreground">{entry.userName}</p>
                {entry.comment && (
                  <div className="mt-1.5 md:mt-2 p-2 md:p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="flex items-start gap-1.5 md:gap-2">
                      <MessageSquare size={12} className="text-muted-foreground mt-0.5 shrink-0 md:hidden" />
                      <MessageSquare size={14} className="text-muted-foreground mt-0.5 shrink-0 hidden md:block" />
                      <p className="text-xs md:text-sm text-foreground break-words">{entry.comment}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StatusTimeline;
