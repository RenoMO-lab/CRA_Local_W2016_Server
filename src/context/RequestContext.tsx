import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CustomerRequest, RequestProduct, RequestStatus, SalesPaymentTerm } from '@/types';
import { useAuth } from './AuthContext';

type RequestUpdatePayload = Partial<CustomerRequest> & {
  historyEvent?: 'edited';
};

type RequestNotifyPayload = {
  eventType?: 'request_created' | 'request_status_changed';
  status?: RequestStatus;
  comment?: string;
};

interface RequestContextType {
  requests: CustomerRequest[];
  isLoading: boolean;
  lastSyncAt: Date | null;
  syncState: 'idle' | 'refreshing' | 'error';
  syncError: string | null;
  refreshRequests: () => Promise<void>;
  getRequestById: (id: string) => CustomerRequest | undefined;
  getRequestByIdAsync: (id: string) => Promise<CustomerRequest | undefined>;
  createRequest: (request: Omit<CustomerRequest, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'createdBy' | 'createdByName'>) => Promise<CustomerRequest>;
  updateRequest: (id: string, updates: RequestUpdatePayload) => Promise<void>;
  updateStatus: (id: string, status: RequestStatus, comment?: string) => Promise<void>;
  notifyRequest: (id: string, payload?: RequestNotifyPayload) => Promise<{ enqueued: boolean; reason?: string }>;
  deleteRequest: (id: string) => Promise<void>;
}

const RequestContext = createContext<RequestContextType | undefined>(undefined);

const API_BASE = '/api/requests';

const reviveAttachment = (a: any) => ({
  ...a,
  uploadedAt: a?.uploadedAt ? new Date(a.uploadedAt) : new Date(),
});

const buildLegacyProduct = (r: any, attachments: any[]): RequestProduct => ({
  axleLocation: r?.axleLocation ?? '',
  axleLocationOther: r?.axleLocationOther ?? '',
  articulationType: r?.articulationType ?? '',
  articulationTypeOther: r?.articulationTypeOther ?? '',
  configurationType: r?.configurationType ?? '',
  configurationTypeOther: r?.configurationTypeOther ?? '',
  quantity: typeof r?.expectedQty === 'number' ? r.expectedQty : null,
  loadsKg: r?.loadsKg ?? null,
  speedsKmh: r?.speedsKmh ?? null,
  tyreSize: r?.tyreSize ?? '',
  trackMm: r?.trackMm ?? null,
  studsPcdMode: r?.studsPcdMode ?? 'standard',
  studsPcdStandardSelections: Array.isArray(r?.studsPcdStandardSelections) ? r.studsPcdStandardSelections : [],
  studsPcdSpecialText: r?.studsPcdSpecialText ?? '',
  wheelBase: r?.wheelBase ?? '',
  finish: r?.finish ?? 'Black Primer default',
  brakeType: r?.brakeType ?? null,
  brakeSize: r?.brakeSize ?? '',
  brakePowerType: r?.brakePowerType ?? '',
  brakeCertificate: r?.brakeCertificate ?? '',
  mainBodySectionType: r?.mainBodySectionType ?? '',
  clientSealingRequest: r?.clientSealingRequest ?? '',
  cupLogo: r?.cupLogo ?? '',
  suspension: r?.suspension ?? '',
  productComments: typeof r?.productComments === 'string' ? r.productComments : r?.otherRequirements ?? '',
  attachments,
});

