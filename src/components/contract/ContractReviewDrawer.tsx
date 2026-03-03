import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle, Download, Edit, ExternalLink, Eye, FileText, RefreshCw, Upload } from 'lucide-react';

import { useContractApprovals } from '@/context/ContractApprovalContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Attachment, ContractApproval, UserRole } from '@/types';
import { cn } from '@/lib/utils';
import { buildAttachmentHref } from '@/lib/attachmentPreview';
import ContractStatusBadge from '@/components/contract/ContractStatusBadge';
import AttachmentPreviewDialog from '@/components/shared/AttachmentPreviewDialog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string | null;
  userRole: UserRole;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onFinanceUpload: (id: string) => void;
  onComplete: (id: string) => void;
};

const MIN_SPINNER_MS = 450;

const sleepMs = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const ensureMinSpinnerMs = async (startedAtMs: number, minMs = MIN_SPINNER_MS) => {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < minMs) await sleepMs(minMs - elapsed);
};

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'yyyy-MM-dd HH:mm');
};

const formatDate = (value?: Date | string | null) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'yyyy-MM-dd');
};

const formatAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number') return '-';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ContractReviewDrawer: React.FC<Props> = ({
  open,
  onOpenChange,
  contractId,
  userRole,
  onView,
  onEdit,
  onApprove,
  onReject,
  onFinanceUpload,
  onComplete,
}) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { getContractById, getContractByIdAsync } = useContractApprovals();

  const [contract, setContract] = useState<ContractApproval | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const latestContractIdRef = useRef<string | null>(null);

  const load = async (id: string) => {
    latestContractIdRef.current = id;
    const startedAt = Date.now();
    setIsLoading(true);
    setLoadError(null);
    try {
      const full = await getContractByIdAsync(id);
      if (latestContractIdRef.current !== id) return;
      setContract(full ?? null);
      if (!full) setLoadError(t.contractApproval.review?.loadFailed ?? t.dashboard.reviewLoadFailed);
    } catch {
      if (latestContractIdRef.current !== id) return;
      setLoadError(t.contractApproval.review?.loadFailed ?? t.dashboard.reviewLoadFailed);
    } finally {
      if (latestContractIdRef.current !== id) return;
      await ensureMinSpinnerMs(startedAt);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !contractId) return;
    const existing = getContractById(contractId);
    setContract(existing ?? null);
    void load(contractId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contractId]);

  useEffect(() => {
    if (open) return;
    setContract(null);
    setIsLoading(false);
    setLoadError(null);
    latestContractIdRef.current = null;
  }, [open]);

  const canEdit = useMemo(() => {
    if (!contract) return false;
    if (userRole === 'admin') return contract.status === 'draft' || contract.status === 'finance_rejected' || contract.status === 'gm_rejected';
    if (userRole === 'sales') {
      return contract.salesOwnerUserId === user?.id && (contract.status === 'draft' || contract.status === 'finance_rejected' || contract.status === 'gm_rejected');
    }
    return false;
  }, [contract, user?.id, userRole]);

  const canFinanceDecision = userRole === 'finance' && contract?.status === 'submitted';
  const canAdminDecision = userRole === 'admin' && contract?.status === 'finance_approved';
  const canCashierUpload = userRole === 'cashier' && contract?.status === 'gm_approved';
  const canMarkCompleted = userRole === 'finance' && contract?.status === 'finance_upload';
  const primaryActionBtnClass = 'h-11 min-w-40 justify-center';

  const headerSubtitle = useMemo(() => {
    if (!contract) return '';
    const client = contract.clientName?.trim() ? contract.clientName : '-';
    const cra = contract.craNumber?.trim() ? contract.craNumber : '-';
    return `${client} - ${cra}`;
  }, [contract]);

  const history = useMemo(() => {
    if (!contract?.history?.length) return [];
    return [...contract.history].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  }, [contract]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto scrollbar-thin">
        <SheetHeader className="pr-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="flex items-baseline gap-3 min-w-0">
                <span className="truncate">{contractId || t.common.loading}</span>
                {contract?.status ? (
                  <span className="shrink-0">
                    <ContractStatusBadge status={contract.status} />
                  </span>
                ) : null}
              </SheetTitle>
              <SheetDescription className="mt-1">{headerSubtitle}</SheetDescription>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs text-muted-foreground">{t.contractApproval.review?.updatedLabel ?? t.dashboard.reviewUpdatedLabel}</div>
              <div className="text-sm font-medium text-foreground">{contract?.updatedAt ? formatDateTime(contract.updatedAt) : '-'}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => contractId && onView(contractId)} disabled={!contractId} className={primaryActionBtnClass}>
              <ExternalLink size={16} className="mr-2" />
              {t.contractApproval.review?.openContract ?? t.dashboard.reviewOpenRequest}
            </Button>
            {canEdit ? (
              <Button variant="outline" onClick={() => contractId && onEdit(contractId)} disabled={!contractId}>
                <Edit size={16} className="mr-2" />
                {t.table.edit}
              </Button>
            ) : null}
            {canFinanceDecision || canAdminDecision ? (
              <>
                <Button onClick={() => contractId && onApprove(contractId)} disabled={!contractId} className={primaryActionBtnClass}>
                  {t.contractApproval.approve}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => contractId && onReject(contractId)}
                  disabled={!contractId}
                  className={primaryActionBtnClass}
                >
                  {t.contractApproval.reject}
                </Button>
              </>
            ) : null}
            {canCashierUpload ? (
              <Button onClick={() => contractId && onFinanceUpload(contractId)} disabled={!contractId} className={primaryActionBtnClass}>
                <Upload size={16} className="mr-2" />
                {t.contractApproval.uploadStamped}
              </Button>
            ) : null}
            {canMarkCompleted ? (
              <Button onClick={() => contractId && onComplete(contractId)} disabled={!contractId} className={primaryActionBtnClass}>
                <CheckCircle size={16} className="mr-2" />
                {t.contractApproval.markCompleted}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => contractId && load(contractId)} disabled={!contractId || isLoading} className="text-muted-foreground">
              <span className={cn('mr-2 inline-flex', isLoading ? 'animate-spin' : '')}>
                <RefreshCw size={16} />
              </span>
              {t.common.update}
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">{t.contractApproval.review?.detailsTitle ?? t.dashboard.reviewDetailsTitle}</div>
              {loadError ? <div className="text-xs text-destructive">{loadError}</div> : null}
            </div>

            {isLoading && !contract ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.clientName}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.clientName || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.craNumber}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.craNumber || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.table.salesOwner}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.salesOwnerName || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.contractAmount}</div>
                    <div className="text-sm font-medium text-right text-foreground">{formatAmount(contract?.contractAmount)}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.paymentTerms}</div>
                    <div className="text-sm font-medium text-right text-foreground whitespace-pre-wrap">{contract?.paymentTerms || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.validity}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.validity || '-'}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedFinalUnitPrice}</div>
                    <div className="text-sm font-medium text-right text-foreground">{formatAmount(contract?.approvedFinalUnitPrice)}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedCurrency}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.approvedCurrency || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedGrossMargin}</div>
                    <div className="text-sm font-medium text-right text-foreground">
                      {typeof contract?.approvedGrossMargin === 'number'
                        ? contract.approvedGrossMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '-'}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedVatMode}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.approvedVatMode || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedVatRate}</div>
                    <div className="text-sm font-medium text-right text-foreground">
                      {typeof contract?.approvedVatRate === 'number'
                        ? contract.approvedVatRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '-'}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedIncoterm}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.approvedIncoterm || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedExpectedDeliveryDate}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.approvedExpectedDeliveryDate || '-'}</div>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">{t.contractApproval.fields.approvedWarrantyPeriod}</div>
                    <div className="text-sm font-medium text-right text-foreground">{contract?.approvedWarrantyPeriod || '-'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="text-sm font-semibold text-foreground">{t.contractApproval.fields.draftContractFile}</div>
            {contract?.draftContractAttachments?.length ? (
              contract.draftContractAttachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={16} className="text-primary" />
                    <span className="truncate text-sm">{attachment.filename}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded p-1.5 text-primary hover:bg-primary/20"
                      onClick={() => {
                        setPreviewAttachment(attachment);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <Eye size={14} />
                    </button>
                    <a
                      href={buildAttachmentHref(attachment)}
                      target="_blank"
                      rel="noreferrer"
                      download={attachment.filename}
                      className="rounded p-1.5 text-primary hover:bg-primary/20"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="text-sm font-semibold text-foreground">{t.contractApproval.fields.stampedContractFile}</div>
            {contract?.stampedContractAttachments?.length ? (
              contract.stampedContractAttachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={16} className="text-primary" />
                    <span className="truncate text-sm">{attachment.filename}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded p-1.5 text-primary hover:bg-primary/20"
                      onClick={() => {
                        setPreviewAttachment(attachment);
                        setIsPreviewOpen(true);
                      }}
                    >
                      <Eye size={14} />
                    </button>
                    <a
                      href={buildAttachmentHref(attachment)}
                      target="_blank"
                      rel="noreferrer"
                      download={attachment.filename}
                      className="rounded p-1.5 text-primary hover:bg-primary/20"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="text-sm font-semibold text-foreground mb-3">{t.contractApproval.review?.activityTitle ?? t.dashboard.reviewActivityTitle}</div>
            {history.length ? (
              <div className="space-y-3">
                {history.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border bg-card px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{t.contractApproval.statuses[entry.status]}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(entry.timestamp)}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{entry.userName || '-'}</div>
                    {entry.comment ? <div className="text-sm mt-1 whitespace-pre-wrap">{entry.comment}</div> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.contractApproval.review?.noActivity ?? t.dashboard.reviewNoActivity}</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{t.contractApproval.table.submissionDate}</span>
                <span className="text-sm">{formatDate(contract?.submittedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{t.contractApproval.table.lastUpdated}</span>
                <span className="text-sm">{formatDate(contract?.updatedAt)}</span>
              </div>
            </div>
          </div>
          <AttachmentPreviewDialog
            open={isPreviewOpen}
            onOpenChange={(next) => {
              setIsPreviewOpen(next);
              if (!next) setPreviewAttachment(null);
            }}
            attachment={previewAttachment}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContractReviewDrawer;
