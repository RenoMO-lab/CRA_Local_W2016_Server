import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useContractApprovals } from '@/context/ContractApprovalContext';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ContractApprovalsTable from '@/components/contract/ContractApprovalsTable';
import { ContractApprovalStatus } from '@/types';
import { toast } from 'sonner';

const ContractApprovals: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { contracts, isLoading, updateStatus, refreshContracts } = useContractApprovals();
  const { t } = useLanguage();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filtered = useMemo(() => {
    return contracts.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (clientFilter.trim() && !item.clientName.toLowerCase().includes(clientFilter.trim().toLowerCase())) return false;
      if (ownerFilter.trim() && !item.salesOwnerName.toLowerCase().includes(ownerFilter.trim().toLowerCase())) return false;
      const submittedAt = item.submittedAt ? new Date(item.submittedAt) : item.createdAt ? new Date(item.createdAt) : null;
      if (fromDate && submittedAt && submittedAt < new Date(`${fromDate}T00:00:00`)) return false;
      if (toDate && submittedAt && submittedAt > new Date(`${toDate}T23:59:59`)) return false;
      return true;
    });
  }, [contracts, statusFilter, clientFilter, ownerFilter, fromDate, toDate]);

  const onApprove = async (id: string) => {
    const comment = window.prompt(t.contractApproval.prompts.approveComment) ?? '';
    try {
      await updateStatus(id, 'gm_approved', comment);
      toast.success(t.contractApproval.messages.approved);
      await refreshContracts();
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const onReject = async (id: string) => {
    const comment = window.prompt(t.contractApproval.prompts.rejectComment) ?? '';
    try {
      await updateStatus(id, 'gm_rejected', comment);
      toast.success(t.contractApproval.messages.rejected);
      await refreshContracts();
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const onComplete = async (id: string) => {
    try {
      await updateStatus(id, 'completed');
      toast.success(t.contractApproval.messages.completed);
      await refreshContracts();
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t.contractApproval.title}</h1>
          <p className="text-sm text-muted-foreground">{t.contractApproval.description}</p>
        </div>
        {(user?.role === 'sales' || user?.role === 'admin') ? (
          <Button onClick={() => navigate('/contract-approvals/new')}>
            <Plus size={14} className="mr-2" />
            {t.contractApproval.newContract}
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t.contractApproval.filters.status} />
            </SelectTrigger>
            <SelectContent className="bg-card border border-border">
              <SelectItem value="all">{t.contractApproval.filters.allStatuses}</SelectItem>
              {(['draft', 'submitted', 'gm_approved', 'gm_rejected', 'finance_upload', 'completed'] as ContractApprovalStatus[]).map(
                (status) => (
                  <SelectItem key={status} value={status}>
                    {t.contractApproval.statuses[status]}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <Input
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            placeholder={t.contractApproval.filters.client}
          />
          <Input
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            placeholder={t.contractApproval.filters.salesOwner}
          />
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t.common.loading}</div>
      ) : (
        <ContractApprovalsTable
          contracts={filtered}
          userRole={user?.role ?? 'sales'}
          onView={(id) => navigate(`/contract-approvals/${id}`)}
          onEdit={(id) => navigate(`/contract-approvals/${id}/edit`)}
          onApprove={onApprove}
          onReject={onReject}
          onFinanceUpload={(id) => navigate(`/contract-approvals/${id}/edit`)}
          onComplete={onComplete}
        />
      )}
    </div>
  );
};

export default ContractApprovals;