const reviveProduct = (p: any): RequestProduct => ({
  axleLocation: p?.axleLocation ?? '',
  axleLocationOther: p?.axleLocationOther ?? '',
  articulationType: p?.articulationType ?? '',
  articulationTypeOther: p?.articulationTypeOther ?? '',
  configurationType: p?.configurationType ?? '',
  configurationTypeOther: p?.configurationTypeOther ?? '',
  quantity: typeof p?.quantity === 'number' ? p.quantity : null,
  loadsKg: p?.loadsKg ?? null,
  speedsKmh: p?.speedsKmh ?? null,
  tyreSize: p?.tyreSize ?? '',
  trackMm: p?.trackMm ?? null,
  studsPcdMode: p?.studsPcdMode ?? 'standard',
  studsPcdStandardSelections: Array.isArray(p?.studsPcdStandardSelections) ? p.studsPcdStandardSelections : [],
  studsPcdSpecialText: p?.studsPcdSpecialText ?? '',
  wheelBase: p?.wheelBase ?? '',
  finish: p?.finish ?? 'Black Primer default',
  brakeType: p?.brakeType ?? null,
  brakeSize: p?.brakeSize ?? '',
  brakePowerType: p?.brakePowerType ?? '',
  brakeCertificate: p?.brakeCertificate ?? '',
  mainBodySectionType: p?.mainBodySectionType ?? '',
  clientSealingRequest: p?.clientSealingRequest ?? '',
  cupLogo: p?.cupLogo ?? '',
  suspension: p?.suspension ?? '',
  productComments: typeof p?.productComments === 'string' ? p.productComments : p?.otherRequirements ?? '',
  attachments: Array.isArray(p?.attachments) ? p.attachments.map(reviveAttachment) : [],
});

const reviveSalesPaymentTerms = (rawTerms: any, rawCount: any): { count: number; terms: SalesPaymentTerm[] } => {
  const source = Array.isArray(rawTerms) ? rawTerms : [];
  const parsedCount = Number.parseInt(String(rawCount ?? ''), 10);
  const baseCount = Number.isFinite(parsedCount) ? parsedCount : source.length || 1;
  const count = Math.min(6, Math.max(1, baseCount));
  const terms = Array.from({ length: count }, (_v, index) => {
    const raw = source[index] ?? {};
    return {
      paymentNumber: index + 1,
      paymentName: typeof raw?.paymentName === 'string' ? raw.paymentName : '',
      paymentPercent: typeof raw?.paymentPercent === 'number' ? raw.paymentPercent : null,
      comments: typeof raw?.comments === 'string' ? raw.comments : '',
    };
  });
  return { count, terms };
};

