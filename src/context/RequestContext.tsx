import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CustomerRequest, RequestProduct, RequestStatus } from '@/types';
import { useAuth } from './AuthContext';

type RequestUpdatePayload = Partial<CustomerRequest> & {
  historyEvent?: 'edited';
};

interface RequestContextType {
  requests: CustomerRequest[];
  isLoading: boolean;
  getRequestById: (id: string) => CustomerRequest | undefined;
  createRequest: (request: Omit<CustomerRequest, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'createdBy' | 'createdByName'>) => Promise<CustomerRequest>;
  updateRequest: (id: string, updates: RequestUpdatePayload) => Promise<void>;
  updateStatus: (id: string, status: RequestStatus, comment?: string) => Promise<void>;
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
  suspension: p?.suspension ?? '',
  productComments: typeof p?.productComments === 'string' ? p.productComments : p?.otherRequirements ?? '',
  attachments: Array.isArray(p?.attachments) ? p.attachments.map(reviveAttachment) : [],
});

const reviveRequest = (r: any): CustomerRequest => {
  const attachments = Array.isArray(r?.attachments) ? r.attachments.map(reviveAttachment) : [];
  const rawProducts = Array.isArray(r?.products) ? r.products : [];
  const normalizedProducts = rawProducts.length
    ? rawProducts.map(reviveProduct)
    : [buildLegacyProduct(r, attachments)];

  if (normalizedProducts.length === 1 && normalizedProducts[0].attachments.length === 0 && attachments.length) {
    normalizedProducts[0] = { ...normalizedProducts[0], attachments };
  }

  return {
    ...r,
    products: normalizedProducts,
    createdAt: r?.createdAt ? new Date(r.createdAt) : new Date(),
    updatedAt: r?.updatedAt ? new Date(r.updatedAt) : new Date(),
    expectedDesignReplyDate: r?.expectedDesignReplyDate ? new Date(r.expectedDesignReplyDate) : undefined,
    expectedDeliverySelections: Array.isArray(r?.expectedDeliverySelections) ? r.expectedDeliverySelections : [],
    attachments,
    designResultComments: r?.designResultComments ?? '',
    designResultAttachments: Array.isArray(r?.designResultAttachments)
      ? r.designResultAttachments.map(reviveAttachment)
      : [],
    incoterm: r?.incoterm ?? '',
    incotermOther: r?.incotermOther ?? '',
    vatMode: r?.vatMode ?? 'without',
    vatRate: typeof r?.vatRate === 'number' ? r.vatRate : null,
    costingAttachments: Array.isArray(r?.costingAttachments)
      ? r.costingAttachments.map(reviveAttachment)
      : [],
    history: Array.isArray(r?.history)
      ? r.history.map((h: any) => ({
          ...h,
          timestamp: h?.timestamp ? new Date(h.timestamp) : new Date(),
        }))
      : [],
  };
};

const fetchJson = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, init);
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
};

export const RequestProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchJson<CustomerRequest[]>(API_BASE);
      setRequests(data.map(reviveRequest));
    } catch (e) {
      console.error('Failed to load requests:', e);
      setRequests([]);
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

    const revived = reviveRequest(created);
    setRequests(prev => [...prev, revived]);
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

    const revived = reviveRequest(updated);
    setRequests(prev => prev.map(r => (r.id === id ? revived : r)));
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

    const revived = reviveRequest(updated);
    setRequests(prev => prev.map(r => (r.id === id ? revived : r)));
  }, [user]);

  const deleteRequest = useCallback(async (id: string) => {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    setRequests(prev => prev.filter(r => r.id !== id));
  }, []);

  return (
    <RequestContext.Provider value={{
      requests,
      isLoading,
      getRequestById,
      createRequest,
      updateRequest,
      updateStatus,
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
