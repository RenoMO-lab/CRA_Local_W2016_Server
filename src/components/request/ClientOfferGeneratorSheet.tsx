import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Loader2, Plus, Save, Trash2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Language } from '@/i18n/translations';
import {
  Attachment,
  AXLE_LOCATIONS,
  ARTICULATION_TYPES,
  ClientOfferConfig,
  ClientOfferLine,
  CONFIGURATION_TYPES,
  CustomerRequest,
  RequestProduct,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type OfferAttachmentOption = {
  id: string;
  source: 'general' | 'technical' | 'design' | 'costing' | 'sales';
  attachment: Attachment;
};

type ClientOfferProfile = {
  companyNameLocal: string;
  companyNameEn: string;
  address: string;
  phone: string;
  email: string;
  contactName: string;
};

interface ClientOfferGeneratorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: CustomerRequest;
  onSaveConfig: (config: ClientOfferConfig) => Promise<void>;
}

const parseOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const MAX_LINE_QTY = 10000;
const MAX_UNIT_PRICE = 1000000;

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeLineQuantity = (value: unknown): number | null => {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) return null;
  return clampNumber(Math.trunc(parsed), 0, MAX_LINE_QTY);
};

const normalizeLineUnitPrice = (value: unknown): number | null => {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) return null;
  const clamped = clampNumber(parsed, 0, MAX_UNIT_PRICE);
  return Math.round((clamped + Number.EPSILON) * 100) / 100;
};

const resolveOther = (value: string | undefined | null, other?: string | null) => {
  if (!value) return '';
  if (value === 'other') return String(other ?? '').trim();
  return String(value ?? '');
};

const getProductTypeLabel = (
  product: Partial<RequestProduct>,
  translateOption: (value: string) => string
) => {
  const parts: string[] = [];
  const append = (value: string | undefined) => {
    const text = String(value ?? '').trim();
    if (!text) return;
    if (text === '-' || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'na') return;
    parts.push(text);
  };

  if (product.axleLocation) {
    if (product.axleLocation === 'other') {
      append(product.axleLocationOther);
    } else {
      const hit = AXLE_LOCATIONS.find((item) => item.value === product.axleLocation);
      append(translateOption(hit?.label ?? String(product.axleLocation)));
    }
  }

  if (product.articulationType) {
    if (product.articulationType === 'other') {
      append(product.articulationTypeOther);
    } else {
      const hit = ARTICULATION_TYPES.find((item) => item.value === product.articulationType);
      append(translateOption(hit?.label ?? String(product.articulationType)));
    }
  }

  if (product.configurationType) {
    if (product.configurationType === 'other') {
      append(product.configurationTypeOther);
    } else {
      const hit = CONFIGURATION_TYPES.find((item) => item.value === product.configurationType);
      append(translateOption(hit?.label ?? String(product.configurationType)));
    }
  }

  return parts.join(' / ');
};

const buildLegacyProduct = (request: CustomerRequest): RequestProduct => ({
  axleLocation: request.axleLocation ?? '',
  axleLocationOther: request.axleLocationOther ?? '',
  articulationType: request.articulationType ?? '',
  articulationTypeOther: request.articulationTypeOther ?? '',
  configurationType: request.configurationType ?? '',
  configurationTypeOther: request.configurationTypeOther ?? '',
  quantity: typeof request.expectedQty === 'number' ? request.expectedQty : null,
  loadsKg: request.loadsKg ?? null,
  speedsKmh: request.speedsKmh ?? null,
  tyreSize: request.tyreSize ?? '',
  trackMm: request.trackMm ?? null,
  studsPcdMode: request.studsPcdMode ?? 'standard',
  studsPcdStandardSelections: Array.isArray(request.studsPcdStandardSelections) ? request.studsPcdStandardSelections : [],
  studsPcdSpecialText: request.studsPcdSpecialText ?? '',
  wheelBase: request.wheelBase ?? '',
  finish: request.finish ?? 'Black Primer default',
  brakeType: request.brakeType ?? null,
  brakeSize: request.brakeSize ?? '',
  brakePowerType: request.brakePowerType ?? '',
  brakeCertificate: request.brakeCertificate ?? '',
  mainBodySectionType: request.mainBodySectionType ?? '',
  clientSealingRequest: request.clientSealingRequest ?? '',
  cupLogo: request.cupLogo ?? '',
  suspension: request.suspension ?? '',
  productComments: request.otherRequirements ?? '',
  attachments: Array.isArray(request.attachments) ? request.attachments : [],
});

