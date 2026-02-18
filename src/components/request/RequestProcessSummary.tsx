import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Eye, File, Paperclip } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { Attachment, CustomerRequest, RequestStatus } from "@/types";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  request: CustomerRequest;
};

const Card: React.FC<{
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ title, description, className, children }) => (
  <div className={cn("bg-card rounded-lg border border-border p-4 md:p-6 space-y-4", className)}>
    <div className="space-y-1">
      <h2 className="text-base md:text-lg font-semibold text-foreground">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </div>
);

const FieldLine: React.FC<{ label: string; value?: React.ReactNode; className?: string }> = ({ label, value, className }) => (
  <div className={cn("flex items-start justify-between gap-3", className)}>
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="text-sm font-medium text-foreground break-words text-right">{value ?? "-"}</div>
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

const isImageFile = (filename: string) => {
  const ext = filename.toLowerCase().split(".").pop();
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext || "");
};

const isPdfFile = (filename: string) => filename.toLowerCase().endsWith(".pdf");

const AttachmentList: React.FC<{
  title: string;
  attachments: Attachment[];
}> = ({ title, attachments }) => {
  const { t } = useLanguage();
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const openPreview = (a: Attachment) => {
    setPreviewAttachment(a);
    setIsPreviewOpen(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        {title}
      </div>
      {attachments.length ? (
        <div className="space-y-2">
          {attachments.map((a) => {
            const href = buildAttachmentHref(a);
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <File className="h-4 w-4 text-primary" />
                  <span className="text-sm truncate text-foreground">{a.filename}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden sm:inline text-xs text-muted-foreground">{formatDate(a.uploadedAt)}</span>
                  <button
                    type="button"
                    onClick={() => openPreview(a)}
                    className="rounded p-1.5 text-primary hover:bg-primary/15"
                    title={t.table.view}
                  >
                    <Eye size={16} />
                  </button>
                  <a
                    href={href}
                    download={a.filename}
                    className="rounded p-1.5 text-primary hover:bg-primary/15"
                    title={t.request.downloadFile}
                  >
                    <Download size={16} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">-</div>
      )}

      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] overflow-auto scrollbar-thin"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewAttachment?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-[300px] items-center justify-center">
            {previewAttachment && isImageFile(previewAttachment.filename) && (
              <img
                src={buildAttachmentHref(previewAttachment)}
                alt={previewAttachment.filename}
                className="max-h-[70vh] max-w-full object-contain"
              />
            )}
            {previewAttachment && isPdfFile(previewAttachment.filename) && (
              <iframe
                src={buildAttachmentHref(previewAttachment)}
                title={previewAttachment.filename}
                className="h-[70vh] w-full border border-border rounded"
              />
            )}
            {previewAttachment &&
              !isImageFile(previewAttachment.filename) &&
              !isPdfFile(previewAttachment.filename) && (
                <div className="space-y-3 text-center">
                  <div className="text-sm text-muted-foreground">{t.request.previewNotAvailable}</div>
                  <a
                    href={buildAttachmentHref(previewAttachment)}
                    download={previewAttachment.filename}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Download size={16} className="mr-2" />
                    {t.request.downloadFile}
                  </a>
                </div>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const getLastHistoryEntry = (request: CustomerRequest, statuses: RequestStatus[]) => {
  const history = Array.isArray(request.history) ? request.history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (h && statuses.includes(h.status)) return h;
  }
  return undefined;
};

const StepTile: React.FC<{
  title: string;
  statusLabel?: string;
  updatedAt?: string;
  children: React.ReactNode;
}> = ({ title, statusLabel, updatedAt, children }) => (
  <div className="rounded-xl border border-border bg-muted/20 p-4 md:p-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {statusLabel ? <div className="text-sm text-muted-foreground">{statusLabel}</div> : null}
      </div>
      {updatedAt ? (
        <div className="text-xs text-muted-foreground sm:text-right">{updatedAt}</div>
      ) : null}
    </div>
    <div className="mt-3 space-y-2">{children}</div>
  </div>
);

const RequestProcessSummary: React.FC<Props> = ({ request }) => {
  const { t, translateOption } = useLanguage();

  // Step-based, cumulative visibility rules:
  // - Once a step is reached/completed, it stays visible for all later steps.
  // - Each step renders as a compact, uniform "finished action" tile, with attachments still viewable/downloadable.
  const hasClarificationData = Boolean(
    (request.clarificationComment ?? "").trim() ||
      (request.clarificationResponse ?? "").trim()
  );
  const hasDesignData = Boolean(
    request.expectedDesignReplyDate ||
      (request.acceptanceMessage ?? "").trim() ||
      (request.designResultComments ?? "").trim() ||
      (Array.isArray(request.designResultAttachments) && request.designResultAttachments.length > 0)
  );
  const hasCostingData = Boolean(
    (request.costingNotes ?? "").trim() ||
      typeof request.sellingPrice === "number" ||
      typeof request.calculatedMargin === "number" ||
      (request.incoterm ?? "").trim() ||
      (request.deliveryLeadtime ?? "").trim() ||
      (Array.isArray(request.costingAttachments) && request.costingAttachments.length > 0)
  );
  const hasSalesData = Boolean(
    typeof request.salesFinalPrice === "number" ||
      typeof request.salesMargin === "number" ||
      (request.salesWarrantyPeriod ?? "").trim() ||
      (request.salesExpectedDeliveryDate ?? "").trim() ||
      (Array.isArray(request.salesPaymentTerms) && request.salesPaymentTerms.length > 0) ||
      (request.salesFeedbackComment ?? "").trim() ||
      (Array.isArray(request.salesAttachments) && request.salesAttachments.length > 0)
  );

  const clarificationStatuses: RequestStatus[] = ["clarification_needed"];
  const designStatuses: RequestStatus[] = ["submitted", "under_review", "feasibility_confirmed", "design_result"];
  const costingStatuses: RequestStatus[] = ["in_costing", "costing_complete"];
  const salesStatuses: RequestStatus[] = ["sales_followup", "gm_approval_pending"];
  const gmStatuses: RequestStatus[] = ["gm_approved", "gm_rejected"];

  const clarificationEntry = getLastHistoryEntry(request, clarificationStatuses);
  const designEntry = getLastHistoryEntry(request, designStatuses);
  const costingEntry = getLastHistoryEntry(request, costingStatuses);
  const salesEntry = getLastHistoryEntry(request, salesStatuses);
  const gmEntry = getLastHistoryEntry(request, gmStatuses);
  const gmPendingEntry = getLastHistoryEntry(request, ["gm_approval_pending"]);

  const designComplete = Boolean(
    (designEntry && ["feasibility_confirmed", "design_result"].includes(designEntry.status)) ||
      ["design_result", "in_costing", "costing_complete", "sales_followup", "gm_approval_pending", "gm_approved", "gm_rejected", "cancelled", "closed"].includes(request.status)
  );
  const costingComplete = Boolean(
    (costingEntry && costingEntry.status === "costing_complete") ||
      ["costing_complete", "sales_followup", "gm_approval_pending", "gm_approved", "gm_rejected", "cancelled", "closed"].includes(request.status)
  );
  const salesSubmittedToGm = Boolean(
    (salesEntry && salesEntry.status === "gm_approval_pending") ||
      ["gm_approval_pending", "gm_approved", "gm_rejected", "cancelled", "closed"].includes(request.status)
  );

  const reachedClarification = Boolean(clarificationEntry || hasClarificationData);
  const reachedDesign = request.status !== "draft";
  const reachedCosting = Boolean(
    ["in_costing", "costing_complete", "sales_followup", "gm_approval_pending", "gm_approved", "gm_rejected", "cancelled", "closed"].includes(request.status) ||
      costingEntry ||
      hasCostingData
  );
  const reachedSales = Boolean(
    ["sales_followup", "gm_approval_pending", "gm_approved", "gm_rejected", "cancelled", "closed"].includes(request.status) ||
      salesEntry ||
      hasSalesData
  );
  const reachedGm = Boolean(
    ["gm_approval_pending", "gm_approved", "gm_rejected", "cancelled", "closed"].includes(request.status) ||
      gmEntry
  );

  const showClarification = reachedClarification;
  const showDesign = reachedDesign || hasDesignData;
  const showCosting = reachedCosting;
  const showSales = reachedSales;
  const showGm = reachedGm;

  const designAttachments = Array.isArray(request.designResultAttachments) ? request.designResultAttachments : [];
  const costingAttachments = Array.isArray(request.costingAttachments) ? request.costingAttachments : [];
  const salesAttachments = Array.isArray(request.salesAttachments) ? request.salesAttachments : [];

  const designStatusLabel = useMemo(() => {
    const s = designEntry?.status;
    if (!s) return "";
    return t.statuses[s as keyof typeof t.statuses] || s;
  }, [designEntry?.status, t.statuses]);
  const costingStatusLabel = useMemo(() => {
    const s = costingEntry?.status;
    if (!s) return "";
    return t.statuses[s as keyof typeof t.statuses] || s;
  }, [costingEntry?.status, t.statuses]);
  const salesStatusLabel = useMemo(() => {
    const s = salesEntry?.status;
    if (!s) return "";
    return t.statuses[s as keyof typeof t.statuses] || s;
  }, [salesEntry?.status, t.statuses]);

  const salesEffectiveEntry = gmEntry ?? gmPendingEntry ?? salesEntry;
  const salesEffectiveStatusLabel = useMemo(() => {
    const s = salesEffectiveEntry?.status;
    if (!s) return "";
    return t.statuses[s as keyof typeof t.statuses] || s;
  }, [salesEffectiveEntry?.status, t.statuses]);
  const gmStatusLabel = useMemo(() => {
    const s = gmEntry?.status ?? gmPendingEntry?.status;
    if (!s) return "";
    return t.statuses[s as keyof typeof t.statuses] || s;
  }, [gmEntry?.status, gmPendingEntry?.status, t.statuses]);

  if (!showClarification && !showDesign && !showCosting && !showSales && !showGm) {
    return null;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {showClarification && (
        <Card title={t.panels.clarification} description={t.panels.designTeamNeedsInfo}>
          <StepTile
            title={t.panels.clarificationRequested}
            statusLabel={clarificationEntry ? `${t.common.status}: ${t.statuses[clarificationEntry.status as keyof typeof t.statuses] || clarificationEntry.status}` : undefined}
            updatedAt={clarificationEntry?.timestamp ? formatDateTime(clarificationEntry.timestamp) : undefined}
          >
            <FieldLine
              label={t.panels.clarificationComment}
              value={request.clarificationComment?.trim() ? <div className="whitespace-pre-line text-right">{request.clarificationComment}</div> : "-"}
            />
            <FieldLine
              label={t.panels.clarificationResponse}
              value={request.clarificationResponse?.trim() ? <div className="whitespace-pre-line text-right">{request.clarificationResponse}</div> : "-"}
            />
          </StepTile>
        </Card>
      )}

      {showDesign && (
        <Card title={t.panels.designReview} description={t.panels.designActionDesc}>
          <StepTile
            title={designComplete ? t.panels.designSubmitted : t.panels.designAction}
            statusLabel={designStatusLabel ? `${t.common.status}: ${designStatusLabel}` : undefined}
            updatedAt={designEntry?.timestamp ? formatDateTime(designEntry.timestamp) : undefined}
          >
            <FieldLine
              label={t.panels.expectedReplyDate}
              value={request.expectedDesignReplyDate ? formatDate(request.expectedDesignReplyDate) : "-"}
            />
            <FieldLine
              label={t.panels.acceptanceMessage}
              value={request.acceptanceMessage?.trim() ? <div className="whitespace-pre-line text-right">{request.acceptanceMessage}</div> : "-"}
            />
            <FieldLine
              label={t.panels.designResultComments}
              value={request.designResultComments?.trim() ? <div className="whitespace-pre-line text-right">{request.designResultComments}</div> : "-"}
            />
          </StepTile>
          <div className="mt-4">
            <AttachmentList title={t.panels.designResultUploads} attachments={designAttachments} />
          </div>
        </Card>
      )}

      {showCosting && (
        <Card title={t.panels.costingPanel} description={t.panels.manageCostingProcess}>
          <StepTile
            title={costingComplete ? t.panels.costingCompleted : (costingStatusLabel || t.panels.costingActions)}
            statusLabel={costingStatusLabel ? `${t.common.status}: ${costingStatusLabel}` : undefined}
            updatedAt={costingEntry?.timestamp ? formatDateTime(costingEntry.timestamp) : undefined}
          >
            <FieldLine
              label={t.panels.sellingPrice}
              value={typeof request.sellingPrice === "number" ? `${request.sellingCurrency ?? "EUR"} ${request.sellingPrice.toFixed(2)}` : "-"}
            />
            <FieldLine
              label={t.panels.margin}
              value={typeof request.calculatedMargin === "number" ? `${request.calculatedMargin.toFixed(1)}%` : "-"}
            />
            <FieldLine label={t.panels.incoterm} value={request.incoterm ? translateOption(request.incoterm) : "-"} />
            <FieldLine
              label={t.panels.vatMode}
              value={(() => {
                if (!request.vatMode) return "-";
                if (request.vatMode === "with") {
                  const rate = typeof request.vatRate === "number" ? request.vatRate : null;
                  return rate !== null ? `${t.panels.withVat} (${rate}%)` : t.panels.withVat;
                }
                return t.panels.withoutVat;
              })()}
            />
            <FieldLine label={t.panels.deliveryLeadtime} value={request.deliveryLeadtime?.trim() ? request.deliveryLeadtime : "-"} />
            <FieldLine
              label={t.panels.costingNotesInternal}
              value={request.costingNotes?.trim() ? <div className="whitespace-pre-line text-right">{request.costingNotes}</div> : "-"}
            />
          </StepTile>
          <div className="mt-4">
            <AttachmentList title={t.panels.costingAttachments} attachments={costingAttachments} />
          </div>
        </Card>
      )}

      {showSales && (
        <Card title={t.panels.salesFollowup} description={t.panels.salesFollowupDesc}>
          <StepTile
            title={salesSubmittedToGm ? t.panels.submittedToGm : (salesStatusLabel || t.panels.salesFollowup)}
            statusLabel={salesEffectiveStatusLabel ? `${t.common.status}: ${salesEffectiveStatusLabel}` : undefined}
            updatedAt={salesEffectiveEntry?.timestamp ? formatDateTime(salesEffectiveEntry.timestamp) : undefined}
          >
            <FieldLine
              label={t.panels.salesFinalPrice}
              value={typeof request.salesFinalPrice === "number" ? `${request.salesCurrency ?? "EUR"} ${request.salesFinalPrice.toFixed(2)}` : "-"}
            />
            <FieldLine
              label={t.panels.salesMargin}
              value={typeof request.salesMargin === "number" ? `${request.salesMargin.toFixed(2)}%` : "-"}
            />
            <FieldLine
              label={t.panels.warrantyPeriod}
              value={(request.salesWarrantyPeriod ?? "").trim() || "-"}
            />
            <FieldLine
              label={t.panels.offerValidityPeriod}
              value={(request.salesOfferValidityPeriod ?? "").trim() || "-"}
            />
            <FieldLine
              label={t.panels.salesExpectedDeliveryDate}
              value={String(request.salesExpectedDeliveryDate ?? "").trim() || "-"}
            />
            <FieldLine
              label={t.panels.incoterm}
              value={(() => {
                const inc = String((request as any).salesIncoterm ?? "").trim();
                if (!inc) return "-";
                if (inc.toLowerCase() === "other") {
                  const other = String((request as any).salesIncotermOther ?? "").trim();
                  return other || t.common.other;
                }
                return translateOption(inc);
              })()}
            />
            <FieldLine
              label={t.panels.vatMode}
              value={(() => {
                const mode = String((request as any).salesVatMode ?? "").trim();
                if (!mode) return "-";
                if (mode === "with") {
                  const rate = typeof (request as any).salesVatRate === "number" ? (request as any).salesVatRate : null;
                  return rate !== null ? `${t.panels.withVat} (${rate}%)` : t.panels.withVat;
                }
                return t.panels.withoutVat;
              })()}
            />
            <FieldLine
              label={t.panels.salesFeedback}
              value={request.salesFeedbackComment?.trim() ? <div className="whitespace-pre-line text-right">{request.salesFeedbackComment}</div> : "-"}
            />
            <FieldLine
              label={t.panels.paymentTerms}
              value={(() => {
                const terms = Array.isArray(request.salesPaymentTerms) ? request.salesPaymentTerms : [];
                if (!terms.length) return "-";
                return (
                  <div className="space-y-1 text-right">
                    {terms.map((term, index) => (
                      <div key={`sales-payment-term-${index}`} className="whitespace-pre-line">
                        #{term.paymentNumber || index + 1} {term.paymentName || "-"} |{" "}
                        {typeof term.paymentPercent === "number" ? `${term.paymentPercent}%` : "-"} |{" "}
                        {term.comments || "-"}
                      </div>
                    ))}
                  </div>
                );
              })()}
            />
          </StepTile>
          <div className="mt-4">
            <AttachmentList title={t.panels.salesAttachments} attachments={salesAttachments} />
          </div>
        </Card>
      )}

      {showGm && (
        <Card title={t.panels.gmApproval} description={t.panels.gmApprovalDesc}>
          {(() => {
            const entry = gmEntry ?? gmPendingEntry;
            const statusKey = entry?.status ?? "gm_approval_pending";
            const statusText = t.statuses[statusKey as keyof typeof t.statuses] || statusKey;
            return (
          <StepTile
            title={statusText}
            statusLabel={gmStatusLabel ? `${t.common.status}: ${gmStatusLabel}` : undefined}
            updatedAt={entry?.timestamp ? formatDateTime(entry.timestamp) : undefined}
          >
            <FieldLine label={t.request.changedBy} value={entry?.userName ? entry.userName : "-"} />
            <FieldLine
              label={t.request.comment}
              value={entry?.comment?.trim() ? <div className="whitespace-pre-line text-right">{entry.comment}</div> : "-"}
            />
          </StepTile>
            );
          })()}
        </Card>
      )}
    </div>
  );
};

export default RequestProcessSummary;
