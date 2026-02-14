import React, { createContext, useContext, useState, useEffect } from 'react';

const MIN_SPINNER_MS = 600;
const sleepMs = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const ensureMinSpinnerMs = async (startedAtMs: number, minMs = MIN_SPINNER_MS) => {
  const elapsed = Date.now() - startedAtMs;
  if (elapsed < minMs) await sleepMs(minMs - elapsed);
};

interface ListItem {
  id: string;
  value: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'sales' | 'design' | 'costing' | 'admin';
  createdAt?: string | null;
}

interface UserCreateInput {
  name: string;
  email: string;
  role: UserItem['role'];
  password: string;
}

interface UserUpdateInput {
  name: string;
  email: string;
  role: UserItem['role'];
  newPassword?: string;
}

interface AdminSettingsContextType {
  // Lists
  applicationVehicles: ListItem[];
  countries: ListItem[];
  brakeTypes: ListItem[];
  brakeSizes: ListItem[];
  brakePowerTypes: ListItem[];
  brakeCertificates: ListItem[];
  mainBodySectionTypes: ListItem[];
  clientSealingRequests: ListItem[];
  cupLogoOptions: ListItem[];
  suspensions: ListItem[];
  repeatabilityTypes: ListItem[];
  expectedDeliveryOptions: ListItem[];
  workingConditions: ListItem[];
  usageTypes: ListItem[];
  environments: ListItem[];
  // Product Type Lists
  axleLocations: ListItem[];
  articulationTypes: ListItem[];
  configurationTypes: ListItem[];
  addListItem: (category: ListCategory, value: string) => Promise<ListItem>;
  updateListItem: (category: ListCategory, id: string, value: string) => Promise<ListItem>;
  deleteListItem: (category: ListCategory, id: string) => Promise<void>;
  reorderListItems: (category: ListCategory, orderedIds: string[]) => Promise<void>;
  // Users
  users: UserItem[];
  isUsersLoading: boolean;
  refreshUsers: () => Promise<void>;
  createUser: (input: UserCreateInput) => Promise<UserItem>;
  updateUser: (id: string, input: UserUpdateInput) => Promise<UserItem>;
  deleteUser: (id: string) => Promise<void>;
  importLegacyUsers: (users: Array<{ name: string; email: string; role: UserItem['role']; password: string }>) => Promise<{ created: number; updated: number; total: number }>;
}

const AdminSettingsContext = createContext<AdminSettingsContextType | undefined>(undefined);

