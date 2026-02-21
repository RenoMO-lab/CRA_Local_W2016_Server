import React from 'react';
import { RequestStatus, STATUS_CONFIG } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

interface StatusBadgeProps {
  status: RequestStatus;
  size?: 'sm' | 'md' | 'lg';
}

const STATUS_ACCENT_BAR: Record<RequestStatus, string> = {
  draft: 'bg-slate-400',
  submitted: 'bg-sky-500',
  edited: 'bg-sky-500',
  design_result: 'bg-rose-500',
  under_review: 'bg-amber-500',
  clarification_needed: 'bg-rose-500',
  feasibility_confirmed: 'bg-emerald-500',
  in_costing: 'bg-cyan-500',
  costing_complete: 'bg-emerald-500',
  sales_followup: 'bg-cyan-500',
  gm_approval_pending: 'bg-amber-500',
  gm_approved: 'bg-emerald-500',
  gm_rejected: 'bg-rose-500',
  cancelled: 'bg-rose-500',
  closed: 'bg-slate-500',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = STATUS_CONFIG[status];
  const { t } = useLanguage();
  
  const sizeClasses = {
    sm: 'h-6 pl-3 pr-2 text-[11px]',
    md: 'h-7 pl-3.5 pr-2.5 text-xs',
    lg: 'h-8 pl-4 pr-3 text-[13px]',
  };

  // Get translated status label
  const statusKey = status as keyof typeof t.statuses;
  const label = t.statuses[statusKey] || config.label;

  return (
    <span className={cn(
      'relative inline-flex items-center rounded-md border border-border/70 bg-muted/30 text-foreground font-medium whitespace-nowrap leading-none',
      sizeClasses[size]
    )}>
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-1 top-0.5 bottom-0.5 w-[3px] rounded-sm',
          STATUS_ACCENT_BAR[status]
        )}
      />
      <span>{label}</span>
    </span>
  );
};

export default StatusBadge;
