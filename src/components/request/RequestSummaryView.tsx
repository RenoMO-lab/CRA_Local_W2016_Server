import React, { useMemo } from "react";
import { format } from "date-fns";
import { File, Paperclip } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { Attachment, CustomerRequest, RequestProduct } from "@/types";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type Props = {
  request: CustomerRequest;
};

const SummaryCard: React.FC<{ title: string; className?: string; children: React.ReactNode }> = ({
  title,
  className,
  children,
}) => (
  <div className={cn("bg-card rounded-lg border border-border p-4 md:p-6 space-y-4", className)}>
    <h2 className="text-base md:text-lg font-semibold text-foreground">{title}</h2>
    {children}
  </div>
);

const SummaryField: React.FC<{ label: string; value?: React.ReactNode; className?: string }> = ({
  label,
  value,
  className,
}) => (
  <div className={cn("space-y-1", className)}>
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-sm font-medium text-foreground break-words">{value ?? "-"}</div>
  </div>
);

const formatDate = (d: any) => {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+date)) return "-";
  return format(date, "MMM d, yyyy");
};

const formatDateTime = (d: any) => {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+date)) return "-";
  return format(date, "yyyy-MM-dd HH:mm");
};

const buildAttachmentHref = (attachment: Attachment) => {
  const url = String(attachment?.url ?? "").trim();
  if (!url) return "";

  if (
    url.startsWith("data:") ||
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("/")
  ) {
    return url;
  }

  // Some stored attachments use base64 content without a prefix.
  const ext = (attachment.filename || "").split(".").pop()?.toLowerCase() ?? "";
  const imageTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
  };

  if (ext === "pdf") return `data:application/pdf;base64,${url}`;
  if (imageTypes[ext]) return `data:${imageTypes[ext]};base64,${url}`;
  return `data:application/octet-stream;base64,${url}`;
};

const normalizeProducts = (r: CustomerRequest): RequestProduct[] => {
  if (Array.isArray(r.products) && r.products.length) return r.products;
  // Legacy single-product fields
  return [
    {
      axleLocation: r.axleLocation ?? "",
      axleLocationOther: r.axleLocationOther ?? "",
      articulationType: r.articulationType ?? "",
      articulationTypeOther: r.articulationTypeOther ?? "",
      configurationType: r.configurationType ?? "",
      configurationTypeOther: r.configurationTypeOther ?? "",
      quantity: typeof r.expectedQty === "number" ? r.expectedQty : null,
      loadsKg: r.loadsKg ?? null,
      speedsKmh: r.speedsKmh ?? null,
      tyreSize: r.tyreSize ?? "",
      trackMm: r.trackMm ?? null,
      studsPcdMode: r.studsPcdMode ?? "standard",
      studsPcdStandardSelections: Array.isArray(r.studsPcdStandardSelections) ? r.studsPcdStandardSelections : [],
      studsPcdSpecialText: r.studsPcdSpecialText ?? "",
      wheelBase: r.wheelBase ?? "",
      finish: r.finish ?? "Black Primer default",
      brakeType: r.brakeType ?? null,
      brakeSize: r.brakeSize ?? "",
      brakePowerType: r.brakePowerType ?? "",
      brakeCertificate: r.brakeCertificate ?? "",
      mainBodySectionType: r.mainBodySectionType ?? "",
      clientSealingRequest: r.clientSealingRequest ?? "",
      cupLogo: r.cupLogo ?? "",
      suspension: r.suspension ?? "",
      productComments: typeof r.otherRequirements === "string" ? r.otherRequirements : "",
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
    } as RequestProduct,
  ];
};