const seedLinesFromProducts = (
  request: CustomerRequest,
  translateOption: (value: string) => string
): ClientOfferLine[] => {
  const products = Array.isArray(request.products) && request.products.length
    ? request.products
    : [buildLegacyProduct(request)];

  return products.map((product, index) => {
    const details = [
      product.tyreSize ? `Tyre: ${product.tyreSize}` : '',
      product.loadsKg !== null && product.loadsKg !== undefined && String(product.loadsKg).trim() !== ''
        ? `Loads: ${product.loadsKg}`
        : '',
      product.speedsKmh !== null && product.speedsKmh !== undefined && String(product.speedsKmh).trim() !== ''
        ? `Speed: ${product.speedsKmh}`
        : '',
      product.trackMm !== null && product.trackMm !== undefined && String(product.trackMm).trim() !== ''
        ? `Track: ${product.trackMm}`
        : '',
      product.brakeType ? `Brake: ${translateOption(String(product.brakeType))}` : '',
      product.suspension ? `Suspension: ${translateOption(product.suspension)}` : '',
    ].filter(Boolean);

    return {
      id: `product-${index + 1}`,
      include: true,
      sourceProductIndex: index,
      description: getProductTypeLabel(product, translateOption) || request.applicationVehicle || `Item ${index + 1}`,
      specification: details.join(' | '),
      quantity: typeof product.quantity === 'number' ? product.quantity : null,
      unitPrice: null,
      remark: '',
    };
  });
};

const collectRequestAttachments = (request: CustomerRequest): OfferAttachmentOption[] => {
  const out: OfferAttachmentOption[] = [];
  const seen = new Set<string>();

  const push = (items: Attachment[] | undefined, source: OfferAttachmentOption['source']) => {
    if (!Array.isArray(items)) return;
    for (const attachment of items) {
      const id = String(attachment?.id ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, source, attachment });
    }
  };

  push(request.attachments, 'general');
  if (Array.isArray(request.products)) {
    for (const product of request.products) {
      push(product?.attachments, 'technical');
    }
  }
  push(request.designResultAttachments, 'design');
  push(request.costingAttachments, 'costing');
  push(request.salesAttachments, 'sales');

  return out;
};

const normalizeConfig = (
  request: CustomerRequest,
  input: ClientOfferConfig | undefined,
  translateOption: (value: string) => string,
  defaultIntro: string
): ClientOfferConfig => {
  const source = input && typeof input === 'object' ? input : undefined;
  const lines = (Array.isArray(source?.lines) && source?.lines.length
    ? source.lines.map((line, index) => ({
        id: typeof line?.id === 'string' && line.id.trim() ? line.id.trim() : `line-${index + 1}`,
        include: line?.include !== false,
        sourceProductIndex:
          typeof line?.sourceProductIndex === 'number' && Number.isInteger(line.sourceProductIndex) && line.sourceProductIndex >= 0
            ? line.sourceProductIndex
            : null,
        description: typeof line?.description === 'string' ? line.description : '',
        specification: typeof line?.specification === 'string' ? line.specification : '',
        quantity: normalizeLineQuantity(line?.quantity),
        unitPrice: normalizeLineUnitPrice(line?.unitPrice),
        remark: typeof line?.remark === 'string' ? line.remark : '',
      }))
    : seedLinesFromProducts(request, translateOption)).map((line) => ({
    ...line,
    quantity: normalizeLineQuantity(line.quantity),
    unitPrice: normalizeLineUnitPrice(line.unitPrice),
  }));

  return {
    offerNumber: String(source?.offerNumber ?? request.id ?? '').trim() || request.id,
    recipientName:
      String(source?.recipientName ?? request.clientName ?? '').trim() ||
      String(request.clientName ?? '').trim(),
    introText: String(source?.introText ?? '').trim() || defaultIntro,
    sectionVisibility: {
      general: source?.sectionVisibility?.general !== false,
      lineItems: source?.sectionVisibility?.lineItems !== false,
      commercialTerms: source?.sectionVisibility?.commercialTerms !== false,
      deliveryTerms: source?.sectionVisibility?.deliveryTerms !== false,
      appendix: source?.sectionVisibility?.appendix !== false,
    },
    lines,
    selectedAttachmentIds: Array.isArray(source?.selectedAttachmentIds)
      ? Array.from(new Set(source.selectedAttachmentIds.map((id) => String(id ?? '').trim()).filter(Boolean)))
      : [],
    updatedAt: source?.updatedAt,
    updatedByUserId: source?.updatedByUserId,
  };
};