const DEFAULT_DATA = {
  applicationVehicles: [
    { id: '1', value: 'Agricultural Trailer' },
    { id: '2', value: 'Construction Equipment Trailer' },
    { id: '3', value: 'Forestry Trailer' },
    { id: '4', value: 'GSE' },
    { id: '5', value: 'Baler' },
  ],
  countries: [
    { id: '1', value: 'China' },
    { id: '2', value: 'France' },
    { id: '3', value: 'India' },
    { id: '4', value: 'Vietnam' },
    { id: '5', value: 'Australia' },
    { id: '6', value: 'New-Zealand' },
    { id: '7', value: 'Canada' },
    { id: '8', value: 'Argentina' },
    { id: '9', value: 'Brazil' },
    { id: '10', value: 'Chili' },
    { id: '11', value: 'Spain' },
  ],
  brakeTypes: [
    { id: '1', value: 'Drum' },
    { id: '2', value: 'Disk' },
    { id: '3', value: 'N/A' },
    { id: '4', value: 'As Per ROC Standard' },
  ],
  brakeSizes: [
    { id: '1', value: '180x32' },
    { id: '2', value: '250x50' },
    { id: '3', value: '300x60' },
    { id: '4', value: '400x80' },
    { id: '5', value: 'N/A' },
  ],
  brakePowerTypes: [
    { id: '1', value: 'Air' },
    { id: '2', value: 'Hydraulic' },
  ],
  brakeCertificates: [
    { id: '1', value: 'Required' },
    { id: '2', value: 'Not required' },
  ],
  mainBodySectionTypes: [
    { id: '1', value: 'Round' },
    { id: '2', value: 'Square' },
    { id: '3', value: 'Tube' },
    { id: '4', value: 'As Per ROC Standard' },
  ],
  clientSealingRequests: [
    { id: '1', value: 'Steel' },
    { id: '2', value: 'Rubber' },
    { id: '3', value: 'N/A' },
    { id: '4', value: 'As Per ROC Standard' },
  ],
  cupLogoOptions: [
    { id: '1', value: 'Keep' },
    { id: '2', value: 'Remove' },
    { id: '3', value: 'As Per ROC Standard' },
  ],
  suspensions: [
    { id: '1', value: 'Air suspension' },
    { id: '2', value: 'Leaf spring' },
    { id: '3', value: 'Hydraulic' },
    { id: '4', value: 'PS-ROC' },
    { id: '5', value: 'V-ROC' },
    { id: '6', value: 'N/A' },
    { id: '7', value: 'As Per ROC Standard' },
  ],
  repeatabilityTypes: [
    { id: '1', value: 'One-off Prototype' },
    { id: '2', value: 'Small batch' },
    { id: '3', value: 'Regular series' },
    { id: '4', value: 'Long Term Program' },
  ],
  expectedDeliveryOptions: [
    { id: '1', value: 'Exploded 3D' },
    { id: '2', value: '2D sales drawing' },
    { id: '3', value: 'Feasibility confirmation' },
    { id: '4', value: 'Recommend Appropriate Solution' },
    { id: '5', value: 'Price Quote' },
  ],
  workingConditions: [
    { id: '1', value: 'Dry' },
    { id: '2', value: 'Wet' },
    { id: '3', value: 'Under Water' },
  ],
  usageTypes: [
    { id: '1', value: 'Farm field' },
    { id: '2', value: 'Tarmac' },
  ],
  environments: [
    { id: '1', value: 'Clean' },
    { id: '2', value: 'Dusty' },
  ],
  axleLocations: [
    { id: '1', value: 'Front' },
    { id: '2', value: 'Rear' },
    { id: '3', value: 'N/A' },
  ],
  articulationTypes: [
    { id: '1', value: 'Straight axle' },
    { id: '2', value: 'Steering axle' },
    { id: '3', value: 'N/A' },
  ],
  configurationTypes: [
    { id: '1', value: 'Tandem' },
    { id: '2', value: 'Tridem' },
    { id: '3', value: 'Boggie' },
    { id: '4', value: 'Industrial Axles' },
    { id: '5', value: 'Stud Axles' },
    { id: '6', value: 'Single Axles' },
  ],
};

export type ListCategory =
  | 'applicationVehicles'
  | 'countries'
  | 'brakeTypes'
  | 'brakeSizes'
  | 'brakePowerTypes'
  | 'brakeCertificates'
  | 'mainBodySectionTypes'
  | 'clientSealingRequests'
  | 'cupLogoOptions'
  | 'suspensions'
  | 'repeatabilityTypes'
  | 'expectedDeliveryOptions'
  | 'workingConditions'
  | 'usageTypes'
  | 'environments'
  | 'axleLocations'
  | 'articulationTypes'
  | 'configurationTypes';

const API_BASE = '/api/admin/lists';
const USERS_API_BASE = '/api/admin/users';

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const normalizeName = (value: unknown) => String(value ?? '').trim();
const normalizeRole = (value: unknown): UserItem['role'] | null => {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'sales' || role === 'design' || role === 'costing' || role === 'admin') {
    return role;
  }
  return null;
};

const mergeDefaultList = (list: ListItem[] | undefined, defaults: ListItem[]) => {
  const safeList = Array.isArray(list) ? list : [];
  if (!safeList.length) return defaults;
  const seen = new Set(safeList.map((item) => item.value.trim().toLowerCase()));
  const merged = [...safeList];
  defaults.forEach((item) => {
    const key = item.value.trim().toLowerCase();
    if (!seen.has(key)) {
      merged.push(item);
    }
  });
  return merged;
};

