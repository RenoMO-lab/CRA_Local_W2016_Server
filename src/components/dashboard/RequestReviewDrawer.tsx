import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ExternalLink, Pencil, RefreshCw } from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { useRequests } from "@/context/RequestContext";
import {
  AXLE_LOCATIONS,
  ARTICULATION_TYPES,
  CONFIGURATION_TYPES,
  CustomerRequest,
  RequestProduct,
  RequestStatus,
  STATUS_CONFIG,
  UserRole,
} from "@/types";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  userRole: UserRole;
};

const MIN_SPINNER_MS = 600;
const sleepMs = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const ensureMinSpinnerMs = async (startedAtMs: number, minMs = MIN_SPINNER_MS) => {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < minMs) await sleepMs(minMs - elapsed);
};

const getPrimaryProduct = (request: CustomerRequest): Partial<RequestProduct> => {
  if (request.products && request.products.length) {
    return request.products[0];
  }
  return {
    axleLocation: request.axleLocation,
    axleLocationOther: request.axleLocationOther,
    articulationType: request.articulationType,
    articulationTypeOther: request.articulationTypeOther,
    configurationType: request.configurationType,
    configurationTypeOther: request.configurationTypeOther,
  };
};

const RequestReviewDrawer: React.FC<Props> = ({ open, onOpenChange, requestId, userRole }) => {
  const navigate = useNavigate();
  const { t, translateOption } = useLanguage();
  const { getRequestById, getRequestByIdAsync } = useRequests();

  const [request, setRequest] = useState<CustomerRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const latestRequestIdRef = useRef<string | null>(null);

  const canEditRoute = userRole === "admin";

  const load = async (id: string) => {
    latestRequestIdRef.current = id;
    const startedAt = Date.now();
    setIsLoading(true);
    setLoadError(null);
    try {
      const full = await getRequestByIdAsync(id);
      if (latestRequestIdRef.current !== id) return;
      setRequest(full ?? null);
      if (!full) setLoadError(t.dashboard.reviewLoadFailed);
    } catch (e) {
      console.error("Failed to load request for review drawer:", e);
      if (latestRequestIdRef.current !== id) return;
      setLoadError(t.dashboard.reviewLoadFailed);
    } finally {
      if (latestRequestIdRef.current !== id) return;
      await ensureMinSpinnerMs(startedAt);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !requestId) return;
    const existing = getRequestById(requestId);
    setRequest(existing ?? null);
    void load(requestId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestId]);

  // Reset state when closing so the next open feels crisp.
  useEffect(() => {
    if (open) return;
    setRequest(null);
    setIsLoading(false);
    setLoadError(null);
    latestRequestIdRef.current = null;
  }, [open]);

  const productTypeLabel = useMemo(() => {
    if (!request) return "-";
    const product = getPrimaryProduct(request);
    const parts: string[] = [];
    const excludedValues = ["n/a", "na", "-", ""];

    const addPart = (value: string | undefined) => {
      if (value && !excludedValues.includes(value.toLowerCase().trim())) {
        parts.push(translateOption(value));
      }
    };

    // Axle Location
    if ((product as any).axleLocation) {
      const axleLocation = String((product as any).axleLocation);
      if (axleLocation === "other" && (product as any).axleLocationOther) {
        addPart(String((product as any).axleLocationOther));
      } else {
        const found = AXLE_LOCATIONS.find((p) => p.value === axleLocation);
        addPart(found ? found.label : axleLocation);
      }
    }

    // Articulation Type
    if ((product as any).articulationType) {
      const articulationType = String((product as any).articulationType);
      if (articulationType === "other" && (product as any).articulationTypeOther) {
        addPart(String((product as any).articulationTypeOther));
      } else {
        const found = ARTICULATION_TYPES.find((p) => p.value === articulationType);
        addPart(found ? found.label : articulationType);
      }
    }

    // Configuration Type
    if ((product as any).configurationType) {
      const configurationType = String((product as any).configurationType);
      if (configurationType === "other" && (product as any).configurationTypeOther) {
        addPart(String((product as any).configurationTypeOther));
      } else {
        const found = CONFIGURATION_TYPES.find((p) => p.value === configurationType);
        addPart(found ? found.label : configurationType);
      }
    }
    return parts.length ? parts.join(" / ") : "-";
  }, [request, translateOption]);

  const sortedHistory = useMemo(() => {
    if (!request?.history?.length) return [];
    return [...request.history].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  }, [request]);

  const headerSubtitle = useMemo(() => {
    if (!request) return "";
    const client = request.clientName?.trim() ? request.clientName : "-";
    const country = request.country?.trim() ? translateOption(request.country) : "-";
    return `${client} • ${country}`;
  }, [request, translateOption]);

  const formatDateTime = (d: Date | string | undefined) => {
    if (!d) return "-";
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(+date)) return "-";
    return format(date, "yyyy-MM-dd HH:mm");
  };

  const formatDate = (d: Date | string | undefined) => {
    if (!d) return "-";
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(+date)) return "-";
    return format(date, "MMM d, yyyy");
  };

  const statusLabel = (status: RequestStatus | undefined) => {
    if (!status) return "-";
    return t.statuses[status] || status;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto scrollbar-thin">
        <SheetHeader className="pr-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="flex items-baseline gap-3 min-w-0">
                <span className="truncate">{requestId || t.common.loading}</span>
                {request?.status ? (
                  <span className="shrink-0">
                    <StatusBadge status={request.status} />
                  </span>
                ) : null}
              </SheetTitle>
              <SheetDescription className="mt-1">{headerSubtitle}</SheetDescription>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs text-muted-foreground">{t.dashboard.reviewUpdatedLabel}</div>
              <div className="text-sm font-medium text-foreground">
                {request?.updatedAt ? formatDateTime(request.updatedAt) : "-"}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => requestId && navigate(`/requests/${requestId}`)}
              disabled={!requestId}
              className="min-w-40"
            >
              <ExternalLink size={16} className="mr-2" />
              {t.dashboard.reviewOpenRequest}
            </Button>
            {canEditRoute && (
              <Button
                variant="outline"
                onClick={() => requestId && navigate(`/requests/${requestId}/edit`)}
                disabled={!requestId}
              >
                <Pencil size={16} className="mr-2" />
                {t.table.edit}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => requestId && load(requestId)}
              disabled={!requestId || isLoading}
              className="text-muted-foreground"
            >
              <span className={cn("mr-2 inline-flex", isLoading ? "animate-spin" : "")}>
                <RefreshCw size={16} />
              </span>
              {t.common.update}
            </Button>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">{t.dashboard.reviewDetailsTitle}</div>
              {loadError ? <div className="text-xs text-destructive">{loadError}</div> : null}
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.table.clientName}</div>
                  <div className="text-sm font-medium text-right text-foreground">{request?.clientName || "-"}</div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.table.application}</div>
                  <div className="text-sm font-medium text-right text-foreground">
                    {request?.applicationVehicle ? translateOption(request.applicationVehicle) : "-"}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.table.country}</div>
                  <div className="text-sm font-medium text-right text-foreground">
                    {request?.country ? translateOption(request.country) : "-"}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.table.productType}</div>
                  <div className="text-sm font-medium text-right text-foreground">{productTypeLabel}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.table.createdBy}</div>
                  <div className="text-sm font-medium text-right text-foreground">{request?.createdByName || "-"}</div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.table.created}</div>
                  <div className="text-sm font-medium text-right text-foreground">
                    {request?.createdAt ? formatDate(request.createdAt) : "-"}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.request.expectedQty}</div>
                  <div className="text-sm font-medium text-right text-foreground">
                    {request?.expectedQty ?? "-"}
                  </div>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">{t.request.clientExpectedDeliveryDate}</div>
                  <div className="text-sm font-medium text-right text-foreground">
                    {request?.clientExpectedDeliveryDate?.trim() ? request.clientExpectedDeliveryDate : "-"}
                  </div>
                </div>
              </div>
            </div>

            {isLoading && !request ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">{t.dashboard.reviewActivityTitle}</div>
            <div className="mt-3">
              {!request && isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
              ) : sortedHistory.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t.dashboard.reviewNoActivity}</div>
              ) : (
                <div className="space-y-3">
                  {sortedHistory.slice(0, 8).map((h) => {
                    const cfg = STATUS_CONFIG[h.status] || { color: "text-foreground", bgColor: "bg-muted" };
                    return (
                      <div key={h.id} className="flex items-start gap-3">
                        <div className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", cfg.bgColor)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <div className="text-sm font-semibold text-foreground">
                              {statusLabel(h.status)}
                              <span className="text-xs font-normal text-muted-foreground">{" "}•{" "}{h.userName || "-"}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDateTime(h.timestamp)}</div>
                          </div>
                          {h.comment?.trim() ? (
                            <div className={cn("mt-1 rounded-md px-3 py-2 text-sm", "bg-muted/40 text-foreground")}>
                              {h.comment}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RequestReviewDrawer;
