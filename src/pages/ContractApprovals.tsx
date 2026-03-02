import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Clock, FileText, Filter, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import { useContractApprovals } from '@/context/ContractApprovalContext';
import { useLanguage } from '@/context/LanguageContext';
import { useAppShell } from '@/context/AppShellContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import KPICard from '@/components/dashboard/KPICard';
import ContractApprovalsTable from '@/components/contract/ContractApprovalsTable';
import ContractReviewDrawer from '@/components/contract/ContractReviewDrawer';
import { ContractApprovalStatus } from '@/types';
import { cn } from '@/lib/utils';

type FilterType = 'all' | ContractApprovalStatus | 'in_progress' | 'completed_group' | 'needs_attention';
type OwnershipFilter = 'all' | 'mine';

const IN_PROGRESS_STATUSES: ContractApprovalStatus[] = ['submitted', 'gm_approved', 'finance_upload'];
const COMPLETED_STATUSES: ContractApprovalStatus[] = ['completed'];
const NEEDS_ATTENTION_STATUSES: ContractApprovalStatus[] = ['gm_rejected'];

const ContractApprovals: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { contracts, isLoading, updateStatus, refreshContracts } = useContractApprovals();
  const { t } = useLanguage();
  const { density, globalSearchQuery } = useAppShell();

  const [statusFilter, setStatusFilter] = useState<FilterType>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [reviewContractId, setReviewContractId] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [decisionModal, setDecisionModal] = useState<{ type: 'approve' | 'reject'; id: string } | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [searchMatchedIds, setSearchMatchedIds] = useState<Set<string>>(new Set());

  const ownershipFiltered = useMemo(() => {
    if (ownershipFilter !== 'mine') return contracts;
    const actorId = String(user?.id ?? '').trim();
    return contracts.filter((item) => String(item.salesOwnerUserId ?? '').trim() === actorId);
  }, [contracts, ownershipFilter, user?.id]);

  const filtered = useMemo(() => {
    return ownershipFiltered.filter((item) => {
      if (statusFilter === 'in_progress' && !IN_PROGRESS_STATUSES.includes(item.status)) return false;
      if (statusFilter === 'completed_group' && !COMPLETED_STATUSES.includes(item.status)) return false;
      if (statusFilter === 'needs_attention' && !NEEDS_ATTENTION_STATUSES.includes(item.status)) return false;
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'in_progress' &&
        statusFilter !== 'completed_group' &&
        statusFilter !== 'needs_attention' &&
        item.status !== statusFilter
      ) {
        return false;
      }
      return true;
    });
  }, [ownershipFiltered, statusFilter]);

  const isSearchMode = globalSearchQuery.trim().length >= 2;
  const hasActiveFilters = statusFilter !== 'all' || ownershipFilter !== 'all';

  const displayedContracts = useMemo(() => {
    if (!isSearchMode) return filtered;
    return filtered.filter((item) => searchMatchedIds.has(item.id));
  }, [filtered, isSearchMode, searchMatchedIds]);

  useEffect(() => {
    let cancelled = false;
    const q = globalSearchQuery.trim();
    if (q.length < 2) {
      setSearchMatchedIds(new Set());
      return () => {
        cancelled = true;
      };
    }
    const run = async () => {
      try {
        const params = new URLSearchParams();
        params.set('q', q);
        const response = await fetch(`/api/contracts/summary?${params.toString()}`, { credentials: 'include' });
        if (!response.ok) throw new Error(`search_failed_${response.status}`);
        const rows = (await response.json()) as Array<{ id?: string }>;
        if (cancelled) return;
        setSearchMatchedIds(new Set(rows.map((row) => String(row?.id ?? '').trim()).filter(Boolean)));
      } catch {
        if (!cancelled) setSearchMatchedIds(new Set());
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [globalSearchQuery]);

  const kpis = useMemo(() => {
    const base = ownershipFiltered;
    const countBy = (statuses: ContractApprovalStatus[]) => base.filter((item) => statuses.includes(item.status)).length;
    const countInProgress = countBy(IN_PROGRESS_STATUSES);
    const countNeedsAttention = countBy(NEEDS_ATTENTION_STATUSES);
    const countCompleted = countBy(COMPLETED_STATUSES);
    return [
      { title: t.contractApproval.metrics?.total ?? 'Total Contracts', value: base.length, icon: FileText, filterValue: 'all' as FilterType },
      { title: t.contractApproval.metrics?.inProgress ?? 'In Progress', value: countInProgress, icon: Clock, filterValue: 'in_progress' as FilterType },
      { title: t.contractApproval.metrics?.completed ?? 'Completed', value: countCompleted, icon: CheckCircle, filterValue: 'completed_group' as FilterType },
      { title: t.contractApproval.metrics?.needsAttention ?? 'Needs Attention', value: countNeedsAttention, icon: AlertCircle, filterValue: 'needs_attention' as FilterType },
    ];
  }, [ownershipFiltered, t.contractApproval.metrics]);

  const clearFilters = () => {
    setStatusFilter('all');
    setOwnershipFilter('all');
  };

  const onQuickReview = (id: string) => {
    setReviewContractId(id);
    setIsReviewOpen(true);
  };

  const onRequestApprove = (id: string) => {
    setDecisionComment('');
    setDecisionModal({ type: 'approve', id });
  };

  const onRequestReject = (id: string) => {
    setDecisionComment('');
    setDecisionModal({ type: 'reject', id });
  };

  const submitDecision = async () => {
    if (!decisionModal) return;
    const status = decisionModal.type === 'approve' ? 'gm_approved' : 'gm_rejected';
    try {
      await updateStatus(decisionModal.id, status, decisionComment.trim());
      toast.success(status === 'gm_approved' ? t.contractApproval.messages.approved : t.contractApproval.messages.rejected);
      await refreshContracts();
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    } finally {
      setDecisionModal(null);
      setDecisionComment('');
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
    <div className={density === 'compact' ? 'space-y-4' : 'space-y-6'}>
      <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4', density === 'compact' ? 'gap-3' : 'gap-6')}>
        {kpis.map((kpi, index) => (
          <div key={kpi.title} className="animate-slide-up h-full" style={{ animationDelay: `${index * 100}ms` }}>
            <KPICard
              title={kpi.title}
              value={kpi.value}
              icon={kpi.icon}
              onClick={() => setStatusFilter((previous) => (previous === kpi.filterValue ? 'all' : kpi.filterValue))}
              isActive={statusFilter === kpi.filterValue}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t.contractApproval.title}</h1>
          <p className="text-sm text-muted-foreground">{t.contractApproval.description}</p>
        </div>
        {user?.role === 'sales' || user?.role === 'admin' ? (
          <Button onClick={() => navigate('/contract-approvals/new')}>
            <Plus size={14} className="mr-2" />
            {t.contractApproval.newContract}
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <Select value={ownershipFilter} onValueChange={(value) => setOwnershipFilter(value as OwnershipFilter)}>
            <SelectTrigger className={density === 'compact' ? 'h-8' : 'h-9'}>
              <SelectValue placeholder={t.dashboard.ownership} />
            </SelectTrigger>
            <SelectContent className="bg-card border border-border">
              <SelectItem value="all">{t.dashboard.allRequests}</SelectItem>
              <SelectItem value="mine">{t.dashboard.myRequests}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FilterType)}>
            <SelectTrigger className={density === 'compact' ? 'h-8' : 'h-9'}>
              <SelectValue placeholder={t.contractApproval.filters.status} />
            </SelectTrigger>
            <SelectContent className="bg-card border border-border">
              <SelectItem value="all">{t.contractApproval.filters.allStatuses}</SelectItem>
              <SelectItem value="in_progress">{t.contractApproval.metrics?.inProgress ?? 'In Progress'}</SelectItem>
              <SelectItem value="completed_group">{t.contractApproval.metrics?.completed ?? 'Completed'}</SelectItem>
              <SelectItem value="needs_attention">{t.contractApproval.metrics?.needsAttention ?? 'Needs Attention'}</SelectItem>
              {(['draft', 'submitted', 'gm_approved', 'gm_rejected', 'finance_upload', 'completed'] as ContractApprovalStatus[]).map((status) => (
                <SelectItem key={status} value={status}>
                  {t.contractApproval.statuses[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters ? (
            <Button variant="outline" size="sm" onClick={clearFilters} className={cn('text-muted-foreground', density === 'compact' ? 'h-8' : 'h-9')}>
              <Filter size={14} className="mr-2" />
              {t.common.clearFilters}
            </Button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <span>{displayedContracts.length}</span>
          <span>{isSearchMode ? t.common.filtered : t.common.total}</span>
          {isSearchMode ? (
            <span className="text-xs rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
              Search: {globalSearchQuery.trim()}
            </span>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t.common.loading}</div>
      ) : (
        <ContractApprovalsTable
          contracts={displayedContracts}
          userRole={user?.role ?? 'sales'}
          onQuickReview={onQuickReview}
          onView={(id) => navigate(`/contract-approvals/${id}`)}
          onEdit={(id) => navigate(`/contract-approvals/${id}/edit`)}
          onApprove={onRequestApprove}
          onReject={onRequestReject}
          onFinanceUpload={(id) => navigate(`/contract-approvals/${id}/edit`)}
          onComplete={onComplete}
        />
      )}

      <Dialog open={Boolean(decisionModal)} onOpenChange={(open) => !open && setDecisionModal(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>{decisionModal?.type === 'approve' ? t.contractApproval.approve : t.contractApproval.reject}</DialogTitle>
            <DialogDescription>
              {decisionModal?.type === 'approve' ? t.contractApproval.prompts.approveComment : t.contractApproval.prompts.rejectComment}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t.contractApproval.fields.comments}</Label>
            <Textarea
              value={decisionComment}
              onChange={(event) => setDecisionComment(event.target.value)}
              rows={4}
              placeholder={decisionModal?.type === 'approve' ? t.contractApproval.prompts.approveComment : t.contractApproval.prompts.rejectComment}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionModal(null)}>
              {t.common.cancel}
            </Button>
            <Button variant={decisionModal?.type === 'reject' ? 'destructive' : 'default'} onClick={submitDecision}>
              {decisionModal?.type === 'approve' ? t.contractApproval.approve : t.contractApproval.reject}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContractReviewDrawer
        open={isReviewOpen}
        onOpenChange={(next) => {
          setIsReviewOpen(next);
          if (!next) setReviewContractId(null);
        }}
        contractId={reviewContractId}
        userRole={user?.role ?? 'sales'}
        onView={(id) => navigate(`/contract-approvals/${id}`)}
        onEdit={(id) => navigate(`/contract-approvals/${id}/edit`)}
        onApprove={onRequestApprove}
        onReject={onRequestReject}
        onFinanceUpload={(id) => navigate(`/contract-approvals/${id}/edit`)}
        onComplete={onComplete}
      />
    </div>
  );
};

export default ContractApprovals;
