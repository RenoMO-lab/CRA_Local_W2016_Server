import React from 'react';
import { ContractApprovalStatus } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

const STATUS_STYLES: Record<ContractApprovalStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-500/10 text-blue-500',
  finance_approved: 'bg-sky-500/10 text-sky-500',
  finance_rejected: 'bg-orange-500/10 text-orange-500',
  gm_approved: 'bg-emerald-500/10 text-emerald-500',
  gm_rejected: 'bg-rose-500/10 text-rose-500',
  finance_upload: 'bg-amber-500/10 text-amber-500',
  completed: 'bg-green-500/10 text-green-500',
};

interface Props {
  status: ContractApprovalStatus;
}

const ContractStatusBadge: React.FC<Props> = ({ status }) => {
  const { t } = useLanguage();
  const label = t.contractApproval.statuses[status] ?? status;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_STYLES[status])}>
      {label}
    </span>
  );
};

export default ContractStatusBadge;
