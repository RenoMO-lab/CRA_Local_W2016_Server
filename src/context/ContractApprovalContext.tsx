import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Attachment, ContractApproval, ContractApprovalStatus } from '@/types';
import { useAuth } from './AuthContext';

type ContractUpdatePayload = Partial<ContractApproval>;

interface ContractApprovalContextType {
  contracts: ContractApproval[];
  isLoading: boolean;
  refreshContracts: () => Promise<void>;
  getContractById: (id: string) => ContractApproval | undefined;
  getContractByIdAsync: (id: string) => Promise<ContractApproval | undefined>;
  createContract: (payload: ContractUpdatePayload) => Promise<ContractApproval>;
  updateContract: (id: string, payload: ContractUpdatePayload) => Promise<ContractApproval>;
  updateStatus: (id: string, status: ContractApprovalStatus, comment?: string) => Promise<ContractApproval>;
}

const ContractApprovalContext = createContext<ContractApprovalContextType | undefined>(undefined);

const API_BASE = '/api/contracts';

const reviveAttachment = (a: any): Attachment => ({
  ...a,
  uploadedAt: a?.uploadedAt ? new Date(a.uploadedAt) : new Date(),
});

const reviveContract = (raw: any): ContractApproval => ({
  id: String(raw?.id ?? '').trim(),
  status: String(raw?.status ?? 'draft') as ContractApprovalStatus,
  clientName: String(raw?.clientName ?? ''),
  craNumber: String(raw?.craNumber ?? ''),
  craRequestId: raw?.craRequestId ? String(raw.craRequestId) : null,
  contractAmount: typeof raw?.contractAmount === 'number' ? raw.contractAmount : null,
  paymentTerms: String(raw?.paymentTerms ?? ''),
  validity: String(raw?.validity ?? ''),
  approvedFinalUnitPrice: typeof raw?.approvedFinalUnitPrice === 'number' ? raw.approvedFinalUnitPrice : null,
  approvedCurrency: raw?.approvedCurrency === 'USD' || raw?.approvedCurrency === 'EUR' || raw?.approvedCurrency === 'RMB'
    ? raw.approvedCurrency
    : '',
  approvedGrossMargin: typeof raw?.approvedGrossMargin === 'number' ? raw.approvedGrossMargin : null,
  approvedVatMode: raw?.approvedVatMode === 'with' || raw?.approvedVatMode === 'without' ? raw.approvedVatMode : '',
  approvedVatRate: typeof raw?.approvedVatRate === 'number' ? raw.approvedVatRate : null,
  approvedIncoterm: String(raw?.approvedIncoterm ?? ''),
  approvedExpectedDeliveryDate: String(raw?.approvedExpectedDeliveryDate ?? ''),
  approvedWarrantyPeriod: String(raw?.approvedWarrantyPeriod ?? ''),
  comments: String(raw?.comments ?? ''),
  salesOwnerUserId: String(raw?.salesOwnerUserId ?? ''),
  salesOwnerName: String(raw?.salesOwnerName ?? ''),
  draftContractAttachments: Array.isArray(raw?.draftContractAttachments)
    ? raw.draftContractAttachments.map(reviveAttachment)
    : [],
  stampedContractAttachments: Array.isArray(raw?.stampedContractAttachments)
    ? raw.stampedContractAttachments.map(reviveAttachment)
    : [],
  history: Array.isArray(raw?.history)
    ? raw.history.map((entry: any) => ({
        id: String(entry?.id ?? ''),
        status: String(entry?.status ?? 'draft') as ContractApprovalStatus,
        timestamp: entry?.timestamp ? new Date(entry.timestamp) : new Date(),
        userId: String(entry?.userId ?? ''),
        userName: String(entry?.userName ?? ''),
        comment: entry?.comment ? String(entry.comment) : undefined,
      }))
    : [],
  submittedAt: raw?.submittedAt ? new Date(raw.submittedAt) : null,
  gmDecisionAt: raw?.gmDecisionAt ? new Date(raw.gmDecisionAt) : null,
  completedAt: raw?.completedAt ? new Date(raw.completedAt) : null,
  createdAt: raw?.createdAt ? new Date(raw.createdAt) : new Date(),
  updatedAt: raw?.updatedAt ? new Date(raw.updatedAt) : new Date(),
  nextActionRole: raw?.nextActionRole ? String(raw.nextActionRole) : undefined,
  nextActionLabel: raw?.nextActionLabel ? String(raw.nextActionLabel) : undefined,
});

