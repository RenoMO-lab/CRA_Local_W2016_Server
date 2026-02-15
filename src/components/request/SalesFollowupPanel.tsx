import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Attachment, CustomerRequest, RequestStatus, SalesPaymentTerm } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { DollarSign, CheckCircle, Loader2, Upload, File, Eye, Download, X, ShieldCheck } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type SalesFollowupData = {
  salesFinalPrice?: number;
  salesCurrency?: 'USD' | 'EUR' | 'RMB';
  salesIncoterm?: string;
  salesIncotermOther?: string;
  salesVatMode?: 'with' | 'without';
  salesVatRate?: number | null;
  salesMargin?: number | null;
  salesWarrantyPeriod?: string;
  salesExpectedDeliveryDate?: string;
  salesPaymentTermCount?: number;
  salesPaymentTerms?: SalesPaymentTerm[];
  salesFeedbackComment?: string;
  salesAttachments?: Attachment[];
};

const MAX_PAYMENT_TERMS = 6;

const createPaymentTerm = (paymentNumber: number): SalesPaymentTerm => ({
  paymentNumber,
  paymentName: '',
  paymentPercent: null,
  comments: '',
});

const normalizePaymentTermsForEditor = (
  rawTerms: SalesPaymentTerm[] | undefined,
  rawCount: number | undefined
): { count: number; terms: SalesPaymentTerm[] } => {
  const source = Array.isArray(rawTerms) ? rawTerms : [];
  const baseCount = Number.isFinite(rawCount as number) ? Number(rawCount) : source.length || 1;
  const count = Math.min(MAX_PAYMENT_TERMS, Math.max(1, baseCount));
  const terms = Array.from({ length: count }, (_v, index) => {
    const raw = source[index] ?? createPaymentTerm(index + 1);
    return {
      paymentNumber: index + 1,
      paymentName: typeof raw.paymentName === 'string' ? raw.paymentName : '',
      paymentPercent: typeof raw.paymentPercent === 'number' ? raw.paymentPercent : null,
      comments: typeof raw.comments === 'string' ? raw.comments : '',
    };
  });
  return { count, terms };
};

interface SalesFollowupPanelProps {
  request: CustomerRequest;
  onUpdateStatus: (status: RequestStatus, comment?: string) => void | Promise<void>;
  onUpdateSalesData: (data: SalesFollowupData) => void | Promise<void>;
  onSaveEdits?: (data: SalesFollowupData) => void | Promise<void>;
  isUpdating: boolean;
  readOnly?: boolean;
  forceEnableActions?: boolean;
  isAdmin?: boolean;
  isSales?: boolean;
  editMode?: boolean;
}

