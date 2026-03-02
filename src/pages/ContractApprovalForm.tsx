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
  const [draftFiles, setDraftFiles] = useState<Attachment[]>([]);
  const [stampedFiles, setStampedFiles] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<Array<{ id: string; status: ContractApprovalStatus; timestamp: Date; userName: string; comment?: string }>>([]);
  const [craError, setCraError] = useState('');
  const [isLookingUpCra, setIsLookingUpCra] = useState(false);
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
    if (user?.role === 'admin') return status === 'draft' || status === 'gm_rejected';
    if (user?.role === 'sales') return salesOwnerUserId === user.id && (status === 'draft' || status === 'gm_rejected');
    return false;
  }, [isEditPath, isNew, salesOwnerUserId, status, user]);

  const canFinanceEdit = useMemo(() => {
    if (!isEditPath) return false;
    return user?.role === 'finance' && (status === 'gm_approved' || status === 'finance_upload');
  }, [isEditPath, status, user]);

  const isReadOnly = !canEditDraft && !canFinanceEdit;

  const getAttachmentUrl = (attachment: Attachment) => {
    const url = String(attachment?.url ?? '').trim();
    if (url) return url;
    const idValue = String(attachment?.id ?? '').trim();
    if (!idValue) return '';
    return `/api/attachments/${encodeURIComponent(idValue)}`;
  };

  const openPreview = (attachment: Attachment) => {
    const url = getAttachmentUrl(attachment);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
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
    const comment = window.prompt(t.contractApproval.prompts.approveComment) ?? '';
    try {
      await updateStatus(contractId, 'gm_approved', comment);
      toast.success(t.contractApproval.messages.approved);
      navigate('/contract-approvals');
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const reject = async () => {
    if (!contractId) return;
    const comment = window.prompt(t.contractApproval.prompts.rejectComment) ?? '';
    try {
      await updateStatus(contractId, 'gm_rejected', comment);
      toast.success(t.contractApproval.messages.rejected);
      navigate('/contract-approvals');
    } catch (error: any) {
      toast.error(String(error?.message ?? error));
    }
  };

  const financeUpload = async () => {
    if (!contractId) return;
    try {
      await updateContract(contractId, { stampedContractAttachments: stampedFiles, comments });
      await updateStatus(contractId, 'finance_upload');
      toast.success(t.contractApproval.messages.financeUploaded);
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
    <div className="space-y-4">
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
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.clientName}</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} disabled={!canEditDraft} />
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.craNumber}</Label>
                <div className="flex gap-2">
                  <Input
                    value={craNumber}
                    onChange={(e) => {
                      setCraNumber(e.target.value);
                      setCraError('');
                    }}
                    disabled={!canEditDraft}
                  />
                  {canEditDraft ? (
                    <Button type="button" variant="outline" onClick={handleLookupCra} disabled={isLookingUpCra}>
                      {isLookingUpCra ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
                      {t.contractApproval.lookupCra}
                    </Button>
                  ) : null}
                </div>
                {craError ? <p className="text-xs text-destructive">{craError}</p> : null}
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.contractAmount}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.validity}</Label>
                <Input value={validity} onChange={(e) => setValidity(e.target.value)} disabled={!canEditDraft} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.contractApproval.fields.paymentTerms}</Label>
              <Textarea value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} disabled={!canEditDraft} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{t.contractApproval.fields.comments}</Label>
              <Textarea value={comments} onChange={(e) => setComments(e.target.value)} disabled={isReadOnly && !canFinanceEdit} rows={3} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{t.contractApproval.approvedSnapshotTitle}</h2>
              {craNumber.trim() ? (
                <span className="text-[11px] text-muted-foreground">{t.contractApproval.approvedSnapshotHint}</span>
              ) : null}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.approvedFinalUnitPrice}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={approvedFinalUnitPrice}
                  onChange={(e) => setApprovedFinalUnitPrice(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.approvedCurrency}</Label>
                <Select value={approvedCurrency || 'none'} onValueChange={(value) => setApprovedCurrency(value === 'none' ? '' : (value as 'USD' | 'EUR' | 'RMB'))} disabled={!canEditDraft}>
                  <SelectTrigger>
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
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.approvedGrossMargin}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={approvedGrossMargin}
                  onChange={(e) => setApprovedGrossMargin(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-2">
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
                  <SelectTrigger>
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border">
                    <SelectItem value="none">-</SelectItem>
                    <SelectItem value="with">{t.panels.withVat}</SelectItem>
                    <SelectItem value="without">{t.panels.withoutVat}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.approvedVatRate}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={approvedVatRate}
                  onChange={(e) => setApprovedVatRate(e.target.value)}
                  disabled={!canEditDraft || approvedVatMode !== 'with'}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.approvedIncoterm}</Label>
                <Input value={approvedIncoterm} onChange={(e) => setApprovedIncoterm(e.target.value)} disabled={!canEditDraft} />
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.approvedExpectedDeliveryDate}</Label>
                <Input
                  type="date"
                  value={approvedExpectedDeliveryDate}
                  onChange={(e) => setApprovedExpectedDeliveryDate(e.target.value)}
                  disabled={!canEditDraft}
                />
              </div>
              <div className="space-y-2">
                <Label>{t.contractApproval.fields.approvedWarrantyPeriod}</Label>
                <Input value={approvedWarrantyPeriod} onChange={(e) => setApprovedWarrantyPeriod(e.target.value)} disabled={!canEditDraft} />
              </div>
            </div>
            {approvedSnapshotWarningText ? (
              <p className="text-xs text-amber-500">{approvedSnapshotWarningText}</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="space-y-2">
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
                  className="w-full border-dashed"
                >
                  <Upload size={16} className="mr-2" />
                  {`${t.common.upload} ${t.contractApproval.fields.draftContractFile}`}
                </Button>
              ) : null}
              <div className="space-y-2">
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
                          href={getAttachmentUrl(att)}
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

            <div className="space-y-2">
              <Label>{t.contractApproval.fields.stampedContractFile}</Label>
              {canFinanceEdit ? (
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
                    className="w-full border-dashed"
                  >
                    <Upload size={16} className="mr-2" />
                    {`${t.common.upload} ${t.contractApproval.fields.stampedContractFile}`}
                  </Button>
                </>
              ) : null}
              <div className="space-y-2">
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
                          href={getAttachmentUrl(att)}
                          target="_blank"
                          rel="noreferrer"
                          download={att.filename}
                          className="rounded p-1.5 text-primary hover:bg-primary/20"
                          title={t.request.downloadFile}
                        >
                          <Download size={14} />
                        </a>
                        {canFinanceEdit ? (
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
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">{t.contractApproval.historyTitle}</h2>
              <div className="space-y-2">
                {history.length ? (
                  history
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border p-2 text-sm">
                        <div className="font-medium">{t.contractApproval.statuses[entry.status]}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.userName || '-'} • {new Date(entry.timestamp).toLocaleString()}
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
            <Button variant="outline" onClick={() => navigate('/contract-approvals')}>
              {t.common.back}
            </Button>
            {canEditDraft ? (
              <>
                <Button variant="outline" onClick={saveDraft}>
                  {t.contractApproval.saveDraft}
                </Button>
                <Button onClick={submitContract}>{t.contractApproval.submit}</Button>
              </>
            ) : null}
            {user?.role === 'admin' && status === 'submitted' ? (
              <>
                <Button onClick={approve}>{t.contractApproval.approve}</Button>
                <Button variant="destructive" onClick={reject}>
                  {t.contractApproval.reject}
                </Button>
              </>
            ) : null}
            {canFinanceEdit && status === 'gm_approved' ? (
              <Button onClick={financeUpload}>{t.contractApproval.uploadStamped}</Button>
            ) : null}
            {canFinanceEdit && status === 'finance_upload' ? (
              <Button onClick={complete}>{t.contractApproval.markCompleted}</Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};

export default ContractApprovalForm;