const reviveRequest = (r: any): CustomerRequest => {
  const attachments = Array.isArray(r?.attachments) ? r.attachments.map(reviveAttachment) : [];
  const rawProducts = Array.isArray(r?.products) ? r.products : [];
  const normalizedProducts = rawProducts.length
    ? rawProducts.map(reviveProduct)
    : [buildLegacyProduct(r, attachments)];

  if (normalizedProducts.length === 1 && normalizedProducts[0].attachments.length === 0 && attachments.length) {
    normalizedProducts[0] = { ...normalizedProducts[0], attachments };
  }
  const revivedPaymentTerms = reviveSalesPaymentTerms(r?.salesPaymentTerms, r?.salesPaymentTermCount);

  return {
    ...r,
    priority:
      r?.priority === 'low' || r?.priority === 'normal' || r?.priority === 'high' || r?.priority === 'urgent'
        ? r.priority
        : 'normal',
    products: normalizedProducts,
    createdAt: r?.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r?.updatedAt ? new Date(r.updatedAt) : new Date(),
    expectedDesignReplyDate: r?.expectedDesignReplyDate ? new Date(r.expectedDesignReplyDate) : undefined,
    expectedDeliverySelections: Array.isArray(r?.expectedDeliverySelections) ? r.expectedDeliverySelections : [],
    clientExpectedDeliveryDate: r?.clientExpectedDeliveryDate ?? '',
    attachments,
    designResultComments: r?.designResultComments ?? '',
    designResultAttachments: Array.isArray(r?.designResultAttachments)
      ? r.designResultAttachments.map(reviveAttachment)
      : [],
    incoterm: r?.incoterm ?? '',
    incotermOther: r?.incotermOther ?? '',
    vatMode: r?.vatMode ?? 'without',
    vatRate: typeof r?.vatRate === 'number' ? r.vatRate : null,
    deliveryLeadtime: r?.deliveryLeadtime ?? '',
    sellingCurrency: r?.sellingCurrency ?? 'EUR',
    costingAttachments: Array.isArray(r?.costingAttachments)
      ? r.costingAttachments.map(reviveAttachment)
      : [],
    salesFinalPrice: typeof r?.salesFinalPrice === 'number' ? r.salesFinalPrice : null,
    salesCurrency: r?.salesCurrency ?? 'EUR',
    salesIncoterm: r?.salesIncoterm ?? '',
    salesIncotermOther: r?.salesIncotermOther ?? '',
    salesVatMode: r?.salesVatMode === 'with' ? 'with' : 'without',
    salesVatRate: typeof r?.salesVatRate === 'number' ? r.salesVatRate : null,
    salesMargin: typeof r?.salesMargin === 'number' ? r.salesMargin : null,
    salesWarrantyPeriod: r?.salesWarrantyPeriod ?? '',
    salesOfferValidityPeriod: r?.salesOfferValidityPeriod ?? '',
    salesExpectedDeliveryDate: r?.salesExpectedDeliveryDate ?? '',
    salesPaymentTermCount: revivedPaymentTerms.count,
    salesPaymentTerms: revivedPaymentTerms.terms,
    salesFeedbackComment: r?.salesFeedbackComment ?? '',
    salesAttachments: Array.isArray(r?.salesAttachments)
      ? r.salesAttachments.map(reviveAttachment)
      : [],
    history: Array.isArray(r?.history)
      ? r.history.map((h: any) => ({
          ...h,
          timestamp: h?.timestamp ? new Date(h.timestamp) : new Date(),
        }))
      : [],
  };
};

type StoredRequest = CustomerRequest & { __full?: boolean };
const isFullRequest = (r: any): r is StoredRequest => !!r?.__full;
const markFullRequest = (r: CustomerRequest): StoredRequest => ({ ...(r as any), __full: true });