const SalesFollowupPanel: React.FC<SalesFollowupPanelProps> = ({
  request,
  onUpdateStatus,
  onUpdateSalesData,
  onSaveEdits,
  isUpdating,
  readOnly = false,
  forceEnableActions = false,
  isAdmin = false,
  isSales = false,
  editMode = false,
}) => {
  const { t } = useLanguage();
  const initialPaymentTermState = normalizePaymentTermsForEditor(
    Array.isArray(request.salesPaymentTerms) ? request.salesPaymentTerms : [],
    request.salesPaymentTermCount
  );
  const [salesFinalPrice, setSalesFinalPrice] = useState<string>(
    request.salesFinalPrice?.toString() || ''
  );
  const [salesCurrency, setSalesCurrency] = useState<'USD' | 'EUR' | 'RMB'>(
    request.salesCurrency || 'EUR'
  );
  const [salesIncoterm, setSalesIncoterm] = useState<string>(request.salesIncoterm || '');
  const [salesIncotermOther, setSalesIncotermOther] = useState<string>(request.salesIncotermOther || '');
  const [salesVatMode, setSalesVatMode] = useState<'with' | 'without'>(request.salesVatMode || 'without');
  const [salesVatRate, setSalesVatRate] = useState<string>(
    typeof request.salesVatRate === 'number' ? request.salesVatRate.toString() : ''
  );
  const [salesMargin, setSalesMargin] = useState<string>(
    typeof request.salesMargin === 'number' ? request.salesMargin.toString() : ''
  );
  const [salesWarrantyPeriod, setSalesWarrantyPeriod] = useState<string>(
    request.salesWarrantyPeriod || ''
  );
  const [salesExpectedDeliveryDate, setSalesExpectedDeliveryDate] = useState<string>(
    request.salesExpectedDeliveryDate || ''
  );
  const [salesPaymentTermCount, setSalesPaymentTermCount] = useState<number>(initialPaymentTermState.count);
  const [salesPaymentTerms, setSalesPaymentTerms] = useState<SalesPaymentTerm[]>(initialPaymentTermState.terms);
  const [salesFeedbackComment, setSalesFeedbackComment] = useState<string>(
    request.salesFeedbackComment || ''
  );
  const [salesAttachments, setSalesAttachments] = useState<Attachment[]>(
    Array.isArray(request.salesAttachments) ? request.salesAttachments : []
  );
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const getActivePaymentTerms = () =>
    Array.from({ length: salesPaymentTermCount }, (_v, index) => {
      const term = salesPaymentTerms[index] ?? createPaymentTerm(index + 1);
      return {
        paymentNumber: index + 1,
        paymentName: term.paymentName ?? '',
        paymentPercent: typeof term.paymentPercent === 'number' ? term.paymentPercent : null,
        comments: term.comments ?? '',
      };
    });

  const openPreview = (attachment: Attachment) => {
    setPreviewAttachment(attachment);
    setIsPreviewOpen(true);
  };

  useEffect(() => {
    if (isPreviewOpen || !previewAttachment) return undefined;
    const timeout = window.setTimeout(() => setPreviewAttachment(null), 200);
    return () => window.clearTimeout(timeout);
  }, [isPreviewOpen, previewAttachment]);

  const isImageFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '');
  };

  const isPdfFile = (filename: string) => filename.toLowerCase().endsWith('.pdf');

  const getPreviewUrl = (attachment: Attachment | null) => {
    const url = attachment?.url ?? '';
    if (!url) return '';
    if (
      url.startsWith('data:') ||
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('blob:') ||
      url.startsWith('/')
    ) {
      return url;
    }

    const ext = attachment?.filename?.split('.').pop()?.toLowerCase() ?? '';
    const imageTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
    };

    if (ext === 'pdf') {
      return `data:application/pdf;base64,${url}`;
    }

    if (imageTypes[ext]) {
      return `data:${imageTypes[ext]};base64,${url}`;
    }

    return url;
  };

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    if (!previewAttachment) {
      setPreviewUrl('');
      return () => {};
    }

    const rawUrl = previewAttachment.url ?? '';
    if (!rawUrl) {
      setPreviewUrl('');
      return () => {};
    }

    if (
      rawUrl.startsWith('http://') ||
      rawUrl.startsWith('https://') ||
      rawUrl.startsWith('blob:') ||
      rawUrl.startsWith('/')
    ) {
      setPreviewUrl(rawUrl);
      return () => {};
    }

    let dataUrl = rawUrl;
    if (!rawUrl.startsWith('data:')) {
      const ext = previewAttachment.filename?.split('.').pop()?.toLowerCase() ?? '';
      const imageTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
      };
      const mime =
        ext === 'pdf'
          ? 'application/pdf'
          : imageTypes[ext] || 'application/octet-stream';
      dataUrl = `data:${mime};base64,${rawUrl}`;
    }

    fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewUrl(dataUrl);
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [previewAttachment]);

  const readAsDataUrl = (file: File, index: number) =>
    new Promise<Attachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: `${Date.now()}-${index}`,
          type: 'other',
          filename: file.name,
          url: typeof reader.result === 'string' ? reader.result : '',
          uploadedAt: new Date(),
          uploadedBy: 'current-user',
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || readOnly) return;
    const maxSize = 10 * 1024 * 1024;
    const tooLarge = Array.from(files).find((f) => f.size > maxSize);
    if (tooLarge) {
      setUploadError(t.panels.salesUploadError);
      return;
    }
    setUploadError(null);
    try {
      const newAttachments = await Promise.all(
        Array.from(files).map((file, index) => readAsDataUrl(file, index))
      );
      setSalesAttachments((prev) => [...prev, ...newAttachments]);
    } catch {
      setUploadError(t.panels.salesUploadError);
    }
  };

  const removeAttachment = (id: string) => {
    setSalesAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handlePaymentTermCountChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    const nextCount = Math.min(MAX_PAYMENT_TERMS, Math.max(1, parsed));
    setSalesPaymentTermCount(nextCount);
    setSalesPaymentTerms((prev) =>
      Array.from({ length: nextCount }, (_v, index) => {
        const existing = prev[index];
        if (!existing) return createPaymentTerm(index + 1);
        return { ...existing, paymentNumber: index + 1 };
      })
    );
  };

  const updatePaymentTerm = (
    index: number,
    field: 'paymentName' | 'paymentPercent' | 'comments',
    value: string
  ) => {
    setSalesPaymentTerms((prev) =>
      prev.map((term, termIndex) => {
        if (termIndex !== index) return term;
        if (field === 'paymentPercent') {
          return { ...term, paymentPercent: parseOptionalNumber(value) };
        }
        return { ...term, [field]: value };
      })
    );
  };

  const buildSalesPayload = (requireFinalPrice: boolean): SalesFollowupData | null => {
    const finalPriceValue = parseOptionalNumber(salesFinalPrice);
    if (requireFinalPrice && (finalPriceValue === null || finalPriceValue <= 0)) {
      return null;
    }
    const salesVatRateValue = salesVatMode === 'with' ? parseOptionalNumber(salesVatRate) : null;
    const paymentTerms = getActivePaymentTerms().map((term) => ({
      paymentNumber: term.paymentNumber,
      paymentName: term.paymentName.trim(),
      paymentPercent: term.paymentPercent,
      comments: term.comments.trim(),
    }));
    return {
      salesFinalPrice: finalPriceValue ?? undefined,
      salesCurrency,
      salesIncoterm,
      salesIncotermOther,
      salesVatMode,
      salesVatRate: salesVatRateValue,
      salesMargin: parseOptionalNumber(salesMargin),
      salesWarrantyPeriod: salesWarrantyPeriod.trim(),
      salesExpectedDeliveryDate: salesExpectedDeliveryDate.trim(),
      salesPaymentTermCount,
      salesPaymentTerms: paymentTerms,
      salesFeedbackComment,
      salesAttachments,
    };
  };

  const handleStartFollowup = async () => {
    await onUpdateStatus('sales_followup');
  };

  const handleSaveDraft = async () => {
    const payload = buildSalesPayload(false);
    if (!payload) return;
    await onUpdateSalesData(payload);
  };

  const handleSaveEdits = async () => {
    const payload = buildSalesPayload(false);
    if (!payload) return;
    if (onSaveEdits) {
      await onSaveEdits(payload);
      return;
    }
    await onUpdateSalesData(payload);
  };

  const handleSubmitForApproval = async () => {
    const payload = buildSalesPayload(true);
    if (!payload) return;
    await onUpdateSalesData(payload);
    await onUpdateStatus(
      'gm_approval_pending',
      salesFeedbackComment?.trim() ? salesFeedbackComment.trim() : undefined
    );
  };

  const handleApproveDeal = () => {
    onUpdateStatus('gm_approved', approvalComment?.trim() || undefined);
  };

  const handleRejectDeal = () => {
    onUpdateStatus('gm_rejected', approvalComment?.trim() || undefined);
  };

  const canStartFollowup = forceEnableActions || request.status === 'costing_complete';
  const canEditSales = forceEnableActions || (isSales && ['sales_followup', 'gm_rejected'].includes(request.status));
  const canSubmitForApproval = isSales && canEditSales;
  const canApprove = isAdmin && (forceEnableActions || request.status === 'gm_approval_pending');
  const finalPriceValue = parseOptionalNumber(salesFinalPrice);
  const vatRateValue = parseOptionalNumber(salesVatRate);
  const marginValue = parseOptionalNumber(salesMargin);
  const paymentTermsForValidation = getActivePaymentTerms();
  const paymentTermsComplete = paymentTermsForValidation.every(
    (term) => term.paymentName.trim().length > 0 && term.paymentPercent !== null
  );
  const paymentPercentTotal = paymentTermsForValidation.reduce(
    (sum, term) => sum + (term.paymentPercent ?? 0),
    0
  );
  const paymentTermsRequiredValid = paymentTermsComplete;
  const paymentTermsTotalValid =
    paymentTermsComplete && Math.abs(paymentPercentTotal - 100) < 0.01;
  const vatRateValid = salesVatMode === 'without' || vatRateValue !== null;
  const marginValid = marginValue !== null;
  const expectedDeliveryValid = salesExpectedDeliveryDate.trim().length > 0;
  const isValidSubmission =
    finalPriceValue !== null &&
    finalPriceValue > 0 &&
    vatRateValid &&
    marginValid &&
    expectedDeliveryValid &&
    paymentTermsRequiredValid &&
    paymentTermsTotalValid;
  const incotermDisplay = salesIncoterm === 'other' ? salesIncotermOther : salesIncoterm;
  const gmDecisionStatus: RequestStatus | null =
    request.status === 'gm_approved' || request.status === 'gm_rejected'
      ? request.status
      : null;
  const gmDecisionLabel = gmDecisionStatus
    ? t.statuses[gmDecisionStatus as keyof typeof t.statuses]
    : '';
  const gmDecisionEntry = gmDecisionStatus
    ? [...request.history].reverse().find((entry) => entry.status === gmDecisionStatus)
    : undefined;

  const showEditor = !readOnly && (editMode || (isSales && ['sales_followup', 'gm_rejected'].includes(request.status)));
  const summaryPaymentTerms = Array.isArray(request.salesPaymentTerms) ? request.salesPaymentTerms : [];
  const hasSalesPaymentTerms = summaryPaymentTerms.some(
    (term) =>
      (term.paymentName ?? '').trim().length > 0 ||
      term.paymentPercent !== null ||
      (term.comments ?? '').trim().length > 0
  );
  const hasSalesSummary = Boolean(
    request.salesFinalPrice ||
      request.salesFeedbackComment ||
      request.salesIncoterm ||
      (request.salesVatMode === 'with' && request.salesVatRate !== null) ||
      typeof request.salesMargin === 'number' ||
      (request.salesWarrantyPeriod ?? '').trim().length > 0 ||
      (request.salesExpectedDeliveryDate ?? '').trim().length > 0 ||
      hasSalesPaymentTerms
  );
  const hasSalesAttachments = Boolean(
    Array.isArray(request.salesAttachments) && request.salesAttachments.length
  );

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-lg bg-info/10 text-info flex items-center justify-center">
          <DollarSign size={20} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{t.panels.salesFollowup}</h3>
          <p className="text-sm text-muted-foreground">{t.panels.salesFollowupDesc}</p>
        </div>
      </div>

      {!readOnly && canStartFollowup && (
        <Button
          variant="outline"
          onClick={handleStartFollowup}
          disabled={isUpdating || request.status === 'sales_followup'}
          className="w-full justify-start"
        >
          <DollarSign size={16} className="mr-2 text-info" />
          {t.panels.startSalesFollowup}
        </Button>
      )}

      {showEditor && (
        <>
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">{t.panels.commercialTerms}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salesFinalPrice" className="text-sm font-medium flex items-center gap-2">
                  <DollarSign size={14} className="text-info" />
                  {t.panels.salesFinalPrice} *
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="salesFinalPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={salesFinalPrice}
                    onChange={(e) => setSalesFinalPrice(e.target.value)}
                    placeholder={`${t.common.add} ${t.panels.salesFinalPrice.toLowerCase()}...`}
                    className="bg-background flex-1"
                    disabled={readOnly}
                  />
                  <div className="min-w-[130px]">
                    <Label className="sr-only">{t.panels.currency}</Label>
                    <Select
                      value={salesCurrency}
                      onValueChange={(value) => setSalesCurrency(value as 'USD' | 'EUR' | 'RMB')}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t.panels.selectCurrency} />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border">
                        <SelectItem value="USD">{t.panels.currencyUsd}</SelectItem>
                        <SelectItem value="EUR">{t.panels.currencyEur}</SelectItem>
                        <SelectItem value="RMB">{t.panels.currencyRmb}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.panels.vatMode}</Label>
                <Select value={salesVatMode} onValueChange={(value) => setSalesVatMode(value as 'with' | 'without')} disabled={readOnly}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.panels.selectVatMode} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border">
                    <SelectItem value="with">{t.panels.withVat}</SelectItem>
                    <SelectItem value="without">{t.panels.withoutVat}</SelectItem>
                  </SelectContent>
                </Select>
                {salesVatMode === 'with' && (
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={salesVatRate}
                    onChange={(e) => setSalesVatRate(e.target.value)}
                    placeholder={t.panels.enterVatRate}
                    disabled={readOnly}
                    className="bg-background"
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salesMargin" className="text-sm font-medium">
                  {t.panels.salesMargin} (%) *
                </Label>
                <Input
                  id="salesMargin"
                  type="number"
                  min="0"
                  step="0.01"
                  value={salesMargin}
                  onChange={(e) => setSalesMargin(e.target.value)}
                  placeholder={t.panels.enterSalesMargin}
                  className="bg-background"
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salesWarrantyPeriod" className="text-sm font-medium">
                  {t.panels.warrantyPeriod}
                </Label>
                <Input
                  id="salesWarrantyPeriod"
                  value={salesWarrantyPeriod}
                  onChange={(e) => setSalesWarrantyPeriod(e.target.value)}
                  placeholder={t.panels.enterWarrantyPeriod}
                  className="bg-background"
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">{t.panels.paymentTerms}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.panels.paymentSettlementCount} *</Label>
                <Select
                  value={String(salesPaymentTermCount)}
                  onValueChange={handlePaymentTermCountChange}
                  disabled={readOnly}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.panels.selectPaymentSettlementCount} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border">
                    {Array.from({ length: MAX_PAYMENT_TERMS }, (_v, index) => (
                      <SelectItem key={index + 1} value={String(index + 1)}>
                        {String(index + 1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              {paymentTermsForValidation.map((term, index) => (
                <div key={term.paymentNumber} className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.panels.paymentNumber}</Label>
                      <Input value={String(term.paymentNumber)} disabled />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.panels.paymentName} *</Label>
                      <Input
                        value={term.paymentName}
                        onChange={(e) => updatePaymentTerm(index, 'paymentName', e.target.value)}
                        placeholder={t.panels.enterPaymentName}
                        disabled={readOnly}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.panels.paymentPercent} *</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={term.paymentPercent ?? ''}
                        onChange={(e) => updatePaymentTerm(index, 'paymentPercent', e.target.value)}
                        placeholder={t.panels.enterPaymentPercent}
                        disabled={readOnly}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{t.panels.paymentComments}</Label>
                      <Input
                        value={term.comments}
                        onChange={(e) => updatePaymentTerm(index, 'comments', e.target.value)}
                        placeholder={t.panels.enterPaymentComments}
                        disabled={readOnly}
                        className="bg-background"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t.panels.paymentTermsTotal}: {paymentPercentTotal.toFixed(2)}%
            </p>
            {!paymentTermsRequiredValid && (
              <p className="text-xs text-destructive">{t.panels.paymentTermsRequired}</p>
            )}
            {paymentTermsRequiredValid && !paymentTermsTotalValid && (
              <p className="text-xs text-destructive">{t.panels.paymentTermsTotalInvalid}</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground">{t.panels.deliveryTerms}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="salesExpectedDeliveryDate" className="text-sm font-medium">
                  {t.panels.salesExpectedDeliveryDate} *
                </Label>
                <Input
                  id="salesExpectedDeliveryDate"
                  type="date"
                  value={salesExpectedDeliveryDate}
                  onChange={(e) => setSalesExpectedDeliveryDate(e.target.value)}
                  className="bg-background"
                  disabled={readOnly}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t.panels.incoterm}</Label>
                <Select value={salesIncoterm} onValueChange={(value) => setSalesIncoterm(value)} disabled={readOnly}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.panels.selectIncoterm} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border">
                    <SelectItem value="EXW">EXW</SelectItem>
                    <SelectItem value="FOB">FOB</SelectItem>
                    <SelectItem value="other">{t.common.other}</SelectItem>
                  </SelectContent>
                </Select>
                {salesIncoterm === 'other' && (
                  <Input
                    value={salesIncotermOther}
                    onChange={(e) => setSalesIncotermOther(e.target.value)}
                    placeholder={t.panels.enterIncoterm}
                    disabled={readOnly}
                    className="bg-background"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t.panels.salesAttachments}</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-dashed"
              disabled={readOnly}
            >
              <Upload size={16} className="mr-2" />
              {t.panels.salesUploadDocs}
            </Button>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            {salesAttachments.length > 0 && (
              <div className="space-y-2">
                {salesAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <File size={16} className="text-primary" />
                      <span className="text-sm truncate">{attachment.filename}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openPreview(attachment)}
                        className="rounded p-1.5 text-primary hover:bg-primary/20"
                        title={t.table.view}
                      >
                        <Eye size={14} />
                      </button>
                      <a
                        href={getPreviewUrl(attachment) || attachment.url}
                        download={attachment.filename}
                        className="rounded p-1.5 text-primary hover:bg-primary/20"
                        title={t.request.downloadFile}
                      >
                        <Download size={14} />
                      </a>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="rounded p-1.5 text-destructive hover:bg-destructive/20"
                          title={t.common.delete}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t.panels.salesFeedback}</Label>
            <Textarea
              value={salesFeedbackComment}
              onChange={(e) => setSalesFeedbackComment(e.target.value)}
              placeholder={t.panels.salesFeedback}
              rows={4}
              disabled={readOnly}
            />
            {!editMode && (
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isUpdating || readOnly}
                size="sm"
              >
                {isUpdating && <Loader2 size={14} className="mr-2 animate-spin" />}
                {t.panels.saveNotes}
              </Button>
            )}
          </div>

          {editMode ? (
            <Button
              onClick={handleSaveEdits}
              disabled={!isValidSubmission || isUpdating}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
              <CheckCircle size={16} className="mr-2" />
              {t.common.save}
            </Button>
          ) : (
            <Button
              onClick={handleSubmitForApproval}
              disabled={!isValidSubmission || isUpdating || !canSubmitForApproval}
              className="w-full bg-info hover:bg-info/90 text-info-foreground"
            >
              {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
              <CheckCircle size={16} className="mr-2" />
              {t.panels.submitForApproval}
            </Button>
          )}
        </>
      )}

      {!showEditor && (hasSalesSummary || hasSalesAttachments) && (
        <div className="space-y-3">
          {hasSalesSummary && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-2">
              {typeof request.salesFinalPrice === 'number' && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t.panels.salesFinalPrice}:</span> {request.salesCurrency ?? 'EUR'} {request.salesFinalPrice.toFixed(2)}
                </p>
              )}
              {typeof request.salesMargin === 'number' && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t.panels.salesMargin}:</span> {request.salesMargin.toFixed(2)}%
                </p>
              )}
              {(request.salesWarrantyPeriod ?? '').trim().length > 0 && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t.panels.warrantyPeriod}:</span> {request.salesWarrantyPeriod}
                </p>
              )}
              {request.salesExpectedDeliveryDate && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t.panels.salesExpectedDeliveryDate}:</span>{' '}
                  {request.salesExpectedDeliveryDate}
                </p>
              )}
              {request.salesIncoterm && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t.panels.incoterm}:</span> {incotermDisplay}
                </p>
              )}
              {request.salesVatMode && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t.panels.vatMode}:</span> {request.salesVatMode === 'with' ? t.panels.withVat : t.panels.withoutVat}
                  {request.salesVatMode === 'with' && request.salesVatRate !== null && (
                    <> ({request.salesVatRate}%)</>
                  )}
                </p>
              )}
              {request.salesFeedbackComment && (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">{t.panels.salesFeedback}:</span> {request.salesFeedbackComment}
                </p>
              )}
              {hasSalesPaymentTerms && (
                <div className="space-y-1">
                  <p className="text-sm text-foreground">
                    <span className="text-muted-foreground">{t.panels.paymentTerms}:</span>
                  </p>
                  {summaryPaymentTerms.map((term, index) => (
                    <p key={`summary-term-${index}`} className="text-sm text-foreground pl-3">
                      #{term.paymentNumber || index + 1} {term.paymentName || '-'} |{' '}
                      {typeof term.paymentPercent === 'number' ? `${term.paymentPercent}%` : '-'} |{' '}
                      {term.comments || '-'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {hasSalesAttachments && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{t.panels.salesAttachments}</p>
              {request.salesAttachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <File size={16} className="text-primary" />
                    <span className="text-sm truncate">{attachment.filename}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openPreview(attachment)}
                      className="rounded p-1.5 text-primary hover:bg-primary/20"
                      title={t.table.view}
                    >
                      <Eye size={14} />
                    </button>
                    <a
                      href={getPreviewUrl(attachment) || attachment.url}
                      download={attachment.filename}
                      className="rounded p-1.5 text-primary hover:bg-primary/20"
                      title={t.request.downloadFile}
                    >
                      <Download size={14} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!showEditor && isSales && request.status === 'gm_approval_pending' && (
        <Button
          disabled
          className="w-full bg-muted/30 text-muted-foreground border border-border"
        >
          {t.panels.submittedToGm}
        </Button>
      )}

      {canApprove && (
        <div className="border-t border-border/60 pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-warning" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t.panels.gmApproval}</h4>
              <p className="text-xs text-muted-foreground">{t.panels.gmApprovalDesc}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.panels.gmApprovalComment}</Label>
            <Textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder={t.panels.gmApprovalComment}
              rows={3}
              disabled={isUpdating}
            />
          </div>
          <Button
            onClick={handleApproveDeal}
            disabled={isUpdating}
            className="w-full bg-success hover:bg-success/90 text-success-foreground"
          >
            {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
            <CheckCircle size={16} className="mr-2" />
            {t.panels.approveDeal}
          </Button>
          <Button
            onClick={handleRejectDeal}
            disabled={isUpdating}
            variant="outline"
            className="w-full border-destructive text-destructive hover:bg-destructive/10"
          >
            {t.panels.rejectDeal}
          </Button>
        </div>
      )}

      {!canApprove && gmDecisionStatus && (
        <div className="border-t border-border/60 pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-muted-foreground" />
            <div>
              <h4 className="text-sm font-semibold text-foreground">{t.panels.gmApproval}</h4>
              <p className="text-xs text-muted-foreground">{t.panels.gmApprovalDesc}</p>
            </div>
          </div>
          <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-2">
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">{t.common.status}:</span>{' '}
              <span className={gmDecisionStatus === 'gm_approved' ? 'text-success' : 'text-destructive'}>
                {gmDecisionLabel}
              </span>
            </p>
            {gmDecisionEntry?.comment && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">{t.panels.gmApprovalComment}:</span>{' '}
                {gmDecisionEntry.comment}
              </p>
            )}
          </div>
        </div>
      )}

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto scrollbar-thin" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewAttachment?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-[300px] items-center justify-center">
            {previewAttachment && isImageFile(previewAttachment.filename) && previewUrl && (
              <img
                src={previewUrl}
                alt={previewAttachment.filename}
                className="max-h-[70vh] max-w-full object-contain"
              />
            )}
            {previewAttachment && isPdfFile(previewAttachment.filename) && previewUrl && (
              <iframe
                src={previewUrl}
                title={previewAttachment.filename}
                className="h-[70vh] w-full border border-border rounded"
              />
            )}
            {previewAttachment &&
              !isImageFile(previewAttachment.filename) &&
              !isPdfFile(previewAttachment.filename) && (
                <div className="text-sm text-muted-foreground">
                  {t.request.previewNotAvailable}
                </div>
              )}
            {previewAttachment && !previewUrl && (
              <div className="text-sm text-muted-foreground">
                {t.request.previewNotAvailable}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesFollowupPanel;

