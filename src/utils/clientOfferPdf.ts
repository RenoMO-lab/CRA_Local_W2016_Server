import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { enUS, fr, zhCN } from 'date-fns/locale';
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
import { Language, translations } from '@/i18n/translations';

export interface ClientOfferProfile {
  companyNameLocal: string;
  companyNameEn: string;
  address: string;
  phone: string;
  email: string;
  contactName: string;
}

type OfferAttachment = {
  attachment: Attachment;
  source: 'general' | 'technical' | 'design' | 'costing' | 'sales';
};

type NormalizedPdfLine = {
  index: number;
  itemNo: string;
  description: string;
  specification: string[];
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  remark: string;
};

type FinancialSummary = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

type NormalizedTerms = {
  commercial: Array<{ label: string; value: string }>;
  delivery: Array<{ label: string; value: string }>;
};

const LOGO_URL = '/monroc-logo.png';
const CHINESE_FONT_FILE = '/fonts/simhei.ttf';
const CHINESE_FONT_NAME = 'simhei';
const MONROC_RED = '#FA0000';
const PDF_TYPE = {
  title: 18,
  section: 12,
  body: 11,
  table: 9.5,
  footer: 9,
  micro: 8.5,
} as const;
const PDF_SPACE = {
  s1: 2.2,
  s2: 4.2,
  s3: 6.3,
} as const;
const PDF_COLOR = {
  ink: '#0F172A',
  muted: '#64748B',
  line: '#CBD5E1',
  card: '#F8FAFC',
  zebra: '#F1F5F9',
  footerBg: '#F8FAFC',
} as const;
const FOOTER_RESERVED_HEIGHT = 12;

let chineseFontLoaded = false;

const arrayBufferToBase64 = (buffer: ArrayBuffer) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file')); 
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if (!result.startsWith('data:') || comma === -1) {
        reject(new Error('Unexpected data URL'));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(new Blob([buffer]));
  });

const loadChineseFont = async (pdf: jsPDF) => {
  if (chineseFontLoaded) return true;
  try {
    const response = await fetch(CHINESE_FONT_FILE);
    if (!response.ok) return false;
    const fontData = await response.arrayBuffer();
    const fontBase64 = await arrayBufferToBase64(fontData);
    pdf.addFileToVFS('simhei.ttf', fontBase64);
    pdf.addFont('simhei.ttf', CHINESE_FONT_NAME, 'normal');
    chineseFontLoaded = true;
    return true;
  } catch {
    return false;
  }
};

const getPdfLanguage = (): Language => {
  try {
    const stored = localStorage.getItem('monroc_language');
    return stored === 'fr' || stored === 'zh' ? stored : 'en';
  } catch {
    return 'en';
  }
};

const getPdfLocale = (language: Language) => {
  if (language === 'fr') return fr;
  if (language === 'zh') return zhCN;
  return enUS;
};

const hexToRgb = (hex: string) => {
  const clean = String(hex ?? '').replace('#', '');
  const value = Number.parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const loadImageAsBase64 = (url: string): Promise<{ dataUrl: string; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = url;
  });
};

const parseOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeOfferLine = (raw: any, index: number): ClientOfferLine => ({
  id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : `line-${index + 1}`,
  include: raw?.include !== false,
  sourceProductIndex:
    typeof raw?.sourceProductIndex === 'number' && Number.isInteger(raw.sourceProductIndex) && raw.sourceProductIndex >= 0
      ? raw.sourceProductIndex
      : null,
  description: typeof raw?.description === 'string' ? raw.description : '',
  specification: typeof raw?.specification === 'string' ? raw.specification : '',
  quantity: parseOptionalNumber(raw?.quantity),
  unitPrice: parseOptionalNumber(raw?.unitPrice),
  remark: typeof raw?.remark === 'string' ? raw.remark : '',
});