const fetchJson = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, init);
  if (!res.ok) {
    let detail = "";
    try {
      const ct = String(res.headers.get("content-type") || "");
      if (ct.includes("application/json")) {
        const data: any = await res.json();
        detail = String(data?.error || data?.message || "").trim();
      } else {
        detail = String(await res.text()).trim();
      }
    } catch {}

    throw new Error(`Request failed with status ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json() as Promise<T>;
};

export const RequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<StoredRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'refreshing' | 'error'>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);

  const refreshRequests = useCallback(async () => {
    setIsLoading(true);
    setSyncState('refreshing');
    setSyncError(null);
    try {
      // Use a lightweight endpoint for dashboard polling; fetch full request only on-demand.
      const data = await fetchJson<CustomerRequest[]>(`${API_BASE}/summary`);
      const summaries = data.map((r) => ({ ...(reviveRequest(r) as any), __full: false } as StoredRequest));
      const summaryIds = new Set(summaries.map((s) => s.id));

      setRequests((prev) => {
        const prevById = new Map(prev.map((r) => [r.id, r]));
        const merged = summaries.map((s) => {
          const existing = prevById.get(s.id);
          if (existing && isFullRequest(existing)) {
            // Keep the fully-loaded request details, but refresh key fields from the summary.
            return {
              ...existing,
              status: s.status,
              updatedAt: s.updatedAt,
              clientName: s.clientName,
              applicationVehicle: s.applicationVehicle,
              country: s.country,
              createdBy: s.createdBy,
              createdByName: s.createdByName,
            };
          }
          return s;
        });

        // Keep any full requests that aren't in the summary (rare, but avoids dropping local state).
        const extras = prev.filter((r) => isFullRequest(r) && !summaryIds.has(r.id));
        return extras.length ? [...merged, ...extras] : merged;
      });
      setLastSyncAt(new Date());
      setSyncState('idle');
    } catch (e) {
      console.error('Failed to load requests:', e);
      setRequests([]);
      setSyncError(String((e as any)?.message ?? e));
      setSyncState('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let intervalId: number | undefined;

    const startPolling = () => {
      if (intervalId) return;
      refreshRequests();
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          refreshRequests();
        }
      }, 30_000);
    };

    const stopPolling = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", startPolling);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", startPolling);
    };
  }, [refreshRequests]);

  const getRequestById = useCallback((id: string) => {
    return requests.find(r => r.id === id);
  }, [requests]);

  const getRequestByIdAsync = useCallback(async (id: string) => {
    const existing = requests.find(r => r.id === id);
    if (existing && isFullRequest(existing)) {
      return existing;
    }
    try {
      const full = await fetchJson<CustomerRequest>(`${API_BASE}/${id}`);
      const revived = markFullRequest(reviveRequest(full));
      setRequests(prev => (prev.some(r => r.id === id) ? prev.map(r => (r.id === id ? revived : r)) : [...prev, revived]));
      return revived;
    } catch (e) {
      console.error('Failed to load request by id:', e);
      return undefined;
    }
  }, [requests]);

  const createRequest = useCallback(async (requestData: Omit<CustomerRequest, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'createdBy' | 'createdByName'>) => {
    const payload = {
      ...requestData,
      createdBy: user?.id || '',
      createdByName: user?.name || '',
    };

    const created = await fetchJson<CustomerRequest>(API_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const revived = markFullRequest(reviveRequest(created));
    setRequests(prev => [...prev, revived]);
    setLastSyncAt(new Date());
    setSyncError(null);
    setSyncState('idle');
    return revived;
  }, [user]);

  const updateRequest = useCallback(async (id: string, updates: RequestUpdatePayload) => {
    const payload = {
      ...updates,
      editedBy: user?.id || '',
      editedByName: user?.name || '',
    };
    const updated = await fetchJson<CustomerRequest>(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const revived = markFullRequest(reviveRequest(updated));
    setRequests(prev => prev.map(r => (r.id === id ? revived : r)));
    setLastSyncAt(new Date());
    setSyncError(null);
    setSyncState('idle');
  }, [user]);

  const updateStatus = useCallback(async (id: string, status: RequestStatus, comment?: string) => {
    const updated = await fetchJson<CustomerRequest>(`${API_BASE}/${id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status,
        comment,
        userId: user?.id || '',
        userName: user?.name || '',
      }),
    });

    const revived = markFullRequest(reviveRequest(updated));
    setRequests(prev => prev.map(r => (r.id === id ? revived : r)));
    setLastSyncAt(new Date());
    setSyncError(null);
    setSyncState('idle');
  }, [user]);

  const notifyRequest = useCallback(async (id: string, payload?: RequestNotifyPayload) => {
    const result = await fetchJson<{ enqueued: boolean; reason?: string }>(`${API_BASE}/${id}/notify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(payload ?? {}),
        actorName: user?.name || '',
      }),
    });
    return result;
  }, [user]);

  const deleteRequest = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    setRequests(prev => prev.filter(r => r.id !== id));
    setLastSyncAt(new Date());
    setSyncError(null);
    setSyncState('idle');
  }, []);

  return (
    <RequestContext.Provider value={{
      requests,
      isLoading,
      lastSyncAt,
      syncState,
      syncError,
      refreshRequests,
      getRequestById,
      getRequestByIdAsync,
      createRequest,
      updateRequest,
      updateStatus,
      notifyRequest,
      deleteRequest,
    }}>
      {children}
    </RequestContext.Provider>
  );
};

export const useRequests = () => {
  const context = useContext(RequestContext);
  if (context === undefined) {
    throw new Error('useRequests must be used within a RequestProvider');
  }
  return context;
};
