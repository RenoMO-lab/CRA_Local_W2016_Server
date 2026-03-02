import React from 'react';
import { ContractApproval, UserRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import ContractStatusBadge from './ContractStatusBadge';
import { useLanguage } from '@/context/LanguageContext';

interface Props {
  contracts: ContractApproval[];
  userRole: UserRole;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onFinanceUpload: (id: string) => void;
  onComplete: (id: string) => void;
}

const toDate = (value: Date | string | null | undefined) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'yyyy-MM-dd');
};

const toAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number') return '-';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ContractApprovalsTable: React.FC<Props> = ({
  contracts,
  userRole,
  onView,
  onEdit,
  onApprove,
  onReject,
  onFinanceUpload,
  onComplete,
}) => {
  const { t } = useLanguage();

  if (!contracts.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {t.contractApproval.empty}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>{t.contractApproval.table.contractId}</TableHead>
            <TableHead>{t.contractApproval.table.clientName}</TableHead>
            <TableHead>{t.contractApproval.table.craNumber}</TableHead>
            <TableHead>{t.contractApproval.table.salesOwner}</TableHead>
            <TableHead className="text-right">{t.contractApproval.table.amount}</TableHead>
            <TableHead>{t.contractApproval.table.status}</TableHead>
            <TableHead>{t.contractApproval.table.submissionDate}</TableHead>
            <TableHead>{t.contractApproval.table.lastUpdated}</TableHead>
            <TableHead className="text-right">{t.contractApproval.table.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract) => (
            <TableRow key={contract.id}>
              <TableCell className="font-semibold text-primary">{contract.id}</TableCell>
              <TableCell>{contract.clientName || '-'}</TableCell>
              <TableCell>{contract.craNumber || '-'}</TableCell>
              <TableCell>{contract.salesOwnerName || '-'}</TableCell>
              <TableCell className="text-right tabular-nums">{toAmount(contract.contractAmount)}</TableCell>
              <TableCell>
                <ContractStatusBadge status={contract.status} />
              </TableCell>
              <TableCell>{toDate(contract.submittedAt)}</TableCell>
              <TableCell>{toDate(contract.updatedAt)}</TableCell>
              <TableCell className="text-right">
                <div className="inline-flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => onView(contract.id)}>
                    {t.table.view}
                  </Button>
                  {(userRole === 'sales' || userRole === 'admin') && (contract.status === 'draft' || contract.status === 'gm_rejected') ? (
                    <Button size="sm" variant="outline" onClick={() => onEdit(contract.id)}>
                      {t.table.edit}
                    </Button>
                  ) : null}
                  {userRole === 'admin' && contract.status === 'submitted' ? (
                    <>
                      <Button size="sm" onClick={() => onApprove(contract.id)}>
                        {t.contractApproval.approve}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => onReject(contract.id)}>
                        {t.contractApproval.reject}
                      </Button>
                    </>
                  ) : null}
                  {userRole === 'finance' && contract.status === 'gm_approved' ? (
                    <Button size="sm" onClick={() => onFinanceUpload(contract.id)}>
                      {t.contractApproval.uploadStamped}
                    </Button>
                  ) : null}
                  {userRole === 'finance' && contract.status === 'finance_upload' ? (
                    <Button size="sm" onClick={() => onComplete(contract.id)}>
                      {t.contractApproval.markCompleted}
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ContractApprovalsTable;