const ClientOfferGeneratorSheet: React.FC<ClientOfferGeneratorSheetProps> = ({
  open,
  onOpenChange,
  request,
  onSaveConfig,
}) => {
  const { user } = useAuth();
  const { t, translateOption, language } = useLanguage();
  const { toast } = useToast();

  const [profile, setProfile] = useState<ClientOfferProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [config, setConfig] = useState<ClientOfferConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfLanguage, setPdfLanguage] = useState<Language>(language);

  const attachments = useMemo(() => collectRequestAttachments(request), [request]);
  const selectedAttachmentCount = useMemo(() => {
    if (!config) return 0;
    const selected = new Set(config.selectedAttachmentIds);
    return attachments.filter((entry) => selected.has(entry.id)).length;
  }, [attachments, config]);
  const selectedAppendixCountText = String(t.clientOffer.selectedAppendixCount ?? '')
    .replace('{selected}', String(selectedAttachmentCount))
    .replace('{total}', String(attachments.length));

  useEffect(() => {
    if (!open) return;
    setConfig(
      normalizeConfig(
        request,
        request.clientOfferConfig,
        translateOption,
        String(t.clientOffer.defaultIntro)
      )
    );
    setPdfLanguage(language);
  }, [open, request.id, language, t.clientOffer.defaultIntro, translateOption]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadProfile = async () => {
      setIsProfileLoading(true);
      try {
        const response = await fetch('/api/admin/client-offer-profile');
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || `Failed to load profile: ${response.status}`);
        }
        if (cancelled) return;
        setProfile({
          companyNameLocal: String(data?.companyNameLocal ?? ''),
          companyNameEn: String(data?.companyNameEn ?? ''),
          address: String(data?.address ?? ''),
          phone: String(data?.phone ?? ''),
          email: String(data?.email ?? ''),
          contactName: String(data?.contactName ?? ''),
        });
      } catch {
        if (cancelled) return;
        setProfile(null);
        toast({
          title: t.request.error,
          description: t.clientOffer.profileLoadFailed,
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) {
          setIsProfileLoading(false);
        }
      }
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [open, request.id, t.clientOffer.profileLoadFailed, t.request.error, toast]);

  const updateLine = (lineId: string, patch: Partial<ClientOfferLine>) => {
    const normalizedPatch: Partial<ClientOfferLine> = { ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'quantity')) {
      normalizedPatch.quantity = normalizeLineQuantity(patch.quantity);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'unitPrice')) {
      normalizedPatch.unitPrice = normalizeLineUnitPrice(patch.unitPrice);
    }

    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.map((line) =>
          line.id === lineId
            ? {
                ...line,
                ...normalizedPatch,
              }
            : line
        ),
      };
    });
  };

  const removeLine = (lineId: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.filter((line) => line.id !== lineId),
      };
    });
  };

  const addLine = () => {
    setConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: [
          ...prev.lines,
          {
            id: `line-${Date.now()}`,
            include: true,
            sourceProductIndex: null,
            description: '',
            specification: '',
            quantity: null,
            unitPrice: null,
            remark: '',
          },
        ],
      };
    });
  };

  const toggleAttachment = (attachmentId: string, checked: boolean) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const current = new Set(prev.selectedAttachmentIds);
      if (checked) current.add(attachmentId);
      else current.delete(attachmentId);
      return {
        ...prev,
        selectedAttachmentIds: Array.from(current),
      };
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const payload: ClientOfferConfig = {
        ...config,
        lines: config.lines.map((line) => ({
          ...line,
          quantity: normalizeLineQuantity(line.quantity),
          unitPrice: normalizeLineUnitPrice(line.unitPrice),
        })),
        updatedAt: new Date().toISOString(),
        updatedByUserId: String(user?.id ?? ''),
      };
      await onSaveConfig(payload);
      setConfig(payload);
      toast({ title: t.common.save, description: t.clientOffer.configSaved });
    } catch (error) {
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? t.clientOffer.configSaveFailed),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!config) return;
    if (!profile) {
      toast({
        title: t.request.error,
        description: t.clientOffer.profileLoadFailed,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      const { generateClientOfferPDF } = await import('@/utils/clientOfferPdf');
      await generateClientOfferPDF(request, config, profile, pdfLanguage);
      toast({ title: t.common.download, description: `${t.common.pdfDownloaded} ${config.offerNumber || request.id}` });
    } catch (error) {
      toast({
        title: t.request.error,
        description: t.common.pdfDownloadFailed,
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const showLoading = isProfileLoading || !config;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto scrollbar-thin">
        <SheetHeader className="pr-8">
          <SheetTitle>{t.clientOffer.sheetTitle}</SheetTitle>
          <SheetDescription>{request.id}</SheetDescription>
        </SheetHeader>

        {showLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t.common.loading}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <Accordion
              type="multiple"
              defaultValue={['line-items', 'appendix', 'export-actions']}
              className="space-y-3"
            >
              <AccordionItem value="offer-basics" className="border border-border rounded-lg bg-card px-4 border-b-0">
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  {t.clientOffer.offerBasics}
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{t.clientOffer.offerNumber}</Label>
                      <Input
                        value={config.offerNumber}
                        onChange={(e) => setConfig((prev) => prev ? { ...prev, offerNumber: e.target.value } : prev)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t.clientOffer.recipientName}</Label>
                      <Input
                        value={config.recipientName}
                        onChange={(e) => setConfig((prev) => prev ? { ...prev, recipientName: e.target.value } : prev)}
                        placeholder={request.clientName || ''}
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>{t.clientOffer.introText}</Label>
                      <Textarea
                        value={config.introText}
                        onChange={(e) => setConfig((prev) => prev ? { ...prev, introText: e.target.value } : prev)}
                        rows={3}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="visibility" className="border border-border rounded-lg bg-card px-4 border-b-0">
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  {t.clientOffer.sections}
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-3">
                  <div className="space-y-2">
                    {([
                      ['general', t.clientOffer.generalInformation],
                      ['lineItems', t.clientOffer.lineItemsTitle],
                      ['commercialTerms', t.clientOffer.commercialTermsTitle],
                      ['deliveryTerms', t.clientOffer.deliveryTermsTitle],
                      ['appendix', t.clientOffer.appendixTitle],
                    ] as Array<[keyof ClientOfferConfig['sectionVisibility'], string]>).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={Boolean(config.sectionVisibility[key])}
                          onCheckedChange={(checked) =>
                            setConfig((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    sectionVisibility: {
                                      ...prev.sectionVisibility,
                                      [key]: Boolean(checked),
                                    },
                                  }
                                : prev
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="line-items" className="border border-border rounded-lg bg-card px-4 border-b-0">
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  {t.clientOffer.lineItemsTitle}
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-end">
                      <Button variant="outline" size="sm" onClick={addLine} className="h-9">
                        <Plus size={14} className="mr-2" />
                        {t.clientOffer.addLine}
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="hidden lg:grid lg:grid-cols-[auto,minmax(11rem,1.3fr),minmax(12rem,1.5fr),6.75rem,8rem,minmax(10rem,1fr),auto] lg:items-center lg:gap-2 px-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <span>{t.clientOffer.item}</span>
                        <span>{t.clientOffer.description}</span>
                        <span>{t.clientOffer.specification}</span>
                        <span className="text-right">{t.clientOffer.quantity}</span>
                        <span className="text-right">{t.clientOffer.unitPrice}</span>
                        <span>{t.clientOffer.remark}</span>
                        <span className="sr-only">{t.common.delete}</span>
                      </div>

                      {config.lines.map((line, index) => (
                        <div key={line.id} className="rounded-md border border-border p-2">
                          <div className="hidden lg:grid lg:grid-cols-[auto,minmax(11rem,1.3fr),minmax(12rem,1.5fr),6.75rem,8rem,minmax(10rem,1fr),auto] lg:items-start lg:gap-2">
                            <label className="flex items-center gap-2 pt-2">
                              <Checkbox
                                checked={line.include}
                                onCheckedChange={(checked) => updateLine(line.id, { include: checked === true })}
                              />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">#{index + 1}</span>
                            </label>

                            <Input
                              value={line.description}
                              onChange={(e) => updateLine(line.id, { description: e.target.value })}
                              className="h-9"
                            />

                            <Textarea
                              value={line.specification}
                              onChange={(e) => updateLine(line.id, { specification: e.target.value })}
                              rows={1}
                              className="min-h-9 h-9 resize-y leading-5"
                            />

                            <Input
                              type="number"
                              min={0}
                              max={MAX_LINE_QTY}
                              step={1}
                              inputMode="numeric"
                              value={line.quantity ?? ''}
                              onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                              className="h-9 text-right tabular-nums"
                            />

                            <Input
                              type="number"
                              min={0}
                              max={MAX_UNIT_PRICE}
                              step={0.01}
                              inputMode="decimal"
                              value={line.unitPrice ?? ''}
                              onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                              className="h-9 text-right tabular-nums"
                            />

                            <Input
                              value={line.remark}
                              onChange={(e) => updateLine(line.id, { remark: e.target.value })}
                              className="h-9"
                            />

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLine(line.id)}
                              className="h-9 px-2"
                              title={t.common.delete}
                            >
                              <Trash2 size={14} />
                              <span className="sr-only">{t.common.delete}</span>
                            </Button>
                          </div>

                          <div className="space-y-2.5 lg:hidden">
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2">
                                <Checkbox
                                  checked={line.include}
                                  onCheckedChange={(checked) => updateLine(line.id, { include: checked === true })}
                                />
                                <span className="text-xs text-muted-foreground">{t.clientOffer.item} #{index + 1}</span>
                              </label>
                              <Button variant="ghost" size="sm" onClick={() => removeLine(line.id)} className="h-8 px-2.5">
                                <Trash2 size={14} className="mr-1.5" />
                                {t.common.delete}
                              </Button>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t.clientOffer.description}</Label>
                              <Input
                                value={line.description}
                                onChange={(e) => updateLine(line.id, { description: e.target.value })}
                                className="h-9"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t.clientOffer.specification}</Label>
                              <Textarea
                                value={line.specification}
                                onChange={(e) => updateLine(line.id, { specification: e.target.value })}
                                rows={1}
                                className="min-h-9 h-9 resize-y leading-5"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">{t.clientOffer.quantity}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={MAX_LINE_QTY}
                                  step={1}
                                  inputMode="numeric"
                                  value={line.quantity ?? ''}
                                  onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                                  className="h-9 text-right tabular-nums"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{t.clientOffer.unitPrice}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={MAX_UNIT_PRICE}
                                  step={0.01}
                                  inputMode="decimal"
                                  value={line.unitPrice ?? ''}
                                  onChange={(e) => updateLine(line.id, { unitPrice: e.target.value })}
                                  className="h-9 text-right tabular-nums"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t.clientOffer.remark}</Label>
                              <Input
                                value={line.remark}
                                onChange={(e) => updateLine(line.id, { remark: e.target.value })}
                                className="h-9"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="appendix" className="border border-border rounded-lg bg-card px-4 border-b-0">
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  {t.clientOffer.availableAppendix}
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-3">
                  <div className="space-y-2.5">
                    <p className="text-xs text-muted-foreground">{selectedAppendixCountText}</p>
                    {attachments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t.clientOffer.noAttachments}</p>
                    ) : (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                        {attachments.map((entry) => {
                          const checked = config.selectedAttachmentIds.includes(entry.id);
                          return (
                            <label
                              key={entry.id}
                              className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(next) => toggleAttachment(entry.id, next === true)}
                              />
                              <span className="text-sm text-foreground truncate" title={entry.attachment.filename}>
                                {entry.attachment.filename}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="export-actions" className="border border-border rounded-lg bg-card px-4 border-b-0">
                <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                  {t.clientOffer.exportActions}
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-3">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>{t.table.pdfLanguage}</Label>
                      <Select value={pdfLanguage} onValueChange={(value) => setPdfLanguage(value as Language)}>
                        <SelectTrigger className="w-full sm:w-56">
                          <SelectValue placeholder={t.table.pdfLanguage} />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border">
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="fr">Francais</SelectItem>
                          <SelectItem value="zh">Chinese</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={handleSave} disabled={isSaving || isGenerating} className="h-10">
                        {isSaving ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
                        {t.clientOffer.saveConfig}
                      </Button>
                      <Button onClick={handleGeneratePdf} disabled={isGenerating || isSaving} className="h-10">
                        {isGenerating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Download size={14} className="mr-2" />}
                        {t.clientOffer.generatePdf}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {profile ? (
              <div className="text-xs text-muted-foreground border-t border-border pt-3">
                <FileText size={12} className="inline-block mr-1.5 align-middle" />
                {profile.companyNameEn || profile.companyNameLocal} | {profile.contactName} | {profile.email}
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ClientOfferGeneratorSheet;