const resolveOtherValue = (value: string | null | undefined, other?: string | null) => {
  if (!value) return '';
  if (value === 'other') return (other ?? '').trim();
  return value;
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

const seedLinesFromProducts = (request: CustomerRequest, translateOption: (value: string) => string): ClientOfferLine[] => {
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

const normalizeOfferConfigForPdf = (
  request: CustomerRequest,
  config: ClientOfferConfig | undefined,
  translateOption: (value: string) => string,
  defaultIntro: string
): ClientOfferConfig => {
  const source = config && typeof config === 'object' ? config : undefined;
  const lines = Array.isArray(source?.lines) && source?.lines.length
    ? source.lines.map((line, index) => normalizeOfferLine(line, index))
    : seedLinesFromProducts(request, translateOption);

  return {
    offerNumber: String(source?.offerNumber ?? request.id ?? '').trim() || request.id,
    recipientName: String(source?.recipientName ?? request.clientName ?? '').trim(),
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
      ? Array.from(new Set(source!.selectedAttachmentIds.map((id) => String(id ?? '').trim()).filter(Boolean)))
      : [],
    updatedAt: source?.updatedAt,
    updatedByUserId: source?.updatedByUserId,
  };
};

const collectRequestAttachments = (request: CustomerRequest): OfferAttachment[] => {
  const out: OfferAttachment[] = [];
  const seen = new Set<string>();

  const push = (items: Attachment[] | undefined, source: OfferAttachment['source']) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const id = String(item?.id ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ attachment: item, source });
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

const parseDataUrl = (value: string) => {
  const raw = String(value ?? '');
  if (!raw.startsWith('data:')) return null;
  const comma = raw.indexOf(',');
  if (comma === -1) return null;
  const header = raw.slice(5, comma);
  const body = raw.slice(comma + 1);
  return {
    mime: header.split(';')[0] || '',
    base64: header.includes(';base64'),
    body,
  };
};

const decodeBase64ToBytes = (b64: string): Uint8Array => {
  const cleaned = String(b64 ?? '').replace(/[\r\n\s]/g, '');
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

const sniffMimeFromBytes = (bytes: Uint8Array): string | null => {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return null;
};

const renderPdfBytesToImages = async (bytes: Uint8Array, maxPages: number): Promise<string[]> => {
  const pdfjs: any = await import('pdfjs-dist');
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  } catch {}

  const loadingTask = pdfjs.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  const pageCount = Math.min(doc.numPages || 0, maxPages);
  const out: string[] = [];

  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
    const page = await doc.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(canvas.toDataURL('image/jpeg', 0.92));
  }

  return out;
};

const attachmentToPreview = async (
  attachment: Attachment,
  t: any
): Promise<{ kind: 'image' | 'pdf' | 'none'; dataUrls?: string[]; note?: string }> => {
  const url = String(attachment?.url ?? '');
  if (!url) return { kind: 'none' };

  const parsed = parseDataUrl(url);
  if (parsed) {
    if (parsed.mime.startsWith('image/')) return { kind: 'image', dataUrls: [url] };
    if (parsed.mime === 'application/pdf' && parsed.base64) {
      const bytes = decodeBase64ToBytes(parsed.body);
      const images = await renderPdfBytesToImages(bytes, 10);
      return { kind: 'pdf', dataUrls: images };
    }
  }

  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
    try {
      const bytes = decodeBase64ToBytes(url);
      const mime = sniffMimeFromBytes(bytes) ?? '';
      if (mime === 'image/png' || mime === 'image/jpeg') {
        return { kind: 'image', dataUrls: [`data:${mime};base64,${url}`] };
      }
      if (mime === 'application/pdf') {
        const images = await renderPdfBytesToImages(bytes, 10);
        return { kind: 'pdf', dataUrls: images };
      }
    } catch {}
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const template = String(t?.pdf?.attachmentFetchFailed ?? 'Failed to fetch attachment ({status}).');
      return { kind: 'none', note: template.replace('{status}', String(response.status)) };
    }
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const mime = String(response.headers.get('content-type') || '').toLowerCase() || sniffMimeFromBytes(bytes) || '';
    if (mime.startsWith('image/')) {
      const b64 = await arrayBufferToBase64(buffer);
      return { kind: 'image', dataUrls: [`data:${mime};base64,${b64}`] };
    }
    if (mime.includes('pdf') || mime === 'application/pdf') {
      const images = await renderPdfBytesToImages(bytes, 10);
      return { kind: 'pdf', dataUrls: images };
    }
  } catch {}

  return {
    kind: 'none',
    note: String(t?.pdf?.previewNotAvailableGeneric ?? t?.request?.previewNotAvailable ?? 'Preview not available.'),
  };
};

