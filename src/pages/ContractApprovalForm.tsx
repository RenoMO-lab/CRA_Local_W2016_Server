import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useContractApprovals } from '@/context/ContractApprovalContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { Attachment, ContractApprovalStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import ContractStatusBadge from '@/components/contract/ContractStatusBadge';
import AttachmentPreviewDialog from '@/components/shared/AttachmentPreviewDialog';
import { buildAttachmentHref } from '@/lib/attachmentPreview';
import { toast } from 'sonner';
import { Download, Eye, File, Loader2, Upload, X } from 'lucide-react';

const readFilesAsAttachments = async (files: FileList | null): Promise<Attachment[]> => {
  const items = Array.from(files ?? []);
  const out: Attachment[] = [];
  for (const file of items) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
    out.push({
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'other',
      filename: file.name,
      url: base64,
      uploadedAt: new Date(),
      uploadedBy: '',
    });
  }
  return out;
};

const ContractApprovalForm: React.FC = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { getContractByIdAsync, createContract, updateContract, updateStatus } = useContractApprovals();

  const isNew = location.pathname.endsWith('/new');
  const isEditPath = location.pathname.endsWith('/edit');

  const [loading, setLoading] = useState(false);
  const [contractId, setContractId] = useState<string>(id ?? '');
  const [status, setStatus] = useState<ContractApprovalStatus>('draft');
  const [salesOwnerUserId, setSalesOwnerUserId] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [craNumber, setCraNumber] = useState('');
  const [contractAmount, setContractAmount] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [validity, setValidity] = useState('');
  const [approvedFinalUnitPrice, setApprovedFinalUnitPrice] = useState('');
  const [approvedCurrency, setApprovedCurrency] = useState<'USD' | 'EUR' | 'RMB' | ''>('');
  const [approvedGrossMargin, setApprovedGrossMargin] = useState('');
  const [approvedVatMode, setApprovedVatMode] = useState<'with' | 'without' | ''>('');
  const [approvedVatRate, setApprovedVatRate] = useState('');
  const [approvedIncoterm, setApprovedIncoterm] = useState('');
  const [approvedExpectedDeliveryDate, setApprovedExpectedDeliveryDate] = useState('');
  const [approvedWarrantyPeriod, setApprovedWarrantyPeriod] = useState('');
  const [comments, setComments] = useState('');
  const [paymentTermsRows, setPaymentTermsRows] = useState(2);
  const [commentsRows, setCommentsRows] = useState(2);
  const [draftFiles, setDraftFiles] = useState<Attachment[]>([]);
  const [stampedFiles, setStampedFiles] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; status: ContractApprovalStatus; timestamp: Date; userName: string; comment?: string }>>([]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [craError, setCraError] = useState('');
  const [isLookingUpCra, setIsLookingUpCra] = useState(false);
  const [decisionComment, setDecisionComment] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const stampedInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isNew) return;
    if (!id) return;
    let alive = true;
    setLoading(true);
    void getContractByIdAsync(id)
      .then((data) => {
        if (!alive || !data) return;
        setContractId(data.id);
        setStatus(data.status);
        setSalesOwnerUserId(data.salesOwnerUserId);
        setClientName(data.clientName);
        setCraNumber(data.craNumber ?? '');
        setContractAmount(typeof data.contractAmount === 'number' ? String(data.contractAmount) : '');
        setPaymentTerms(data.paymentTerms ?? '');
        setValidity(data.validity ?? '');
        setApprovedFinalUnitPrice(typeof data.approvedFinalUnitPrice === 'number' ? String(data.approvedFinalUnitPrice) : '');
        setApprovedCurrency(data.approvedCurrency === 'USD' || data.approvedCurrency === 'EUR' || data.approvedCurrency === 'RMB' ? data.approvedCurrency : '');
        setApprovedGrossMargin(typeof data.approvedGrossMargin === 'number' ? String(data.approvedGrossMargin) : '');
        setApprovedVatMode(data.approvedVatMode === 'with' || data.approvedVatMode === 'without' ? data.approvedVatMode : '');
        setApprovedVatRate(typeof data.approvedVatRate === 'number' ? String(data.approvedVatRate) : '');
        setApprovedIncoterm(data.approvedIncoterm ?? '');
        setApprovedExpectedDeliveryDate(data.approvedExpectedDeliveryDate ?? '');
        setApprovedWarrantyPeriod(data.approvedWarrantyPeriod ?? '');
        setComments(data.comments ?? '');
        setDraftFiles(Array.isArray(data.draftContractAttachments) ? data.draftContractAttachments : []);
        setStampedFiles(Array.isArray(data.stampedContractAttachments) ? data.stampedContractAttachments : []);
        setHistory(
          Array.isArray(data.history)
            ? data.history.map((entry) => ({
                id: entry.id,
                status: entry.status,
                timestamp: entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp),
                userName: entry.userName,
                comment: entry.comment,
              }))
            : []
        );
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [getContractByIdAsync, id, isNew]);

  const canEditDraft = useMemo(() => {
    if (isNew) return user?.role === 'sales' || user?.role === 'admin';
    if (!isEditPath) return false;
    if (user?.role === 'admin') return status === 'draft' || status === 'finance_rejected' || status === 'gm_rejected';
    if (user?.role === 'sales') {
      return salesOwnerUserId === user.id && (status === 'draft' || status === 'finance_rejected' || status === 'gm_rejected');
    }
    return false;
  }, [isEditPath, isNew, salesOwnerUserId, status, user]);

  const canFinanceReview = useMemo(() => {
    if (!isEditPath) return false;
    return user?.role === 'finance' && status === 'submitted';
  }, [isEditPath, status, user]);

  const canAdminDecision = useMemo(() => {
    if (!isEditPath) return false;
    return user?.role === 'admin' && status === 'finance_approved';
  }, [isEditPath, status, user]);

  const canCashierUpload = useMemo(() => {
    if (!isEditPath) return false;
    return user?.role === 'cashier' && status === 'gm_approved';
  }, [isEditPath, status, user]);

  const canFinanceLegacyEdit = useMemo(() => {
    if (!isEditPath) return false;
    return user?.role === 'finance' && status === 'finance_upload';
  }, [isEditPath, status, user]);

  const canStampedEdit = canCashierUpload || canFinanceLegacyEdit;
  const canCommentEdit = canEditDraft || canStampedEdit || canFinanceReview || canAdminDecision;

  const openPreview = (attachment: Attachment) => {
    setPreviewAttachment(attachment);
    setIsPreviewOpen(true);
  };

  const handleLookupCra = async () => {
    const value = craNumber.trim();
    setCraError('');
    if (!value) return;
    setIsLookingUpCra(true);
    try {
      const res = await fetch(`/api/contracts/cra-prefill/${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) {
        setCraError(String(data?.error ?? t.contractApproval.validation.invalidCra));
        return;
      }
      setClientName(String(data?.clientName ?? ''));
      setContractAmount(typeof data?.contractAmount === 'number' ? String(data.contractAmount) : '');
      setPaymentTerms(String(data?.paymentTerms ?? ''));
      setValidity(String(data?.validity ?? ''));
      setApprovedFinalUnitPrice(typeof data?.approvedFinalUnitPrice === 'number' ? String(data.approvedFinalUnitPrice) : '');
      setApprovedCurrency(data?.approvedCurrency === 'USD' || data?.approvedCurrency === 'EUR' || data?.approvedCurrency === 'RMB' ? data.approvedCurrency : '');
      setApprovedGrossMargin(typeof data?.approvedGrossMargin === 'number' ? String(data.approvedGrossMargin) : '');
      setApprovedVatMode(data?.approvedVatMode === 'with' || data?.approvedVatMode === 'without' ? data.approvedVatMode : '');
      setApprovedVatRate(typeof data?.approvedVatRate === 'number' ? String(data.approvedVatRate) : '');
      setApprovedIncoterm(String(data?.approvedIncoterm ?? ''));
      setApprovedExpectedDeliveryDate(String(data?.approvedExpectedDeliveryDate ?? ''));
      setApprovedWarrantyPeriod(String(data?.approvedWarrantyPeriod ?? ''));
      setCraError('');
      toast.success(t.contractApproval.messages.prefillApprovedSnapshotApplied || t.contractApproval.messages.prefillApplied);
    } catch (error: any) {
      setCraError(String(error?.message ?? t.contractApproval.validation.invalidCra));
    } finally {
      setIsLookingUpCra(false);
    }
  };

  const handleDraftUpload = async (files: FileList | null) => {
    const parsed = await readFilesAsAttachments(files);
    if (parsed.length > 0) {
      setDraftFiles((prev) => [...prev, ...parsed]);
    }
    if (draftInputRef.current) draftInputRef.current.value = '';
  };

  const handleStampedUpload = async (files: FileList | null) => {
    const parsed = await readFilesAsAttachments(files);
    if (parsed.length > 0) {
      setStampedFiles((prev) => [...prev, ...parsed]);
    }
    if (stampedInputRef.current) stampedInputRef.current.value = '';
  };

  const removeDraftAttachment = (idValue: string) => {
    setDraftFiles((prev) => prev.filter((item) => item.id !== idValue));
  };

  const removeStampedAttachment = (idValue: string) => {
    setStampedFiles((prev) => prev.filter((item) => item.id !== idValue));
  };

  const buildPayload = () => ({
    clientName,
    craNumber,
    contractAmount: contractAmount.trim() ? Number.parseFloat(contractAmount) : null,
    paymentTerms,
    validity,
    approvedFinalUnitPrice: approvedFinalUnitPrice.trim() ? Number.parseFloat(approvedFinalUnitPrice) : null,
    approvedCurrency,
    approvedGrossMargin: approvedGrossMargin.trim() ? Number.parseFloat(approvedGrossMargin) : null,
    approvedVatMode,
    approvedVatRate: approvedVatRate.trim() ? Number.parseFloat(approvedVatRate) : null,
    approvedIncoterm,
    approvedExpectedDeliveryDate,
    approvedWarrantyPeriod,
    comments,
    draftContractAttachments: draftFiles,
    stampedContractAttachments: stampedFiles,
  });

  const approvedSnapshotMissing = useMemo(() => {
    if (!craNumber.trim()) return [];
    const missing: string[] = [];
    if (!approvedFinalUnitPrice.trim()) missing.push(String(t.contractApproval.fields.approvedFinalUnitPrice));
    if (!approvedCurrency.trim()) missing.push(String(t.contractApproval.fields.approvedCurrency));
    if (!approvedGrossMargin.trim()) missing.push(String(t.contractApproval.fields.approvedGrossMargin));
    if (!approvedVatMode.trim()) missing.push(String(t.contractApproval.fields.approvedVatMode));
    if (approvedVatMode === 'with' && !approvedVatRate.trim()) missing.push(String(t.contractApproval.fields.approvedVatRate));
    if (!approvedIncoterm.trim()) missing.push(String(t.contractApproval.fields.approvedIncoterm));
    if (!approvedExpectedDeliveryDate.trim()) missing.push(String(t.contractApproval.fields.approvedExpectedDeliveryDate));
    if (!approvedWarrantyPeriod.trim()) missing.push(String(t.contractApproval.fields.approvedWarrantyPeriod));
    return missing;
  }, [
    craNumber,
    approvedFinalUnitPrice,
    approvedCurrency,
    approvedGrossMargin,
    approvedVatMode,
    approvedVatRate,
    approvedIncoterm,
    approvedExpectedDeliveryDate,
    approvedWarrantyPeriod,
    t.contractApproval.fields.approvedCurrency,
    t.contractApproval.fields.approvedExpectedDeliveryDate,
    t.contractApproval.fields.approvedFinalUnitPrice,
    t.contractApproval.fields.approvedGrossMargin,
    t.contractApproval.fields.approvedIncoterm,
    t.contractApproval.fields.approvedVatMode,
    t.contractApproval.fields.approvedVatRate,
    t.contractApproval.fields.approvedWarrantyPeriod,
  ]);

  const approvedSnapshotWarningText = useMemo(() => {
    if (!approvedSnapshotMissing.length) return '';
    return String(t.contractApproval.validation.approvedSnapshotMissing ?? '')
      .replace('{fields}', approvedSnapshotMissing.join(', '));
  }, [approvedSnapshotMissing, t.contractApproval.validation.approvedSnapshotMissing]);

  const getCompactTextareaRows = (value: string) => {
    const text = String(value ?? '');
    if (text.includes('\n')) return 4;
    if (text.length > 120) return 4;
    return 2;
  };

  const saveDraft = async () => {
    try {
      if (isNew) {
        const created = await createContract({
          ...buildPayload(),
          status: 'draft',
        });
        toast.success(t.contractApproval.messages.saved);
        navigate(`/contract-approvals/${created.id}/edit`, { replace: true });
      } else if (contractId) {
        await updateContract(contractId, buildPayload());
        toast.success(t.contractApproval.messages.saved);
      }
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const submitContract = async () => {
    if (craNumber.trim() && craError) {
      toast.error(craError);
      return;
    }
    if (!clientName.trim()) {
      toast.error(`${t.contractApproval.fields.clientName} ${t.common.required.toLowerCase()}`);
      return;
    }
    if (!contractAmount.trim() || Number.isNaN(Number.parseFloat(contractAmount))) {
      toast.error(`${t.contractApproval.fields.contractAmount} ${t.common.required.toLowerCase()}`);
      return;
    }
    if (!paymentTerms.trim()) {
      toast.error(`${t.contractApproval.fields.paymentTerms} ${t.common.required.toLowerCase()}`);
      return;
    }
    if (!validity.trim()) {
      toast.error(`${t.contractApproval.fields.validity} ${t.common.required.toLowerCase()}`);
      return;
    }
    if (!draftFiles.length) {
      toast.error(t.contractApproval.validation.draftRequired);
      return;
    }
    if (approvedSnapshotWarningText) {
      toast.warning(approvedSnapshotWarningText);
    }
    try {
      if (isNew) {
        const created = await createContract({
          ...buildPayload(),
          status: 'submitted',
        });
        toast.success(t.contractApproval.messages.submitted);
        navigate(`/contract-approvals/${created.id}`, { replace: true });
        return;
      }
      if (!contractId) return;
      await updateContract(contractId, buildPayload());
      await updateStatus(contractId, 'submitted');
      toast.success(t.contractApproval.messages.submitted);
      navigate(`/contract-approvals/${contractId}`, { replace: true });
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const approve = async () => {
    if (!contractId) return;
    let nextStatus: ContractApprovalStatus | null = null;
    if (status === 'submitted') nextStatus = 'finance_approved';
    if (status === 'finance_approved') nextStatus = 'gm_approved';

    if (!nextStatus) {
      toast.error(t.contractApproval.validation.invalidDecisionState);
      return false;
    }

    try {
      await updateStatus(contractId, nextStatus, decisionComment.trim());
      if (nextStatus === 'finance_approved') toast.success(t.contractApproval.messages.reviewed ?? t.contractApproval.messages.financeApproved);
      else toast.success(t.contractApproval.messages.approved);
      setDecisionComment('');
      setDecisionError('');
      navigate('/contract-approvals');
      return true;
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
      return false;
    }
  };

  const reject = async () => {
    if (!contractId) return;
    const trimmedComment = decisionComment.trim();
    if (!trimmedComment) {
      setDecisionError(t.contractApproval.validation.rejectCommentRequired);
      return false;
    }

    let nextStatus: ContractApprovalStatus | null = null;
    if (status === 'submitted') nextStatus = 'finance_rejected';
    if (status === 'finance_approved') nextStatus = 'gm_rejected';

    if (!nextStatus) {
      toast.error(t.contractApproval.validation.invalidDecisionState);
      return false;
    }

    try {
      await updateStatus(contractId, nextStatus, trimmedComment);
      if (nextStatus === 'finance_rejected') toast.success(t.contractApproval.messages.financeRejected);
      else toast.success(t.contractApproval.messages.rejected);
      setDecisionComment('');
      setDecisionError('');
      navigate('/contract-approvals');
      return true;
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
      return false;
    }
  };

  const financeUpload = async () => {
    if (!contractId) return;
    if (!stampedFiles.length) {
      toast.error(t.contractApproval.validation.stampedRequired);
      return;
    }
    try {
      await updateContract(contractId, { stampedContractAttachments: stampedFiles, comments });
      toast.success(t.contractApproval.messages.cashierCompleted ?? t.contractApproval.messages.completed);
      navigate(`/contract-approvals/${contractId}`);
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const complete = async () => {
    if (!contractId) return;
    try {
      await updateContract(contractId, { stampedContractAttachments: stampedFiles, comments });
      await updateStatus(contractId, 'completed');
      toast.success(t.contractApproval.messages.completed);
      navigate('/contract-approvals');
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {isNew ? t.contractApproval.newContract : `${t.contractApproval.title} ${contractId || ''}`}
          </h1>
          <p className="text-sm text-muted-foreground">{t.contractApproval.description}</p>
        </div>
        {!isNew ? <ContractStatusBadge status={status} /> : null}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">{t.common.loading}</div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
              <div className="space-y-1.5 xl:col-span-3">
                <Label>{t.contractApproval.fields.clientName}</Label>
                <Input className="h-9" value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={!canEditDraft} />
              </div>
              <div className="space-y-1.5 xl:col-span-4">
                <Label>{t.contractApproval.fields.craNumber}</Label>
                <div className="flex gap-2">
                  <Input
                    className="h-9"
                    value={craNumber}
                    onChange={(e) => {
                      setCraNumber(e.target.value);
                      setCraError('');
                    }}
                    disabled={!canEditDraft}
                  />
                  {canEditDraft ? (
                    <Button type="button" variant="outline" onClick={handleLookupCra} disabled={isLookingUpCra} className="h-9 px-3">
                      {isLookingUpCra ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
                      {t.contractApproval.lookupCra}
                    </Button>
                  ) : null}
                </div>
                {craError ? <p className="text-xs text-destructive">{craError}</p> : null}
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>{t.contractApproval.fields.contractAmount}</Label>
                <Input
                  className="h-9 max-w-[10rem]"
                  type="number"
                  step="0.01"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-1.5 xl:col-span-1">
                <Label>{t.contractApproval.fields.validity}</Label>
                <Input className="h-9 max-w-[7rem]" value={validity} onChange={(e) => setValidity(e.target.value)} disabled={!canEditDraft} />
              </div>
              <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
              <Label>{t.contractApproval.fields.paymentTerms}</Label>
                <Textarea
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  onFocus={() => setPaymentTermsRows(4)}
                  onBlur={() => setPaymentTermsRows(getCompactTextareaRows(paymentTerms))}
                  disabled={!canEditDraft}
                  rows={paymentTermsRows}
                  className="min-h-[4.5rem]"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2 xl:col-span-12">
                <Label>{t.contractApproval.fields.comments}</Label>
                <Textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  onFocus={() => setCommentsRows(4)}
                  onBlur={() => setCommentsRows(getCompactTextareaRows(comments))}
                  disabled={!canCommentEdit}
                  rows={commentsRows}
                  className="min-h-[4.5rem]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t.contractApproval.approvedSnapshotTitle}</h2>
              {craNumber.trim() ? (
                <span className="text-[11px] text-muted-foreground">{t.contractApproval.approvedSnapshotHint}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3">
              <div className="space-y-1.5 xl:col-span-2">
                <Label>{t.contractApproval.fields.approvedFinalUnitPrice}</Label>
                <Input
                  className="h-9"
                  type="number"
                  step="0.01"
                  value={approvedFinalUnitPrice}
                  onChange={(e) => setApprovedFinalUnitPrice(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-1.5 xl:col-span-1">
                <Label>{t.contractApproval.fields.approvedCurrency}</Label>
                <Select value={approvedCurrency || 'none'} onValueChange={(value) => setApprovedCurrency(value === 'none' ? '' : (value as 'USD' | 'EUR' | 'RMB'))} disabled={!canEditDraft}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border">
                    <SelectItem value="none">-</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="RMB">RMB</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>{t.contractApproval.fields.approvedGrossMargin}</Label>
                <Input
                  className="h-9 max-w-[8rem]"
                  type="number"
                  step="0.01"
                  value={approvedGrossMargin}
                  onChange={(e) => setApprovedGrossMargin(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>{t.contractApproval.fields.approvedVatMode}</Label>
                <Select
                  value={approvedVatMode || 'none'}
                  onValueChange={(value) => {
                    const normalized = value === 'none' ? '' : (value as 'with' | 'without');
                    setApprovedVatMode(normalized);
                    if (normalized !== 'with') setApprovedVatRate('');
                  }}
                  disabled={!canEditDraft}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border">
                    <SelectItem value="none">-</SelectItem>
                    <SelectItem value="with">{t.panels.withVat}</SelectItem>
                    <SelectItem value="without">{t.panels.withoutVat}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 xl:col-span-1">
                <Label>{t.contractApproval.fields.approvedVatRate}</Label>
                <Input
                  className="h-9 max-w-[8rem]"
                  type="number"
                  step="0.01"
                  value={approvedVatRate}
                  onChange={(e) => setApprovedVatRate(e.target.value)}
                  disabled={!canEditDraft || approvedVatMode !== 'with'}
                />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>{t.contractApproval.fields.approvedIncoterm}</Label>
                <Input className="h-9" value={approvedIncoterm} onChange={(e) => setApprovedIncoterm(e.target.value)} disabled={!canEditDraft} />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>{t.contractApproval.fields.approvedExpectedDeliveryDate}</Label>
                <Input
                  className="h-9"
                  type="date"
                  value={approvedExpectedDeliveryDate}
                  onChange={(e) => setApprovedExpectedDeliveryDate(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-1.5 xl:col-span-2">
                <Label>{t.contractApproval.fields.approvedWarrantyPeriod}</Label>
                <Input className="h-9 max-w-[10rem]" value={approvedWarrantyPeriod} onChange={(e) => setApprovedWarrantyPeriod(e.target.value)} disabled={!canEditDraft} />
              </div>
            </div>
            {approvedSnapshotWarningText ? (
              <p className="text-xs text-amber-500">{approvedSnapshotWarningText}</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
            <div className="space-y-1.5">
              <Label>{t.contractApproval.fields.draftContractFile}</Label>
              <input
                ref={draftInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  void handleDraftUpload(event.target.files);
                }}
                disabled={!canEditDraft}
              />
              {canEditDraft ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => draftInputRef.current?.click()}
                  className="w-full h-9 border-dashed py-1.5"
                >
                  <Upload size={16} className="mr-2" />
                  {`${t.common.upload} ${t.contractApproval.fields.draftContractFile}`}
                </Button>
              ) : null}
              <div className="space-y-2 max-h-[9rem] overflow-y-auto pr-1">
                {draftFiles.length ? (
                  draftFiles.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <File size={16} className="text-primary" />
                        <span className="text-sm truncate">{att.filename}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openPreview(att)}
                          className="rounded p-1.5 text-primary hover:bg-primary/20"
                          title={t.table.view}
                        >
                          <Eye size={14} />
                        </button>
                        <a
                          href={buildAttachmentHref(att)}
                          target="_blank"
                          rel="noreferrer"
                          download={att.filename}
                          className="rounded p-1.5 text-primary hover:bg-primary/20"
                          title={t.request.downloadFile}
                        >
                          <Download size={14} />
                        </a>
                        {canEditDraft ? (
                          <button
                            type="button"
                            onClick={() => removeDraftAttachment(att.id)}
                            className="rounded p-1.5 text-destructive hover:bg-destructive/20"
                            title={t.common.delete}
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t.contractApproval.fields.stampedContractFile}</Label>
              {canStampedEdit ? (
                <>
                  <input
                    ref={stampedInputRef}
                  type="file"
                  accept="application/pdf"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void handleStampedUpload(event.target.files);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => stampedInputRef.current?.click()}
                    className="w-full h-9 border-dashed py-1.5"
                  >
                    <Upload size={16} className="mr-2" />
                    {`${t.common.upload} ${t.contractApproval.fields.stampedContractFile}`}
                  </Button>
                </>
              ) : null}
              <div className="space-y-2 max-h-[9rem] overflow-y-auto pr-1">
                {stampedFiles.length ? (
                  stampedFiles.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <File size={16} className="text-primary" />
                        <span className="text-sm truncate">{att.filename}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openPreview(att)}
                          className="rounded p-1.5 text-primary hover:bg-primary/20"
                          title={t.table.view}
                        >
                          <Eye size={14} />
                        </button>
                        <a
                          href={buildAttachmentHref(att)}
                          target="_blank"
                          rel="noreferrer"
                          download={att.filename}
                          className="rounded p-1.5 text-primary hover:bg-primary/20"
                          title={t.request.downloadFile}
                        >
                          <Download size={14} />
                        </a>
                        {canStampedEdit ? (
                          <button
                            type="button"
                            onClick={() => removeStampedAttachment(att.id)}
                            className="rounded p-1.5 text-destructive hover:bg-destructive/20"
                            title={t.common.delete}
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>
          </div>

          {!isNew ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <h2 className="text-sm font-semibold text-foreground mb-2">{t.contractApproval.historyTitle}</h2>
              <div className="space-y-2 max-h-[10rem] overflow-y-auto pr-1">
                {history.length ? (
                  history
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border p-2 text-sm">
                        <div className="font-medium">{t.contractApproval.statuses[entry.status]}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.userName || '-'} - {new Date(entry.timestamp).toLocaleString()}
                        </div>
                        {entry.comment ? <div className="mt-1">{entry.comment}</div> : null}
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate('/contract-approvals')}>
              {t.common.back}
            </Button>
            {canEditDraft ? (
              <>
                <Button size="sm" variant="outline" onClick={saveDraft}>
                  {t.contractApproval.saveDraft}
                </Button>
                <Button size="sm" onClick={submitContract}>{t.contractApproval.submit}</Button>
              </>
            ) : null}
            {canFinanceReview || canAdminDecision ? (
              <div className="w-full space-y-2">
                <Label>{t.contractApproval.fields.comments}</Label>
                <Textarea
                  value={decisionComment}
                  onChange={(event) => {
                    setDecisionComment(event.target.value);
                    if (decisionError) setDecisionError('');
                  }}
                  rows={3}
                  placeholder={
                    canFinanceReview
                      ? (t.contractApproval.prompts.reviewComment ?? t.contractApproval.prompts.approveComment)
                      : t.contractApproval.prompts.approveComment
                  }
                />
                {decisionError ? <p className="text-xs text-destructive">{decisionError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={approve}>
                    {canFinanceReview ? (t.contractApproval.reviewAction ?? t.contractApproval.approve) : t.contractApproval.approve}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={reject}>
                    {t.contractApproval.reject}
                  </Button>
                </div>
              </div>
            ) : null}
            {canCashierUpload && status === 'gm_approved' ? (
              <Button size="sm" onClick={financeUpload}>{t.contractApproval.uploadStamped}</Button>
            ) : null}
            {canFinanceLegacyEdit && status === 'finance_upload' ? (
              <Button size="sm" onClick={complete}>{t.contractApproval.markCompleted}</Button>
            ) : null}
          </div>
        </>
      )}
      <AttachmentPreviewDialog
        open={isPreviewOpen}
        onOpenChange={(next) => {
          setIsPreviewOpen(next);
          if (!next) setPreviewAttachment(null);
        }}
        attachment={previewAttachment}
      />
    </div>
  );
};

export default ContractApprovalForm;