export const AdminSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [applicationVehicles, setApplicationVehicles] = useState<ListItem[]>(DEFAULT_DATA.applicationVehicles);
  const [countries, setCountries] = useState<ListItem[]>(DEFAULT_DATA.countries);
  const [brakeTypes, setBrakeTypes] = useState<ListItem[]>(DEFAULT_DATA.brakeTypes);
  const [brakeSizes, setBrakeSizes] = useState<ListItem[]>(DEFAULT_DATA.brakeSizes);
  const [brakePowerTypes, setBrakePowerTypes] = useState<ListItem[]>(DEFAULT_DATA.brakePowerTypes);
  const [brakeCertificates, setBrakeCertificates] = useState<ListItem[]>(DEFAULT_DATA.brakeCertificates);
  const [mainBodySectionTypes, setMainBodySectionTypes] = useState<ListItem[]>(DEFAULT_DATA.mainBodySectionTypes);
  const [clientSealingRequests, setClientSealingRequests] = useState<ListItem[]>(DEFAULT_DATA.clientSealingRequests);
  const [cupLogoOptions, setCupLogoOptions] = useState<ListItem[]>(DEFAULT_DATA.cupLogoOptions);
  const [suspensions, setSuspensions] = useState<ListItem[]>(DEFAULT_DATA.suspensions);
  const [repeatabilityTypes, setRepeatabilityTypes] = useState<ListItem[]>(DEFAULT_DATA.repeatabilityTypes);
  const [expectedDeliveryOptions, setExpectedDeliveryOptions] = useState<ListItem[]>(DEFAULT_DATA.expectedDeliveryOptions);
  const [workingConditions, setWorkingConditions] = useState<ListItem[]>(DEFAULT_DATA.workingConditions);
  const [usageTypes, setUsageTypes] = useState<ListItem[]>(DEFAULT_DATA.usageTypes);
  const [environments, setEnvironments] = useState<ListItem[]>(DEFAULT_DATA.environments);
  const [axleLocations, setAxleLocations] = useState<ListItem[]>(DEFAULT_DATA.axleLocations);
  const [articulationTypes, setArticulationTypes] = useState<ListItem[]>(DEFAULT_DATA.articulationTypes);
  const [configurationTypes, setConfigurationTypes] = useState<ListItem[]>(DEFAULT_DATA.configurationTypes);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  const fetchJson = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
    const res = await fetch(input, init);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(String(body?.error ?? `Request failed with status ${res.status}`));
    }
    return res.json() as Promise<T>;
  };

  const getListState = (category: ListCategory): [ListItem[], React.Dispatch<React.SetStateAction<ListItem[]>>] => {
    switch (category) {
      case 'applicationVehicles':
        return [applicationVehicles, setApplicationVehicles];
      case 'countries':
        return [countries, setCountries];
      case 'brakeTypes':
        return [brakeTypes, setBrakeTypes];
      case 'brakeSizes':
        return [brakeSizes, setBrakeSizes];
      case 'brakePowerTypes':
        return [brakePowerTypes, setBrakePowerTypes];
      case 'brakeCertificates':
        return [brakeCertificates, setBrakeCertificates];
      case 'mainBodySectionTypes':
        return [mainBodySectionTypes, setMainBodySectionTypes];
      case 'clientSealingRequests':
        return [clientSealingRequests, setClientSealingRequests];
      case 'cupLogoOptions':
        return [cupLogoOptions, setCupLogoOptions];
      case 'suspensions':
        return [suspensions, setSuspensions];
      case 'repeatabilityTypes':
        return [repeatabilityTypes, setRepeatabilityTypes];
      case 'expectedDeliveryOptions':
        return [expectedDeliveryOptions, setExpectedDeliveryOptions];
      case 'workingConditions':
        return [workingConditions, setWorkingConditions];
      case 'usageTypes':
        return [usageTypes, setUsageTypes];
      case 'environments':
        return [environments, setEnvironments];
      case 'axleLocations':
        return [axleLocations, setAxleLocations];
      case 'articulationTypes':
        return [articulationTypes, setArticulationTypes];
      case 'configurationTypes':
        return [configurationTypes, setConfigurationTypes];
      default:
        return [[], () => {}];
    }
  };

  useEffect(() => {
    let isActive = true;
    fetchJson<Record<ListCategory, ListItem[]>>(API_BASE)
      .then((lists) => {
        if (!isActive) return;
        setApplicationVehicles(lists.applicationVehicles ?? DEFAULT_DATA.applicationVehicles);
        setCountries(lists.countries ?? DEFAULT_DATA.countries);
        setBrakeTypes(lists.brakeTypes ?? DEFAULT_DATA.brakeTypes);
        setBrakeSizes(lists.brakeSizes ?? DEFAULT_DATA.brakeSizes);
        setBrakePowerTypes(mergeDefaultList(lists.brakePowerTypes, DEFAULT_DATA.brakePowerTypes));
        setBrakeCertificates(mergeDefaultList(lists.brakeCertificates, DEFAULT_DATA.brakeCertificates));
        setMainBodySectionTypes(mergeDefaultList(lists.mainBodySectionTypes, DEFAULT_DATA.mainBodySectionTypes));
        setClientSealingRequests(mergeDefaultList(lists.clientSealingRequests, DEFAULT_DATA.clientSealingRequests));
        setCupLogoOptions(mergeDefaultList(lists.cupLogoOptions, DEFAULT_DATA.cupLogoOptions));
        setSuspensions(lists.suspensions ?? DEFAULT_DATA.suspensions);
        setRepeatabilityTypes(lists.repeatabilityTypes ?? DEFAULT_DATA.repeatabilityTypes);
        setExpectedDeliveryOptions(lists.expectedDeliveryOptions ?? DEFAULT_DATA.expectedDeliveryOptions);
        setWorkingConditions(lists.workingConditions ?? DEFAULT_DATA.workingConditions);
        setUsageTypes(mergeDefaultList(lists.usageTypes, DEFAULT_DATA.usageTypes));
        setEnvironments(lists.environments ?? DEFAULT_DATA.environments);
        setAxleLocations(lists.axleLocations ?? DEFAULT_DATA.axleLocations);
        setArticulationTypes(lists.articulationTypes ?? DEFAULT_DATA.articulationTypes);
        setConfigurationTypes(lists.configurationTypes ?? DEFAULT_DATA.configurationTypes);
      })
      .catch((error) => {
        console.error('Failed to load admin lists:', error);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const addListItem = async (category: ListCategory, value: string) => {
    const created = await fetchJson<ListItem>(`${API_BASE}/${category}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const [, setList] = getListState(category);
    setList((prev) => [...prev, created]);
    return created;
  };

  const updateListItem = async (category: ListCategory, id: string, value: string) => {
    const updated = await fetchJson<ListItem>(`${API_BASE}/${category}/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const [, setList] = getListState(category);
    setList((prev) => prev.map((item) => (item.id === id ? updated : item)));
    return updated;
  };

  const deleteListItem = async (category: ListCategory, id: string) => {
    await fetch(`${API_BASE}/${category}/${id}`, { method: 'DELETE' });
    const [, setList] = getListState(category);
    setList((prev) => prev.filter((item) => item.id !== id));
  };

  const reorderListItems = async (category: ListCategory, orderedIds: string[]) => {
    const [, setList] = getListState(category);

    // Optimistic reorder based on the ids from the UI.
    setList((prev) => {
      const byId = new Map(prev.map((i) => [i.id, i]));
      const next: ListItem[] = [];
      const seen = new Set<string>();

      for (const id of orderedIds) {
        const item = byId.get(id);
        if (!item) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        next.push(item);
      }
      // Append any items not included (e.g. concurrent add).
      for (const item of prev) {
        if (seen.has(item.id)) continue;
        next.push(item);
      }
      return next;
    });

    try {
      await fetchJson<{ ok: boolean }>(`${API_BASE}/${category}/reorder`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      });
    } catch (error) {
      console.error('Failed to reorder admin list:', error);
      // Best-effort rollback: refetch server state.
      try {
        const fresh = await fetchJson<ListItem[]>(`${API_BASE}/${category}`);
        setList(fresh);
      } catch (e) {
        console.error('Failed to refetch admin list after reorder failure:', e);
      }
      throw error;
    }
  };

  const mapUser = (raw: any): UserItem => {
    const role = normalizeRole(raw?.role) || 'sales';
    return {
      id: String(raw?.id ?? ''),
      name: String(raw?.name ?? ''),
      email: String(raw?.email ?? ''),
      role,
      createdAt: raw?.createdAt ? String(raw.createdAt) : null,
    };
  };

  const refreshUsers = async () => {
    const startedAt = Date.now();
    setIsUsersLoading(true);
    try {
      const data = await fetchJson<UserItem[]>(USERS_API_BASE);
      const mapped = Array.isArray(data) ? data.map(mapUser) : [];
      setUsers(mapped.filter((item) => item.id && item.email));
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsUsersLoading(false);
    }
  };

  const createUser = async (input: UserCreateInput) => {
    const payload = {
      name: normalizeName(input.name),
      email: normalizeEmail(input.email),
      role: normalizeRole(input.role),
      password: String(input.password ?? ''),
    };
    if (!payload.name || !payload.email || !payload.role || !payload.password.trim()) {
      throw new Error('Invalid user payload');
    }

    const created = await fetchJson<UserItem>(USERS_API_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const mapped = mapUser(created);
    setUsers((prev) => [...prev, mapped].sort((a, b) => a.email.localeCompare(b.email)));
    return mapped;
  };

  const updateUser = async (id: string, input: UserUpdateInput) => {
    const userId = String(id ?? '').trim();
    if (!userId) throw new Error('Missing user id');
    const payload = {
      name: normalizeName(input.name),
      email: normalizeEmail(input.email),
      role: normalizeRole(input.role),
      newPassword: String(input.newPassword ?? ''),
    };
    if (!payload.name || !payload.email || !payload.role) {
      throw new Error('Invalid user payload');
    }

    const updated = await fetchJson<UserItem>(`${USERS_API_BASE}/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const mapped = mapUser(updated);
    setUsers((prev) =>
      prev
        .map((item) => (item.id === userId ? mapped : item))
        .sort((a, b) => a.email.localeCompare(b.email))
    );
    return mapped;
  };

  const deleteUser = async (id: string) => {
    const userId = String(id ?? '').trim();
    if (!userId) throw new Error('Missing user id');
    const res = await fetch(`${USERS_API_BASE}/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(String(body?.error ?? `Request failed with status ${res.status}`));
    }
    setUsers((prev) => prev.filter((item) => item.id !== userId));
  };

  const importLegacyUsers = async (
    importUsers: Array<{ name: string; email: string; role: UserItem['role']; password: string }>
  ) => {
    const usersPayload = Array.isArray(importUsers)
      ? importUsers
          .map((entry) => ({
            name: normalizeName(entry?.name),
            email: normalizeEmail(entry?.email),
            role: normalizeRole(entry?.role),
            password: String(entry?.password ?? '').trim(),
          }))
          .filter((entry) => entry.name && entry.email && entry.role && entry.password)
      : [];

    if (!usersPayload.length) {
      throw new Error('No valid users to import');
    }

    const result = await fetchJson<{ created: number; updated: number; total: number }>(
      `${USERS_API_BASE}/import-legacy`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ users: usersPayload }),
      }
    );
    await refreshUsers();
    return result;
  };

  return (
    <AdminSettingsContext.Provider value={{
      applicationVehicles,
      countries,
      brakeTypes,
      brakeSizes,
      brakePowerTypes,
      brakeCertificates,
      mainBodySectionTypes,
      clientSealingRequests,
      cupLogoOptions,
      suspensions,
      repeatabilityTypes,
      expectedDeliveryOptions,
      workingConditions,
      usageTypes,
      environments,
      axleLocations,
      articulationTypes,
      configurationTypes,
      addListItem,
      updateListItem,
      deleteListItem,
      reorderListItems,
      users,
      isUsersLoading,
      refreshUsers,
      createUser,
      updateUser,
      deleteUser,
      importLegacyUsers,
    }}>
      {children}
    </AdminSettingsContext.Provider>
  );
};

export const useAdminSettings = () => {
  const context = useContext(AdminSettingsContext);
  if (context === undefined) {
    throw new Error('useAdminSettings must be used within an AdminSettingsProvider');
  }
  return context;
};

export type { ListItem, UserItem };