const RequestSummaryView: React.FC<Props> = ({ request }) => {
  const { t, translateOption } = useLanguage();

  const countryDisplay = useMemo(() => {
    if ((request.country || "").trim().toLowerCase() === "other") {
      return request.countryOther?.trim() ? request.countryOther : t.common.other;
    }
    return request.country ? translateOption(request.country) : "-";
  }, [request.country, request.countryOther, translateOption, t.common.other]);

  const applicationVehicleDisplay = useMemo(() => {
    if ((request.applicationVehicle || "").trim().toLowerCase() === "other") {
      return request.applicationVehicleOther?.trim() ? request.applicationVehicleOther : t.common.other;
    }
    return request.applicationVehicle ? translateOption(request.applicationVehicle) : "-";
  }, [request.applicationVehicle, request.applicationVehicleOther, translateOption, t.common.other]);

  const workingConditionDisplay = useMemo(() => {
    if ((request.workingCondition || "").trim().toLowerCase() === "other") {
      return request.workingConditionOther?.trim() ? request.workingConditionOther : t.common.other;
    }
    return request.workingCondition ? translateOption(request.workingCondition) : "-";
  }, [request.workingCondition, request.workingConditionOther, translateOption, t.common.other]);

  const usageTypeDisplay = useMemo(() => {
    if ((request.usageType || "").trim().toLowerCase() === "other") {
      return request.usageTypeOther?.trim() ? request.usageTypeOther : t.common.other;
    }
    return request.usageType ? translateOption(request.usageType) : "-";
  }, [request.usageType, request.usageTypeOther, translateOption, t.common.other]);

  const environmentDisplay = useMemo(() => {
    if ((request.environment || "").trim().toLowerCase() === "other") {
      return request.environmentOther?.trim() ? request.environmentOther : t.common.other;
    }
    return request.environment ? translateOption(request.environment) : "-";
  }, [request.environment, request.environmentOther, translateOption, t.common.other]);

  const expectedDeliverySelections = Array.isArray(request.expectedDeliverySelections) ? request.expectedDeliverySelections : [];
  const products = useMemo(() => normalizeProducts(request), [request]);

  return (
    <div className="space-y-4 md:space-y-6">
      <SummaryCard title={t.request.generalInfo}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <SummaryField label={t.table.requestId} value={request.id} />
          <SummaryField label={t.table.createdBy} value={request.createdByName || "-"} />
          <SummaryField label={t.table.created} value={formatDate(request.createdAt)} />
          <SummaryField label={t.table.clientName} value={request.clientName || "-"} />
          <SummaryField label={t.request.clientContact} value={request.clientContact || "-"} />
          <SummaryField label={t.table.country} value={countryDisplay} />
          {(request.country === "China" || request.country === "china") && (
            <SummaryField label={t.request.city} value={(request as any).city || "-"} />
          )}
          <SummaryField label={t.request.applicationVehicle} value={applicationVehicleDisplay} />
          <SummaryField label={t.common.status} value={t.statuses[request.status] || request.status} />
          <SummaryField label={t.common.date} value={formatDateTime(request.updatedAt)} />
        </div>
      </SummaryCard>

      <SummaryCard title={t.request.expectedDelivery}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <SummaryField
            label={t.request.expectedDelivery}
            value={
              expectedDeliverySelections.length ? (
                <div className="flex flex-wrap gap-2">
                  {expectedDeliverySelections.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-semibold text-foreground"
                    >
                      {translateOption(item)}
                    </span>
                  ))}
                </div>
              ) : (
                "-"
              )
            }
          />
          <SummaryField
            label={t.request.clientExpectedDeliveryDate}
            value={request.clientExpectedDeliveryDate?.trim() ? request.clientExpectedDeliveryDate : "-"}
          />
        </div>
      </SummaryCard>

      <SummaryCard title={t.request.clientApplication}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          <SummaryField label={t.request.workingCondition} value={workingConditionDisplay} />
          <SummaryField label={t.request.usageType} value={usageTypeDisplay} />
          <SummaryField label={t.request.environment} value={environmentDisplay} />
          <SummaryField label={t.request.expectedQty} value={request.expectedQty ?? "-"} />
          <SummaryField label={t.request.repeatability} value={request.repeatability ? translateOption(request.repeatability) : "-"} />
        </div>
      </SummaryCard>

      <SummaryCard title={t.request.productsStep}>
        <Accordion type="single" collapsible defaultValue={products.length ? `product-0` : undefined}>
          {products.map((p, idx) => {
            const title = `${t.request.productLabel} ${idx + 1}`;
            const attachments = Array.isArray(p.attachments) ? p.attachments : [];
            const isOther = (v: any) => String(v ?? "").trim().toLowerCase() === "other";
            const displayValue = (value: any, otherValue?: any) => {
              if (!value) return "-";
              if (isOther(value)) return otherValue?.trim() ? otherValue : t.common.other;
              return translateOption(String(value));
            };

            const studsDisplay =
              p.studsPcdMode === "special"
                ? p.studsPcdSpecialText?.trim() || "-"
                : (Array.isArray(p.studsPcdStandardSelections) && p.studsPcdStandardSelections.length
                    ? p.studsPcdStandardSelections.map(translateOption).join(", ")
                    : "-");

            return (
              <AccordionItem key={idx} value={`product-${idx}`} className="border-b border-border/60">
                <AccordionTrigger className="text-sm md:text-base font-semibold">{title}</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 py-2">
                    <SummaryField label={t.request.quantity} value={p.quantity ?? "-"} />
                    <SummaryField label={t.request.configurationType} value={displayValue(p.configurationType, p.configurationTypeOther)} />
                    <SummaryField label={t.request.axleLocation} value={displayValue(p.axleLocation, p.axleLocationOther)} />
                    <SummaryField label={t.request.articulationType} value={displayValue(p.articulationType, p.articulationTypeOther)} />
                    <SummaryField label={t.request.loads} value={p.loadsKg ?? "-"} />
                    <SummaryField label={t.request.speeds} value={p.speedsKmh ?? "-"} />
                    <SummaryField label={t.request.tyreSize} value={p.tyreSize || "-"} />
                    <SummaryField label={t.request.track} value={p.trackMm ?? "-"} />
                    <SummaryField label={t.request.studsPcd} value={studsDisplay} className="sm:col-span-2 lg:col-span-3" />
                    <SummaryField label={t.request.brakeType} value={p.brakeType ? translateOption(String(p.brakeType)) : "-"} />
                    <SummaryField label={t.request.brakeSize} value={p.brakeSize || "-"} />
                    <SummaryField label={t.request.suspension} value={p.suspension ? translateOption(p.suspension) : "-"} />
                    <SummaryField label={t.request.finish} value={p.finish || "-"} className="sm:col-span-2 lg:col-span-3" />
                    {p.productComments?.trim() ? (
                      <SummaryField
                        label={t.request.otherRequirements}
                        value={<div className="whitespace-pre-line">{p.productComments}</div>}
                        className="sm:col-span-2 lg:col-span-3"
                      />
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      {t.request.attachments}
                    </div>
                    {attachments.length ? (
                      <div className="mt-2 space-y-2">
                        {attachments.map((a) => {
                          const href = buildAttachmentHref(a);
                          return (
                            <a
                              key={a.id}
                              href={href}
                              download={a.filename}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 hover:bg-muted/30"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <File className="h-4 w-4 text-primary" />
                                <span className="text-sm truncate text-foreground">{a.filename}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{formatDate(a.uploadedAt)}</span>
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-muted-foreground">-</div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </SummaryCard>
    </div>
  );
};

export default RequestSummaryView;
