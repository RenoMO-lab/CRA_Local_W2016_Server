import jsPDF from 'jspdf';
import { Attachment, CustomerRequest, RequestProduct, STATUS_CONFIG, AXLE_LOCATIONS, ARTICULATION_TYPES, CONFIGURATION_TYPES, STANDARD_STUDS_PCD_OPTIONS } from '@/types';
import { format } from 'date-fns';
import { enUS, fr, zhCN } from 'date-fns/locale';
import { translations, Language } from '@/i18n/translations';

const MONROC_RED = '#FA0000';
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
  const issuedAt = new Date();

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
  // Branding-only header band (logo + accent line).
  const pageHeaderHeight = 28;
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

  const drawWatermark = () => {
    const wm1 = String((t as any)?.pdf?.watermarkLine1 ?? "CONFIDENTIAL - INTERNAL USE ONLY");
    const wm2 = String((t as any)?.pdf?.watermarkLine2 ?? "PROPERTY OF MONROC");
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;
    const angle = -35;

    // Best practice: use real opacity (alpha) so watermark stays readable but unobtrusive.
    // Fallback: very light gray when GState/opacity isn't available in the runtime build.
    const hasGState = typeof (pdf as any).GState === "function" && typeof (pdf as any).setGState === "function";

    try {
      (pdf as any).saveGraphicsState?.();
    } catch {}

    if (hasGState) {
      // Line 1
      const gs1 = new (pdf as any).GState({ opacity: 0.08, fillOpacity: 0.08, strokeOpacity: 0.08 });
      (pdf as any).setGState(gs1);
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(38);
      setFont("bold");
      pdf.text(wm1, centerX, centerY, { align: "center", angle } as any);

      // Line 2
      const gs2 = new (pdf as any).GState({ opacity: 0.06, fillOpacity: 0.06, strokeOpacity: 0.06 });
      (pdf as any).setGState(gs2);
      pdf.setFontSize(18);
      setFont("bold");
      pdf.text(wm2, centerX, centerY + 10, { align: "center", angle } as any);
    } else {
      pdf.setTextColor(230, 230, 230);
      pdf.setFontSize(38);
      setFont("bold");
      pdf.text(wm1, centerX, centerY, { align: "center", angle } as any);
      pdf.setFontSize(18);
      setFont("bold");
      pdf.text(wm2, centerX, centerY + 10, { align: "center", angle } as any);
    }

    // Reset drawing state for the rest of the page.
    pdf.setTextColor(0, 0, 0);
    setFont("normal");
    try {
      (pdf as any).restoreGraphicsState?.();
    } catch {}
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

    // Watermark should be behind content: draw it before logo/issue date and before body rendering.
    drawWatermark();

    // Logo.
    if (cachedLogo) {
      // Make the logo clearly visible in the header band.
      const maxH = 24;
      const maxW = 112;
      const scale = Math.min(maxW / cachedLogo.width, maxH / cachedLogo.height);
      const w = cachedLogo.width * scale;
      const h = cachedLogo.height * scale;
      // Vertically center within the header band.
      const yLogo = Math.max(2.0, (pageHeaderHeight - h) / 2);
      pdf.addImage(cachedLogo.dataUrl, "PNG", margin, yLogo, w, h);
    }

    if (isFirstPage) {
      pdf.setFontSize(9);
      setFont("normal");
      const [mr, mg, mb] = rgb(COLORS.muted);
      pdf.setTextColor(mr, mg, mb);
      // Keep the issue/generated date in the header (cover page only).
      pdf.text(
        `${String(t.pdf.generatedLabel ?? "Generated")}: ${formatDate(issuedAt, "MMMM d, yyyy HH:mm")}`,
        pageWidth - margin,
        pageHeaderHeight - 8.2,
        { align: "right" },
      );
      pdf.setTextColor(0, 0, 0);
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
    // Keep the strip away from the rounded corner to avoid "bleeding" outside the frame.
    const stripX = x + 1.6;
    const stripY = topY + 2.4;
    const stripW = 2.0;
    const stripH = Math.max(0, headerH - 3.6);
    pdf.rect(stripX, stripY, stripW, stripH, "F");

    const truncateToWidth = (text: string, maxW: number) => {
      const raw = String(text ?? "");
      if (pdf.getTextWidth(raw) <= maxW) return raw;
      let t = raw;
      while (t.length > 0 && pdf.getTextWidth(`${t}...`) > maxW) {
        t = t.slice(0, -1);
      }
      return `${t}...`;
    };

    // Header title.
    pdf.setFontSize(variant === "continued" ? 10 : 11);
    setFont(variant === "continued" ? "normal" : "bold");
    const [tr, tg, tb] = rgb(COLORS.title);
    pdf.setTextColor(tr, tg, tb);

    const titleX = x + 6;
    const titleY = topY + (variant === "continued" ? 5.1 : 6.2);
    let titleText = title;
    if (variant === "continued") {
      const continuedText = `(${String(t.pdf.continuedLabel ?? "Continued")})`;
      pdf.setFontSize(8);
      setFont("normal");
      const continuedW = pdf.getTextWidth(continuedText);
      pdf.setFontSize(10);
      setFont("normal");
      const maxTitleW = Math.max(20, w - 12 - continuedW - 6);
      titleText = truncateToWidth(title, maxTitleW);
    }
    pdf.text(titleText, titleX, titleY);

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
    emptyCellValue?: string;
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
      const emptyCellValue = opts.emptyCellValue ?? "-";
      const cellLines = row.map((cell, idx) => {
        const cw = (opts.colWidths[idx] ?? 20) - padX * 2;
        const trimmed = String(cell ?? "").trim();
        const text = trimmed.length ? trimmed : emptyCellValue;
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

  type AppendixContext = "technical" | "design" | "costing" | "sales";
  type AppendixItem = {
    id: string; // A.1, A.2...
    category: string;
    typeLabel: string;
    filename: string;
    uploadedBy: string;
    uploadedAt: Date | null;
    sizeLabel: string;
    attachment: Attachment;
  };

  const appendixItems: AppendixItem[] = [];
  const appendixKeyToId = new Map<string, string>();

  const appendixIdForIndex = (idx: number) => `A.${idx + 1}`;

  const extFromFilename = (filename: string) => {
    const base = String(filename ?? "").trim();
    const dot = base.lastIndexOf(".");
    if (dot === -1) return "";
    const ext = base.slice(dot + 1).toLowerCase();
    return ext && ext.length <= 8 ? ext : "";
  };

  const categoryForContext = (ctx: AppendixContext) => {
    if (ctx === "technical") return String(t.pdf.attachmentCategoryTechnicalDrawing ?? "Technical Drawing");
    if (ctx === "design") return String(t.pdf.attachmentCategoryTechnicalDrawing ?? "Technical Drawing");
    if (ctx === "costing") return String(t.pdf.attachmentCategoryCommercial ?? "Commercial");
    if (ctx === "sales") return String(t.pdf.attachmentCategoryCommercial ?? "Commercial");
    return String(t.pdf.attachmentCategoryOther ?? "Other");
  };

  const seeAppendixText = (ref: string) =>
    String(t.pdf.seeAppendix || "See Appendix {appendix}").replace("{appendix}", ref);

  const registerAppendixAttachments = (ctx: AppendixContext, attachments: Attachment[]) => {
    const atts = Array.isArray(attachments) ? attachments : [];
    const ids: string[] = [];

    for (const att of atts) {
      const filename = String(att?.filename ?? "").trim();
      const url = String(att?.url ?? "");
      if (!filename && !url) continue;

      const key = `${String(att?.type ?? "")}::${filename}::${url}`;
      const existing = appendixKeyToId.get(key);
      if (existing) {
        ids.push(existing);
        continue;
      }

      const id = appendixIdForIndex(appendixItems.length);
      appendixKeyToId.set(key, id);

      const ext = extFromFilename(filename);
      const typeLabelRaw = formatAttachmentType(String(att?.type ?? ""));
      const typeLabel = ext ? `${typeLabelRaw} (${ext})` : typeLabelRaw;

      const uploadedAt = att?.uploadedAt ? new Date(att.uploadedAt as any) : null;
      const uploadedBy = String(att?.uploadedBy ?? "").trim();

      appendixItems.push({
        id,
        category: categoryForContext(ctx),
        typeLabel,
        filename: filename || "-",
        uploadedBy,
        uploadedAt,
        sizeLabel: formatBytes(estimateBase64Bytes(url)),
        attachment: att,
      });
      ids.push(id);
    }

    const unique = Array.from(new Set(ids));
    unique.sort((a, b) => {
      const an = parseInt(a.split(".")[1] || "0", 10);
      const bn = parseInt(b.split(".")[1] || "0", 10);
      return an - bn;
    });

    if (!unique.length) return "";
    const nums = unique
      .map((id) => parseInt(id.split(".")[1] || "", 10))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    const min = nums[0];
    const max = nums[nums.length - 1];
    const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);

    if (contiguous && min === max) return `A.${min}`;
    if (contiguous) return `A.${min}-A.${max}`;
    return unique.join(", ");
  };

  const drawParamTable = (
    rows: Array<{ param: string; value: any; unit?: string }>,
    opts?: { colWidths?: [number, number] },
  ) => {
    const visible = rows
      .map((r) => ({
        param: String(r.param ?? "").trim(),
        value: getDisplayValueLocal(r.value),
        unit: String(r.unit ?? "").trim(),
      }))
      .filter((r) => r.param && r.value !== null);
    if (!visible.length) return;

    const formatValueWithUnit = (value: string, unit: string) => {
      const v = String(value ?? "").trim();
      const u = String(unit ?? "").trim();
      if (!u) return v;

      // Currency as prefix.
      if (u === "EUR" || u === "USD" || u === "RMB") return `${u} ${v}`;

      // Percent: no space (per requirement).
      if (u === "%") return `${v}%`;

      // Default: suffix with a space (incl. pcs).
      return `${v} ${u}`;
    };

    const colWidths: [number, number] = opts?.colWidths ?? [72, contentWidth - 12 - 72];
    drawTable({
      headers: [String(t.pdf.parameterLabel ?? "Parameter"), String(t.pdf.valueLabel ?? "Value")],
      rows: visible.map((r) => [r.param, formatValueWithUnit(String(r.value ?? ""), r.unit)]),
      colWidths: [colWidths[0], colWidths[1]],
      onPageBreak: () => {
        pageBreakActiveCard();
      },
      emptyCellValue: "",
    });
    y += 4;
  };

  const measureStackField = (label: string, value: string, maxW: number) => {
    pdf.setFontSize(8);
    const lhLabel = lineHeightMm(8);
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(String(value ?? ""), Math.max(10, maxW)) as string[];
    const lhValue = lineHeightMm(11);
    return lhLabel + Math.max(1, lines.length) * lhValue + 2.2;
  };

  const drawStackField = (label: string, value: string, x: number, maxW: number, yTop: number) => {
    const v = String(value ?? "").trim();
    pdf.setFontSize(8);
    setFont("bold");
    const [mr, mg, mb] = rgb(COLORS.muted);
    pdf.setTextColor(mr, mg, mb);
    pdf.text(label, x, yTop);

    pdf.setFontSize(11);
    setFont("normal");
    pdf.setTextColor(0, 0, 0);
    const lines = pdf.splitTextToSize(v || "-", Math.max(10, maxW)) as string[];
    const yValue = yTop + lineHeightMm(8) + 1.6;
    pdf.text(lines, x, yValue);
    return yValue + Math.max(1, lines.length) * lineHeightMm(11) + 2.2;
  };

  const drawCoverHeaderBlock = () => {
    const leftFields = [
      { label: String(t.pdf.requestNumberLabel ?? "Request Number"), value: request.id },
      { label: String(t.request.clientName ?? "Client Name"), value: request.clientName },
      { label: String(t.request.country ?? "Country"), value: translateResolvedOption(request.country, request.countryOther) },
      {
        label: String(t.request.applicationVehicle ?? "Application Vehicle"),
        value: translateResolvedOption(request.applicationVehicle, request.applicationVehicleOther),
      },
    ];

    const revisionValue = (() => {
      const raw: any = (request as any)?.revision ?? (request as any)?.version ?? null;
      if (raw !== null && raw !== undefined && String(raw).trim() !== "") return String(raw);
      const edits = Array.isArray(request.history) ? request.history.filter((h: any) => h?.status === "edited").length : 0;
      return String(Math.max(1, 1 + edits));
    })();

    const rightFields = [
      { kind: "status" as const, label: String(t.common.status ?? "Status"), value: String(statusLabel) },
      { kind: "text" as const, label: String(t.table.createdBy ?? "Created By"), value: request.createdByName },
      { kind: "text" as const, label: String(t.pdf.createdAtLabel ?? "Created At"), value: formatDate(new Date(request.createdAt), "MMMM d, yyyy") },
      { kind: "text" as const, label: String(t.pdf.revisionLabel ?? "Revision"), value: revisionValue },
    ];

    const x = margin;
    const w = contentWidth;
    const pad = 7;
    const colGap = 10;
    const colW = (w - colGap) / 2;
    const innerW = colW - pad * 2;

    const leftH = leftFields.reduce((sum, f) => sum + measureStackField(f.label, String(f.value ?? ""), innerW), 0);
    const statusRowH = lineHeightMm(8) + 6.6 + 4.0;
    const rightTextH = rightFields
      .filter((f) => f.kind === "text")
      .reduce((sum, f: any) => sum + measureStackField(f.label, String(f.value ?? ""), innerW), 0);
    const blockH = Math.max(leftH, statusRowH + rightTextH) + pad * 2;

    ensureSpace(blockH + 4);

    const [br, bg, bb] = rgb(COLORS.border);
    const [fillR, fillG, fillB] = rgb("#F9FAFB");
    pdf.setFillColor(fillR, fillG, fillB);
    pdf.setDrawColor(br, bg, bb);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x, y, w, blockH, 3, 3, "FD");

    const leftX = x + pad;
    const rightX = x + colW + colGap + pad;
    let yLeft = y + pad + 4;
    let yRight = y + pad + 4;

    for (const f of leftFields) {
      yLeft = drawStackField(f.label, String(f.value ?? ""), leftX, innerW, yLeft);
    }

    // Status badge (value) in the right column.
    pdf.setFontSize(8);
    setFont("bold");
    const [mr, mg, mb] = rgb(COLORS.muted);
    pdf.setTextColor(mr, mg, mb);
    pdf.text(rightFields[0].label, rightX, yRight);
    pdf.setTextColor(0, 0, 0);

    const badgeY = yRight + lineHeightMm(8) + 1.4;
    drawStatusBadge(String(statusLabel), rightX + innerW, badgeY);
    yRight = badgeY + 6.6 + 4.2;

    for (const f of rightFields.slice(1)) {
      yRight = drawStackField(f.label, String((f as any).value ?? ""), rightX, innerW, yRight);
    }

    y += blockH + 8;
  };

  const drawExecutiveSummaryBox = () => {
    const deliverables = request.expectedDeliverySelections?.length
      ? request.expectedDeliverySelections.map(translateOption).join("; ")
      : "";
    const quantity = typeof request.expectedQty === "number" ? String(request.expectedQty) : "";
    const targetReplyDate = String(request.clientExpectedDeliveryDate ?? "").trim();

    const fields = [
      { label: String(t.request.applicationVehicle ?? "Application Vehicle"), value: translateResolvedOption(request.applicationVehicle, request.applicationVehicleOther) },
      { label: String(t.pdf.deliverablesLabel ?? "Deliverables"), value: deliverables },
      { label: String(t.request.quantity ?? "Quantity"), value: quantity },
      { label: String(t.request.clientExpectedDeliveryDate ?? "Client Expected Reply Date"), value: targetReplyDate },
    ];

    const x = margin;
    const w = contentWidth;
    const pad = 7;
    const colGap = 10;
    const colW = (w - colGap) / 2;
    const innerW = colW - pad * 2;

    const titleH = lineHeightMm(12) + 4.5;
    const leftH = measureStackField(fields[0].label, String(fields[0].value ?? ""), innerW) + measureStackField(fields[1].label, String(fields[1].value ?? ""), innerW);
    const rightH = measureStackField(fields[2].label, String(fields[2].value ?? ""), innerW) + measureStackField(fields[3].label, String(fields[3].value ?? ""), innerW);
    const boxH = Math.max(leftH, rightH) + pad * 2 + titleH;

    ensureSpace(boxH + 4);

    const [br, bg, bb] = rgb(COLORS.border);
    const [fillR, fillG, fillB] = rgb("#FFFFFF");
    pdf.setFillColor(fillR, fillG, fillB);
    pdf.setDrawColor(br, bg, bb);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(x, y, w, boxH, 3, 3, "FD");

    // Title + divider
    pdf.setFontSize(12);
    setFont("bold");
    const [tr, tg, tb] = rgb(COLORS.title);
    pdf.setTextColor(tr, tg, tb);
    pdf.text(String(t.pdf.executiveSummaryTitle ?? "Executive Summary"), x + pad, y + pad + 2);
    pdf.setTextColor(0, 0, 0);
    setFont("normal");
    const yDiv = y + pad + 4.6;
    pdf.setDrawColor(br, bg, bb);
    pdf.setLineWidth(0.2);
    pdf.line(x + pad, yDiv, x + w - pad, yDiv);

    const leftX = x + pad;
    const rightX = x + colW + colGap + pad;
    let yLeft = yDiv + 6;
    let yRight = yDiv + 6;

    yLeft = drawStackField(fields[0].label, String(fields[0].value ?? ""), leftX, innerW, yLeft);
    yLeft = drawStackField(fields[1].label, String(fields[1].value ?? ""), leftX, innerW, yLeft);

    yRight = drawStackField(fields[2].label, String(fields[2].value ?? ""), rightX, innerW, yRight);
    yRight = drawStackField(fields[3].label, String(fields[3].value ?? ""), rightX, innerW, yRight);

    y += boxH + 10;
  };

  // First page header.
  drawPageHeader(true);

  // Report title + cover content.
  ensureSpace(22);
  pdf.setFontSize(18);
  setFont("bold");
  const [tr, tg, tb] = rgb(COLORS.title);
  pdf.setTextColor(tr, tg, tb);
  pdf.text(String(t.pdf.reportTitle ?? "Monroc Customer Request Report"), margin, y);
  setFont("normal");
  pdf.setTextColor(0, 0, 0);
  y += 10;

  drawCoverHeaderBlock();
  drawExecutiveSummaryBox();

  // 1. General Information
  beginCard(`1. ${String(t.request.generalInfo ?? "General Information")}`);
  drawParamTable([
    { param: String(t.request.clientContact ?? "Client Contact"), value: request.clientContact },
    { param: String(t.request.repeatability ?? "Repeatability"), value: translateOption(request.repeatability) },
    { param: String(t.request.country ?? "Country"), value: translateResolvedOption(request.country, request.countryOther) },
    { param: String(t.request.applicationVehicle ?? "Application Vehicle"), value: translateResolvedOption(request.applicationVehicle, request.applicationVehicleOther) },
    ...(request.country === "China" && request.city ? [{ param: String(t.request.city ?? "City"), value: request.city }] : []),
  ]);

  drawSubheading(String(t.request.expectedDelivery ?? "Expected Deliverable"));
  drawParamTable([
    {
      param: String(t.pdf.deliverablesLabel ?? "Deliverables"),
      value: request.expectedDeliverySelections?.length ? request.expectedDeliverySelections.map(translateOption).join("; ") : "",
    },
    { param: String(t.request.quantity ?? "Quantity"), value: typeof request.expectedQty === "number" ? String(request.expectedQty) : "", unit: "pcs" },
    { param: String(t.request.clientExpectedDeliveryDate ?? "Client Expected Reply Date"), value: request.clientExpectedDeliveryDate || "" },
  ]);
  endCard();

  // 2. Client Application
  beginCard(`2. ${String(t.request.clientApplication ?? "Client Application")}`);
  drawParamTable([
    { param: String(t.request.workingCondition ?? "Working Condition"), value: translateResolvedOption(request.workingCondition, request.workingConditionOther) },
    { param: String(t.request.usageType ?? "Road Conditions"), value: translateResolvedOption(request.usageType, request.usageTypeOther) },
    { param: String(t.request.environment ?? "Environment"), value: translateResolvedOption(request.environment, request.environmentOther) },
  ]);
  endCard();

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

    beginCard(`3. ${t.request.technicalInfo} - ${productLabel}`);

    drawSubheading(`3.1 ${t.pdf.axlePerformanceTitle}`);
    drawParamTable([
      { param: String(t.request.productType), value: getProductTypeLabel(product, translateOption) },
      { param: String(t.request.repeatability), value: translateOption(request.repeatability) },
      { param: String(t.request.quantity), value: product.quantity !== null && product.quantity !== undefined ? String(product.quantity) : "", unit: "pcs" },
      { param: String(t.pdf.loadsKgLabel), value: product.loadsKg, unit: "kg" },
      { param: String(t.pdf.speedsKmhLabel), value: product.speedsKmh, unit: "km/h" },
    ]);

    const articulationValue = String(product.articulationType ?? "").toLowerCase();
    const showWheelBase = articulationValue.includes("steering");
    drawSubheading(`3.2 ${t.pdf.wheelsGeometryTitle}`);
    drawParamTable([
      { param: String(t.request.tyreSize), value: product.tyreSize },
      { param: String(t.pdf.trackMmLabel), value: product.trackMm, unit: "mm" },
      ...(showWheelBase ? [{ param: String(t.request.wheelBase), value: product.wheelBase }] : []),
    ]);

    const brakeTypeRaw = String(product.brakeType ?? "").toLowerCase();
    const isBrakeNA = brakeTypeRaw === "na" || brakeTypeRaw === "n/a" || brakeTypeRaw === "n.a";
    drawSubheading(`3.3 ${t.pdf.brakingSuspensionTitle}`);
    drawParamTable([
      { param: String(t.request.brakeType), value: translateBrakeType(product.brakeType) },
      ...(!isBrakeNA ? [{ param: String(t.request.brakeSize), value: translateOption(product.brakeSize) }] : []),
      { param: String(t.request.brakePowerType), value: translateOption(product.brakePowerType) },
      { param: String(t.request.brakeCertificate), value: translateOption(product.brakeCertificate) },
      { param: String(t.request.suspension), value: translateOption(product.suspension) },
    ]);

    drawSubheading(`3.4 ${t.pdf.finishInterfaceTitle}`);
    drawParamTable([
      { param: String(t.request.finish), value: product.finish },
      { param: String(t.request.studsPcd), value: studsValue },
      { param: String(t.request.mainBodySectionType), value: translateOption(product.mainBodySectionType) },
      { param: String(t.request.clientSealingRequest), value: translateOption(product.clientSealingRequest) },
      { param: String(t.request.cupLogo), value: translateOption(product.cupLogo) },
    ]);

    const productAttachments = Array.isArray(product.attachments) ? product.attachments : [];

    if (product.productComments) {
      drawSubheading(t.request.productComments);
      drawParagraph(product.productComments);
    }

    if (productAttachments.length) {
      const appendixRef = registerAppendixAttachments("technical", productAttachments);
      drawSubheading(t.request.attachments);
      drawNote(seeAppendixText(appendixRef));
    }

    endCard();
  }

  // Design notes + result card(s).
  const designAttachments = Array.isArray(request.designResultAttachments) ? request.designResultAttachments : [];
  const hasDesignNotes = (request.designNotes ?? "").trim().length > 0;
  const hasDesignResultComments = (request.designResultComments ?? "").trim().length > 0;
  const hasDesignAttachments = designAttachments.length > 0;
  if (hasDesignNotes || hasDesignResultComments || hasDesignAttachments) {
    beginCard(`4. ${t.panels.designResult}`);

    if (hasDesignNotes) {
      drawSubheading(t.pdf.designNotesTitle);
      drawParagraph(request.designNotes ?? "");
    }
    if (hasDesignResultComments) {
      drawSubheading(t.panels.designResultComments);
      drawParagraph(request.designResultComments ?? "");
    }
    if (hasDesignAttachments) {
      const appendixRef = registerAppendixAttachments("design", designAttachments);
      drawSubheading(t.panels.designResultUploads);
      drawNote(seeAppendixText(appendixRef));
    }

    endCard();
  }

  // 5. Internal Costing
  const costingAttachments = Array.isArray(request.costingAttachments) ? request.costingAttachments : [];
  const incotermValue = request.incoterm === "other" ? request.incotermOther : request.incoterm;
  const sellingCurrency = request.sellingCurrency ?? "EUR";
  const vatValue = request.vatMode
    ? request.vatMode === "with"
      ? `${t.panels.withVat}${request.vatRate !== null ? ` (${request.vatRate}%)` : ""}`
      : t.panels.withoutVat
    : "";

  const hasSellingPrice = typeof request.sellingPrice === "number" && Number.isFinite(request.sellingPrice);
  const hasCostingMargin = typeof request.calculatedMargin === "number" && Number.isFinite(request.calculatedMargin);
  if (hasSellingPrice || hasCostingMargin || request.deliveryLeadtime || incotermValue || request.vatMode || (request.costingNotes ?? "").trim() || costingAttachments.length) {
    beginCard(`5. ${String(t.pdf.internalCostingTitle ?? t.pdf.costingInformationTitle)}`);
    drawParamTable([
      hasSellingPrice ? { param: String(t.panels.sellingPrice), value: request.sellingPrice!.toFixed(2), unit: sellingCurrency } : { param: "", value: null },
      hasCostingMargin ? { param: String(t.panels.margin), value: request.calculatedMargin!.toFixed(1), unit: "%" } : { param: "", value: null },
      request.deliveryLeadtime ? { param: String(t.panels.deliveryLeadtime), value: request.deliveryLeadtime } : { param: "", value: null },
      incotermValue ? { param: String(t.panels.incoterm), value: incotermValue } : { param: "", value: null },
      vatValue ? { param: String(t.panels.vatMode), value: vatValue } : { param: "", value: null },
    ]);
    if ((request.costingNotes ?? "").trim()) {
      drawSubheading(t.panels.costingNotes);
      drawParagraph(request.costingNotes ?? "");
    }
    if (costingAttachments.length) {
      const appendixRef = registerAppendixAttachments("costing", costingAttachments);
      drawSubheading(t.panels.costingAttachments);
      drawNote(seeAppendixText(appendixRef));
    }
    endCard();
  }

  // 6. Commercial Offer (Sales Follow-up)
  const salesAttachments = Array.isArray(request.salesAttachments) ? request.salesAttachments : [];
  const salesIncotermValue = request.salesIncoterm === "other" ? request.salesIncotermOther : request.salesIncoterm;
  const salesCurrency = request.salesCurrency ?? "EUR";
  const salesVatValue = request.salesVatMode
    ? request.salesVatMode === "with"
      ? `${t.panels.withVat}${request.salesVatRate !== null ? ` (${request.salesVatRate}%)` : ""}`
      : t.panels.withoutVat
    : "";

  const hasSalesFinalPrice = request.salesFinalPrice !== null && request.salesFinalPrice !== undefined && Number.isFinite(Number(request.salesFinalPrice));
  const hasSalesContent =
    hasSalesFinalPrice ||
    typeof request.salesMargin === "number" ||
    (request.salesWarrantyPeriod ?? "").trim() ||
    (request.salesOfferValidityPeriod ?? "").trim() ||
    request.salesExpectedDeliveryDate ||
    salesIncotermValue ||
    request.salesVatMode ||
    (request.salesFeedbackComment ?? "").trim() ||
    (Array.isArray(request.salesPaymentTerms) && request.salesPaymentTerms.length) ||
    salesAttachments.length;

  if (hasSalesContent) {
    beginCard(`6. ${String(t.pdf.commercialOfferTitle ?? t.panels.salesFollowup)}`);
    drawParamTable(
      [
        hasSalesFinalPrice ? { param: String(t.panels.salesFinalPrice), value: Number(request.salesFinalPrice).toFixed(2), unit: salesCurrency } : { param: "", value: null },
        typeof request.salesMargin === "number" ? { param: String(t.panels.salesMargin), value: request.salesMargin.toFixed(2), unit: "%" } : { param: "", value: null },
        (request.salesWarrantyPeriod ?? "").trim() ? { param: String(t.panels.warrantyPeriod), value: String(request.salesWarrantyPeriod).trim() } : { param: "", value: null },
        (request.salesOfferValidityPeriod ?? "").trim()
          ? { param: String(t.panels.offerValidityPeriod), value: String(request.salesOfferValidityPeriod).trim() }
          : { param: "", value: null },
        request.salesExpectedDeliveryDate ? { param: String(t.panels.salesExpectedDeliveryDate), value: String(request.salesExpectedDeliveryDate) } : { param: "", value: null },
        salesIncotermValue ? { param: String(t.panels.incoterm), value: salesIncotermValue } : { param: "", value: null },
        salesVatValue ? { param: String(t.panels.vatMode), value: salesVatValue } : { param: "", value: null },
      ],
    );
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
      const appendixRef = registerAppendixAttachments("sales", salesAttachments);
      drawSubheading(t.panels.salesAttachments);
      drawNote(seeAppendixText(appendixRef));
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

    beginCard(`7. ${String(t.pdf.statusHistoryTitle ?? "Status History")}`);
    const headers = [
      String(t.pdf.stageLabel ?? t.common.status ?? "Stage"),
      String(t.common.date ?? "Date"),
      String(t.pdf.ownerLabel ?? t.pdf.byLabel ?? "Owner"),
      String(t.pdf.commentLabel ?? "Comment"),
    ];
    const colWidths = [34, 34, 30, contentWidth - 12 - 34 - 34 - 30];
    const rows = filteredHistory.map((entry: any) => {
      const st = t.statuses[entry.status as keyof typeof t.statuses] || STATUS_CONFIG[entry.status]?.label || entry.status;
      const ts = formatDate(new Date(entry.timestamp), "MMM d, yyyy HH:mm");
      const owner = String(entry.userName || "");
      const comment = String(entry.comment || "");
      return [st, ts, owner, comment];
    });

    drawTable({
      headers,
      rows,
      colWidths,
      onPageBreak: () => {
        pageBreakActiveCard();
      },
      emptyCellValue: "",
    });
    endCard();
  }

  // Footer (page numbers).
  // Appendix (attachments) pages at the end.
  if (appendixItems.length) {
    addPage();

    // Appendix index
    beginCard(`8. ${String(t.pdf.appendixTitle ?? "Appendix")}`);
    const headers = [
      String(t.pdf.appendixIdLabel ?? "Appendix ID"),
      String(t.pdf.categoryLabel ?? "Category"),
      String(t.pdf.typeLabel ?? "Type"),
      String(t.pdf.descriptionLabel ?? t.pdf.fileLabel ?? "Description"),
      String(t.pdf.byLabel ?? "By"),
      String(t.common.date ?? "Date"),
      String(t.pdf.sizeLabel ?? "Size"),
    ];
    const colWidths = [14, 26, 24, 44, 20, 28, contentWidth - 12 - 14 - 26 - 24 - 44 - 20 - 28];

    const rows = appendixItems.map((it) => [
      it.id,
      it.category,
      it.typeLabel,
      it.filename,
      it.uploadedBy || "",
      it.uploadedAt ? formatDate(new Date(it.uploadedAt), "MMM d, yyyy HH:mm") : "",
      it.sizeLabel,
    ]);

    drawTable({
      headers,
      rows,
      colWidths,
      onPageBreak: () => {
        pageBreakActiveCard();
      },
      emptyCellValue: "",
    });
    endCard();

    // Attachment previews (each starts on its own page).
    for (const it of appendixItems) {
      addPage();
      const extraParts = [
        it.category,
        it.typeLabel,
        it.uploadedBy ? `${String(t.pdf.byLabel ?? "By")}: ${it.uploadedBy}` : "",
        it.uploadedAt ? `${String(t.common.date ?? "Date")}: ${formatDate(new Date(it.uploadedAt), "MMM d, yyyy HH:mm")}` : "",
        it.sizeLabel && it.sizeLabel !== "-" ? `${String(t.pdf.sizeLabel ?? "Size")}: ${it.sizeLabel}` : "",
      ].filter(Boolean);
      const extra = extraParts.join(" | ");
      const title = `${String(t.pdf.appendixTitle ?? "Appendix")} ${it.id} - ${it.filename}`;
      drawAppendixAttachmentHeader(title, extra);

      const preview = await attachmentToPreview(it.attachment);
      if (preview.kind === "image" && preview.dataUrls?.length) {
        await drawImageFit(preview.dataUrls[0]);
        continue;
      }
      if (preview.kind === "pdf" && preview.dataUrls?.length) {
        for (let p = 0; p < preview.dataUrls.length; p++) {
          if (p > 0) {
            addPage();
            const pageTitle = `${String(t.pdf.appendixTitle ?? "Appendix")} ${it.id} - ${it.filename} (PDF ${p + 1}/${preview.dataUrls.length})`;
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

  // Footer (page numbers) - must run after appendix pages are added.
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5);
    pdf.setTextColor(150, 150, 150);
    const pageLabel = t.pdf.pageOfLabel.replace("{current}", String(i)).replace("{total}", String(pageCount));
    const footer = `Monroc | ${String(t.pdf.confidentialityNotice ?? "Internal Use Only")} | ${String(t.pdf.reportTitle)} | ${request.id} | ${pageLabel}`;
    pdf.text(footer, pageWidth / 2, pageHeight - 6, { align: "center" });
  }

  pdf.save(`${request.id}_report.pdf`);
};
