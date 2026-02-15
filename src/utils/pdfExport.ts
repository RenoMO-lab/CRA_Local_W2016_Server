import jsPDF from 'jspdf';
import { Attachment, CustomerRequest, RequestProduct, STATUS_CONFIG, AXLE_LOCATIONS, ARTICULATION_TYPES, CONFIGURATION_TYPES, STANDARD_STUDS_PCD_OPTIONS } from '@/types';
import { format } from 'date-fns';
import { enUS, fr, zhCN } from 'date-fns/locale';
import { translations, Language } from '@/i18n/translations';

const MONROC_RED = '#FA0000';
const LIGHT_GREY = '#F3F4F6';
const MID_GREY = '#6B7280';
const TEXT_GREY = '#4B5563';
const LOGO_URL = '/monroc-logo.png';
const CHINESE_FONT_FILE = '/fonts/simhei.ttf';
const CHINESE_FONT_NAME = 'simhei';

let chineseFontLoaded = false;

const arrayBufferToBase64 = (buffer: ArrayBuffer) =>
  new Promise<string>((resolve, reject) => {
    // Avoid huge String.fromCharCode spreads and btoa() limits for large TTFs.
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read font'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      if (!result.startsWith('data:') || comma === -1) {
        reject(new Error('Unexpected font data URL'));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(new Blob([buffer], { type: 'font/ttf' }));
  });

