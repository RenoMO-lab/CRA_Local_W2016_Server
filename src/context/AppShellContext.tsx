import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

type DensityMode = 'compact' | 'comfortable';
type SaveStateKind = 'idle' | 'saving' | 'saved' | 'error';

export interface AppShellStatus {
  environment: {
    label: string;
    nodeEnv: string;
  };
  db: {
    health: string;
    healthLabel: string;
    lastRefreshedAt: string | null;
  };
  build: {
    hash: string;
    builtAt: string;
  };
  serverTime: string;
}

export interface AppShellSearchResult {
  id: string;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  clientName: string;
  applicationVehicle: string;
  country: string;
  createdByName: string;
  updatedAt: string;
}

interface SaveState {
  kind: SaveStateKind;
  at: Date | null;
  message?: string;
}

interface AppShellContextType {
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  searchResults: AppShellSearchResult[];
  isSearchLoading: boolean;
  shellStatus: AppShellStatus | null;
  shellStatusError: string | null;
  isShellStatusLoading: boolean;
  refreshShellStatus: () => Promise<void>;
  saveState: SaveState;
  setSaveState: (kind: SaveStateKind, message?: string) => void;
}

const DENSITY_KEY = 'cra_ui_density';
const SIDEBAR_WIDTH_KEY = 'cra_sidebar_width';
const DEFAULT_SIDEBAR_WIDTH = 264;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 420;

const AppShellContext = createContext<AppShellContextType | undefined>(undefined);

const clampSidebarWidth = (value: number) => Math.min(Math.max(value, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isAbortError = (error: unknown) => error instanceof Error && error.name === 'AbortError';

export const AppShellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [density, setDensityState] = useState<DensityMode>(() => {
    const stored = String(localStorage.getItem(DENSITY_KEY) ?? '').trim();
    return stored === 'comfortable' ? 'comfortable' : 'compact';
  });
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    const raw = Number.parseInt(String(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? ''), 10);
    if (!Number.isFinite(raw)) return DEFAULT_SIDEBAR_WIDTH;
    return clampSidebarWidth(raw);
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AppShellSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [shellStatus, setShellStatus] = useState<AppShellStatus | null>(null);
  const [shellStatusError, setShellStatusError] = useState<string | null>(null);
  const [isShellStatusLoading, setIsShellStatusLoading] = useState(false);
  const [saveState, setSaveStateData] = useState<SaveState>({ kind: 'idle', at: null });

  const setDensity = useCallback((next: DensityMode) => {
    setDensityState(next);
    localStorage.setItem(DENSITY_KEY, next);
  }, []);

  const setSidebarWidth = useCallback((next: number) => {
    const clamped = clampSidebarWidth(next);
    setSidebarWidthState(clamped);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped));
  }, []);

  const refreshShellStatus = useCallback(async () => {
    if (!isAuthenticated) {
      setShellStatus(null);
      setShellStatusError(null);
      return;
    }

    setIsShellStatusLoading(true);
    setShellStatusError(null);
    try {
      const res = await fetch('/api/app-shell-status', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load shell status: ${res.status}`);
      }
      const data = await res.json();
      setShellStatus(data);
    } catch (error) {
      setShellStatusError(errorMessage(error));
    } finally {
      setIsShellStatusLoading(false);
    }
  }, [isAuthenticated]);

  const setSaveState = useCallback((kind: SaveStateKind, message?: string) => {
    setSaveStateData({
      kind,
      at: kind === 'idle' ? null : new Date(),
      message,
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    void refreshShellStatus();
  }, [refreshShellStatus]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timer = window.setInterval(() => {
      void refreshShellStatus();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, refreshShellStatus]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return undefined;
    }

    const query = globalSearchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearchLoading(true);
      try {
        const params = new URLSearchParams({ q: query, limit: '25' });
        const res = await fetch(`/api/requests/search?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Search failed: ${res.status}`);
        }
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!isAbortError(error)) {
          setSearchResults([]);
        }
      } finally {
        setIsSearchLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [globalSearchQuery, isAuthenticated]);

  const value = useMemo<AppShellContextType>(
    () => ({
      density,
      setDensity,
      sidebarWidth,
      setSidebarWidth,
      commandPaletteOpen,
      setCommandPaletteOpen,
      globalSearchQuery,
      setGlobalSearchQuery,
      searchResults,
      isSearchLoading,
      shellStatus,
      shellStatusError,
      isShellStatusLoading,
      refreshShellStatus,
      saveState,
      setSaveState,
    }),
    [
      density,
      setDensity,
      sidebarWidth,
      setSidebarWidth,
      commandPaletteOpen,
      globalSearchQuery,
      searchResults,
      isSearchLoading,
      shellStatus,
      shellStatusError,
      isShellStatusLoading,
      refreshShellStatus,
      saveState,
      setSaveState,
    ]
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
};

export const useAppShell = () => {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell must be used within AppShellProvider');
  }
  return context;
};
