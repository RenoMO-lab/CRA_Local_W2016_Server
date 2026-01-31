import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Attachment, CustomerRequest, RequestStatus } from '@/types';
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

interface SalesFollowupPanelProps {
  request: CustomerRequest;
  onUpdateStatus: (status: RequestStatus, comment?: string) => void | Promise<void>;
  onUpdateSalesData: (data: {
    salesFinalPrice?: number;
    salesCurrency?: 'USD' | 'EUR' | 'RMB';
    salesIncoterm?: string;
    salesIncotermOther?: string;
    salesVatMode?: 'with' | 'without';
    salesVatRate?: number | null;
    salesFeedbackComment?: string;
    salesAttachments?: Attachment[];
  }) => void | Promise<void>;
  isUpdating: boolean;
  readOnly?: boolean;
  forceEnableActions?: boolean;
  isAdmin?: boolean;
}

const SalesFollowupPanel: React.FC<SalesFollowupPanelProps> = ({
  request,
  onUpdateStatus,
  onUpdateSalesData,
  isUpdating,
  readOnly = false,
  forceEnableActions = false,
  isAdmin = false,
}) => {
  const { t } = useLanguage();
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
  const [salesFeedbackComment, setSalesFeedbackComment] = useState<string>(
    request.salesFeedbackComment || ''
  );
  const [salesAttachments, setSalesAttachments] = useState<Attachment[]>(
    Array.isArray(request.salesAttachments) ? request.salesAttachments : []
  );
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleStartFollowup = async () => {
    await onUpdateStatus('sales_followup');
  };

  const handleSaveDraft = async () => {
    await onUpdateSalesData({
      salesFinalPrice: salesFinalPrice ? parseFloat(salesFinalPrice) : undefined,
      salesCurrency,
      salesIncoterm,
      salesIncotermOther,
      salesVatMode,
      salesVatRate: salesVatMode === 'with' ? parseFloat(salesVatRate) : null,
      salesFeedbackComment,
      salesAttachments,
    });
  };

  const handleSubmitForApproval = async () => {
    const priceValue = parseFloat(salesFinalPrice);
    if (isNaN(priceValue) || priceValue <= 0) return;
    await onUpdateSalesData({
      salesFinalPrice: priceValue,
      salesCurrency,
      salesIncoterm,
      salesIncotermOther,
      salesVatMode,
      salesVatRate: salesVatMode === 'with' ? parseFloat(salesVatRate) : null,
      salesFeedbackComment,
      salesAttachments,
    });
    await onUpdateStatus(
      'gm_approval_pending',
      salesFeedbackComment?.trim() ? salesFeedbackComment.trim() : undefined
    );
  };

  const handleApproveDeal = () => {
    onUpdateStatus('gm_approved', approvalComment?.trim() || undefined);
  };

  const canStartFollowup = forceEnableActions || request.status === 'costing_complete';
  const canEditSales = forceEnableActions || ['sales_followup', 'gm_approval_pending'].includes(request.status);
  const canSubmitForApproval = canEditSales && request.status !== 'gm_approval_pending';
  const canApprove = isAdmin && (forceEnableActions || request.status === 'gm_approval_pending');
  const vatRateValid = salesVatMode === 'without' || (salesVatRate !== '' && !isNaN(parseFloat(salesVatRate)));
  const isValidSubmission = salesFinalPrice && parseFloat(salesFinalPrice) > 0 && vatRateValid;
  const incotermDisplay = salesIncoterm === 'other' ? salesIncotermOther : salesIncoterm;

  const showEditor = !readOnly && canEditSales && request.status !== 'gm_approved';
  const hasSalesData = Boolean(
    request.salesFinalPrice ||
      request.salesFeedbackComment ||
      (Array.isArray(request.salesAttachments) && request.salesAttachments.length) ||
      request.salesIncoterm ||
      (request.salesVatMode === 'with' && request.salesVatRate !== null)
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        onClick={() => setPreviewAttachment(attachment)}
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
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isUpdating || readOnly}
              size="sm"
            >
              {isUpdating && <Loader2 size={14} className="mr-2 animate-spin" />}
              {t.panels.saveNotes}
            </Button>
          </div>

          <Button
            onClick={handleSubmitForApproval}
            disabled={!isValidSubmission || isUpdating || !canSubmitForApproval}
            className="w-full bg-info hover:bg-info/90 text-info-foreground"
          >
            {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
            <CheckCircle size={16} className="mr-2" />
            {t.panels.submitForApproval}
          </Button>
        </>
      )}

      {!showEditor && hasSalesData && (
        <div className="p-4 bg-muted/40 rounded-lg border border-border space-y-2">
          {request.salesFinalPrice && (
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">{t.panels.salesFinalPrice}:</span> {request.salesCurrency ?? 'EUR'} {request.salesFinalPrice.toFixed(2)}
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
          {Array.isArray(request.salesAttachments) && request.salesAttachments.length > 0 && (
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
                      onClick={() => setPreviewAttachment(attachment)}
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
        </div>
      )}

      <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
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