const formatMoney = (value: number | null, currency: string) => {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${currency} ${value.toFixed(2)}`;
};

const sanitizeFileToken = (value: string, fallback: string) => {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
};

const normalizeNumber = (value: unknown): number | null => {
  const parsed = parseOptionalNumber(value);
  if (parsed === null || !Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
};

const toSpecBullets = (specification: string) => {
  const chunks = String(specification ?? '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!chunks.length) return ['-'];
  return chunks.map((entry) => `• ${entry}`);
};

const normalizeTermValue = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text || '-';
};

const buildPaymentTermsValue = (request: CustomerRequest) => {
  if (!Array.isArray(request.salesPaymentTerms) || !request.salesPaymentTerms.length) return '-';
  const parts = request.salesPaymentTerms
    .filter((term) => (term.paymentName ?? '').trim() || term.paymentPercent !== null)
    .map((term) => {
      const name = normalizeTermValue(term.paymentName);
      const percent = typeof term.paymentPercent === 'number' ? `${term.paymentPercent}%` : '-';
      return `${name} (${percent})`;
    });
  return parts.length ? parts.join('; ') : '-';
};

const normalizeTermsForPdf = (request: CustomerRequest, t: any): NormalizedTerms => {
  const commercial: Array<{ label: string; value: string }> = [
    {
      label: String(t.panels.offerValidityPeriod),
      value: normalizeTermValue(request.salesOfferValidityPeriod),
    },
    {
      label: String(t.panels.paymentTerms),
      value: buildPaymentTermsValue(request),
    },
  ];

  const incoterm = request.salesIncoterm === 'other' ? request.salesIncotermOther : request.salesIncoterm;
  const delivery: Array<{ label: string; value: string }> = [
    {
      label: String(t.panels.salesExpectedDeliveryDate),
      value: normalizeTermValue(request.salesExpectedDeliveryDate),
    },
    {
      label: String(t.panels.incoterm),
      value: normalizeTermValue(incoterm),
    },
    {
      label: String(t.panels.warrantyPeriod),
      value: normalizeTermValue(request.salesWarrantyPeriod),
    },
  ];

  return { commercial, delivery };
};

const validateAndNormalizeOfferPdfData = (
  lines: ClientOfferLine[],
  request: CustomerRequest
): {
  lines: NormalizedPdfLine[];
  summary: FinancialSummary;
  warnings: string[];
} => {
  const warnings: string[] = [];
  const normalizedLines: NormalizedPdfLine[] = lines.map((line, index) => {
    const quantity = normalizeNumber(line.quantity);
    const unitPrice = normalizeNumber(line.unitPrice);
    const lineTotal = quantity !== null && unitPrice !== null ? Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100 : null;

    if (line.quantity !== quantity && line.quantity !== null) {
      warnings.push(`Line ${index + 1}: quantity normalized from "${String(line.quantity)}" to "${String(quantity)}".`);
    }
    if (line.unitPrice !== unitPrice && line.unitPrice !== null) {
      warnings.push(`Line ${index + 1}: unit price normalized from "${String(line.unitPrice)}" to "${String(unitPrice)}".`);
    }

    return {
      index,
      itemNo: String(index + 1),
      description: String(line.description || '-').trim() || '-',
      specification: toSpecBullets(String(line.specification || '')),
      quantity,
      unitPrice,
      lineTotal,
      remark: String(line.remark || '-').trim() || '-',
    };
  });

  const subtotal = Math.round(
    (normalizedLines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0) + Number.EPSILON) * 100
  ) / 100;
  const discount = 0;
  const vatRate = request.salesVatMode === 'with' ? normalizeNumber(request.salesVatRate) : 0;
  const tax = Math.round((((subtotal - discount) * (vatRate ?? 0)) / 100 + Number.EPSILON) * 100) / 100;
  const total = Math.round((subtotal - discount + tax + Number.EPSILON) * 100) / 100;

  const summary: FinancialSummary = { subtotal, discount, tax, total };
  return { lines: normalizedLines, summary, warnings };
};

const sourceLabelForPdf = (source: OfferAttachment['source'], t: any) => {
  if (source === 'technical') return String(t.clientOffer.sourceTechnical);
  if (source === 'design') return String(t.clientOffer.sourceDesign);
  if (source === 'costing') return String(t.clientOffer.sourceCosting);
  if (source === 'sales') return String(t.clientOffer.sourceSales);
  return String(t.clientOffer.sourceGeneral);
};

export const generateClientOfferPDF = async (
  request: CustomerRequest,
  configInput: ClientOfferConfig | undefined,
  profileInput: ClientOfferProfile,
  languageOverride?: Language
): Promise<void> => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const language = languageOverride ?? getPdfLanguage();
  const locale = getPdfLocale(language);
  const t = translations[language];
  const options = t.options as Record<string, string>;
  const translateOption = (value: string) => options[String(value ?? '')] || String(value ?? '');

  const useChineseFont = language === 'zh' ? await loadChineseFont(pdf) : false;
  const setFont = (weight: 'normal' | 'bold') => {
    if (useChineseFont) {
      pdf.setFont(CHINESE_FONT_NAME, 'normal');
      return;
    }
    pdf.setFont('helvetica', weight);
  };

  const profile: ClientOfferProfile = {
    companyNameLocal: String(profileInput?.companyNameLocal ?? ''),
    companyNameEn: String(profileInput?.companyNameEn ?? ''),
    address: String(profileInput?.address ?? ''),
    phone: String(profileInput?.phone ?? ''),
    email: String(profileInput?.email ?? ''),
    contactName: String(profileInput?.contactName ?? ''),
  };

  const config = normalizeOfferConfigForPdf(
    request,
    configInput,
    translateOption,
    String(t.clientOffer.defaultIntro)
  );

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const bottomMargin = 14 + FOOTER_RESERVED_HEIGHT;
  const contentBottomY = pageHeight - bottomMargin;
  const contentWidth = pageWidth - margin * 2;
  const pageHeaderHeight = 28;
  const ptToMm = (pt: number) => (pt * 25.4) / 72;
  const lineHeightMm = (fontSizePt: number) => ptToMm(fontSizePt) * pdf.getLineHeightFactor();
  const rgb = (hex: string) => {
    const c = hexToRgb(hex);
    return [c.r, c.g, c.b] as const;
  };

  let logo: { dataUrl: string; width: number; height: number } | null = null;
  try {
    logo = await loadImageAsBase64(LOGO_URL);
  } catch {
    logo = null;
  }

  let y = pageHeaderHeight + 6;

  const drawWatermark = () => {
    const line1 = String(profile.companyNameEn || profile.companyNameLocal || 'MONROC');
    const line2 = String(t.clientOffer.pdfTitle || 'Client Offer');
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;
    const angle = -35;
    const hasGState = typeof (pdf as any).GState === 'function' && typeof (pdf as any).setGState === 'function';

    try {
      (pdf as any).saveGraphicsState?.();
    } catch {}

    if (hasGState) {
      const gs1 = new (pdf as any).GState({ opacity: 0.035, fillOpacity: 0.035, strokeOpacity: 0.035 });
      (pdf as any).setGState(gs1);
      pdf.setFontSize(36);
      setFont('bold');
      pdf.text(line1, centerX, centerY, { align: 'center', angle } as any);

      const gs2 = new (pdf as any).GState({ opacity: 0.025, fillOpacity: 0.025, strokeOpacity: 0.025 });
      (pdf as any).setGState(gs2);
      pdf.setFontSize(18);
      pdf.text(line2, centerX, centerY + 10, { align: 'center', angle } as any);
    } else {
      pdf.setTextColor(236, 240, 244);
      pdf.setFontSize(36);
      setFont('bold');
      pdf.text(line1, centerX, centerY, { align: 'center', angle } as any);
      pdf.setFontSize(18);
      pdf.text(line2, centerX, centerY + 10, { align: 'center', angle } as any);
    }

    pdf.setTextColor(0, 0, 0);
    setFont('normal');
    try {
      (pdf as any).restoreGraphicsState?.();
    } catch {}
  };

  const drawPageHeader = () => {
    const [rr, rg, rb] = rgb(MONROC_RED);
    pdf.setDrawColor(rr, rg, rb);
    pdf.setLineWidth(1.1);
    pdf.line(0, 0.8, pageWidth, 0.8);

    const [cr, cg, cb] = rgb(PDF_COLOR.card);
    const [lr, lg, lb] = rgb(PDF_COLOR.line);
    const [mr, mg, mb] = rgb(PDF_COLOR.muted);
    pdf.setFillColor(cr, cg, cb);
    pdf.rect(0, 0, pageWidth, pageHeaderHeight, 'F');

    if (logo) {
      const maxH = 20;
      const maxW = 90;
      const scale = Math.min(maxW / logo.width, maxH / logo.height);
      const width = logo.width * scale;
      const height = logo.height * scale;
      const logoY = Math.max(2, (pageHeaderHeight - height) / 2);
      pdf.addImage(logo.dataUrl, 'PNG', margin, logoY, width, height);
    }

    const headerLeftX = margin + 42;
    const headerRightX = pageWidth - margin;

    pdf.setTextColor(mr, mg, mb);
    pdf.setFontSize(PDF_TYPE.micro);
    setFont('bold');
    pdf.text(String(profile.companyNameEn || profile.companyNameLocal || '-').toUpperCase(), headerLeftX, 9);
    setFont('normal');
    pdf.text(String(profile.address || '-'), headerLeftX, 13.8);

    setFont('bold');
    pdf.text(String(t.clientOffer.contactName || 'Contact').toUpperCase(), headerRightX, 9, { align: 'right' });
    setFont('normal');
    pdf.text(`${String(t.clientOffer.phone || 'Phone')}: ${profile.phone || '-'}`, headerRightX, 13.8, { align: 'right' });
    pdf.text(`${String(t.clientOffer.email || 'Email')}: ${profile.email || '-'}`, headerRightX, 18, { align: 'right' });

    pdf.setDrawColor(lr, lg, lb);
    pdf.setLineWidth(0.25);
    pdf.line(margin, pageHeaderHeight - 1.4, pageWidth - margin, pageHeaderHeight - 1.4);
    pdf.setTextColor(0, 0, 0);
  };

  const addPage = () => {
    pdf.addPage();
    drawPageHeader();
    y = pageHeaderHeight + 6;
  };

  const ensureSpace = (height: number) => {
    if (y + height <= contentBottomY) return;
    addPage();
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(8.4);
    pdf.setFontSize(PDF_TYPE.section);
    setFont('bold');
    const [ir, ig, ib] = rgb(PDF_COLOR.ink);
    const [lr, lg, lb] = rgb(PDF_COLOR.line);
    pdf.setTextColor(ir, ig, ib);
    pdf.text(title, margin, y);
    y += 4.2;
    pdf.setDrawColor(lr, lg, lb);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 3;
    pdf.setTextColor(0, 0, 0);
    setFont('normal');
  };

  const drawParagraph = (text: string, fontSize = PDF_TYPE.body) => {
    const raw = String(text ?? '').trim();
    if (!raw) return;
    pdf.setFontSize(fontSize);
    setFont('normal');
    const lines = pdf.splitTextToSize(raw, contentWidth) as string[];
    const lh = lineHeightMm(fontSize);
    for (const line of lines) {
      ensureSpace(lh + 0.8);
      pdf.text(line, margin, y);
      y += lh;
    }
    y += PDF_SPACE.s1;
  };

  const drawTitleCard = (offerDate: string) => {
    const cardH = 15.5;
    const [cr, cg, cb] = rgb(PDF_COLOR.card);
    const [lr, lg, lb] = rgb(PDF_COLOR.line);
    const [mr, mg, mb] = rgb(PDF_COLOR.muted);
    ensureSpace(cardH + PDF_SPACE.s2);
    pdf.setFillColor(cr, cg, cb);
    pdf.setDrawColor(lr, lg, lb);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(margin, y, contentWidth, cardH, 1.8, 1.8, 'FD');

    pdf.setFontSize(PDF_TYPE.title);
    setFont('bold');
    pdf.setTextColor(...rgb(PDF_COLOR.ink));
    pdf.text(String(t.clientOffer.pdfTitle), margin + 3, y + 5.8);

    const labelX = margin + contentWidth - 56;
    const valueX = margin + contentWidth - 3;
    pdf.setFontSize(PDF_TYPE.micro);
    pdf.setTextColor(mr, mg, mb);
    setFont('bold');
    pdf.text(`${String(t.clientOffer.offerNumber).toUpperCase()}:`, labelX, y + 5.7);
    pdf.text(`${String(t.clientOffer.offerDate).toUpperCase()}:`, labelX, y + 10.2);
    setFont('normal');
    pdf.setTextColor(...rgb(PDF_COLOR.ink));
    pdf.text(String(config.offerNumber || request.id || '-'), valueX, y + 5.7, { align: 'right' });
    pdf.text(String(offerDate), valueX, y + 10.2, { align: 'right' });

    y += cardH + PDF_SPACE.s2;
  };

  const drawMetaRows = (rows: Array<{ label: string; value: string }>) => {
    const labelWidth = 34;
    const rowH = 5.8;
    const [mr, mg, mb] = rgb(PDF_COLOR.muted);
    const [lr, lg, lb] = rgb(PDF_COLOR.line);
    for (const row of rows) {
      ensureSpace(rowH);
      pdf.setDrawColor(lr, lg, lb);
      pdf.setLineWidth(0.2);
      pdf.line(margin, y, pageWidth - margin, y);
      pdf.setFontSize(PDF_TYPE.micro);
      setFont('bold');
      pdf.setTextColor(mr, mg, mb);
      pdf.text(String(row.label || '-').toUpperCase(), margin, y + 3.8);
      pdf.setFontSize(PDF_TYPE.body);
      setFont('normal');
      pdf.setTextColor(...rgb(PDF_COLOR.ink));
      pdf.text(String(row.value || '-'), margin + labelWidth, y + 3.8);
      y += rowH;
    }
    pdf.setDrawColor(lr, lg, lb);
    pdf.line(margin, y, pageWidth - margin, y);
    y += PDF_SPACE.s2;
    pdf.setTextColor(0, 0, 0);
  };

  const drawTable = (
    headers: string[],
    rows: string[][],
    colWidths: number[],
    opts?: {
      rightAlignColumns?: number[];
      bodyFontSize?: number;
      headerFontSize?: number;
      rowPaddingY?: number;
      zebra?: boolean;
    }
  ) => {
    const padX = 2.2;
    const rowPaddingY = opts?.rowPaddingY ?? 1.8;
    const bodyFontSize = opts?.bodyFontSize ?? PDF_TYPE.table;
    const headerFontSize = opts?.headerFontSize ?? PDF_TYPE.micro;
    const rightAlignColumns = new Set(opts?.rightAlignColumns ?? []);
    const headerH = 8.8;
    const x = margin;

    const drawHeader = () => {
      ensureSpace(headerH);
      pdf.setFillColor(...rgb(PDF_COLOR.zebra));
      pdf.rect(x, y, contentWidth, headerH, 'F');
      pdf.setDrawColor(...rgb(PDF_COLOR.line));
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, contentWidth, headerH, 'S');

      pdf.setFontSize(headerFontSize);
      setFont('bold');
      pdf.setTextColor(...rgb(PDF_COLOR.muted));
      let cx = x;
      for (let idx = 0; idx < headers.length; idx += 1) {
        const w = colWidths[idx] ?? 20;
        if (rightAlignColumns.has(idx)) {
          pdf.text(headers[idx], cx + w - padX, y + 5.6, { align: 'right' });
        } else {
          pdf.text(headers[idx], cx + padX, y + 5.6);
        }
        cx += w;
      }
      setFont('normal');
      pdf.setTextColor(0, 0, 0);
      y += headerH;
    };

    drawHeader();

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const cellLines = row.map((cell, idx) => {
        const width = Math.max(10, (colWidths[idx] ?? 20) - padX * 2);
        const chunks = String(cell ?? '-').split('\n');
        const out: string[] = [];
        for (const chunk of chunks) {
          const wrapped = pdf.splitTextToSize(chunk, width) as string[];
          out.push(...(wrapped.length ? wrapped : ['']));
        }
        return out;
      });
      const rowH = Math.max(8.6, Math.max(...cellLines.map((lines) => lines.length)) * lineHeightMm(bodyFontSize) + rowPaddingY * 2);

      if (y + rowH > contentBottomY) {
        addPage();
        drawHeader();
      }

      if ((opts?.zebra ?? true) && rowIndex % 2 === 1) {
        pdf.setFillColor(...rgb(PDF_COLOR.card));
        pdf.rect(x, y, contentWidth, rowH, 'F');
      }

      pdf.setDrawColor(...rgb(PDF_COLOR.line));
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, contentWidth, rowH, 'S');

      let cx = x;
      for (let c = 0; c < row.length; c += 1) {
        if (c > 0) {
          pdf.line(cx, y, cx, y + rowH);
        }
        pdf.setFontSize(bodyFontSize);
        const w = colWidths[c] ?? 20;
        const lines = cellLines[c];
        if (rightAlignColumns.has(c)) {
          const lh = lineHeightMm(bodyFontSize);
          for (let li = 0; li < lines.length; li += 1) {
            pdf.text(lines[li], cx + w - padX, y + rowPaddingY + 3 + li * lh, { align: 'right' });
          }
        } else {
          pdf.text(lines, cx + padX, y + rowPaddingY + 3);
        }
        cx += w;
      }

      y += rowH;
    }

    y += PDF_SPACE.s1;
  };

  const attachmentOptions = collectRequestAttachments(request);
  const selectedAttachmentIds = new Set(config.selectedAttachmentIds);
  const selectedAttachments = attachmentOptions.filter((entry) => selectedAttachmentIds.has(String(entry.attachment.id ?? '').trim()));

  const normalizedSourceLines = (config.lines ?? []).map((line, index) => normalizeOfferLine(line, index));
  const includedLines = normalizedSourceLines.filter((line) => line.include !== false);
  const normalizedPayload = validateAndNormalizeOfferPdfData(
    includedLines.length ? includedLines : [{ id: 'line-1', include: true, description: '-', specification: '-', quantity: null, unitPrice: null, remark: '-' }],
    request
  );
  const normalizedRows = normalizedPayload.lines;
  const summary = normalizedPayload.summary;
  if (normalizedPayload.warnings.length) {
    console.warn('[client-offer-pdf] normalized mismatches:', normalizedPayload.warnings);
  }
  const normalizedTerms = normalizeTermsForPdf(request, t);

  const offerDate = format(new Date(), 'PPP', { locale });
  drawPageHeader();
  drawTitleCard(offerDate);
  drawMetaRows([
    { label: String(t.clientOffer.offerNumber), value: config.offerNumber || request.id },
    { label: String(t.clientOffer.offerDate), value: offerDate },
    { label: String(t.clientOffer.recipientName), value: config.recipientName || request.clientName || '-' },
    { label: String(t.table.requestId), value: request.id },
    {
      label: String(t.request.country),
      value: translateOption(resolveOtherValue(request.country, request.countryOther)) || '-',
    },
  ]);

  if (config.sectionVisibility.general) {
    drawSectionTitle(String(t.clientOffer.generalInformation));
    drawParagraph(config.introText || String(t.clientOffer.defaultIntro));
  }

  if (config.sectionVisibility.lineItems) {
    drawSectionTitle(String(t.clientOffer.lineItemsTitle));

    const headers = [
      String(t.clientOffer.item),
      String(t.clientOffer.description),
      String(t.clientOffer.specification),
      String(t.clientOffer.quantity),
      String(t.clientOffer.unitPrice),
      String(t.clientOffer.lineTotal || t.clientOffer.total),
      String(t.clientOffer.remark),
    ];

    const colWidths = [10, 32, 50, 13, 23, 23, contentWidth - (10 + 32 + 50 + 13 + 23 + 23)];
    const rows: string[][] = normalizedRows.map((line) => [
      line.itemNo,
      line.description,
      line.specification.join('\n'),
      line.quantity === null ? '-' : String(Math.trunc(line.quantity)),
      formatMoney(line.unitPrice, request.salesCurrency || 'EUR'),
      formatMoney(line.lineTotal, request.salesCurrency || 'EUR'),
      line.remark,
    ]);
    drawTable(headers, rows, colWidths, {
      rightAlignColumns: [3, 4, 5],
      bodyFontSize: PDF_TYPE.table,
      headerFontSize: PDF_TYPE.micro,
      rowPaddingY: 2.2,
      zebra: true,
    });

    const summaryWidth = 68;
    const rowH = 5.6;
    const summaryRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: String(t.clientOffer.subtotal || 'Subtotal'), value: formatMoney(summary.subtotal, request.salesCurrency || 'EUR') },
      { label: String(t.clientOffer.discount || 'Discount'), value: formatMoney(summary.discount, request.salesCurrency || 'EUR') },
      { label: String(t.clientOffer.taxes || 'Taxes'), value: formatMoney(summary.tax, request.salesCurrency || 'EUR') },
      { label: String(t.common.total), value: formatMoney(summary.total, request.salesCurrency || 'EUR'), bold: true },
    ];
    const summaryHeight = rowH * summaryRows.length + 3.2;
    ensureSpace(summaryHeight + PDF_SPACE.s2);
    const x = pageWidth - margin - summaryWidth;
    pdf.setDrawColor(...rgb(PDF_COLOR.line));
    pdf.setFillColor(...rgb(PDF_COLOR.card));
    pdf.roundedRect(x, y, summaryWidth, summaryHeight, 1.6, 1.6, 'FD');
    let sy = y + 3.8;
    for (const row of summaryRows) {
      pdf.setFontSize(PDF_TYPE.table);
      setFont(row.bold ? 'bold' : 'normal');
      pdf.setTextColor(...rgb(row.bold ? PDF_COLOR.ink : PDF_COLOR.muted));
      pdf.text(row.label, x + 2.2, sy);
      pdf.text(row.value, x + summaryWidth - 2.2, sy, { align: 'right' });
      sy += rowH;
    }
    setFont('normal');
    pdf.setTextColor(0, 0, 0);
    y += summaryHeight + PDF_SPACE.s2;
  }

  if (config.sectionVisibility.commercialTerms || config.sectionVisibility.deliveryTerms) {
    drawSectionTitle(
      config.sectionVisibility.commercialTerms && config.sectionVisibility.deliveryTerms
        ? `${String(t.clientOffer.commercialTermsTitle)} / ${String(t.clientOffer.deliveryTermsTitle)}`
        : config.sectionVisibility.commercialTerms
          ? String(t.clientOffer.commercialTermsTitle)
          : String(t.clientOffer.deliveryTermsTitle)
    );

    const showCommercial = config.sectionVisibility.commercialTerms;
    const showDelivery = config.sectionVisibility.deliveryTerms;
    const dualCards = showCommercial && showDelivery;
    const gap = 4;
    const cardW = dualCards ? (contentWidth - gap) / 2 : contentWidth;
    const cardTitleH = 5.4;
    const rowLabelGap = 2.5;
    const rowAfterGap = 1.5;

    const estimateCardHeight = (rows: Array<{ label: string; value: string }>) => {
      let h = cardTitleH + 2.2;
      for (const row of rows) {
        const wrapped = pdf.splitTextToSize(row.value, cardW - 4.4) as string[];
        const shownLines = Math.max(1, Math.min(2, wrapped.length));
        h += rowLabelGap + shownLines * lineHeightMm(PDF_TYPE.table) + rowAfterGap;
      }
      return h + 1.4;
    };

    const commercialRows = normalizedTerms.commercial;
    const deliveryRows = normalizedTerms.delivery;
    const cardH = Math.max(
      showCommercial ? estimateCardHeight(commercialRows) : 0,
      showDelivery ? estimateCardHeight(deliveryRows) : 0
    );
    ensureSpace(cardH + PDF_SPACE.s1);

    const drawTermCard = (x: number, title: string, rows: Array<{ label: string; value: string }>) => {
      pdf.setFillColor(...rgb(PDF_COLOR.card));
      pdf.setDrawColor(...rgb(PDF_COLOR.line));
      pdf.roundedRect(x, y, cardW, cardH, 1.6, 1.6, 'FD');
      pdf.setFontSize(PDF_TYPE.micro);
      setFont('bold');
      pdf.setTextColor(...rgb(PDF_COLOR.muted));
      pdf.text(title.toUpperCase(), x + 2.2, y + 3.9);
      let ry = y + cardTitleH + 1.8;
      for (const row of rows) {
        pdf.setFontSize(PDF_TYPE.micro);
        setFont('bold');
        pdf.setTextColor(...rgb(PDF_COLOR.muted));
        pdf.text(`${row.label}:`, x + 2.2, ry);
        pdf.setFontSize(PDF_TYPE.table);
        setFont('normal');
        pdf.setTextColor(...rgb(PDF_COLOR.ink));
        const wrapped = pdf.splitTextToSize(row.value, cardW - 4.4) as string[];
        const shown = wrapped.slice(0, 2);
        const valueY = ry + rowLabelGap;
        pdf.text(shown.length ? shown : ['-'], x + 2.2, valueY);
        ry = valueY + Math.max(1, shown.length) * lineHeightMm(PDF_TYPE.table) + rowAfterGap;
      }
    };

    if (showCommercial) {
      drawTermCard(margin, String(t.clientOffer.commercialTermsTitle), commercialRows);
    }
    if (showDelivery) {
      drawTermCard(showCommercial && dualCards ? margin + cardW + gap : margin, String(t.clientOffer.deliveryTermsTitle), deliveryRows);
    }
    y += cardH + PDF_SPACE.s1;
  }

  if (config.sectionVisibility.appendix && selectedAttachments.length) {
    addPage();
    drawSectionTitle(String(t.clientOffer.appendixTitle));

    const indexHeaders = [
      String(t.pdf.appendixIdLabel),
      String(t.clientOffer.source),
      String(t.pdf.fileLabel),
    ];
    const indexWidths = [24, 34, contentWidth - (24 + 34)];
    const indexRows = selectedAttachments.map((entry, index) => [
      `A.${index + 1}`,
      sourceLabelForPdf(entry.source, t),
      String(entry.attachment.filename || '-'),
    ]);

    drawTable(indexHeaders, indexRows, indexWidths);

    const drawImageFit = async (dataUrl: string) => {
      const image = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = dataUrl;
      });

      const availableWidth = pageWidth - margin * 2;
      const availableHeight = contentBottomY - y;
      const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
      const renderW = image.width * scale;
      const renderH = image.height * scale;
      const renderX = margin + (availableWidth - renderW) / 2;
      const formatHint = dataUrl.toLowerCase().startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
      pdf.addImage(dataUrl, formatHint as any, renderX, y, renderW, renderH);
      y += renderH + 4;
    };

    for (let index = 0; index < selectedAttachments.length; index += 1) {
      const entry = selectedAttachments[index];
      addPage();
      drawSectionTitle(`${String(t.clientOffer.appendixTitle)} A.${index + 1}`);
      drawParagraph(`${sourceLabelForPdf(entry.source, t)} - ${String(entry.attachment.filename || '-')}`, 9);

      const preview = await attachmentToPreview(entry.attachment, t);
      if (preview.kind === 'image' && preview.dataUrls?.length) {
        await drawImageFit(preview.dataUrls[0]);
        continue;
      }
      if (preview.kind === 'pdf' && preview.dataUrls?.length) {
        for (let pageIndex = 0; pageIndex < preview.dataUrls.length; pageIndex += 1) {
          if (pageIndex > 0) {
            addPage();
            drawSectionTitle(`${String(t.clientOffer.appendixTitle)} A.${index + 1} (${pageIndex + 1}/${preview.dataUrls.length})`);
          }
          await drawImageFit(preview.dataUrls[pageIndex]);
        }
        continue;
      }

      drawParagraph(preview.note || String(t.pdf.previewNotAvailableGeneric || 'Preview not available.'), 9.5);
    }
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    drawWatermark();
    const [fr, fg, fb] = rgb(PDF_COLOR.footerBg);
    const [lr, lg, lb] = rgb(PDF_COLOR.line);
    const [mr, mg, mb] = rgb(PDF_COLOR.muted);
    const footerTopY = pageHeight - FOOTER_RESERVED_HEIGHT;
    pdf.setFillColor(fr, fg, fb);
    pdf.setDrawColor(lr, lg, lb);
    pdf.rect(0, footerTopY, pageWidth, FOOTER_RESERVED_HEIGHT, 'FD');
    pdf.setFontSize(PDF_TYPE.footer);
    pdf.setTextColor(mr, mg, mb);
    const pageLabel = String(t.pdf.pageOfLabel || 'Page {current} of {total}')
      .replace('{current}', String(page))
      .replace('{total}', String(pageCount));
    const leftText = String(t.clientOffer.footerConfidential || 'CONFIDENTIAL - INTERNAL USE ONLY');
    const centerText = String(t.clientOffer.footerPropertyOf || 'PROPERTY OF MONROC');
    const rightText = `${config.offerNumber || request.id} | ${pageLabel}`;
    pdf.text(leftText, margin, pageHeight - 4.6);
    pdf.text(centerText, pageWidth / 2, pageHeight - 4.6, { align: 'center' });
    pdf.text(rightText, pageWidth - margin, pageHeight - 4.6, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  }

  const safeOfferNumber = sanitizeFileToken(String(config.offerNumber || request.id || 'offer'), 'offer');
  const safeClientName = sanitizeFileToken(String(config.recipientName || request.clientName || 'client'), 'client');
  pdf.save(`${safeOfferNumber}_${safeClientName}.pdf`);
};
