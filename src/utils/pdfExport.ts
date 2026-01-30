import jsPDF from 'jspdf';
import { CustomerRequest, RequestProduct, STATUS_CONFIG, AXLE_LOCATIONS, ARTICULATION_TYPES, CONFIGURATION_TYPES, STANDARD_STUDS_PCD_OPTIONS } from '@/types';
import { format } from 'date-fns';
import { enUS, fr, zhCN } from 'date-fns/locale';
import { translations, Language } from '@/i18n/translations';

const MONROC_RED = '#FA0000';
const LIGHT_GREY = '#F3F4F6';
const MID_GREY = '#6B7280';
const TEXT_GREY = '#4B5563';
const LOGO_URL = '/monroc-logo.png';

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
  
  return parts.length > 0 ? parts.join(' / ') : '-';
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
    return `${count} × M${bolt} studs – PCD ${pcd1}/${pcd2}`;
  }
  if (selection.startsWith('STD_')) {
    return selection.replace(/_/g, ' ');
  }
  return selection;
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

export const generateRequestPDF = async (request: CustomerRequest): Promise<void> => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const language = getPdfLanguage();
  const t = translations[language];
  const locale = getPdfLocale(language);
  const translateOption = (value: string) => {
    const options = t.options as Record<string, string>;
    return options?.[value] || value;
  };
  const translateBrakeType = (value: string | null | undefined) => {
    if (!value) return '';
    if (value === 'drum') return t.request.drum;
    if (value === 'disk') return t.request.disk;
    if (value === 'na') return t.request.na;
    return translateOption(value);
  };
  const translateResolvedOption = (value: string | null | undefined, other?: string | null) => {
    const resolved = resolveOtherValue(value, other);
    if (!resolved) return '';
    if (value === 'other') return resolved;
    return translateOption(resolved);
  };
  const formatDate = (date: Date, pattern: string) => format(date, pattern, { locale });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const gutter = 10;
  const colWidth = (contentWidth - gutter) / 2;
  const labelWidth = 48;
  const lineHeight = 4.5;
  const bottomMargin = 18;
  let y = margin;
  const labelFontSize = 9;
  const valueFontSize = 10;
  const sectionTitleSize = 14;
  const subsectionTitleSize = 11;

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - bottomMargin) {
      pdf.addPage();
      y = margin;
    }
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(14);
    pdf.setFontSize(sectionTitleSize);
    const redRgb = hexToRgb(MONROC_RED);
    pdf.setTextColor(redRgb.r, redRgb.g, redRgb.b);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin, y);
    pdf.setFont('helvetica', 'normal');
    y += 9;
  };

  const drawSubsectionTitle = (title: string) => {
    ensureSpace(10);
    pdf.setFontSize(subsectionTitleSize);
    const greyRgb = hexToRgb(TEXT_GREY);
    pdf.setTextColor(greyRgb.r, greyRgb.g, greyRgb.b);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin, y);
    pdf.setFont('helvetica', 'normal');
    y += 7;
  };

  const measureInlineField = (
    label: string,
    value: string | number | null | undefined,
    x: number,
    availableWidth: number
  ) => {
    const displayValue = getDisplayValue(value);
    if (!displayValue) {
      return null;
    }
    pdf.setFontSize(labelFontSize);
    const labelTextWidth = pdf.getTextWidth(label);
    const valueX = x + Math.max(labelWidth, labelTextWidth + 4);
    const availableValueWidth = Math.max(16, availableWidth - (valueX - x));
    const valueLines = pdf.splitTextToSize(displayValue, availableValueWidth);
    return {
      displayValue,
      labelTextWidth,
      valueX,
      availableValueWidth,
      lineCount: Math.max(valueLines.length, 1),
    };
  };

  const drawInlineField = (
    label: string,
    value: string | number | null | undefined,
    x: number,
    yPos: number,
    availableWidth: number
  ) => {
    const measure = measureInlineField(label, value, x, availableWidth);
    if (!measure) {
      return 0;
    }
    pdf.setFontSize(labelFontSize);
    pdf.setFont('helvetica', 'bold');
    const labelRgb = hexToRgb(TEXT_GREY);
    pdf.setTextColor(labelRgb.r, labelRgb.g, labelRgb.b);
    pdf.text(label, x, yPos);
    pdf.text(':', x + measure.labelTextWidth + 2, yPos);
    pdf.setFontSize(valueFontSize);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(0, 0, 0);
    pdf.text(pdf.splitTextToSize(measure.displayValue, measure.availableValueWidth), measure.valueX, yPos);
    return measure.lineCount;
  };

  const drawFieldGrid = (
    fields: { label: string; value: string | number | null | undefined }[],
    rowGap = 1
  ) => {
    for (let i = 0; i < fields.length; i += 2) {
      const left = fields[i];
      const right = fields[i + 1];
      const leftValue = getDisplayValue(left?.value ?? null);
      const rightValue = getDisplayValue(right?.value ?? null);
      const leftMeasure = left && leftValue ? measureInlineField(left.label, left.value, margin, colWidth) : null;
      const rightMeasure = right && rightValue
        ? measureInlineField(right.label, right.value, margin + colWidth + gutter, colWidth)
        : null;
      const leftLines = leftMeasure ? leftMeasure.lineCount : 0;
      const rightLines = rightMeasure ? rightMeasure.lineCount : 0;
      if (leftLines === 0 && rightLines === 0) {
        continue;
      }
      const rowLines = Math.max(leftLines, rightLines);
      const rowHeight = rowLines * lineHeight + rowGap;
      ensureSpace(rowHeight);
      if (left && leftValue) {
        drawInlineField(left.label, left.value, margin, y, colWidth);
      }
      if (right && rightValue) {
        drawInlineField(right.label, right.value, margin + colWidth + gutter, y, colWidth);
      }
      y += rowHeight;
    }
  };

  const drawFieldLine = (label: string, value: string | number | null | undefined) => {
    const displayValue = getDisplayValue(value);
    if (!displayValue) return;
    const measure = measureInlineField(label, displayValue, margin, contentWidth);
    const lineCount = measure ? measure.lineCount : 1;
    const rowHeight = lineCount * lineHeight + 0.5;
    ensureSpace(rowHeight);
    drawInlineField(label, displayValue, margin, y, contentWidth);
    y += rowHeight;
  };

  const drawParagraph = (text: string) => {
    const lines = pdf.splitTextToSize(text, contentWidth);
    ensureSpace(lines.length * lineHeight + 4);
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    pdf.text(lines, margin, y);
    y += lines.length * lineHeight + 4;
  };

  // Header band
  const headerHeight = 30;
  const headerRgb = hexToRgb(LIGHT_GREY);
  pdf.setFillColor(headerRgb.r, headerRgb.g, headerRgb.b);
  pdf.rect(0, 0, pageWidth, headerHeight, 'F');

  // Logo and generated date
  try {
    const logo = await loadImageAsBase64(LOGO_URL);
    const maxLogoWidth = 132;
    const maxLogoHeight = 30;
    const scale = Math.min(maxLogoWidth / logo.width, maxLogoHeight / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    pdf.addImage(logo.dataUrl, 'PNG', margin, 4 + (maxLogoHeight - logoHeight) / 2, logoWidth, logoHeight);
  } catch (e) {
    console.warn('Could not load logo for PDF');
  }

  pdf.setFontSize(9);
  const midGrey = hexToRgb(MID_GREY);
  pdf.setTextColor(midGrey.r, midGrey.g, midGrey.b);
  pdf.text(`${t.pdf.generatedLabel}: ${formatDate(new Date(), 'MMMM d, yyyy HH:mm')}`, pageWidth - margin, 18, { align: 'right' });

  y = headerHeight + 10;

  // Title
  pdf.setFontSize(18);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.text(t.pdf.reportTitle, margin, y);
  pdf.setFont('helvetica', 'normal');
  y += 8;

  // Request ID + Status (combined)
  const statusLabel = t.statuses[request.status] || STATUS_CONFIG[request.status]?.label || request.status;
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${t.pdf.requestLabel}: ${request.id} | ${statusLabel}`, margin, y);
  pdf.setFont('helvetica', 'normal');
  y += 8;

  // Divider line
  const divider = hexToRgb('#E5E7EB');
  pdf.setDrawColor(divider.r, divider.g, divider.b);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Metadata grid
  drawFieldGrid([
    { label: t.request.clientName, value: request.clientName },
    { label: t.request.clientContact, value: request.clientContact },
    { label: t.table.createdBy, value: request.createdByName },
    { label: t.pdf.createdAtLabel, value: formatDate(new Date(request.createdAt), 'MMMM d, yyyy') },
    { label: t.pdf.lastUpdatedLabel, value: formatDate(new Date(request.updatedAt), 'MMMM d, yyyy') },
  ], 4);
  y += 6;

  // General Information Section
  drawSectionTitle(t.request.generalInfo);
  drawFieldLine(t.request.applicationVehicle, translateResolvedOption(request.applicationVehicle, request.applicationVehicleOther));
  drawFieldLine(t.request.country, translateResolvedOption(request.country, request.countryOther));
  if (request.country === 'China' && request.city) {
    drawFieldLine(t.request.city, request.city);
  }
  // Expected Delivery Section
  drawSectionTitle(t.request.expectedDelivery);
  drawFieldLine(
    t.pdf.deliverablesLabel,
    request.expectedDeliverySelections?.length
      ? request.expectedDeliverySelections.map(translateOption).join('; ')
      : undefined
  );
  y += 6;

  // Client Application Section
  drawSectionTitle(t.request.clientApplication);
  drawFieldLine(
    t.request.workingCondition,
    translateResolvedOption(request.workingCondition, request.workingConditionOther)
  );
  drawFieldLine(t.request.usageType, translateResolvedOption(request.usageType, request.usageTypeOther));
  drawFieldLine(t.request.environment, translateResolvedOption(request.environment, request.environmentOther));
  y += 6;

  const products = Array.isArray(request.products) && request.products.length
    ? request.products
    : [buildLegacyProduct(request)];

  const studsLabelMap = new Map(STANDARD_STUDS_PCD_OPTIONS.map((option) => [option.id, option.label]));

  products.forEach((product, index) => {
    const productLabel = `${t.request.productLabel} ${index + 1}`;
    const studsMode = product.studsPcdMode ?? 'standard';
    const studsValue = studsMode === 'standard' && product.studsPcdStandardSelections?.length
      ? product.studsPcdStandardSelections
          .map((id) => translateOption(studsLabelMap.get(id) ?? formatStudsPcdSelection(id)))
          .join('; ')
      : studsMode === 'special' && product.studsPcdSpecialText
        ? product.studsPcdSpecialText
        : undefined;

    drawSectionTitle(`${t.request.technicalInfo} - ${productLabel}`);
    drawSubsectionTitle(t.pdf.axlePerformanceTitle);
    drawFieldGrid(
      [
        { label: t.request.repeatability, value: translateOption(request.repeatability) },
        { label: t.request.quantity, value: product.quantity },
        { label: t.request.productType, value: getProductTypeLabel(product, translateOption) },
        { label: t.pdf.loadsKgLabel, value: product.loadsKg },
        { label: t.pdf.speedsKmhLabel, value: product.speedsKmh },
      ],
      2
    );
    y += 4;

    drawSubsectionTitle(t.pdf.wheelsGeometryTitle);
    const articulationValue = String(product.articulationType ?? '').toLowerCase();
    const showWheelBase = articulationValue.includes('steering');
    drawFieldGrid(
      [
        { label: t.request.tyreSize, value: product.tyreSize },
        { label: t.pdf.trackMmLabel, value: product.trackMm },
        showWheelBase ? { label: t.request.wheelBase, value: product.wheelBase } : null,
      ].filter(Boolean) as { label: string; value: string | number | null | undefined }[],
      2
    );
    y += 4;

    drawSubsectionTitle(t.pdf.brakingSuspensionTitle);
    const brakeTypeRaw = String(product.brakeType ?? '').toLowerCase();
    const isBrakeNA = brakeTypeRaw === 'na' || brakeTypeRaw === 'n/a' || brakeTypeRaw === 'n.a';
    drawFieldGrid(
      [
          { label: t.request.brakeType, value: translateBrakeType(product.brakeType) },
          !isBrakeNA ? { label: t.request.brakeSize, value: translateOption(product.brakeSize) } : null,
          { label: t.request.brakePowerType, value: translateOption(product.brakePowerType) },
          { label: t.request.brakeCertificate, value: translateOption(product.brakeCertificate) },
          { label: t.request.suspension, value: translateOption(product.suspension) },
        ].filter(Boolean) as { label: string; value: string | number | null | undefined }[],
        2
      );
    y += 4;

    drawSubsectionTitle(t.pdf.finishInterfaceTitle);
    drawFieldGrid(
      [
          { label: t.request.finish, value: product.finish },
          { label: t.request.studsPcd, value: studsValue },
          { label: t.request.mainBodySectionType, value: translateOption(product.mainBodySectionType) },
          { label: t.request.clientSealingRequest, value: translateOption(product.clientSealingRequest) },
          { label: t.request.cupLogo, value: translateOption(product.cupLogo) },
        ],
        2
      );
    y += 5;

    if (product.productComments) {
      drawSectionTitle(`${t.request.productComments} - ${productLabel}`);
      drawParagraph(product.productComments);
    }
  });

  // Design Notes
  if (request.designNotes) {
    drawSectionTitle(t.pdf.designNotesTitle);
    drawParagraph(request.designNotes);
  }

  // Costing Information
  if (request.sellingPrice || request.costingNotes || request.deliveryLeadtime) {
    drawSectionTitle(t.pdf.costingInformationTitle);
    drawFieldGrid([
      request.sellingPrice ? { label: t.panels.sellingPrice, value: `€${request.sellingPrice.toFixed(2)}` } : null,
      request.calculatedMargin ? { label: t.panels.margin, value: `${request.calculatedMargin.toFixed(1)}%` } : null,
      request.deliveryLeadtime ? { label: t.panels.deliveryLeadtime, value: request.deliveryLeadtime } : null,
    ].filter(Boolean) as { label: string; value: string | number | null | undefined }[]);
    if (request.costingNotes) {
      drawParagraph(request.costingNotes);
    }
  }

  // Status History Section
  if (request.history && request.history.length > 0) {
    drawSectionTitle(t.pdf.statusHistoryTitle);
    const statusCol = 30;
    const dateCol = 40;
    const byCol = 30;
    const commentCol = contentWidth - statusCol - dateCol - byCol;
    const headerFill = hexToRgb(LIGHT_GREY);
    ensureSpace(8);
    pdf.setFillColor(headerFill.r, headerFill.g, headerFill.b);
    pdf.rect(margin, y - 4, contentWidth, 8, 'F');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    const tableHeaderRgb = hexToRgb(TEXT_GREY);
    pdf.setTextColor(tableHeaderRgb.r, tableHeaderRgb.g, tableHeaderRgb.b);
    pdf.text(t.common.status, margin + 2, y);
    pdf.text(t.common.date, margin + statusCol + 2, y);
    pdf.text(t.pdf.byLabel, margin + statusCol + dateCol + 2, y);
    pdf.text(t.pdf.commentLabel, margin + statusCol + dateCol + byCol + 2, y);
    pdf.setFont('helvetica', 'normal');
    y += 7;

    const filteredHistory = request.history.filter((entry, index, arr) => {
      if (index === 0) return true;
      const prev = arr[index - 1];
      const sameStatus = entry.status === prev.status;
      const sameUser = entry.userName === prev.userName;
      const noComment = !entry.comment && !prev.comment;
      return !(sameStatus && sameUser && noComment);
    });

    for (const entry of filteredHistory) {
      const statusLabel = t.statuses[entry.status as keyof typeof t.statuses] || STATUS_CONFIG[entry.status]?.label || entry.status;
      const timestamp = formatDate(new Date(entry.timestamp), 'MMM d, yyyy HH:mm');
      const commentText = entry.comment ? entry.comment : t.pdf.notProvided;
      const commentLines = pdf.splitTextToSize(commentText, commentCol - 4);
      const rowLines = Math.max(1, commentLines.length);
      const rowHeight = rowLines * lineHeight + 2;
      ensureSpace(rowHeight);
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.text(statusLabel, margin + 2, y);
      pdf.text(timestamp, margin + statusCol + 2, y);
      pdf.text(entry.userName || t.pdf.notProvided, margin + statusCol + dateCol + 2, y);
      pdf.text(commentLines, margin + statusCol + dateCol + byCol + 2, y);
      y += rowHeight;
    }
  }

  // Footer
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    const pageLabel = t.pdf.pageOfLabel
      .replace('{current}', String(i))
      .replace('{total}', String(pageCount));
    pdf.text(
      `${pageLabel} | ${t.pdf.reportTitle} | ${request.id}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    );
  }

  // Save the PDF
  pdf.save(`${request.id}_report.pdf`);
};