const loadChineseFont = async (pdf: jsPDF) => {
  if (chineseFontLoaded) return true;
  try {
    const response = await fetch(CHINESE_FONT_FILE);
    if (!response.ok) {
      return false;
    }
    const fontData = await response.arrayBuffer();
    const fontBase64 = await arrayBufferToBase64(fontData);
    pdf.addFileToVFS('simhei.ttf', fontBase64);
    pdf.addFont('simhei.ttf', CHINESE_FONT_NAME, 'normal');
    chineseFontLoaded = true;
    return true;
  } catch (error) {
    console.warn('Could not load Chinese PDF font:', error);
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
  switch (language) {
    case 'fr':
      return fr;
    case 'zh':
      return zhCN;
    default:
      return enUS;
  }
};

const getProductTypeLabel = (
  product: Partial<RequestProduct>,
  translateOption?: (value: string) => string
): string => {
  const translate = translateOption ?? ((value: string) => value);
  const parts: string[] = [];
  const excludedValues = ['n/a', 'na', '-', ''];
  
  const addPart = (value: string | undefined) => {
    if (value && !excludedValues.includes(value.toLowerCase().trim())) {
      parts.push(value);
    }
  };
  
  if (product.axleLocation) {
    if (product.axleLocation === 'other' && product.axleLocationOther) {
      addPart(product.axleLocationOther);
    } else {
      const found = AXLE_LOCATIONS.find(p => p.value === product.axleLocation);
      addPart(found ? translate(found.label) : String(product.axleLocation));
    }
  }
  
  if (product.articulationType) {
    if (product.articulationType === 'other' && product.articulationTypeOther) {
      addPart(product.articulationTypeOther);
    } else {
      const found = ARTICULATION_TYPES.find(p => p.value === product.articulationType);
      addPart(found ? translate(found.label) : String(product.articulationType));
    }
  }
  
  if (product.configurationType) {
    if (product.configurationType === 'other' && product.configurationTypeOther) {
      addPart(product.configurationTypeOther);
    } else {
      const found = CONFIGURATION_TYPES.find(p => p.value === product.configurationType);
      addPart(found ? translate(found.label) : String(product.configurationType));
    }
  }
  
  // Empty string means "omit the field" in the PDF (more compact than printing "-").
  return parts.length > 0 ? parts.join(' / ') : '';
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

const hexToRgb = (hex: string) => {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const getDisplayValue = (value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const resolveOtherValue = (value: string | null | undefined, other?: string | null) => {
  if (!value) return '';
  if (value === 'other') return other?.trim() || '';
  return value;
};

const formatStudsPcdSelection = (selection: string): string => {
  const match = selection.match(/^STD_(\d+)_M(\d+)_([0-9]+)_([0-9]+)$/);
  if (match) {
    const [, count, bolt, pcd1, pcd2] = match;
    return `${count} x M${bolt} studs - PCD ${pcd1}/${pcd2}`;
  }
  if (selection.startsWith('STD_')) {
    return selection.replace(/_/g, ' ');
  }
  return selection;
};const buildLegacyProduct = (request: CustomerRequest): RequestProduct => ({
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

export const generateRequestPDF = async (request: CustomerRequest, languageOverride?: Language): Promise<void> => {
  const pdf = new jsPDF("p", "mm", "a4");
  const language = languageOverride ?? getPdfLanguage();
  const useChineseFont = language === "zh" ? await loadChineseFont(pdf) : false;

  const setFont = (weight: "normal" | "bold") => {
    if (useChineseFont) {
      pdf.setFont(CHINESE_FONT_NAME, "normal");
      return;
    }
    pdf.setFont("helvetica", weight);
  };

  const t = translations[language];
  const locale = getPdfLocale(language);
  const formatDate = (date: Date, pattern: string) => format(date, pattern, { locale });

  const translateOption = (value: string) => {
    const options = t.options as Record<string, string>;
    return options?.[value] || value;
  };

  const translateBrakeType = (value: string | null | undefined) => {
    if (!value) return "";
    if (value === "drum") return t.request.drum;
    if (value === "disk") return t.request.disk;
    if (value === "na") return t.request.na;
    return translateOption(value);
  };

  const translateResolvedOption = (value: string | null | undefined, other?: string | null) => {
    const resolved = resolveOtherValue(value, other);
    if (!resolved) return "";
    if (value === "other") return resolved;
    return translateOption(resolved);
  };

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 16;
  // Needs to fit: request id + status badge + generated timestamp without overlap.
  const pageHeaderHeight = 24;
  const ptToMm = (pt: number) => (pt * 25.4) / 72;
  const lineHeightMm = (fontSizePt: number) => ptToMm(fontSizePt) * pdf.getLineHeightFactor();

  const COLORS = {
    border: "#E5E7EB",
    headerFill: "#F3F4F6",
    zebra: "#F9FAFB",
    title: "#0F172A",
    muted: "#64748B",
  } as const;

  const statusAccent = (status: string) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("reject") || s.includes("clarification")) return "#DC2626";
    if (s.includes("approved") || s.includes("complete") || s.includes("confirmed")) return "#16A34A";
    if (s.includes("pending") || s.includes("review")) return "#F59E0B";
    if (s.includes("submitted") || s.includes("costing") || s.includes("sales")) return "#2563EB";
    return "#6B7280";
  };

  const getDisplayValueLocal = (value: string | number | null | undefined) => getDisplayValue(value);
  const hasDisplayValueLocal = (value: string | number | null | undefined) => getDisplayValueLocal(value) !== null;

  const rgb = (hex: string) => {
    const v = hexToRgb(hex);
    return [v.r, v.g, v.b] as const;
  };

  const estimateBase64Bytes = (rawUrl: string): number | null => {
    const url = String(rawUrl ?? "");
    if (!url) return null;
    let b64 = "";
    if (url.startsWith("data:")) {
      const comma = url.indexOf(",");
      if (comma === -1) return null;
      b64 = url.slice(comma + 1);
    } else if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("/")) {
      // Some attachments are stored as raw base64 strings.
      b64 = url;
    } else {
      return null;
    }
    const cleaned = b64.replace(/[\r\n\s]/g, "");
    if (!cleaned) return null;
    const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "-";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(0)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const formatAttachmentType = (type: string) => {
    const v = String(type ?? "").toLowerCase();
    if (v === "rim_drawing") return t.request.rimDrawing;
    if (v === "picture") return t.request.picturesLabel;
    if (v === "spec") return "Spec";
    return translateOption(type);
  };

  const decodeBase64ToBytes = (b64: string): Uint8Array => {
    const cleaned = String(b64 ?? "").replace(/[\r\n\s]/g, "");
    const bin = atob(cleaned);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  const sniffMimeFromBytes = (bytes: Uint8Array): string | null => {
    if (!bytes || bytes.length < 4) return null;
    // %PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
    // PNG
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
      return "image/png";
    }
    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    return null;
  };

  const sniffMimeFromBase64 = (b64: string): string | null => {
    const cleaned = String(b64 ?? "").replace(/[\r\n\s]/g, "");
    if (!cleaned) return null;
    const prefixLen = Math.min(cleaned.length, 2048);
    const sliceLen = prefixLen - (prefixLen % 4);
    const sample = cleaned.slice(0, Math.max(4, sliceLen));
    try {
      const sampleBytes = decodeBase64ToBytes(sample);
      return sniffMimeFromBytes(sampleBytes);
    } catch {
      return null;
    }
  };

  const parseDataUrl = (url: string) => {
    const raw = String(url ?? "");
    if (!raw.startsWith("data:")) return null;
    const comma = raw.indexOf(",");
    if (comma === -1) return null;
    const header = raw.slice(0, comma);
    const body = raw.slice(comma + 1);
    const mimeMatch = header.match(/^data:([^;]+)(;base64)?$/i);
    const mime = mimeMatch?.[1] ? String(mimeMatch[1]).toLowerCase() : "";
    const isBase64 = header.toLowerCase().includes(";base64");
    return { mime, isBase64, body };
  };

  const isProbablyRawBase64 = (url: string) => {
    const u = String(url ?? "");
    return u && !u.startsWith("data:") && !u.startsWith("http://") && !u.startsWith("https://") && !u.startsWith("/");
  };

  const loadImageDimensions = (src: string): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = src;
    });

  const drawAppendixAttachmentHeader = (title: string, extra?: string) => {
    pdf.setFontSize(12);
    setFont("bold");
    const [tr, tg, tb] = rgb(COLORS.title);
    pdf.setTextColor(tr, tg, tb);
    pdf.text(title, margin, y);
    setFont("normal");
    pdf.setTextColor(0, 0, 0);
    y += 6;
    if (extra) {
      pdf.setFontSize(9);
      const [mr, mg, mb] = rgb(COLORS.muted);
      pdf.setTextColor(mr, mg, mb);
      pdf.text(extra, margin, y);
      pdf.setTextColor(0, 0, 0);
      y += 6;
    }
  };

  const drawImageFit = async (dataUrl: string) => {
    const dims = await loadImageDimensions(dataUrl);
    const availW = pageWidth - margin * 2;
    const availH = pageHeight - bottomMargin - y;
    const scale = Math.min(availW / dims.width, availH / dims.height);
    const wMm = dims.width * scale;
    const hMm = dims.height * scale;
    const x = margin + (availW - wMm) / 2;
    const format = dataUrl.toLowerCase().startsWith("data:image/jpeg") ? "JPEG" : "PNG";
    pdf.addImage(dataUrl, format as any, x, y, wMm, hMm);
    y += hMm + 6;
  };

  const renderPdfBytesToImages = async (bytes: Uint8Array, maxPages: number): Promise<string[]> => {
    // Dynamic import to avoid loading PDF.js unless needed.
    const pdfjs: any = await import("pdfjs-dist");
    try {
      // Vite-friendly worker URL
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    } catch {}

    const loadingTask = pdfjs.getDocument({ data: bytes });
    const doc = await loadingTask.promise;
    const pageCount = Math.min(doc.numPages || 0, maxPages);
    const out: string[] = [];

    for (let p = 1; p <= pageCount; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.92));
    }
    return out;
  };

  const attachmentToPreview = async (att: Attachment): Promise<{ kind: "image" | "pdf" | "none"; dataUrls?: string[]; note?: string }> => {
    const url = String(att?.url ?? "");
    if (!url) return { kind: "none" };

    // data URL
    const parsed = parseDataUrl(url);
    if (parsed) {
      const mime = parsed.mime || "";
      if (mime.startsWith("image/")) {
        return { kind: "image", dataUrls: [url] };
      }
      if (mime === "application/pdf") {
        if (!parsed.isBase64) return { kind: "none", note: "PDF preview not available (not base64)." };
        const bytes = decodeBase64ToBytes(parsed.body);
        const imgs = await renderPdfBytesToImages(bytes, 10);
        return { kind: "pdf", dataUrls: imgs };
      }
    }

    // raw base64 (stored without data: prefix)
    if (isProbablyRawBase64(url)) {
      const mime = sniffMimeFromBase64(url);
      if (mime === "image/png" || mime === "image/jpeg") {
        return { kind: "image", dataUrls: [`data:${mime};base64,${url}`] };
      }
      if (mime === "application/pdf") {
        const bytes = decodeBase64ToBytes(url);
        const imgs = await renderPdfBytesToImages(bytes, 10);
        return { kind: "pdf", dataUrls: imgs };
      }
      return { kind: "none", note: "Preview not available for this file type." };
    }

    // remote/relative URL
    try {
      const res = await fetch(url);
      if (!res.ok) return { kind: "none", note: `Failed to fetch attachment (${res.status}).` };
      const ab = await res.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const mime = String(res.headers.get("content-type") || "").toLowerCase() || sniffMimeFromBytes(bytes) || "";
      if (mime.startsWith("image/")) {
        const b64 = await arrayBufferToBase64(ab);
        return { kind: "image", dataUrls: [`data:${mime};base64,${b64}`] };
      }
      if (mime.includes("pdf") || mime === "application/pdf") {
        const imgs = await renderPdfBytesToImages(bytes, 10);
        return { kind: "pdf", dataUrls: imgs };
      }
      return { kind: "none", note: "Preview not available for this file type." };
    } catch (e) {
      return { kind: "none", note: "Failed to load attachment for preview." };
    }
  };

  const statusLabel = t.statuses[request.status] || STATUS_CONFIG[request.status]?.label || request.status;
  const accent = statusAccent(request.status);

  let cachedLogo: { dataUrl: string; width: number; height: number } | null = null;
  try {
    cachedLogo = await loadImageAsBase64(LOGO_URL);
  } catch {
    cachedLogo = null;
  }

  // Keep a small gap below the header band.
  let y = pageHeaderHeight + 8;

  const drawStatusBadge = (text: string, xRight: number, yTop: number) => {
    const padX = 3;
    const padY = 2.2;
    pdf.setFontSize(9);
    setFont("bold");
    const w = pdf.getTextWidth(text) + padX * 2;
    const h = 6.6;
    const x = xRight - w;
    const [r, g, b] = rgb(accent);
    pdf.setFillColor(r, g, b);
    pdf.roundedRect(x, yTop, w, h, 2.4, 2.4, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.text(text, x + padX, yTop + padY + 2.3);
    pdf.setTextColor(0, 0, 0);
    setFont("normal");
  };

  const drawPageHeader = (isFirstPage: boolean) => {
    // Top accent line.
    const [rr, rg, rb] = rgb(MONROC_RED);
    pdf.setDrawColor(rr, rg, rb);
    pdf.setLineWidth(1.2);
    pdf.line(0, 0.8, pageWidth, 0.8);

    // Light header background.
    const [fr, fg, fb] = rgb(COLORS.headerFill);
    pdf.setFillColor(fr, fg, fb);
    pdf.rect(0, 0, pageWidth, pageHeaderHeight, "F");

    // Logo.
    if (cachedLogo) {
      // Make the logo clearly visible in the header band.
      const maxH = 20;
      const maxW = 92;
      const scale = Math.min(maxW / cachedLogo.width, maxH / cachedLogo.height);
      const w = cachedLogo.width * scale;
      const h = cachedLogo.height * scale;
      // Vertically center within the header band.
      const yLogo = Math.max(2.0, (pageHeaderHeight - h) / 2);
      pdf.addImage(cachedLogo.dataUrl, "PNG", margin, yLogo, w, h);
    }

    // Status on the right (request id is already shown in the report body).
    pdf.setFontSize(9);
    setFont("bold");
    const [tr, tg, tb] = rgb(COLORS.title);
    pdf.setTextColor(tr, tg, tb);
    const badgeY = 9.2;
    const badgeH = 6.6;
    drawStatusBadge(String(statusLabel), pageWidth - margin, badgeY);

    if (isFirstPage) {
      pdf.setFontSize(9);
      setFont("normal");
      const [mr, mg, mb] = rgb(COLORS.muted);
      pdf.setTextColor(mr, mg, mb);
      // Keep the generated timestamp below the status badge to avoid overlap.
      pdf.text(
        `${t.pdf.generatedLabel}: ${formatDate(new Date(), "MMMM d, yyyy HH:mm")}`,
        pageWidth - margin,
        badgeY + badgeH + 5.2,
        {
        align: "right",
        },
      );
    }

    pdf.setTextColor(0, 0, 0);
    setFont("normal");
  };

  const addPage = () => {
    pdf.addPage();
    drawPageHeader(false);
    y = pageHeaderHeight + 8;
  };

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - bottomMargin) return;
    // If we're inside a card, close/reopen it on the new page with a "continued" header.
    if (activeCard) {
      pageBreakActiveCard();
      return;
    }
    addPage();
  };

  type Card = { x: number; w: number; topY: number; title: string };
  type ActiveCard = { title: string; card: Card; continuedCount: number };
  let activeCard: ActiveCard | null = null;

  const startCardFrame = (title: string, opts?: { variant?: "normal" | "continued" }): Card => {
    const x = margin;
    const w = contentWidth;
    const variant = opts?.variant ?? "normal";
    const headerH = variant === "continued" ? 7 : 9;
    const topY = y;
    // Inset header fills so they don't "leak" outside the rounded card corner.
    const headerInset = 0.8;

    // Header fill + accent strip.
    const [fr, fg, fb] = rgb(COLORS.headerFill);
    pdf.setFillColor(fr, fg, fb);
    pdf.rect(x + headerInset, topY + headerInset, w - headerInset * 2, headerH - headerInset, "F");
    const [ar, ag, ab] = rgb(MONROC_RED);
    pdf.setFillColor(ar, ag, ab);
    // Start the strip slightly lower so the rounded top-left border stays clean.
    const stripTopPad = 1.4;
    const stripY = topY + headerInset + stripTopPad;
    const stripH = Math.max(0, headerH - headerInset - stripTopPad);
    pdf.rect(x + headerInset, stripY, 3 - headerInset, stripH, "F");

    // Header title.
    pdf.setFontSize(variant === "continued" ? 10 : 11);
    setFont(variant === "continued" ? "normal" : "bold");
    const [tr, tg, tb] = rgb(COLORS.title);
    pdf.setTextColor(tr, tg, tb);
    pdf.text(title, x + 6, topY + (variant === "continued" ? 5.1 : 6.2));

    if (variant === "continued") {
      // Smaller continuation indicator (less repetitive), right-aligned to avoid overlap.
      const continuedText = `(${String(t.pdf.continuedLabel ?? "Continued")})`;
      pdf.setFontSize(8);
      setFont("normal");
      const [mr, mg, mb] = rgb(COLORS.muted);
      pdf.setTextColor(mr, mg, mb);
      pdf.text(continuedText, x + w - 6, topY + 5.0, { align: "right" });
      pdf.setTextColor(tr, tg, tb);
    }

    setFont("normal");
    pdf.setTextColor(0, 0, 0);

    y = topY + headerH + 6;
    return { x, w, topY, title };
  };

  const endCardFrame = (card: Card, opts?: { advanceY?: boolean }) => {
    const padBottom = 4;
    const h = y - card.topY + padBottom;
    const [br, bg, bb] = rgb(COLORS.border);
    pdf.setDrawColor(br, bg, bb);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(card.x, card.topY, card.w, h, 3, 3, "S");
    if (opts?.advanceY !== false) {
      y = card.topY + h + 7;
    }
  };

  const beginCard = (title: string) => {
    // Minimum space: header + a couple of lines.
    ensureSpace(9 + 14);
    const card = startCardFrame(title, { variant: "normal" });
    activeCard = { title, card, continuedCount: 0 };
  };

  const beginCardContinued = (title: string, continuedCount: number) => {
    ensureSpace(7 + 10);
    const card = startCardFrame(title, { variant: "continued" });
    activeCard = { title, card, continuedCount };
  };

  const endCard = () => {
    if (!activeCard) return;
    endCardFrame(activeCard.card);
    activeCard = null;
  };

  const pageBreakActiveCard = () => {
    if (!activeCard) {
      addPage();
      return;
    }
    const { title, card, continuedCount } = activeCard;
    // Close current page's frame without adding extra spacing (we're going to a new page).
    endCardFrame(card, { advanceY: false });
    addPage();
    // Re-open the same card with a smaller "continued" header.
    beginCardContinued(title, continuedCount + 1);
  };

  const measureKv = (label: string, value: string, x: number, w: number, labelW: number) => {
    pdf.setFontSize(9);
    setFont("bold");
    const labelTextW = pdf.getTextWidth(label);
    setFont("normal");
    const valueX = x + Math.max(labelW, labelTextW + 3);
    const valueW = Math.max(20, w - (valueX - x));
    pdf.setFontSize(10);
    const lines = pdf.splitTextToSize(value, valueW) as string[];
    return { labelTextW, valueX, lines, lineCount: Math.max(lines.length, 1) };
  };

  const drawKv = (label: string, rawValue: string | number | null | undefined, x: number, w: number) => {
    const value = getDisplayValueLocal(rawValue);
    if (!value) return 0;
    const labelW = 44;
    const m = measureKv(label, value, x, w, labelW);

    pdf.setFontSize(9);
    setFont("bold");
    const [lr, lg, lb] = rgb(TEXT_GREY);
    pdf.setTextColor(lr, lg, lb);
    pdf.text(label, x, y);
    pdf.text(":", x + m.labelTextW + 1.6, y);

    pdf.setFontSize(10);
    setFont("normal");
    pdf.setTextColor(0, 0, 0);
    pdf.text(m.lines, m.valueX, y);
    return m.lineCount;
  };

  const drawKvGrid = (fields: { label: string; value: any }[], columns = 2) => {
    // Drop empty values up-front so the grid doesn't create blank rows/columns.
    const visible = fields.filter((f) => hasDisplayValueLocal(f.value));
    if (!visible.length) return;

    const innerX = margin + 6;
    const innerW = contentWidth - 12;
    const gutter = 8;
    const colW = columns === 1 ? innerW : (innerW - gutter) / columns;

    for (let i = 0; i < visible.length; i += columns) {
      const slice = visible.slice(i, i + columns);
      const measures = slice.map((f) => measureKv(f.label, String(getDisplayValueLocal(f.value) ?? ""), innerX, colW, 44));
      const lineCount = Math.max(1, ...measures.map((m: any) => m.lineCount));
      const rowH = lineCount * lineHeightMm(10) + 1.5;
      ensureSpace(rowH);

      for (let c = 0; c < slice.length; c++) {
        const f = slice[c];
        const x = innerX + c * (colW + gutter);
        drawKv(f.label, f.value, x, colW);
      }
      y += rowH;
    }
  };

  const drawSubheading = (text: string) => {
    ensureSpace(7);
    pdf.setFontSize(10);
    setFont("bold");
    const [mr, mg, mb] = rgb(COLORS.muted);
    pdf.setTextColor(mr, mg, mb);
    pdf.text(text, margin + 6, y);
    pdf.setTextColor(0, 0, 0);
    setFont("normal");
    y += 6;
  };

  const drawNote = (text: string) => {
    const innerX = margin + 6;
    const innerW = contentWidth - 12;
    const raw = String(text ?? "").trim();
    if (!raw) return;
    pdf.setFontSize(9);
    setFont("normal");
    const lines = pdf.splitTextToSize(raw, innerW) as string[];
    const lh = lineHeightMm(9);
    const h = Math.max(1, lines.length) * lh + 1;
    ensureSpace(h);
    const [mr, mg, mb] = rgb(COLORS.muted);
    pdf.setTextColor(mr, mg, mb);
    pdf.text(lines, innerX, y);
    pdf.setTextColor(0, 0, 0);
    y += h;
  };

  const drawParagraph = (text: string) => {
    const innerX = margin + 6;
    const innerW = contentWidth - 12;
    pdf.setFontSize(10);
    setFont("normal");
    const raw = String(text ?? "").trim();
    if (!raw) return;

    const lines = pdf.splitTextToSize(raw, innerW) as string[];
    const lh = lineHeightMm(10);
    pdf.setTextColor(0, 0, 0);

    // Render in chunks so long paragraphs never overflow the page (and frames remain correct).
    let idx = 0;
    while (idx < lines.length) {
      const available = pageHeight - bottomMargin - y;
      // Reserve a tiny bottom pad so the last line doesn't touch the border.
      const maxLines = Math.max(1, Math.floor((available - 1) / lh));
      if (maxLines <= 0) {
        ensureSpace(lh + 2);
        continue;
      }

      const chunk = lines.slice(idx, idx + maxLines);
      const h = Math.max(1, chunk.length) * lh;
      ensureSpace(h + 2);
      pdf.text(chunk, innerX, y);
      y += h + 2;
      idx += chunk.length;
    }
  };

  const drawTable = (opts: {
    headers: string[];
    rows: Array<string[]>;
    colWidths: number[];
    onPageBreak?: () => void;
  }) => {
    const x = margin + 6;
    const w = contentWidth - 12;
    const padX = 2;
    const headerH = 8;
    const fontSize = 9;
    const rowPadY = 2.2;

    const headerFill = hexToRgb(COLORS.headerFill);
    const zebraFill = hexToRgb(COLORS.zebra);
    const borderRgb = hexToRgb(COLORS.border);

    const drawHeader = () => {
      ensureSpace(headerH);
      pdf.setFillColor(headerFill.r, headerFill.g, headerFill.b);
      pdf.rect(x, y, w, headerH, "F");
      pdf.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, w, headerH, "S");

      pdf.setFontSize(fontSize);
      setFont("bold");
      const hdrRgb = hexToRgb(TEXT_GREY);
      pdf.setTextColor(hdrRgb.r, hdrRgb.g, hdrRgb.b);
      let cx = x;
      for (let i = 0; i < opts.headers.length; i++) {
        const cw = opts.colWidths[i] ?? 20;
        pdf.text(String(opts.headers[i] ?? ""), cx + padX, y + 5.6);
        cx += cw;
      }
      setFont("normal");
      pdf.setTextColor(0, 0, 0);
      y += headerH;
    };

    drawHeader();

    for (let r = 0; r < opts.rows.length; r++) {
      const row = opts.rows[r] ?? [];
      pdf.setFontSize(fontSize);
      setFont("normal");
      const cellLines = row.map((cell, idx) => {
        const cw = (opts.colWidths[idx] ?? 20) - padX * 2;
        const text = String(cell ?? "").trim() || "-";
        return pdf.splitTextToSize(text, Math.max(10, cw)) as string[];
      });
      const maxLines = Math.max(1, ...cellLines.map((lines) => lines.length));
      const rowH = maxLines * lineHeightMm(fontSize) + rowPadY * 2;

      if (y + rowH > pageHeight - bottomMargin) {
        if (typeof opts.onPageBreak === "function") {
          opts.onPageBreak();
        } else {
          addPage();
        }
        drawHeader();
      }

      if (r % 2 === 1) {
        pdf.setFillColor(zebraFill.r, zebraFill.g, zebraFill.b);
        pdf.rect(x, y, w, rowH, "F");
      }
      pdf.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, w, rowH, "S");

      let cx = x;
      for (let c = 0; c < row.length; c++) {
        const cw = opts.colWidths[c] ?? 20;
        if (c > 0) {
          pdf.line(cx, y, cx, y + rowH);
        }
        pdf.text(cellLines[c], cx + padX, y + rowPadY + 3.2);
        cx += cw;
      }

      y += rowH;
    }
  };

  const drawTableCard = (
    title: string,
    opts: { headers: string[]; rows: Array<string[]>; colWidths: number[] },
  ) => {
    beginCard(title);
    drawTable({
      ...opts,
      onPageBreak: () => {
        pageBreakActiveCard();
      },
    });
    endCard();
  };

  type AppendixSection = {
    label: string;
    title: string;
    headers: string[];
    rows: Array<string[]>;
    colWidths: number[];
    attachments: Attachment[];
  };
  const appendixSections: AppendixSection[] = [];
  const appendixLabelFor = (index: number) => {
    // A..Z, then A1, A2... (should be plenty for our attachment groups)
    if (index < 26) return String.fromCharCode(65 + index);
    return `A${index - 25}`;
  };
  const registerAppendixTable = (
    title: string,
    opts: { headers: string[]; rows: Array<string[]>; colWidths: number[]; attachments: Attachment[] },
  ) => {
    const label = appendixLabelFor(appendixSections.length);
    appendixSections.push({ label, title, ...opts, attachments: opts.attachments ?? [] });
    return label;
  };
  const seeAppendixText = (label: string) => String(t.pdf.seeAppendix || "See Appendix {appendix}").replace("{appendix}", label);

  // First page header.
  drawPageHeader(true);

  // Title block.
  ensureSpace(18);
  pdf.setFontSize(18);
  setFont("bold");
  const [tr, tg, tb] = rgb(COLORS.title);
  pdf.setTextColor(tr, tg, tb);
  pdf.text(t.pdf.reportTitle, margin, y);
  setFont("normal");
  pdf.setTextColor(0, 0, 0);
  y += 10;

  // Summary card.
  const summaryFields = [
    { label: t.common.status, value: statusLabel },
    { label: t.request.clientName, value: request.clientName },
    { label: t.request.clientContact, value: request.clientContact },
    { label: t.table.createdBy, value: request.createdByName },
    { label: t.pdf.createdAtLabel, value: formatDate(new Date(request.createdAt), "MMMM d, yyyy") },
  ];
  if (summaryFields.some((f) => hasDisplayValueLocal(f.value))) {
    beginCard(`${t.pdf.requestLabel}: ${request.id}`);
    drawKvGrid(summaryFields, 2);
    endCard();
  }

  // General information card.
  const generalFields = [
    {
      label: t.request.applicationVehicle,
      value: translateResolvedOption(request.applicationVehicle, request.applicationVehicleOther),
    },
    { label: t.request.country, value: translateResolvedOption(request.country, request.countryOther) },
    ...(request.country === "China" && request.city ? [{ label: t.request.city, value: request.city }] : []),
  ];
  if (generalFields.some((f) => hasDisplayValueLocal(f.value))) {
    beginCard(t.request.generalInfo);
    drawKvGrid(generalFields, 2);
    endCard();
  }

  // Expected delivery card.
  const deliveryFields = [
    {
      label: t.pdf.deliverablesLabel,
      value: request.expectedDeliverySelections?.length ? request.expectedDeliverySelections.map(translateOption).join("; ") : "",
    },
    { label: t.request.clientExpectedDeliveryDate, value: request.clientExpectedDeliveryDate || "" },
  ];
  if (deliveryFields.some((f) => hasDisplayValueLocal(f.value))) {
    beginCard(t.request.expectedDelivery);
    drawKvGrid(deliveryFields, 1);
    endCard();
  }

  // Client application card.
  const applicationFields = [
    {
      label: t.request.workingCondition,
      value: translateResolvedOption(request.workingCondition, request.workingConditionOther),
    },
    { label: t.request.usageType, value: translateResolvedOption(request.usageType, request.usageTypeOther) },
    { label: t.request.environment, value: translateResolvedOption(request.environment, request.environmentOther) },
  ];
  if (applicationFields.some((f) => hasDisplayValueLocal(f.value))) {
    beginCard(t.request.clientApplication);
    drawKvGrid(applicationFields, 1);
    endCard();
  }

  const products = Array.isArray(request.products) && request.products.length ? request.products : [buildLegacyProduct(request)];
  const studsLabelMap = new Map(STANDARD_STUDS_PCD_OPTIONS.map((option) => [option.id, option.label]));

  // Product cards.
  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    const productLabel = `${t.request.productLabel} ${index + 1}`;

    const studsMode = product.studsPcdMode ?? "standard";
    const studsValue =
      studsMode === "standard" && product.studsPcdStandardSelections?.length
        ? product.studsPcdStandardSelections
            .map((id) => translateOption(studsLabelMap.get(id) ?? formatStudsPcdSelection(id)))
            .join("; ")
        : studsMode === "special" && product.studsPcdSpecialText
          ? product.studsPcdSpecialText
          : "";

    beginCard(`${t.request.technicalInfo} - ${productLabel}`);

    const axleFields = [
      { label: t.request.productType, value: getProductTypeLabel(product, translateOption) },
      { label: t.request.repeatability, value: translateOption(request.repeatability) },
      { label: t.request.quantity, value: product.quantity },
      { label: t.pdf.loadsKgLabel, value: product.loadsKg },
      { label: t.pdf.speedsKmhLabel, value: product.speedsKmh },
    ];
    if (axleFields.some((f) => hasDisplayValueLocal(f.value))) {
      drawSubheading(t.pdf.axlePerformanceTitle);
      drawKvGrid(axleFields, 2);
    }

    const articulationValue = String(product.articulationType ?? "").toLowerCase();
    const showWheelBase = articulationValue.includes("steering");
    const wheelsFields = [
      { label: t.request.tyreSize, value: product.tyreSize },
      { label: t.pdf.trackMmLabel, value: product.trackMm },
      ...(showWheelBase ? [{ label: t.request.wheelBase, value: product.wheelBase }] : []),
    ];
    if (wheelsFields.some((f) => hasDisplayValueLocal(f.value))) {
      drawSubheading(t.pdf.wheelsGeometryTitle);
      drawKvGrid(wheelsFields, 2);
    }

    const brakeTypeRaw = String(product.brakeType ?? "").toLowerCase();
    const isBrakeNA = brakeTypeRaw === "na" || brakeTypeRaw === "n/a" || brakeTypeRaw === "n.a";
    const brakingFields = [
      { label: t.request.brakeType, value: translateBrakeType(product.brakeType) },
      ...(!isBrakeNA ? [{ label: t.request.brakeSize, value: translateOption(product.brakeSize) }] : []),
      { label: t.request.brakePowerType, value: translateOption(product.brakePowerType) },
      { label: t.request.brakeCertificate, value: translateOption(product.brakeCertificate) },
      { label: t.request.suspension, value: translateOption(product.suspension) },
    ];
    if (brakingFields.some((f) => hasDisplayValueLocal(f.value))) {
      drawSubheading(t.pdf.brakingSuspensionTitle);
      drawKvGrid(brakingFields, 2);
    }

    const finishFields = [
      { label: t.request.finish, value: product.finish },
      { label: t.request.studsPcd, value: studsValue },
      { label: t.request.mainBodySectionType, value: translateOption(product.mainBodySectionType) },
      { label: t.request.clientSealingRequest, value: translateOption(product.clientSealingRequest) },
      { label: t.request.cupLogo, value: translateOption(product.cupLogo) },
    ];
    if (finishFields.some((f) => hasDisplayValueLocal(f.value))) {
      drawSubheading(t.pdf.finishInterfaceTitle);
      drawKvGrid(finishFields, 2);
    }

    const productAttachments = Array.isArray(product.attachments) ? product.attachments : [];
    const productAttachmentRows = productAttachments.map((att) => [
      String(att.filename ?? "").trim() || "-",
      formatAttachmentType(att.type),
      formatBytes(estimateBase64Bytes(att.url)),
    ]);

    if (product.productComments) {
      drawSubheading(t.request.productComments);
      drawParagraph(product.productComments);
    }

    if (productAttachmentRows.length) {
      const appendixLabel = registerAppendixTable(`${t.request.attachments} - ${productLabel}`, {
        headers: [t.pdf.fileLabel, t.pdf.typeLabel, t.pdf.sizeLabel],
        rows: productAttachmentRows,
        colWidths: [90, 55, contentWidth - 12 - 90 - 55],
        attachments: productAttachments,
      });
      drawSubheading(t.request.attachments);
      drawNote(seeAppendixText(appendixLabel));
    }

    endCard();
  }

  // Design notes + result card(s).
  const designAttachments = Array.isArray(request.designResultAttachments) ? request.designResultAttachments : [];
  const hasDesignNotes = (request.designNotes ?? "").trim().length > 0;
  const hasDesignResultComments = (request.designResultComments ?? "").trim().length > 0;
  const hasDesignAttachments = designAttachments.length > 0;
  if (hasDesignNotes || hasDesignResultComments || hasDesignAttachments) {
    beginCard(t.panels.designResult);

    if (hasDesignNotes) {
      drawSubheading(t.pdf.designNotesTitle);
      drawParagraph(request.designNotes ?? "");
    }
    if (hasDesignResultComments) {
      drawSubheading(t.panels.designResultComments);
      drawParagraph(request.designResultComments ?? "");
    }
    if (hasDesignAttachments) {
      const rows = designAttachments.map((att) => [
        String(att.filename ?? "").trim() || "-",
        formatAttachmentType(att.type),
        formatBytes(estimateBase64Bytes(att.url)),
      ]);
      const appendixLabel = registerAppendixTable(`${t.panels.designResult} - ${t.panels.designResultUploads}`, {
        headers: [t.pdf.fileLabel, t.pdf.typeLabel, t.pdf.sizeLabel],
        rows,
        colWidths: [90, 55, contentWidth - 12 - 90 - 55],
        attachments: designAttachments,
      });
      drawSubheading(t.panels.designResultUploads);
      drawNote(seeAppendixText(appendixLabel));
    }

    endCard();
  }

  // Costing card.
  const costingAttachments = Array.isArray(request.costingAttachments) ? request.costingAttachments : [];
  const incotermValue = request.incoterm === "other" ? request.incotermOther : request.incoterm;
  const sellingCurrency = request.sellingCurrency ?? "EUR";
  const costingFields = [
    request.sellingPrice ? { label: t.panels.sellingPrice, value: `${sellingCurrency} ${request.sellingPrice.toFixed(2)}` } : null,
    request.calculatedMargin ? { label: t.panels.margin, value: `${request.calculatedMargin.toFixed(1)}%` } : null,
    request.deliveryLeadtime ? { label: t.panels.deliveryLeadtime, value: request.deliveryLeadtime } : null,
    incotermValue ? { label: t.panels.incoterm, value: incotermValue } : null,
    request.vatMode
      ? {
          label: t.panels.vatMode,
          value:
            request.vatMode === "with"
              ? `${t.panels.withVat}${request.vatRate !== null ? ` (${request.vatRate}%)` : ""}`
              : t.panels.withoutVat,
        }
      : null,
  ].filter(Boolean) as any[];

  if (costingFields.length || (request.costingNotes ?? "").trim()) {
    beginCard(t.pdf.costingInformationTitle);
    if (costingFields.length) drawKvGrid(costingFields, 2);
    if ((request.costingNotes ?? "").trim()) {
      drawSubheading(t.panels.costingNotes);
      drawParagraph(request.costingNotes ?? "");
    }
    if (costingAttachments.length) {
      const rows = costingAttachments.map((att) => [
        String(att.filename ?? "").trim() || "-",
        formatAttachmentType(att.type),
        formatBytes(estimateBase64Bytes(att.url)),
      ]);
      const appendixLabel = registerAppendixTable(`${t.pdf.costingInformationTitle} - ${t.panels.costingAttachments}`, {
        headers: [t.pdf.fileLabel, t.pdf.typeLabel, t.pdf.sizeLabel],
        rows,
        colWidths: [90, 55, contentWidth - 12 - 90 - 55],
        attachments: costingAttachments,
      });
      drawSubheading(t.panels.costingAttachments);
      drawNote(seeAppendixText(appendixLabel));
    }
    endCard();
  }

  // Sales follow-up card.
  const salesAttachments = Array.isArray(request.salesAttachments) ? request.salesAttachments : [];
  const salesIncotermValue = request.salesIncoterm === "other" ? request.salesIncotermOther : request.salesIncoterm;
  const salesCurrency = request.salesCurrency ?? "EUR";
  const salesFields = [
    request.salesFinalPrice ? { label: t.panels.salesFinalPrice, value: `${salesCurrency} ${request.salesFinalPrice.toFixed(2)}` } : null,
    typeof request.salesMargin === "number" ? { label: t.panels.salesMargin, value: `${request.salesMargin.toFixed(2)}%` } : null,
    (request.salesWarrantyPeriod ?? "").trim() ? { label: t.panels.warrantyPeriod, value: String(request.salesWarrantyPeriod).trim() } : null,
    (request.salesOfferValidityPeriod ?? "").trim() ? { label: t.panels.offerValidityPeriod, value: String(request.salesOfferValidityPeriod).trim() } : null,
    request.salesExpectedDeliveryDate ? { label: t.panels.salesExpectedDeliveryDate, value: String(request.salesExpectedDeliveryDate) } : null,
    salesIncotermValue ? { label: t.panels.incoterm, value: salesIncotermValue } : null,
    request.salesVatMode
      ? {
          label: t.panels.vatMode,
          value:
            request.salesVatMode === "with"
              ? `${t.panels.withVat}${request.salesVatRate !== null ? ` (${request.salesVatRate}%)` : ""}`
              : t.panels.withoutVat,
        }
      : null,
  ].filter(Boolean) as any[];

  if (salesFields.length || (request.salesFeedbackComment ?? "").trim()) {
    beginCard(t.panels.salesFollowup);
    if (salesFields.length) drawKvGrid(salesFields, 2);
    if ((request.salesFeedbackComment ?? "").trim()) {
      drawSubheading(t.panels.salesFeedback);
      drawParagraph(request.salesFeedbackComment ?? "");
    }
    const salesPaymentTermsRaw = Array.isArray(request.salesPaymentTerms) ? request.salesPaymentTerms : [];
    const salesPaymentTerms = salesPaymentTermsRaw.filter((term: any) => {
      const name = String(term?.paymentName ?? "").trim();
      const pctOk = typeof term?.paymentPercent === "number" && Number.isFinite(term.paymentPercent);
      const comments = String(term?.comments ?? "").trim();
      return Boolean(name || pctOk || comments);
    });
    if (salesPaymentTerms.length) {
      const rows = salesPaymentTerms.map((term: any, index: number) => [
        String(term?.paymentNumber || index + 1),
        String(term?.paymentName || "-"),
        typeof term?.paymentPercent === "number" ? `${term.paymentPercent}%` : "-",
        String(term?.comments || "-"),
      ]);
      drawSubheading(t.panels.paymentTerms);
      drawTable({
        headers: [t.panels.paymentNumber, t.panels.paymentName, t.panels.paymentPercent, t.panels.paymentComments],
        rows,
        colWidths: [18, 44, 22, contentWidth - 12 - 18 - 44 - 22],
        onPageBreak: () => {
          pageBreakActiveCard();
        },
      });
      y += 4;
    }

    if (salesAttachments.length) {
      const rows = salesAttachments.map((att) => [
        String(att.filename ?? "").trim() || "-",
        formatAttachmentType(att.type),
        formatBytes(estimateBase64Bytes(att.url)),
      ]);
      const appendixLabel = registerAppendixTable(`${t.panels.salesFollowup} - ${t.panels.salesAttachments}`, {
        headers: [t.pdf.fileLabel, t.pdf.typeLabel, t.pdf.sizeLabel],
        rows,
        colWidths: [90, 55, contentWidth - 12 - 90 - 55],
        attachments: salesAttachments,
      });
      drawSubheading(t.panels.salesAttachments);
      drawNote(seeAppendixText(appendixLabel));
    }

    endCard();
  }

  // Status history card.
  if (Array.isArray(request.history) && request.history.length) {
    const filteredHistory = request.history.filter((entry, index, arr) => {
      if (index === 0) return true;
      const prev = arr[index - 1];
      const sameStatus = entry.status === prev.status;
      const sameUser = entry.userName === prev.userName;
      const noComment = !entry.comment && !prev.comment;
      return !(sameStatus && sameUser && noComment);
    });

    beginCard(t.pdf.statusHistoryTitle);
    const headers = [t.common.status, t.common.date, t.pdf.byLabel, t.pdf.commentLabel];
    const colWidths = [28, 34, 30, contentWidth - 12 - 28 - 34 - 30];

    const x = margin + 6;
    const w = contentWidth - 12;
    const headerH = 8;
    const padX = 2;
    const fontSize = 9;
    const rowPadY = 2.2;
    const headerFill = hexToRgb(COLORS.headerFill);
    const zebraFill = hexToRgb(COLORS.zebra);
    const borderRgb = hexToRgb(COLORS.border);
    const hdrRgb = hexToRgb(TEXT_GREY);

    const drawHistoryHeader = () => {
      ensureSpace(headerH);
      pdf.setFillColor(headerFill.r, headerFill.g, headerFill.b);
      pdf.rect(x, y, w, headerH, "F");
      pdf.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, w, headerH, "S");
      pdf.setFontSize(fontSize);
      setFont("bold");
      pdf.setTextColor(hdrRgb.r, hdrRgb.g, hdrRgb.b);
      let cx = x;
      for (let i = 0; i < headers.length; i++) {
        const cw = colWidths[i];
        pdf.text(headers[i], cx + padX, y + 5.6);
        cx += cw;
      }
      setFont("normal");
      pdf.setTextColor(0, 0, 0);
      y += headerH;
    };

    drawHistoryHeader();

    for (let i = 0; i < filteredHistory.length; i++) {
      const entry: any = filteredHistory[i];
      const st = t.statuses[entry.status as keyof typeof t.statuses] || STATUS_CONFIG[entry.status]?.label || entry.status;
      const ts = formatDate(new Date(entry.timestamp), "MMM d, yyyy HH:mm");
      const by = String(entry.userName || t.pdf.notProvided);
      const comment = String(entry.comment || t.pdf.notProvided);

      pdf.setFontSize(fontSize);
      setFont("normal");
      const cells = [st, ts, by, comment];
      const cellLines = cells.map((cell, idx) => {
        const cw = colWidths[idx] - padX * 2;
        return pdf.splitTextToSize(String(cell ?? ""), Math.max(10, cw)) as string[];
      });
      const maxLines = Math.max(1, ...cellLines.map((lines) => lines.length));
      const rowH = maxLines * lineHeightMm(fontSize) + rowPadY * 2;

      if (y + rowH > pageHeight - bottomMargin) {
        pageBreakActiveCard();
        drawHistoryHeader();
      }

      if (i % 2 === 1) {
        pdf.setFillColor(zebraFill.r, zebraFill.g, zebraFill.b);
        pdf.rect(x, y, w, rowH, "F");
      }
      pdf.setDrawColor(borderRgb.r, borderRgb.g, borderRgb.b);
      pdf.setLineWidth(0.2);
      pdf.rect(x, y, w, rowH, "S");

      let cx = x;
      for (let c = 0; c < cells.length; c++) {
        const cw = colWidths[c];
        if (c > 0) pdf.line(cx, y, cx, y + rowH);
        pdf.text(cellLines[c], cx + padX, y + rowPadY + 3.2);
        cx += cw;
      }
      y += rowH;
    }

    endCard();
  }

  // Footer (page numbers).
  // Appendix (attachments) pages at the end.
  if (appendixSections.length) {
    addPage();
    pdf.setFontSize(16);
    setFont("bold");
    const [tr, tg, tb] = rgb(COLORS.title);
    pdf.setTextColor(tr, tg, tb);
    pdf.text(String(t.pdf.appendixTitle ?? "Appendix"), margin, y);
    setFont("normal");
    pdf.setTextColor(0, 0, 0);
    y += 8;

    const drawAppendixSectionHeader = (label: string, title: string) => {
      ensureSpace(10);
      pdf.setFontSize(12);
      setFont("bold");
      const [mr, mg, mb] = rgb(COLORS.muted);
      pdf.setTextColor(mr, mg, mb);
      pdf.text(`${String(t.pdf.appendixTitle ?? "Appendix")} ${label} - ${title}`, margin, y);
      pdf.setTextColor(0, 0, 0);
      setFont("normal");
      // Divider line
      const [br, bg, bb] = rgb(COLORS.border);
      pdf.setDrawColor(br, bg, bb);
      pdf.setLineWidth(0.3);
      pdf.line(margin, y + 2, pageWidth - margin, y + 2);
      y += 7;
    };

    for (const section of appendixSections) {
      const atts = Array.isArray(section.attachments) ? section.attachments : [];
      if (!atts.length) continue;

      // Avoid wasting a mostly-empty "index" page for small attachment groups.
      // Show an index table only when there are many attachments.
      const showIndexTable = atts.length >= 4;

      if (showIndexTable) {
        drawAppendixSectionHeader(section.label, section.title);
        drawTable({
          headers: section.headers,
          rows: section.rows,
          colWidths: section.colWidths,
          onPageBreak: () => {
            addPage();
            drawAppendixSectionHeader(section.label, section.title);
          },
        });
        y += 6;
      }

      // Preview the attachment contents (images/PDFs).
      for (let i = 0; i < atts.length; i++) {
        const att = atts[i];
        // Start each attachment preview on its own page to keep the appendix readable.
        addPage();
        // Show the section header once if there are multiple items or if we're showing the index table.
        const hasMultiple = atts.length > 1;
        if ((hasMultiple || showIndexTable) && i === 0) {
          drawAppendixSectionHeader(section.label, section.title);
        }

        const extra = `${formatAttachmentType(att.type)} - ${formatDate(new Date(att.uploadedAt ?? new Date()), "MMM d, yyyy HH:mm")}`;
        const filename = String(att.filename || "-");
        const itemLabel = `${section.label}.${i + 1}`;
        // Reduce redundancy: if the section header is already visible, don't repeat "Appendix" on the item line.
        const itemTitle =
          (atts.length > 1 || showIndexTable) && i === 0
            ? `${itemLabel} - ${filename}`
            : `${String(t.pdf.appendixTitle ?? "Appendix")} ${itemLabel} - ${filename}`;
        drawAppendixAttachmentHeader(itemTitle, extra);

        const preview = await attachmentToPreview(att);
        if (preview.kind === "image" && preview.dataUrls?.length) {
          await drawImageFit(preview.dataUrls[0]);
          continue;
        }
        if (preview.kind === "pdf" && preview.dataUrls?.length) {
          for (let p = 0; p < preview.dataUrls.length; p++) {
            if (p > 0) {
              addPage();
              if ((atts.length > 1 || showIndexTable) && i === 0) {
                drawAppendixSectionHeader(section.label, section.title);
              }
              const pageTitle =
                (atts.length > 1 || showIndexTable) && i === 0
                  ? `${itemLabel} - ${filename} (PDF ${p + 1}/${preview.dataUrls.length})`
                  : `${String(t.pdf.appendixTitle ?? "Appendix")} ${itemLabel} - ${filename} (PDF ${p + 1}/${preview.dataUrls.length})`;
              drawAppendixAttachmentHeader(pageTitle, extra);
            }
            await drawImageFit(preview.dataUrls[p]);
          }
          continue;
        }

        pdf.setFontSize(10);
        setFont("normal");
        const [mr, mg, mb] = rgb(COLORS.muted);
        pdf.setTextColor(mr, mg, mb);
        pdf.text(String(preview.note || "Preview not available."), margin, y);
        pdf.setTextColor(0, 0, 0);
        y += 8;
      }
    }
  }

  // Footer (page numbers) - must run after appendix pages are added.
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    const pageLabel = t.pdf.pageOfLabel.replace("{current}", String(i)).replace("{total}", String(pageCount));
    pdf.text(`${pageLabel} | ${t.pdf.reportTitle} | ${request.id}`, pageWidth / 2, pageHeight - 6, { align: "center" });
  }

  pdf.save(`${request.id}_report.pdf`);
};
