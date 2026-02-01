import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DollarSign, CheckCircle, Loader2, TrendingUp, Upload, File, Eye, Download, X } from 'lucide-react';
import { Attachment, CustomerRequest, RequestStatus } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CostingPanelProps {
  request: CustomerRequest;
  onUpdateStatus: (status: RequestStatus, notes?: string) => void | Promise<void>;
  onUpdateCostingData: (data: {
    costingNotes?: string;
    sellingPrice?: number;
    sellingCurrency?: 'USD' | 'EUR' | 'RMB';
    calculatedMargin?: number;
    incoterm?: string;
    incotermOther?: string;
    vatMode?: 'with' | 'without';
    vatRate?: number | null;
    deliveryLeadtime?: string;
    costingAttachments?: Attachment[];
  }) => void | Promise<void>;
  isUpdating: boolean;
  readOnly?: boolean;
  forceEnableActions?: boolean;
}

const CostingPanel: React.FC<CostingPanelProps> = ({
  request,
  onUpdateStatus,
  onUpdateCostingData,
  isUpdating,
  readOnly = false,
  forceEnableActions = false,
}) => {
  const [costingNotes, setCostingNotes] = useState(request.costingNotes || '');
  const [sellingPrice, setSellingPrice] = useState<string>(
    request.sellingPrice?.toString() || ''
  );
  const [sellingCurrency, setSellingCurrency] = useState<'USD' | 'EUR' | 'RMB'>(
    request.sellingCurrency || 'EUR'
  );
  const [calculatedMargin, setCalculatedMargin] = useState<string>(
    request.calculatedMargin?.toString() || ''
  );
  const [incoterm, setIncoterm] = useState<string>(request.incoterm || '');
  const [incotermOther, setIncotermOther] = useState<string>(request.incotermOther || '');
  const [vatMode, setVatMode] = useState<'with' | 'without'>(request.vatMode || 'without');
  const [vatRate, setVatRate] = useState<string>(
    typeof request.vatRate === 'number' ? request.vatRate.toString() : ''
  );
  const [deliveryLeadtime, setDeliveryLeadtime] = useState<string>(request.deliveryLeadtime || '');
  const [costingAttachments, setCostingAttachments] = useState<Attachment[]>(
    Array.isArray(request.costingAttachments) ? request.costingAttachments : []
  );
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

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
      setUploadError(t.panels.costingUploadError);
      return;
    }
    setUploadError(null);
    try {
      const newAttachments = await Promise.all(
        Array.from(files).map((file, index) => readAsDataUrl(file, index))
      );
      setCostingAttachments((prev) => [...prev, ...newAttachments]);
    } catch {
      setUploadError(t.panels.costingUploadError);
    }
  };

  const removeAttachment = (id: string) => {
    setCostingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSetInCosting = () => {
    onUpdateStatus('in_costing');
  };

  const handleSubmitCosting = () => {
    const priceValue = parseFloat(sellingPrice);
    const marginValue = parseFloat(calculatedMargin);

    if (isNaN(priceValue) || priceValue <= 0) {
      return;
    }
    if (isNaN(marginValue)) {
      return;
    }

    onUpdateCostingData({
      costingNotes,
      sellingPrice: priceValue,
      sellingCurrency,
      calculatedMargin: marginValue,
      incoterm,
      incotermOther,
      vatMode,
      vatRate: vatMode === 'with' ? parseFloat(vatRate) : null,
      deliveryLeadtime,
      costingAttachments,
    });
    onUpdateStatus(
      'costing_complete',
      `${t.panels.sellingPrice}: ${sellingCurrency} ${priceValue.toFixed(2)}, ${t.panels.margin}: ${marginValue.toFixed(1)}%`
    );
  };

  const handleSaveNotes = () => {
    onUpdateCostingData({
      costingNotes,
      sellingCurrency,
      incoterm,
      incotermOther,
      vatMode,
      vatRate: vatMode === 'with' ? parseFloat(vatRate) : null,
      deliveryLeadtime,
      costingAttachments,
    });
  };

  const canSetInCosting = forceEnableActions || ['feasibility_confirmed', 'design_result'].includes(request.status);
  const canComplete = forceEnableActions || request.status === 'in_costing';
  const vatRateValid = vatMode === 'without' || (vatRate !== '' && !isNaN(parseFloat(vatRate)));
  const isValidSubmission =
    sellingPrice &&
    parseFloat(sellingPrice) > 0 &&
    calculatedMargin &&
    !isNaN(parseFloat(calculatedMargin)) &&
    vatRateValid;

  const incotermDisplay = incoterm === 'other' ? incotermOther : incoterm;

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-lg bg-success/10 text-success flex items-center justify-center">
          <DollarSign size={20} />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{t.panels.costingActions}</h3>
          <p className="text-sm text-muted-foreground">{t.panels.manageCostingProcess}</p>
        </div>
      </div>

      {!readOnly && (canSetInCosting || request.status === 'in_costing') && (
        <Button
          variant="outline"
          onClick={handleSetInCosting}
          disabled={isUpdating || request.status === 'in_costing'}
          className={`w-full justify-start ${
            request.status === 'in_costing'
              ? 'bg-success/10 text-success border-success/30'
              : ''
          }`}
        >
          <DollarSign
            size={16}
            className={`mr-2 ${request.status === 'in_costing' ? 'text-success' : 'text-info'}`}
          />
          {t.panels.setInCosting}
        </Button>
      )}

      {!readOnly && canComplete && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sellingPrice" className="text-sm font-medium flex items-center gap-2">
                <DollarSign size={14} className="text-success" />
                {t.panels.sellingPrice} *
              </Label>
              <div className="flex gap-2">
                <Input
                  id="sellingPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder={`${t.common.add} ${t.panels.sellingPrice.toLowerCase()}...`}
                  className="bg-background flex-1"
                  disabled={readOnly}
                />
                <div className="min-w-[130px]">
                  <Label className="sr-only">{t.panels.currency}</Label>
                  <Select
                    value={sellingCurrency}
                    onValueChange={(value) => setSellingCurrency(value as 'USD' | 'EUR' | 'RMB')}
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
              <Label htmlFor="calculatedMargin" className="text-sm font-medium flex items-center gap-2">
                <TrendingUp size={14} className="text-info" />
                {t.panels.margin} (%) *
              </Label>
              <Input
                id="calculatedMargin"
                type="number"
                step="0.1"
                value={calculatedMargin}
                onChange={(e) => setCalculatedMargin(e.target.value)}
                placeholder={`${t.common.add} ${t.panels.margin.toLowerCase()}...`}
                className="bg-background"
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t.panels.incoterm}</Label>
              <Select value={incoterm} onValueChange={(value) => setIncoterm(value)} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.panels.selectIncoterm} />
                </SelectTrigger>
                <SelectContent className="bg-card border border-border">
                  <SelectItem value="EXW">EXW</SelectItem>
                  <SelectItem value="FOB">FOB</SelectItem>
                  <SelectItem value="other">{t.common.other}</SelectItem>
                </SelectContent>
              </Select>
              {incoterm === 'other' && (
                <Input
                  value={incotermOther}
                  onChange={(e) => setIncotermOther(e.target.value)}
                  placeholder={t.panels.enterIncoterm}
                  disabled={readOnly}
                  className="bg-background"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t.panels.vatMode}</Label>
              <Select value={vatMode} onValueChange={(value) => setVatMode(value as 'with' | 'without')} disabled={readOnly}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.panels.selectVatMode} />
                </SelectTrigger>
                <SelectContent className="bg-card border border-border">
                  <SelectItem value="with">{t.panels.withVat}</SelectItem>
                  <SelectItem value="without">{t.panels.withoutVat}</SelectItem>
                </SelectContent>
              </Select>
              {vatMode === 'with' && (
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  placeholder={t.panels.enterVatRate}
                  disabled={readOnly}
                  className="bg-background"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.panels.deliveryLeadtime}</Label>
            <Input
              value={deliveryLeadtime}
              onChange={(e) => setDeliveryLeadtime(e.target.value)}
              placeholder={t.panels.enterDeliveryLeadtime}
              disabled={readOnly}
              className="bg-background"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">{t.panels.costingAttachments}</Label>
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
              {t.panels.uploadCostingDocs}
            </Button>
            {uploadError && (
              <p className="text-xs text-destructive">{uploadError}</p>
            )}
            {costingAttachments.length > 0 && (
              <div className="space-y-2">
                {costingAttachments.map((attachment) => (
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
            <Label className="text-sm font-medium">{t.panels.costingNotesInternal}</Label>
            <Textarea
              value={costingNotes}
              onChange={(e) => setCostingNotes(e.target.value)}
              placeholder={t.panels.addCostingNotes}
              rows={4}
              disabled={readOnly}
            />
            <Button
              variant="outline"
              onClick={handleSaveNotes}
              disabled={isUpdating || readOnly}
              size="sm"
            >
              {isUpdating && <Loader2 size={14} className="mr-2 animate-spin" />}
              {t.panels.saveNotes}
            </Button>
          </div>

          <Button
            onClick={handleSubmitCosting}
            disabled={!isValidSubmission || isUpdating}
            className="w-full bg-success hover:bg-success/90 text-success-foreground"
          >
            {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
            <CheckCircle size={16} className="mr-2" />
            {t.panels.submitCostingComplete}
          </Button>
        </>
      )}

      {['costing_complete', 'sales_followup', 'gm_approval_pending', 'gm_approved', 'gm_rejected'].includes(request.status) && (
        <div className="space-y-3">
          <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20 space-y-2">
            <p className="text-sm font-medium text-foreground">{t.panels.costingCompleted}</p>
            {request.sellingPrice && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">{t.panels.sellingPrice}:</span> {request.sellingCurrency ?? 'EUR'} {request.sellingPrice.toFixed(2)}
              </p>
            )}
            {request.calculatedMargin !== undefined && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">{t.panels.margin}:</span> {request.calculatedMargin.toFixed(1)}%
              </p>
            )}
            {request.incoterm && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">{t.panels.incoterm}:</span> {incotermDisplay}
              </p>
            )}
            <p className="text-sm text-foreground">
              <span className="text-muted-foreground">{t.panels.vatMode}:</span> {request.vatMode === 'with' ? t.panels.withVat : t.panels.withoutVat}
              {request.vatMode === 'with' && request.vatRate !== null && (
                <> ({request.vatRate}%)</>
              )}
            </p>
            {request.deliveryLeadtime && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">{t.panels.deliveryLeadtime}:</span> {request.deliveryLeadtime}
              </p>
            )}
            {request.costingNotes && (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">{t.panels.costingNotes}:</span> {request.costingNotes}
              </p>
            )}
          </div>
          {Array.isArray(request.costingAttachments) && request.costingAttachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">{t.panels.costingAttachments}</p>
              {request.costingAttachments.map((attachment) => (
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

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
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

export default CostingPanel;