const fetchJson = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, init);
  if (!res.ok) {
    let detail = '';
    try {
      const payload = await res.json();
      detail = String(payload?.error ?? payload?.message ?? '').trim();
    } catch {
      detail = '';
    }
    throw new Error(`Request failed with status ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
};

type StoredContract = ContractApproval & { __full?: boolean };
const isFullContract = (item: StoredContract | undefined): item is StoredContract => Boolean(item?.__full);
const markFull = (item: ContractApproval): StoredContract => ({ ...(item as any), __full: true });

export const ContractApprovalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<StoredContract[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshContracts = useCallback(async () => {
    if (!user) {
      setContracts([]);
      return;
    }
    if (user.role !== 'sales' && user.role !== 'admin' && user.role !== 'finance') {
      setContracts([]);
      return;
    }
    setIsLoading(true);
    try {
      const rows = await fetchJson<any[]>(`${API_BASE}/summary`);
      const normalized = rows.map((row) => ({ ...(reviveContract(row) as any), __full: false })) as StoredContract[];
      const ids = new Set(normalized.map((row) => row.id));
      setContracts((prev) => {
        const byId = new Map(prev.map((row) => [row.id, row]));
        const merged = normalized.map((row) => {
          const existing = byId.get(row.id);
          if (existing && isFullContract(existing)) {
            return {
              ...existing,
              status: row.status,
              clientName: row.clientName,
              craNumber: row.craNumber,
              contractAmount: row.contractAmount,
              salesOwnerName: row.salesOwnerName,
              nextActionRole: row.nextActionRole,
              nextActionLabel: row.nextActionLabel,
              updatedAt: row.updatedAt,
              submittedAt: row.submittedAt,
            };
          }
          return row;
        });
        const extras = prev.filter((row) => isFullContract(row) && !ids.has(row.id));
        return extras.length ? [...merged, ...extras] : merged;
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshContracts();
  }, [refreshContracts]);

  const getContractById = useCallback((id: string) => contracts.find((row) => row.id === id), [contracts]);

  const getContractByIdAsync = useCallback(
    async (id: string) => {
      const existing = contracts.find((row) => row.id === id);
      if (existing && isFullContract(existing)) return existing;
      try {
        const full = await fetchJson<any>(`${API_BASE}/${encodeURIComponent(id)}`);
        const normalized = markFull(reviveContract(full));
        setContracts((prev) => (prev.some((row) => row.id === id) ? prev.map((row) => (row.id === id ? normalized : row)) : [...prev, normalized]));
        return normalized;
      } catch {
        return undefined;
      }
    },
    [contracts]
  );

  const createContract = useCallback(async (payload: ContractUpdatePayload) => {
    const created = await fetchJson<any>(API_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const normalized = markFull(reviveContract(created));
    setContracts((prev) => (prev.some((row) => row.id === normalized.id) ? prev.map((row) => (row.id === normalized.id ? normalized : row)) : [normalized, ...prev]));
    return normalized;
  }, []);

  const updateContract = useCallback(async (id: string, payload: ContractUpdatePayload) => {
    const updated = await fetchJson<any>(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const normalized = markFull(reviveContract(updated));
    setContracts((prev) => prev.map((row) => (row.id === id ? normalized : row)));
    return normalized;
  }, []);

  const updateStatus = useCallback(async (id: string, status: ContractApprovalStatus, comment?: string) => {
    const updated = await fetchJson<any>(`${API_BASE}/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, comment }),
    });
    const normalized = markFull(reviveContract(updated));
    setContracts((prev) => prev.map((row) => (row.id === id ? normalized : row)));
    return normalized;
  }, []);

  return (
    <ContractApprovalContext.Provider
      value={{
        contracts,
        isLoading,
        refreshContracts,
        getContractById,
        getContractByIdAsync,
        createContract,
        updateContract,
        updateStatus,
      }}
    >
      {children}
    </ContractApprovalContext.Provider>
  );
};

export const useContractApprovals = () => {
  const context = useContext(ContractApprovalContext);
  if (!context) throw new Error('useContractApprovals must be used within ContractApprovalProvider');
  return context;
};
