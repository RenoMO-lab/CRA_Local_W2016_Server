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

const LOGO_URL = '/monroc-logo.png';
const CHINESE_FONT_FILE = '/fonts/simhei.ttf';
const CHINESE_FONT_NAME = 'simhei';
const MONROC_RED = '#FA0000';

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
  const bottomMargin = 14;
  const contentWidth = pageWidth - margin * 2;
  const pageHeaderHeight = 26;
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
    const line1 = String(t.pdf.watermarkLine1 ?? 'CONFIDENTIAL - INTERNAL USE ONLY');
    const line2 = String(t.pdf.watermarkLine2 ?? 'PROPERTY OF MONROC');
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;
    const angle = -35;
    const hasGState = typeof (pdf as any).GState === 'function' && typeof (pdf as any).setGState === 'function';

    try {
      (pdf as any).saveGraphicsState?.();
    } catch {}

    if (hasGState) {
      const gs1 = new (pdf as any).GState({ opacity: 0.05, fillOpacity: 0.05, strokeOpacity: 0.05 });
      (pdf as any).setGState(gs1);
      pdf.setFontSize(36);
      setFont('bold');
      pdf.text(line1, centerX, centerY, { align: 'center', angle } as any);

      const gs2 = new (pdf as any).GState({ opacity: 0.035, fillOpacity: 0.035, strokeOpacity: 0.035 });
      (pdf as any).setGState(gs2);
      pdf.setFontSize(18);
      pdf.text(line2, centerX, centerY + 10, { align: 'center', angle } as any);
    } else {
      pdf.setTextColor(230, 230, 230);
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

    pdf.setFillColor(248, 250, 252);
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

    pdf.setFontSize(8.5);
    setFont('normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text(profile.companyNameEn || profile.companyNameLocal, pageWidth - margin, 9, { align: 'right' });
    pdf.text(profile.address || '-', pageWidth - margin, 13.5, { align: 'right' });
    pdf.text(`${profile.phone || '-'} | ${profile.email || '-'}`, pageWidth - margin, 18, { align: 'right' });
    pdf.setTextColor(0, 0, 0);
  };

  const addPage = () => {
    pdf.addPage();
    drawPageHeader();
    y = pageHeaderHeight + 6;
  };

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - bottomMargin) return;
    addPage();
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(10);
    pdf.setFontSize(12);
    setFont('bold');
    pdf.setTextColor(15, 23, 42);
    pdf.text(title, margin, y);
    y += 5;
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 4;
    pdf.setTextColor(0, 0, 0);
    setFont('normal');
  };

  const drawParagraph = (text: string, fontSize = 10) => {
    const raw = String(text ?? '').trim();
    if (!raw) return;
    pdf.setFontSize(fontSize);
    setFont('normal');
    const lines = pdf.splitTextToSize(raw, contentWidth) as string[];
    const lh = lineHeightMm(fontSize);
    for (const line of lines) {
      ensureSpace(lh + 1);
      pdf.text(line, margin, y);
      y += lh;
    }
    y += 2;
  };

  const drawMetaTable = (rows: Array<{ label: string; value: string }>) => {
    const labelWidth = 40;
    const rowH = 7;
    for (const row of rows) {
      ensureSpace(rowH);
      pdf.setFillColor(248, 250, 252);
      pdf.rect(margin, y - 5.6, labelWidth, rowH, 'F');
      pdf.rect(margin + labelWidth, y - 5.6, contentWidth - labelWidth, rowH, 'S');
      pdf.rect(margin, y - 5.6, labelWidth, rowH, 'S');
      pdf.setFontSize(9);
      setFont('bold');
      pdf.setTextColor(100, 116, 139);
      pdf.text(row.label, margin + 2, y - 1.3);
      setFont('normal');
      pdf.setTextColor(0, 0, 0);
      pdf.text(String(row.value || '-'), margin + labelWidth + 2, y - 1.3);
      y += rowH;
    }
    y += 2;
  };

  const drawTable = (headers: string[], rows: string[][], colWidths: number[]) => {
    const padX = 1.8;
    const headerH = 7.5;
    const x = margin;

    const drawHeader = () => {
      ensureSpace(headerH);
      pdf.setFillColor(241, 245, 249);
      pdf.rect(x, y, contentWidth, headerH, 'F');
      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, contentWidth, headerH, 'S');

      pdf.setFontSize(8.5);
      setFont('bold');
      pdf.setTextColor(71, 85, 105);
      let cx = x;
      for (let idx = 0; idx < headers.length; idx += 1) {
        pdf.text(headers[idx], cx + padX, y + 4.9);
        cx += colWidths[idx] ?? 20;
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
        return pdf.splitTextToSize(String(cell ?? '-'), width) as string[];
      });
      const rowH = Math.max(6.6, Math.max(...cellLines.map((lines) => lines.length)) * lineHeightMm(8.3) + 2.4);

      if (y + rowH > pageHeight - bottomMargin) {
        addPage();
        drawHeader();
      }

      if (rowIndex % 2 === 1) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(x, y, contentWidth, rowH, 'F');
      }

      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, contentWidth, rowH, 'S');

      let cx = x;
      for (let c = 0; c < row.length; c += 1) {
        if (c > 0) {
          pdf.line(cx, y, cx, y + rowH);
        }
        pdf.setFontSize(8.3);
        pdf.text(cellLines[c], cx + padX, y + 3.8);
        cx += colWidths[c] ?? 20;
      }

      y += rowH;
    }

    y += 2;
  };

  const attachmentOptions = collectRequestAttachments(request);
  const selectedAttachmentIds = new Set(config.selectedAttachmentIds);
  const selectedAttachments = attachmentOptions.filter((entry) => selectedAttachmentIds.has(String(entry.attachment.id ?? '').trim()));

  const normalizedLines = (config.lines ?? []).map((line, index) => normalizeOfferLine(line, index));
  const includedLines = normalizedLines.filter((line) => line.include !== false);

  const offerDate = format(new Date(), 'PPP', { locale });
  drawPageHeader();

  pdf.setFontSize(18);
  setFont('bold');
  pdf.text(String(t.clientOffer.pdfTitle), margin, y);
  y += 8;

  drawMetaTable([
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
      String(t.clientOffer.total),
      String(t.clientOffer.remark),
    ];

    const colWidths = [10, 32, 46, 16, 20, 20, contentWidth - (10 + 32 + 46 + 16 + 20 + 20)];
    const rows: string[][] = [];

    includedLines.forEach((line, index) => {
      const qty = line.quantity;
      const price = line.unitPrice;
      const total = qty !== null && price !== null ? qty * price : null;
      rows.push([
        String(index + 1),
        line.description || '-',
        line.specification || '-',
        qty === null ? '-' : String(qty),
        formatMoney(price, request.salesCurrency || 'EUR'),
        formatMoney(total, request.salesCurrency || 'EUR'),
        line.remark || '-',
      ]);
    });

    if (!rows.length) {
      rows.push(['1', '-', '-', '-', '-', '-', '-']);
    }

    drawTable(headers, rows, colWidths);

    const grandTotal = includedLines.reduce((sum, line) => {
      if (line.quantity === null || line.unitPrice === null) return sum;
      return sum + line.quantity * line.unitPrice;
    }, 0);

    ensureSpace(8);
    pdf.setFontSize(10);
    setFont('bold');
    pdf.text(
      `${String(t.common.total)}: ${formatMoney(Number.isFinite(grandTotal) ? grandTotal : null, request.salesCurrency || 'EUR')}`,
      pageWidth - margin,
      y,
      { align: 'right' }
    );
    y += 5;
  }

  const commercialTerms: string[] = [];
  if (typeof request.salesFinalPrice === 'number') {
    commercialTerms.push(`${String(t.panels.salesFinalPrice)}: ${formatMoney(request.salesFinalPrice, request.salesCurrency || 'EUR')}`);
  }
  if ((request.salesOfferValidityPeriod ?? '').trim()) {
    commercialTerms.push(`${String(t.panels.offerValidityPeriod)}: ${String(request.salesOfferValidityPeriod).trim()}`);
  }
  if (Array.isArray(request.salesPaymentTerms) && request.salesPaymentTerms.length) {
    const paymentText = request.salesPaymentTerms
      .filter((term) => (term.paymentName ?? '').trim() || term.paymentPercent !== null)
      .map((term) => {
        const percent = typeof term.paymentPercent === 'number' ? `${term.paymentPercent}%` : '-';
        const name = (term.paymentName ?? '').trim() || '-';
        return `${name} (${percent})`;
      })
      .join('; ');
    if (paymentText) {
      commercialTerms.push(`${String(t.panels.paymentTerms)}: ${paymentText}`);
    }
  }
  if (!commercialTerms.length) {
    commercialTerms.push(String(t.clientOffer.defaultCommercialTerm));
  }

  const deliveryTerms: string[] = [];
  if ((request.salesExpectedDeliveryDate ?? '').trim()) {
    deliveryTerms.push(`${String(t.panels.salesExpectedDeliveryDate)}: ${String(request.salesExpectedDeliveryDate).trim()}`);
  }
  const incoterm = request.salesIncoterm === 'other' ? request.salesIncotermOther : request.salesIncoterm;
  if ((incoterm ?? '').trim()) {
    deliveryTerms.push(`${String(t.panels.incoterm)}: ${String(incoterm).trim()}`);
  }
  if ((request.salesWarrantyPeriod ?? '').trim()) {
    deliveryTerms.push(`${String(t.panels.warrantyPeriod)}: ${String(request.salesWarrantyPeriod).trim()}`);
  }
  if (!deliveryTerms.length) {
    deliveryTerms.push(String(t.clientOffer.defaultDeliveryTerm));
  }

  if (config.sectionVisibility.commercialTerms) {
    drawSectionTitle(String(t.clientOffer.commercialTermsTitle));
    for (const term of commercialTerms) {
      drawParagraph(`- ${term}`, 9.5);
    }
  }

  if (config.sectionVisibility.deliveryTerms) {
    drawSectionTitle(String(t.clientOffer.deliveryTermsTitle));
    for (const term of deliveryTerms) {
      drawParagraph(`- ${term}`, 9.5);
    }
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
      const availableHeight = pageHeight - bottomMargin - y;
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
    pdf.setFontSize(7.4);
    pdf.setTextColor(148, 163, 184);
    const pageLabel = String(t.pdf.pageOfLabel || 'Page {current} of {total}')
      .replace('{current}', String(page))
      .replace('{total}', String(pageCount));
    const footer = `${String(t.clientOffer.pdfTitle)} | ${config.offerNumber || request.id} | ${pageLabel}`;
    pdf.text(footer, pageWidth / 2, pageHeight - 5.5, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  const safeOfferNumber = String(config.offerNumber || request.id || 'client-offer').replace(/[^a-zA-Z0-9-_]+/g, '_');
  pdf.save(`${safeOfferNumber}_client_offer.pdf`);
};
