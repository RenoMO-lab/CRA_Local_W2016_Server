import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  LayoutGrid,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAppShell } from '@/context/AppShellContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRequests } from '@/context/RequestContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import UserHubMenu from '@/components/layout/UserHubMenu';
import DesktopUpdateConfirmDialog from '@/components/layout/DesktopUpdateConfirmDialog';
import DesktopUpdateProgressDialog from '@/components/layout/DesktopUpdateProgressDialog';
import { cn } from '@/lib/utils';

interface DesktopAppChromeProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface RouteContext {
  breadcrumb: BreadcrumbItem[];
}

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  requestId: string | null;
  payload?: Record<string, any> | null;
  isRead: boolean;
  createdAt: string | null;
  readAt: string | null;
}

type DesktopUpdaterBridge = {
  getCurrentVersion: () => Promise<string>;
  checkForUpdate?: (payload?: Record<string, any>) => Promise<{ available: boolean; current: string; target?: string }>;
  getCapabilities?: () => Promise<{ inAppUpdate?: boolean; silentInstall?: boolean; autoRestart?: boolean }>;
  getInstallStatus?: () => Promise<Record<string, any> | null>;
  cancelInstall?: () => Promise<{ cancelled?: boolean } | boolean | void>;
  installUpdate: (payload?: Record<string, any>) => Promise<{ started: boolean } | boolean | void>;
  restartApp: () => Promise<void>;
  pingUpdater?: () => Promise<{ ok?: boolean } | boolean | void>;
};

type ClientUpdatePrepareResponse = {
  updateAvailable: boolean;
  currentVersion: string | null;
  targetVersion: string | null;
  notes: string | null;
  publishedAt: string | null;
  manifestUrl: string | null;
  expiresAt: string | null;
};

type DesktopUpdatePillState =
  | 'hidden'
  | 'available'
  | 'confirming'
  | 'downloading'
  | 'installing'
  | 'ready_to_restart'
  | 'failed';

type DesktopUpdateProgressPhase = 'checking' | 'downloading' | 'installing' | 'ready_to_restart' | 'failed';
type DesktopUpdaterBridgeState =
  | 'unknown'
  | 'ready'
  | 'not_desktop_runtime'
  | 'bridge_missing'
  | 'invoke_unavailable'
  | 'bridge_incomplete'
  | 'capability_disabled'
  | 'version_unavailable'
  | 'prepare_failed';
type DesktopUpdaterDiagnostics = {
  state: DesktopUpdaterBridgeState;
  detail: string;
};

const DESKTOP_UPDATE_PLATFORM = 'windows-x86_64';
const DESKTOP_UPDATE_RESTART_SECONDS = 10;

const detectDesktopRuntime = (): boolean => {
  const hostRuntime = String((window as any)?.__CRA_DESKTOP_HOST__?.runtime ?? '').trim().toLowerCase();
  const userAgent = typeof navigator === 'undefined' ? '' : String(navigator.userAgent ?? '').toLowerCase();
  return Boolean(
    hostRuntime === 'tauri' ||
      (window as any)?.__TAURI__ ||
      (window as any)?.__TAURI_INTERNALS__ ||
      userAgent.includes('tauri')
  );
};

type DesktopInvokeResolution = {
  invoke: ((command: string, payload?: Record<string, any>) => Promise<any>) | null;
  source: string | null;
};

const resolveDesktopInvoke = (): DesktopInvokeResolution => {
  const tauriObj = (window as any)?.__TAURI__;
  if (typeof tauriObj?.invoke === 'function') {
    return {
      invoke: (command: string, payload: Record<string, any> = {}) => tauriObj.invoke(command, payload),
      source: '__TAURI__.invoke',
    };
  }
  if (typeof tauriObj?.core?.invoke === 'function') {
    return {
      invoke: (command: string, payload: Record<string, any> = {}) => tauriObj.core.invoke(command, payload),
      source: '__TAURI__.core.invoke',
    };
  }
  if (typeof (window as any)?.__TAURI_INVOKE__ === 'function') {
    return {
      invoke: (command: string, payload: Record<string, any> = {}) => (window as any).__TAURI_INVOKE__(command, payload),
      source: '__TAURI_INVOKE__',
    };
  }
  return { invoke: null, source: null };
};

const resolveDesktopUpdaterBridge = (): {
  bridge: DesktopUpdaterBridge | null;
  state: DesktopUpdaterBridgeState;
  detail: string;
} => {
  if (!detectDesktopRuntime()) {
    return {
      bridge: null,
      state: 'not_desktop_runtime',
      detail: 'desktop runtime marker not detected',
    };
  }

  const scriptedBridge = (window as any)?.__CRA_DESKTOP_UPDATER__;
  const hasScriptedBridge = Boolean(scriptedBridge);
  const scriptedBridgeComplete =
    typeof scriptedBridge?.getCurrentVersion === 'function' &&
    typeof scriptedBridge?.installUpdate === 'function' &&
    typeof scriptedBridge?.restartApp === 'function';

  if (hasScriptedBridge && scriptedBridgeComplete) {
    return {
      bridge: scriptedBridge as DesktopUpdaterBridge,
      state: 'ready',
      detail: 'bridge ready (__CRA_DESKTOP_UPDATER__)',
    };
  }

  const invokeResolution = resolveDesktopInvoke();
  if (!invokeResolution.invoke) {
    return {
      bridge: null,
      state: hasScriptedBridge ? 'bridge_incomplete' : 'invoke_unavailable',
      detail: hasScriptedBridge
        ? 'bridge object is incomplete and invoke fallback is unavailable'
        : 'window.__CRA_DESKTOP_UPDATER__ is missing and no tauri invoke bridge was found',
    };
  }

  const invoke = invokeResolution.invoke;
  const fallbackBridge: DesktopUpdaterBridge = {
    getCurrentVersion: () => invoke('desktop_get_current_version'),
    installUpdate: (payload: Record<string, any> = {}) => invoke('desktop_prepare_update_install', payload),
    restartApp: () => invoke('desktop_apply_prepared_update'),
  };

  return {
    bridge: fallbackBridge,
    state: 'ready',
    detail: `bridge adapter ready (${invokeResolution.source})`,
  };
};

const getDesktopUpdaterBridge = (): DesktopUpdaterBridge | null => {
  return resolveDesktopUpdaterBridge().bridge;
};

const resolveInstallPhase = (
  status: Record<string, any> | null | undefined
): {
  phase: DesktopUpdateProgressPhase | null;
  message: string;
  progress: number | null;
} => {
  const rawState = String(status?.phase ?? status?.status ?? status?.state ?? '').trim().toLowerCase();
  const message = String(status?.message ?? status?.detail ?? status?.error ?? '').trim();
  const rawProgress = Number(status?.progress ?? status?.percent ?? status?.percentage ?? NaN);
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : null;

  if (!rawState) return { phase: null, message, progress };
  if (rawState.includes('fail') || rawState.includes('error') || rawState.includes('cancel')) {
    return { phase: 'failed', message, progress };
  }
  if (
    rawState.includes('ready') ||
    rawState.includes('restart') ||
    rawState.includes('complete') ||
    rawState.includes('applied')
  ) {
    return { phase: 'ready_to_restart', message, progress };
  }
  if (rawState.includes('download') || rawState.includes('fetch')) {
    return { phase: 'downloading', message, progress };
  }
  if (
    rawState.includes('install') ||
    rawState.includes('verify') ||
    rawState.includes('extract') ||
    rawState.includes('prepare')
  ) {
    return { phase: 'installing', message, progress };
  }

  return { phase: null, message, progress };
};

const formatTimeShort = (value?: Date | string | null) => {
  if (!value) return '--';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatNotificationTime = (value?: string | null) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const humanizeKey = (value?: string | null) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const interpolate = (template: string, values: Record<string, string>) => {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
};

const resolveRequestStatusLabel = (status: string, t: any) => {
  const key = String(status ?? '').trim();
  if (!key) return '';
  return (t.statuses as Record<string, string> | undefined)?.[key] ?? humanizeKey(key);
};

const resolveContractStatusLabel = (status: string, t: any) => {
  const key = String(status ?? '').trim();
  if (!key) return '';
  return (t.contractApproval?.statuses as Record<string, string> | undefined)?.[key] ?? humanizeKey(key);
};

const extractFirstInteger = (text: string) => {
  const match = String(text ?? '').match(/(\d+)/);
  return match?.[1] ?? '0';
};

const resolveNotificationDisplay = (item: AppNotification, t: any) => {
  const payload = item.payload ?? {};
  const type = String(payload?.eventType ?? item.type ?? '').trim().toLowerCase();
  const title = String(item.title ?? '').trim();
  const body = String(item.body ?? '').trim();
  const requestId = String(item.requestId ?? payload?.requestId ?? '').trim();
  const contractId = String(payload?.contractId ?? '').trim();
  const status = String(payload?.status ?? '').trim();
  const previousStatus = String(payload?.previousStatus ?? '').trim();
  const actorName = String(payload?.actorName ?? '').trim();
  const version = String(payload?.version ?? '').trim();
  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();

  const looksLikeIntegrityAlert =
    type.includes('integrity') ||
    lowerTitle.includes('integrity alert') ||
    lowerBody.includes('status/history mismatches');

  if (looksLikeIntegrityAlert) {
    return {
      title: t.appChrome.requestStatusIntegrityAlert,
      body: interpolate(t.appChrome.requestStatusIntegrityBody, { count: extractFirstInteger(body) }),
    };
  }

  if (type === 'request_created') {
    const id = requestId || humanizeKey(title.replace(/^new request\s+/i, ''));
    const statusLabel = resolveRequestStatusLabel(status, t) || t.appChrome.workflowLabel;
    return {
      title: interpolate(t.appChrome.notificationRequestCreatedTitle, { id: id || t.appChrome.requestLabel }),
      body: interpolate(t.appChrome.notificationRequestCreatedBodyWithStatus, { status: statusLabel }),
    };
  }

  if (type === 'request_status_changed') {
    const id = requestId || (title.split(' ')[0] ?? '').trim();
    const toLabel = resolveRequestStatusLabel(status, t);
    const fromLabel = resolveRequestStatusLabel(previousStatus, t);
    if (id && toLabel && fromLabel && toLabel !== fromLabel) {
      return {
        title: interpolate(t.appChrome.notificationMovedToTitle, { id, status: toLabel }),
        body: actorName
          ? interpolate(t.appChrome.notificationStatusChangedByBody, { actor: actorName, from: fromLabel, to: toLabel })
          : interpolate(t.appChrome.notificationStatusChangedBody, { from: fromLabel, to: toLabel }),
      };
    }
    if (id && toLabel) {
      return {
        title: interpolate(t.appChrome.notificationUpdatedTitle, { id }),
        body: actorName
          ? interpolate(t.appChrome.notificationRequestUpdatedInByBody, { actor: actorName, status: toLabel })
          : interpolate(t.appChrome.notificationRequestUpdatedInBody, { status: toLabel }),
      };
    }
    if (id) {
      return {
        title: interpolate(t.appChrome.notificationUpdatedTitle, { id }),
        body: actorName
          ? interpolate(t.appChrome.notificationRequestUpdatedByBody, { actor: actorName })
          : t.appChrome.notificationRequestUpdatedBody,
      };
    }
  }

  if (type === 'contract_status_changed') {
    const id = contractId || (title.split(' ')[0] ?? '').trim();
    const toLabel = resolveContractStatusLabel(status, t);
    const fromLabel = resolveContractStatusLabel(previousStatus, t);
    if (id && toLabel && fromLabel && toLabel !== fromLabel) {
      return {
        title: interpolate(t.appChrome.notificationMovedToTitle, { id, status: toLabel }),
        body: actorName
          ? interpolate(t.appChrome.notificationStatusChangedByBody, { actor: actorName, from: fromLabel, to: toLabel })
          : interpolate(t.appChrome.notificationStatusChangedBody, { from: fromLabel, to: toLabel }),
      };
    }
    if (id && toLabel) {
      return {
        title: interpolate(t.appChrome.notificationUpdatedTitle, { id }),
        body: actorName
          ? interpolate(t.appChrome.notificationContractUpdatedInByBody, { actor: actorName, status: toLabel })
          : interpolate(t.appChrome.notificationContractUpdatedInBody, { status: toLabel }),
      };
    }
    if (id) {
      return {
        title: interpolate(t.appChrome.notificationUpdatedTitle, { id }),
        body: actorName
          ? interpolate(t.appChrome.notificationContractUpdatedByBody, { actor: actorName })
          : t.appChrome.notificationContractUpdatedBody,
      };
    }
  }

  if (type === 'client_update_available') {
    const inferredVersion = version || (() => {
      const match = title.match(/\((v[^)]+)\)/i) || body.match(/\b(v\d+(?:\.\d+){1,3})\b/i);
      return String(match?.[1] ?? '').trim();
    })();
    return {
      title: inferredVersion
        ? interpolate(t.appChrome.notificationClientUpdateTitle, { version: inferredVersion })
        : t.appChrome.notificationClientUpdateTitlePlain,
      body: inferredVersion
        ? interpolate(t.appChrome.notificationClientUpdateBody, { version: inferredVersion })
        : t.appChrome.notificationClientUpdateBodyPlain,
    };
  }

  if (type === 'feedback_submitted') {
    const ticketNumber = String(payload?.ticketNumber ?? '').trim();
    const typeLabel = String(payload?.feedbackType ?? '').trim();
    const submittedBy = String(payload?.submittedBy ?? '').trim();
    return {
      title: t.appChrome.notificationFeedbackSubmittedTitle,
      body: interpolate(t.appChrome.notificationFeedbackSubmittedBody, {
        ticket: ticketNumber || '-',
        type: typeLabel || '-',
        user: submittedBy || '-',
      }),
    };
  }

  return { title, body };
};

const routeContext = (pathname: string, t: any): RouteContext => {
  if (pathname.startsWith('/dashboard')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.dashboard },
      ],
    };
  }
  if (pathname.startsWith('/contract-approvals/new')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.contractApprovals, to: '/contract-approvals' },
        { label: t.appChrome.new },
      ],
    };
  }
  if (pathname.startsWith('/contract-approvals/')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.contractApprovals, to: '/contract-approvals' },
        { label: t.appChrome.detail },
      ],
    };
  }
  if (pathname.startsWith('/contract-approvals')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.contractApprovals },
      ],
    };
  }
  if (pathname.startsWith('/requests/new')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.dashboard, to: '/dashboard' },
        { label: t.appChrome.new },
      ],
    };
  }
  if (pathname.startsWith('/requests/')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.dashboard, to: '/dashboard' },
        { label: t.appChrome.detail },
      ],
    };
  }
  if (pathname.startsWith('/performance')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.performance },
      ],
    };
  }
  if (pathname.startsWith('/price-list')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.priceList },
      ],
    };
  }
  if (pathname.startsWith('/downloads')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.downloads },
      ],
    };
  }
  if (pathname.startsWith('/settings')) {
    return {
      breadcrumb: [
        { label: 'CRA', to: '/dashboard' },
        { label: t.nav.admin },
      ],
    };
  }
  return {
    breadcrumb: [
      { label: 'CRA', to: '/dashboard' },
      { label: t.appChrome.workspace },
    ],
  };
};

const isTypingElement = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

const DesktopAppChrome: React.FC<DesktopAppChromeProps> = ({ sidebarCollapsed, onToggleSidebar }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    density,
    setDensity,
    globalSearchQuery,
    setGlobalSearchQuery,
    commandPaletteOpen,
    setCommandPaletteOpen,
    searchResults,
    isSearchLoading,
    shellStatus,
    shellStatusError,
    refreshShellStatus,
    saveState,
  } = useAppShell();
  const { refreshRequests, lastSyncAt, syncState, syncError } = useRequests();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const desktopRuntimeDetected = detectDesktopRuntime();
  const desktopUpdatePromptedVersionRef = useRef<string>('');
  const desktopUpdateManifestUrlRef = useRef<string>('');
  const desktopUpdateInstallBusyRef = useRef(false);
  const desktopUpdateRestartTimerRef = useRef<number | null>(null);
  const [desktopUpdatePillState, setDesktopUpdatePillState] = useState<DesktopUpdatePillState>('hidden');
  const [desktopUpdateTargetVersion, setDesktopUpdateTargetVersion] = useState<string>('');
  const [desktopUpdateNotifiedVersion, setDesktopUpdateNotifiedVersion] = useState<string>('');
  const [desktopUpdatePrepare, setDesktopUpdatePrepare] = useState<ClientUpdatePrepareResponse | null>(null);
  const [desktopUpdateConfirmOpen, setDesktopUpdateConfirmOpen] = useState(false);
  const [desktopUpdateProgressOpen, setDesktopUpdateProgressOpen] = useState(false);
  const [desktopUpdateProgressPhase, setDesktopUpdateProgressPhase] = useState<DesktopUpdateProgressPhase>('checking');
  const [desktopUpdateProgressPercent, setDesktopUpdateProgressPercent] = useState(0);
  const [desktopUpdateProgressMessage, setDesktopUpdateProgressMessage] = useState('');
  const [desktopUpdateErrorMessage, setDesktopUpdateErrorMessage] = useState('');
  const [desktopUpdateRestartCountdown, setDesktopUpdateRestartCountdown] = useState<number | null>(null);
  const [desktopUpdateBusy, setDesktopUpdateBusy] = useState(false);
  const [desktopUpdateCanCancelInstall, setDesktopUpdateCanCancelInstall] = useState(false);
  const [desktopUpdaterDiagnostics, setDesktopUpdaterDiagnostics] = useState<DesktopUpdaterDiagnostics>({
    state: 'unknown',
    detail: '',
  });
  const [paletteQuery, setPaletteQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsFilter, setNotificationsFilter] = useState<'unread' | 'all'>('unread');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const context = useMemo(() => routeContext(location.pathname, t), [location.pathname, t]);
  const notificationItems = useMemo(
    () => notifications.map((item) => ({ ...item, display: resolveNotificationDisplay(item, t) })),
    [notifications, t]
  );

  const navigationCommands = useMemo(
    () => {
      const commands = [
        { id: 'go-dashboard', label: t.appChrome.goToRequestAnalysis, path: '/dashboard', icon: LayoutGrid },
        { id: 'go-contract-approvals', label: t.appChrome.goToContractApproval, path: '/contract-approvals', icon: FileText },
      ];
      if (user?.role === 'sales' || user?.role === 'admin') {
        commands.push(
          { id: 'go-new-request', label: t.nav.newRequest, path: '/requests/new', icon: Plus },
          { id: 'go-new-contract', label: t.appChrome.newContractApproval, path: '/contract-approvals/new', icon: Plus }
        );
      }
      if (user?.role === 'admin') {
        commands.push({ id: 'go-settings', label: t.appChrome.goToSettings, path: '/settings', icon: Settings });
      }
      return commands;
    },
    [t.appChrome.goToContractApproval, t.appChrome.goToRequestAnalysis, t.appChrome.goToSettings, t.appChrome.newContractApproval, t.nav.newRequest, user?.role]
  );

  const utilityCommands = useMemo(
    () => [
      {
        id: 'refresh-all',
        label: t.appChrome.refreshData,
        run: async () => {
          await Promise.all([refreshRequests(), refreshShellStatus()]);
          toast.success(t.appChrome.dataRefreshed);
        },
      },
      {
        id: 'toggle-density',
        label: density === 'compact' ? t.appChrome.switchToComfortableDensity : t.appChrome.switchToCompactDensity,
        run: async () => {
          setDensity(density === 'compact' ? 'comfortable' : 'compact');
        },
      },
    ],
    [density, refreshRequests, refreshShellStatus, setDensity, t.appChrome.dataRefreshed, t.appChrome.refreshData, t.appChrome.switchToComfortableDensity, t.appChrome.switchToCompactDensity]
  );

  const filteredPaletteRequests = useMemo(() => {
    return searchResults.slice(0, 8);
  }, [searchResults]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteQuery(globalSearchQuery);
        setCommandPaletteOpen(true);
        return;
      }

      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingElement(event.target)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingElement(event.target)) {
        event.preventDefault();
        navigate('/requests/new');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [globalSearchQuery, navigate, setCommandPaletteOpen]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch('/api/notifications/unread-count');
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      setUnreadCount(Number(data?.unreadCount ?? 0) || 0);
    } catch {
      // ignore transient polling errors
    }
  }, [user]);

  const fetchNotifications = useCallback(
    async (filter: 'unread' | 'all') => {
      if (!user) {
        setNotifications([]);
        return;
      }
      setNotificationsLoading(true);
      setNotificationsError(null);
      try {
        const unreadOnly = filter === 'unread';
        const res = await fetch(`/api/notifications?limit=50&unreadOnly=${unreadOnly ? 'true' : 'false'}`);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = await res.json().catch(() => null);
        const items = Array.isArray(data?.items) ? (data.items as AppNotification[]) : [];
        setNotifications(items);
      } catch (error) {
        setNotificationsError(String((error as any)?.message ?? error));
      } finally {
        setNotificationsLoading(false);
      }
    },
    [user]
  );

  const updateDesktopUpdaterDiagnostics = useCallback((state: DesktopUpdaterBridgeState, detail: string) => {
    setDesktopUpdaterDiagnostics((prev) => {
      if (prev.state === state && prev.detail === detail) {
        return prev;
      }
      const logPayload = { state, detail };
      if (state === 'ready') {
        console.info('[desktop-updater] bridge_state', logPayload);
      } else {
        console.warn('[desktop-updater] bridge_state', logPayload);
      }
      (window as any).__CRA_DESKTOP_UPDATER_DIAGNOSTICS__ = {
        state,
        detail,
        updatedAt: new Date().toISOString(),
      };
      return { state, detail };
    });
  }, []);

  const clearDesktopUpdateRestartTimer = useCallback(() => {
    if (desktopUpdateRestartTimerRef.current) {
      window.clearInterval(desktopUpdateRestartTimerRef.current);
      desktopUpdateRestartTimerRef.current = null;
    }
  }, []);

  const requestDesktopUpdatePrepare = useCallback(async (): Promise<ClientUpdatePrepareResponse | null> => {
    if (!user) return null;
    if (!desktopRuntimeDetected) {
      updateDesktopUpdaterDiagnostics('not_desktop_runtime', 'desktop runtime marker not detected');
      return null;
    }

    const bridgeResolution = resolveDesktopUpdaterBridge();
    if (!bridgeResolution.bridge) {
      updateDesktopUpdaterDiagnostics(bridgeResolution.state, bridgeResolution.detail);
      return null;
    }
    const bridge = bridgeResolution.bridge;

    if (typeof bridge.pingUpdater === 'function') {
      const pingResult = await bridge.pingUpdater().catch(() => null);
      const pingOk =
        typeof pingResult === 'boolean'
          ? pingResult
          : pingResult && typeof pingResult === 'object' && 'ok' in pingResult
            ? (pingResult as { ok?: boolean }).ok !== false
            : pingResult !== null;
      if (!pingOk) {
        updateDesktopUpdaterDiagnostics('invoke_unavailable', 'desktop updater probe command failed');
        return null;
      }
    }

    if (typeof bridge.getCapabilities === 'function') {
      const capabilities = await bridge.getCapabilities().catch(() => null);
      if (capabilities && capabilities.inAppUpdate === false) {
        updateDesktopUpdaterDiagnostics('capability_disabled', 'bridge capability inAppUpdate=false');
        return null;
      }
    }

    const currentVersion = String(await bridge.getCurrentVersion().catch(() => '')).trim();
    if (!currentVersion) {
      updateDesktopUpdaterDiagnostics('version_unavailable', 'desktop bridge returned an empty version');
      return null;
    }

    const prepareRes = await fetch('/api/client/update/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentVersion,
        platform: DESKTOP_UPDATE_PLATFORM,
        channel: 'stable',
      }),
    }).catch(() => null);
    if (!prepareRes?.ok) {
      console.warn('[desktop-updater] prepare_failed', {
        status: prepareRes?.status ?? 'network',
      });
      updateDesktopUpdaterDiagnostics('prepare_failed', `prepare endpoint failed (status ${prepareRes?.status ?? 'network'})`);
      return null;
    }

    const prepare = (await prepareRes.json().catch(() => null)) as ClientUpdatePrepareResponse | null;
    if (!prepare?.updateAvailable || !prepare.targetVersion || !prepare.manifestUrl) {
      if (prepare?.targetVersion) {
        setDesktopUpdateNotifiedVersion(prepare.targetVersion);
      }
      console.info('[desktop-updater] prepare_success', {
        updateAvailable: false,
        targetVersion: prepare?.targetVersion ?? null,
      });
      updateDesktopUpdaterDiagnostics('ready', 'in-app updater ready (no newer version for current client)');
      return null;
    }
    setDesktopUpdateNotifiedVersion(prepare.targetVersion);
    console.info('[desktop-updater] prepare_success', {
      updateAvailable: true,
      targetVersion: prepare.targetVersion,
    });
    updateDesktopUpdaterDiagnostics('ready', 'in-app updater ready');
    return prepare;
  }, [desktopRuntimeDetected, updateDesktopUpdaterDiagnostics, user]);

  const handleDesktopRestartNow = useCallback(async () => {
    clearDesktopUpdateRestartTimer();
    setDesktopUpdateRestartCountdown(null);
    const bridge = getDesktopUpdaterBridge();
    if (!bridge) {
      setDesktopUpdatePillState('failed');
      setDesktopUpdateProgressPhase('failed');
      setDesktopUpdateErrorMessage(t.appChrome.desktopUpdateBridgeUnavailable);
      setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateBridgeUnavailable);
      setDesktopUpdateProgressOpen(true);
      return;
    }
    await bridge.restartApp().catch(() => {
      toast.error(t.appChrome.desktopUpdateRestartFailed);
    });
  }, [clearDesktopUpdateRestartTimer, t.appChrome.desktopUpdateBridgeUnavailable, t.appChrome.desktopUpdateRestartFailed]);

  const startDesktopAutoRestartCountdown = useCallback(() => {
    clearDesktopUpdateRestartTimer();
    setDesktopUpdateRestartCountdown(DESKTOP_UPDATE_RESTART_SECONDS);
    desktopUpdateRestartTimerRef.current = window.setInterval(() => {
      setDesktopUpdateRestartCountdown((prev) => {
        if (prev == null) return null;
        if (prev <= 1) {
          clearDesktopUpdateRestartTimer();
          void handleDesktopRestartNow();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearDesktopUpdateRestartTimer, handleDesktopRestartNow]);

  const markDesktopUpdateFailure = useCallback(
    (reason: string) => {
      clearDesktopUpdateRestartTimer();
      setDesktopUpdateRestartCountdown(null);
      setDesktopUpdatePillState('failed');
      setDesktopUpdateProgressPhase('failed');
      setDesktopUpdateProgressPercent(0);
      setDesktopUpdateErrorMessage(reason);
      setDesktopUpdateProgressMessage(reason);
      setDesktopUpdateProgressOpen(true);
      toast.error(t.appChrome.desktopUpdateInstallFailedTitle, {
        description: interpolate(t.appChrome.desktopUpdateInstallFailedBody, { reason: reason || '-' }),
      });
    },
    [clearDesktopUpdateRestartTimer, t.appChrome.desktopUpdateInstallFailedBody, t.appChrome.desktopUpdateInstallFailedTitle]
  );

  const installDesktopUpdate = useCallback(
    async (prepareInput?: ClientUpdatePrepareResponse | null) => {
      const bridge = getDesktopUpdaterBridge();
      if (!bridge) {
        markDesktopUpdateFailure(t.appChrome.desktopUpdateBridgeUnavailable);
        return;
      }
      if (desktopUpdateInstallBusyRef.current) return;

      desktopUpdateInstallBusyRef.current = true;
      setDesktopUpdateBusy(true);
      setDesktopUpdateConfirmOpen(false);
      setDesktopUpdateProgressOpen(true);
      setDesktopUpdateProgressPhase('checking');
      setDesktopUpdateProgressPercent(5);
      setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateProgressChecking);
      setDesktopUpdateErrorMessage('');
      setDesktopUpdateCanCancelInstall(typeof bridge.cancelInstall === 'function');
      setDesktopUpdatePillState('downloading');
      clearDesktopUpdateRestartTimer();
      setDesktopUpdateRestartCountdown(null);

      try {
        let prepare = prepareInput;
        if (!prepare?.manifestUrl || !prepare?.targetVersion) {
          prepare = await requestDesktopUpdatePrepare();
        }
        if (!prepare?.manifestUrl || !prepare?.targetVersion) {
          throw new Error(t.appChrome.desktopUpdatePrepareFailed);
        }

        desktopUpdateManifestUrlRef.current = String(prepare.manifestUrl ?? '').trim();
        setDesktopUpdatePrepare(prepare);
        setDesktopUpdateTargetVersion(prepare.targetVersion);

        const manifestRes = await fetch(prepare.manifestUrl, { cache: 'no-store' });
        if (!manifestRes.ok) {
          throw new Error(`Failed to load update manifest (${manifestRes.status})`);
        }
        const manifestPayload = await manifestRes.json().catch(() => null);
        const platformNode =
          manifestPayload?.platforms?.[DESKTOP_UPDATE_PLATFORM] ??
          manifestPayload?.platforms?.['windows-x86_64'] ??
          null;
        const artifactUrl = String(platformNode?.url ?? '').trim();
        if (!artifactUrl) {
          throw new Error(t.appChrome.desktopUpdateArtifactMissing);
        }

        setDesktopUpdateProgressPhase('downloading');
        setDesktopUpdateProgressPercent(20);
        setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateProgressDownloading);

        const installResult = await bridge.installUpdate({
          manifestUrl: prepare.manifestUrl,
          artifactUrl,
          targetVersion: prepare.targetVersion || null,
        });
        const installStarted =
          typeof installResult === 'boolean'
            ? installResult
            : typeof installResult === 'object' && installResult !== null
              ? (installResult as { started?: boolean }).started !== false
              : true;
        if (!installStarted) {
          throw new Error(t.appChrome.desktopUpdateInstallNotStarted);
        }

        if (typeof bridge.getInstallStatus === 'function') {
          const deadline = Date.now() + 15 * 60_000;
          while (Date.now() < deadline) {
            const statusPayload = await bridge.getInstallStatus().catch(() => null);
            const resolved = resolveInstallPhase(statusPayload);
            if (resolved.progress != null) {
              setDesktopUpdateProgressPercent(resolved.progress);
            }
            if (resolved.message) {
              setDesktopUpdateProgressMessage(resolved.message);
            }
            if (resolved.phase === 'failed') {
              throw new Error(resolved.message || t.appChrome.desktopUpdateInstallFailedUnknown);
            }
            if (resolved.phase === 'ready_to_restart') {
              break;
            }
            if (resolved.phase === 'downloading') {
              setDesktopUpdatePillState('downloading');
              setDesktopUpdateProgressPhase('downloading');
              if (!resolved.message) {
                setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateProgressDownloading);
              }
            } else {
              setDesktopUpdatePillState('installing');
              setDesktopUpdateProgressPhase('installing');
              if (resolved.progress == null) {
                setDesktopUpdateProgressPercent((prev) => Math.max(prev, 60));
              }
              if (!resolved.message) {
                setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateProgressInstalling);
              }
            }
            await new Promise((resolve) => window.setTimeout(resolve, 900));
          }
        } else {
          setDesktopUpdatePillState('installing');
          setDesktopUpdateProgressPhase('installing');
          setDesktopUpdateProgressPercent(85);
          setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateProgressInstalling);
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }

        setDesktopUpdatePillState('ready_to_restart');
        setDesktopUpdateProgressPhase('ready_to_restart');
        setDesktopUpdateProgressPercent(100);
        setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateInstallReadyBody);
        toast.success(t.appChrome.desktopUpdateInstallReadyTitle, {
          description: t.appChrome.desktopUpdateInstallReadyBody,
        });
        startDesktopAutoRestartCountdown();
      } catch (error) {
        const reason = String((error as any)?.message ?? error).trim() || t.appChrome.desktopUpdateInstallFailedUnknown;
        markDesktopUpdateFailure(reason);
      } finally {
        desktopUpdateInstallBusyRef.current = false;
        setDesktopUpdateBusy(false);
      }
    },
    [
      clearDesktopUpdateRestartTimer,
      markDesktopUpdateFailure,
      requestDesktopUpdatePrepare,
      startDesktopAutoRestartCountdown,
      t.appChrome.desktopUpdateArtifactMissing,
      t.appChrome.desktopUpdateBridgeUnavailable,
      t.appChrome.desktopUpdateInstallFailedUnknown,
      t.appChrome.desktopUpdateInstallNotStarted,
      t.appChrome.desktopUpdateInstallReadyBody,
      t.appChrome.desktopUpdateInstallReadyTitle,
      t.appChrome.desktopUpdatePrepareFailed,
      t.appChrome.desktopUpdateProgressChecking,
      t.appChrome.desktopUpdateProgressDownloading,
      t.appChrome.desktopUpdateProgressInstalling,
    ]
  );

  const checkDesktopInAppUpdate = useCallback(
    async (opts?: { forcePrompt?: boolean }) => {
      if (!user) {
        if (desktopUpdatePillState !== 'ready_to_restart') {
          setDesktopUpdatePillState('hidden');
        }
        return false;
      }

      const prepare = await requestDesktopUpdatePrepare();
      if (!prepare) {
        if (
          desktopUpdatePillState !== 'ready_to_restart' &&
          desktopUpdatePillState !== 'downloading' &&
          desktopUpdatePillState !== 'installing'
        ) {
          setDesktopUpdatePillState('hidden');
          setDesktopUpdateTargetVersion('');
          setDesktopUpdatePrepare(null);
        }
        return false;
      }

      desktopUpdateManifestUrlRef.current = String(prepare.manifestUrl ?? '').trim();
      setDesktopUpdateTargetVersion(prepare.targetVersion);
      setDesktopUpdatePrepare(prepare);
      if (
        desktopUpdatePillState !== 'ready_to_restart' &&
        desktopUpdatePillState !== 'downloading' &&
        desktopUpdatePillState !== 'installing'
      ) {
        setDesktopUpdatePillState('available');
      }
      if (
        !opts?.forcePrompt &&
        desktopUpdatePromptedVersionRef.current &&
        desktopUpdatePromptedVersionRef.current === prepare.targetVersion
      ) {
        return true;
      }
      desktopUpdatePromptedVersionRef.current = prepare.targetVersion;

      toast.message(
        interpolate(t.appChrome.desktopUpdateAvailableTitle, {
          version: prepare.targetVersion,
        }),
        {
          description: prepare.notes || t.appChrome.desktopUpdateAvailableBody,
          action: {
            label: t.appChrome.desktopUpdateNow,
            onClick: () => {
              setDesktopUpdateConfirmOpen(true);
              setDesktopUpdatePillState('confirming');
            },
          },
          cancel: {
            label: t.appChrome.desktopUpdateLater,
            onClick: () => {},
          },
        }
      );
      return true;
    },
    [desktopUpdatePillState, requestDesktopUpdatePrepare, t.appChrome, user]
  );

  const handleDesktopUpdatePillClick = useCallback(async () => {
    const bridge = getDesktopUpdaterBridge();
    if (!bridge) {
      setDesktopUpdatePillState('hidden');
      return;
    }

    if (desktopUpdatePillState === 'ready_to_restart') {
      setDesktopUpdateProgressOpen(true);
      return;
    }
    if (desktopUpdatePillState === 'downloading' || desktopUpdatePillState === 'installing') {
      setDesktopUpdateProgressOpen(true);
      return;
    }
    if (desktopUpdatePillState !== 'available' && desktopUpdatePillState !== 'failed') return;

    if (!desktopUpdatePrepare) {
      const available = await checkDesktopInAppUpdate({ forcePrompt: true });
      if (!available) {
        setDesktopUpdatePillState('failed');
        setDesktopUpdateErrorMessage(t.appChrome.desktopUpdatePrepareFailed);
        setDesktopUpdateProgressPhase('failed');
        setDesktopUpdateProgressMessage(t.appChrome.desktopUpdatePrepareFailed);
        setDesktopUpdateProgressOpen(true);
      }
      if (available) {
        setDesktopUpdateConfirmOpen(true);
        setDesktopUpdatePillState('confirming');
      }
      return;
    }
    setDesktopUpdateConfirmOpen(true);
    setDesktopUpdatePillState('confirming');
  }, [checkDesktopInAppUpdate, desktopUpdatePillState, desktopUpdatePrepare, t.appChrome.desktopUpdatePrepareFailed]);

  const handleDesktopUpdateConfirmOpenChange = useCallback(
    (open: boolean) => {
      setDesktopUpdateConfirmOpen(open);
      if (!open && desktopUpdatePillState === 'confirming') {
        setDesktopUpdatePillState('available');
      }
    },
    [desktopUpdatePillState]
  );

  const handleDesktopUpdateConfirm = useCallback(() => {
    setDesktopUpdateConfirmOpen(false);
    void installDesktopUpdate(desktopUpdatePrepare);
  }, [desktopUpdatePrepare, installDesktopUpdate]);

  const handleDesktopUpdateCancelInstall = useCallback(async () => {
    const bridge = getDesktopUpdaterBridge();
    if (!bridge || typeof bridge.cancelInstall !== 'function') return;
    await bridge.cancelInstall().catch(() => null);
    markDesktopUpdateFailure(t.appChrome.desktopUpdateInstallCancelled);
  }, [markDesktopUpdateFailure, t.appChrome.desktopUpdateInstallCancelled]);

  const handleDesktopUpdateRetry = useCallback(() => {
    void installDesktopUpdate(desktopUpdatePrepare);
  }, [desktopUpdatePrepare, installDesktopUpdate]);

  const handleDesktopUpdateProgressOpenChange = useCallback(
    (open: boolean) => {
      if (
        !open &&
        (desktopUpdatePillState === 'confirming' || desktopUpdatePillState === 'downloading' || desktopUpdatePillState === 'installing')
      ) {
        return;
      }
      setDesktopUpdateProgressOpen(open);
    },
    [desktopUpdatePillState]
  );

  const handleDesktopUpdateCancelAutoRestart = useCallback(() => {
    clearDesktopUpdateRestartTimer();
    setDesktopUpdateRestartCountdown(null);
  }, [clearDesktopUpdateRestartTimer]);

  const handleDesktopUpdateOpenDownloads = useCallback(() => {
    navigate('/downloads');
  }, [navigate]);

  useEffect(() => {
    return () => {
      clearDesktopUpdateRestartTimer();
    };
  }, [clearDesktopUpdateRestartTimer]);

  useEffect(() => {
    if (!notificationsOpen) return;
    fetchNotifications(notificationsFilter);
  }, [fetchNotifications, notificationsFilter, notificationsOpen]);

  useEffect(() => {
    let timerId: number | undefined;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      await fetchUnreadCount();
      if (notificationsOpen) {
        await fetchNotifications(notificationsFilter);
      }
    };

    void tick();
    timerId = window.setInterval(tick, 20_000);

    return () => {
      if (timerId) window.clearInterval(timerId);
    };
  }, [fetchNotifications, fetchUnreadCount, notificationsFilter, notificationsOpen]);

  const syncClientUpdateNotification = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications/client-update/sync', { method: 'POST' });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      const syncVersion = String(data?.targetVersion ?? data?.version ?? '').trim();
      if (syncVersion) {
        setDesktopUpdateNotifiedVersion(syncVersion);
      }
      if (desktopRuntimeDetected) {
        const forcePrompt = data?.createdForCurrentUser === true;
        await checkDesktopInAppUpdate({ forcePrompt });
      }
      await fetchUnreadCount();
      if (notificationsOpen) {
        await fetchNotifications(notificationsFilter);
      }
    } catch {
      // ignore transient sync errors
    }
  }, [checkDesktopInAppUpdate, desktopRuntimeDetected, fetchNotifications, fetchUnreadCount, notificationsFilter, notificationsOpen, user]);

  useEffect(() => {
    if (!user) return;

    let timerId: number | undefined;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      await syncClientUpdateNotification();
    };

    void tick();
    timerId = window.setInterval(tick, 10 * 60_000);

    return () => {
      if (timerId) window.clearInterval(timerId);
    };
  }, [syncClientUpdateNotification, user]);

  useEffect(() => {
    if (!user) return;
    if (!desktopRuntimeDetected) return;

    let timerId: number | undefined;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        await checkDesktopInAppUpdate();
      } catch {
        // Best effort only; do not interrupt user flow.
      }
    };

    void tick();
    timerId = window.setInterval(tick, 6 * 60 * 60 * 1000);

    return () => {
      if (timerId) window.clearInterval(timerId);
    };
  }, [checkDesktopInAppUpdate, desktopRuntimeDetected, user]);

  useEffect(() => {
    if (user) return;
    clearDesktopUpdateRestartTimer();
    setDesktopUpdatePillState('hidden');
    setDesktopUpdateTargetVersion('');
    setDesktopUpdatePrepare(null);
    setDesktopUpdateConfirmOpen(false);
    setDesktopUpdateProgressOpen(false);
    setDesktopUpdateRestartCountdown(null);
    setDesktopUpdateBusy(false);
    setDesktopUpdateErrorMessage('');
    setDesktopUpdateNotifiedVersion('');
    setDesktopUpdaterDiagnostics({ state: 'unknown', detail: '' });
  }, [clearDesktopUpdateRestartTimer, user]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshRequests(), refreshShellStatus()]);
      toast.success(t.appChrome.dataRefreshed);
    } catch {
      toast.error(t.appChrome.refreshFailed);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' });
      if (!res.ok) return;
      setNotifications((prev) => prev.filter((item) => (notificationsFilter === 'unread' ? item.id !== notificationId : true)).map((item) => (
        item.id === notificationId ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() } : item
      )));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // no-op
    }
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true);
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) return;
      setUnreadCount(0);
      setNotifications((prev) => (notificationsFilter === 'unread' ? [] : prev.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() }))));
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const handleOpenNotification = async (item: AppNotification) => {
    if (!item.isRead) {
      await handleMarkRead(item.id);
    }
    const actionPath = typeof item.payload?.actionPath === 'string' ? item.payload.actionPath : '';
    if (item.type === 'client_update_available') {
      const available = await checkDesktopInAppUpdate({ forcePrompt: true });
      if (available) {
        setDesktopUpdateConfirmOpen(true);
        setDesktopUpdatePillState((prev) => (prev === 'available' ? 'confirming' : prev));
      }
      setNotificationsOpen(false);
      return;
    }
    if (actionPath.startsWith('/contract-approvals')) {
      navigate(actionPath);
      setNotificationsOpen(false);
      return;
    }
    if (item.requestId) {
      navigate(`/requests/${item.requestId}`);
      setNotificationsOpen(false);
      return;
    }
    if (actionPath) {
      navigate(actionPath);
      setNotificationsOpen(false);
    }
  };

  const desktopUpdatePillVisible = desktopUpdatePillState !== 'hidden';
  const desktopUpdaterStateLabel =
    desktopUpdaterDiagnostics.state === 'ready'
      ? t.appChrome.desktopUpdateBridgeStateReady
      : desktopUpdaterDiagnostics.state === 'not_desktop_runtime'
        ? t.appChrome.desktopUpdateBridgeStateNotDesktop
        : desktopUpdaterDiagnostics.state === 'invoke_unavailable'
          ? t.appChrome.desktopUpdateBridgeStateInvokeUnavailable
        : desktopUpdaterDiagnostics.state === 'bridge_missing'
          ? t.appChrome.desktopUpdateBridgeStateMissing
          : desktopUpdaterDiagnostics.state === 'bridge_incomplete'
            ? t.appChrome.desktopUpdateBridgeStateIncomplete
            : desktopUpdaterDiagnostics.state === 'capability_disabled'
              ? t.appChrome.desktopUpdateBridgeStateCapabilityDisabled
              : desktopUpdaterDiagnostics.state === 'version_unavailable'
                ? t.appChrome.desktopUpdateBridgeStateVersionUnavailable
                : desktopUpdaterDiagnostics.state === 'prepare_failed'
                  ? t.appChrome.desktopUpdateBridgeStatePrepareFailed
                  : t.appChrome.desktopUpdateBridgeStateUnknown;
  const desktopUpdateUnavailableVisible =
    desktopRuntimeDetected &&
    !desktopUpdatePillVisible &&
    Boolean(desktopUpdateNotifiedVersion) &&
    desktopUpdaterDiagnostics.state !== 'ready';
  const desktopUpdateUnavailableTitle = interpolate(t.appChrome.desktopUpdateUnavailableTitle, {
    version: desktopUpdateNotifiedVersion || '-',
    state: desktopUpdaterStateLabel,
  });
  const desktopUpdaterStateDetail = desktopUpdaterDiagnostics.detail || t.appChrome.desktopUpdateBridgeStateDetailFallback;
  const desktopUpdatePillLabel =
    desktopUpdatePillState === 'downloading' || desktopUpdatePillState === 'installing'
      ? t.appChrome.desktopUpdatePillUpdating
      : desktopUpdatePillState === 'ready_to_restart'
        ? t.appChrome.desktopUpdatePillRestart
        : t.appChrome.desktopUpdatePillUpdate;
  const desktopUpdatePillTitle = interpolate(t.appChrome.desktopUpdatePillTitle, {
    version: desktopUpdateTargetVersion || '-',
  });

  return (
    <>
      <div
        className="hidden md:grid fixed top-0 left-0 right-0 z-50 h-14 px-4 border-b backdrop-blur shadow-sm items-center gap-3 whitespace-nowrap grid-cols-[minmax(0,1fr)_minmax(220px,420px)_auto]"
        style={{
          backgroundColor: 'hsl(var(--shell-surface) / 0.96)',
          borderColor: 'hsl(var(--shell-border))',
        }}
      >
        <div className="min-w-0 flex items-center gap-3 overflow-hidden">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? t.appChrome.expandSidebar : t.appChrome.collapseSidebar}
            title={sidebarCollapsed ? t.appChrome.expandSidebar : t.appChrome.collapseSidebar}
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
          <img src="/monroc-favicon.png?v=5" alt="ROC" className="h-9 w-9 object-contain shrink-0" />
          <div className="min-w-0 flex items-center gap-1 text-sm text-muted-foreground overflow-hidden">
            {context.breadcrumb.map((crumb, index) => (
              <React.Fragment key={`${crumb.label}-${index}`}>
                {crumb.to && index < context.breadcrumb.length - 1 ? (
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors truncate max-w-[110px] lg:max-w-[150px]"
                    onClick={() => navigate(crumb.to as string)}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    className={cn(
                      'truncate max-w-[110px] lg:max-w-[150px]',
                      index === context.breadcrumb.length - 1 && 'text-foreground font-medium'
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
                {index < context.breadcrumb.length - 1 ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : null}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="min-w-0 justify-self-end w-full">
          <div className="relative w-full min-w-[220px] max-w-[360px] transition-[max-width] duration-200 ease-out focus-within:max-w-[420px]">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              ref={searchInputRef}
              value={globalSearchQuery}
              onChange={(event) => setGlobalSearchQuery(event.target.value)}
              placeholder={t.appChrome.searchRecordsPlaceholder}
              className="h-8 pl-9 pr-20"
            />
            <button
              type="button"
              onClick={() => {
                setPaletteQuery(globalSearchQuery);
                setCommandPaletteOpen(true);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Command className="h-3 w-3" />
              K
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {desktopUpdateUnavailableVisible ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs font-semibold border-amber-500/40 text-amber-600 bg-amber-500/10 hover:bg-amber-500/15"
              onClick={() => setNotificationsOpen(true)}
              title={desktopUpdateUnavailableTitle}
              aria-label={desktopUpdateUnavailableTitle}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{t.appChrome.desktopUpdateUnavailableIndicator}</span>
            </Button>
          ) : null}
          {desktopUpdatePillVisible ? (
            <Button
              type="button"
              size="sm"
              className={cn(
                'h-8 rounded-full px-3.5 text-xs font-semibold text-white shadow-[0_0_10px_hsl(210_100%_60%/0.35)] transition-all',
                'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 hover:shadow-[0_0_16px_hsl(210_100%_60%/0.5)]',
                'focus-visible:ring-blue-400/80',
                (desktopUpdatePillState === 'downloading' || desktopUpdatePillState === 'installing') && 'cursor-wait'
              )}
              onClick={() => {
                void handleDesktopUpdatePillClick();
              }}
              disabled={desktopUpdatePillState === 'confirming' || desktopUpdateBusy}
              aria-live="polite"
              aria-label={desktopUpdatePillTitle}
              title={desktopUpdatePillTitle}
            >
              {desktopUpdatePillState === 'downloading' || desktopUpdatePillState === 'installing' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              <span>{desktopUpdatePillLabel}</span>
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label={t.common.refresh}
            title={t.common.refresh}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setNotificationsOpen(true)}
            aria-label={t.appChrome.notifications}
            title={t.appChrome.notifications}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-4 text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </Button>
          <UserHubMenu
            trigger={
              <Button variant="outline" className="h-8 max-w-[220px] gap-2 px-1.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[11px] font-semibold text-primary">
                  {(user?.name || t.appChrome.userLabel).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 truncate text-xs font-medium">{user?.name || t.appChrome.userLabel}</span>
                {user ? (
                  <span className="hidden sm:inline-flex rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t.roles[user.role]}
                  </span>
                ) : null}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            }
          />
        </div>
      </div>

      <div
        className="hidden md:flex fixed bottom-0 left-0 right-0 z-50 h-8 px-4 border-t backdrop-blur items-center justify-between text-[11px] text-muted-foreground"
        style={{
          backgroundColor: 'hsl(var(--shell-surface) / 0.96)',
          borderColor: 'hsl(var(--shell-border))',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate">{t.appChrome.dbLabel}: {shellStatus?.db?.healthLabel ?? '--'}</span>
          <span className="truncate">{t.appChrome.syncLabel}: {syncState === 'refreshing' ? t.appChrome.syncRefreshing : syncState === 'error' ? t.appChrome.syncError : t.appChrome.syncReady}</span>
          <span className="truncate">{t.appChrome.lastRefreshLabel}: {formatTimeShort(lastSyncAt)}</span>
        </div>
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate">
            {saveState.kind === 'saving'
              ? t.common.saving
              : saveState.kind === 'saved'
                ? `${t.appChrome.savedLabel} ${formatTimeShort(saveState.at)}`
                : saveState.kind === 'error'
                  ? t.appChrome.saveError
                  : t.appChrome.idle}
          </span>
          <span className="truncate">{t.appChrome.userLabel}: {user?.name ?? '--'}</span>
          <span className="truncate">{t.appChrome.buildLabel}: {shellStatus?.build?.hash ? shellStatus.build.hash.slice(0, 8) : '--'}</span>
          {syncError ? <span className="text-red-600 truncate">{t.appChrome.syncError}</span> : null}
          {shellStatusError ? <span className="text-red-600 truncate">{t.appChrome.statusError}</span> : null}
        </div>
      </div>

      <DesktopUpdateConfirmDialog
        open={desktopUpdateConfirmOpen}
        onOpenChange={handleDesktopUpdateConfirmOpenChange}
        targetVersion={desktopUpdateTargetVersion}
        notes={desktopUpdatePrepare?.notes ?? null}
        isSubmitting={desktopUpdateBusy}
        onConfirm={handleDesktopUpdateConfirm}
      />

      <DesktopUpdateProgressDialog
        open={desktopUpdateProgressOpen}
        onOpenChange={handleDesktopUpdateProgressOpenChange}
        phase={desktopUpdateProgressPhase}
        progressPercent={desktopUpdateProgressPercent}
        message={desktopUpdateProgressMessage}
        errorMessage={desktopUpdateErrorMessage}
        canCancelInstall={desktopUpdateCanCancelInstall}
        restartCountdown={desktopUpdateRestartCountdown}
        onCancelInstall={() => {
          void handleDesktopUpdateCancelInstall();
        }}
        onRetry={handleDesktopUpdateRetry}
        onRestartNow={() => {
          void handleDesktopRestartNow();
        }}
        onCancelAutoRestart={handleDesktopUpdateCancelAutoRestart}
        onOpenDownloads={handleDesktopUpdateOpenDownloads}
      />

      <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
        <DialogContent hideCloseButton className="max-w-2xl p-0 gap-0">
          <DialogTitle className="sr-only">{t.appChrome.commandPaletteTitle}</DialogTitle>
          <div className="border-b border-border p-3">
            <Input
              value={paletteQuery}
              onChange={(event) => {
                const value = event.target.value;
                setPaletteQuery(value);
                setGlobalSearchQuery(value);
              }}
              placeholder={t.appChrome.commandPalettePlaceholder}
              className="h-10"
              autoFocus
            />
          </div>
          <div className="max-h-[70vh] overflow-y-auto scrollbar-thin p-2 space-y-2">
            <div>
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">{t.appChrome.navigation}</div>
              <div className="space-y-1">
                {navigationCommands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={() => {
                      setCommandPaletteOpen(false);
                      navigate(command.path);
                    }}
                    className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent text-left"
                  >
                    <command.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{command.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">{t.appChrome.requests}</div>
              {isSearchLoading ? (
                <div className="px-2 py-2 text-sm text-muted-foreground">{t.appChrome.searching}</div>
              ) : filteredPaletteRequests.length ? (
                <div className="space-y-1">
                  {filteredPaletteRequests.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCommandPaletteOpen(false);
                        navigate(`/requests/${item.id}`);
                      }}
                      className="w-full rounded px-2 py-2 text-left hover:bg-accent"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{item.id}</span>
                        <span className="text-xs text-muted-foreground">{item.status}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.clientName} - {item.country}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-2 py-2 text-sm text-muted-foreground">{t.appChrome.noMatchingRequests}</div>
              )}
            </div>

            <div>
              <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">{t.appChrome.utilities}</div>
              <div className="space-y-1">
                {utilityCommands.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    onClick={async () => {
                      await command.run();
                      setCommandPaletteOpen(false);
                    }}
                    className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-accent text-left"
                  >
                    <span>{command.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            <span>{t.appChrome.commandPaletteHint}</span>
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(false)}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <X className="h-3 w-3" />
              {t.common.close}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0">
          <div className="h-full flex flex-col">
            <SheetHeader className="px-4 py-3 border-b border-border">
              <div className="flex items-center justify-between gap-2">
                <SheetTitle className="text-base">{t.appChrome.notifications}</SheetTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{unreadCount} {t.appChrome.unread}</span>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleMarkAllRead} disabled={isMarkingAllRead || unreadCount === 0}>
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    {t.appChrome.markAllRead}
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <Button
                variant={notificationsFilter === 'unread' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setNotificationsFilter('unread')}
              >
                {t.appChrome.unreadTab}
              </Button>
              <Button
                variant={notificationsFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setNotificationsFilter('all')}
              >
                {t.appChrome.allTab}
              </Button>
            </div>

            {desktopRuntimeDetected ? (
              <div className="px-3 py-2 border-b border-border bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t.appChrome.desktopUpdateBridgeStateLabel}
                  </span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      desktopUpdaterDiagnostics.state === 'ready' ? 'text-emerald-600' : 'text-amber-600'
                    )}
                  >
                    {desktopUpdaterStateLabel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {desktopUpdaterStateDetail}
                </p>
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
              {notificationsLoading ? <div className="p-3 text-sm text-muted-foreground">{t.appChrome.loadingNotifications}</div> : null}
              {notificationsError ? <div className="p-3 text-sm text-red-600">{t.appChrome.failedLoadNotifications}</div> : null}
              {!notificationsLoading && !notificationsError && notificationItems.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">{t.appChrome.noNotifications}</div>
              ) : null}
              <div className="space-y-2">
                {notificationItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-md border p-2 transition-colors',
                      item.isRead ? 'border-border bg-background' : 'border-primary/30 bg-primary/5'
                    )}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => void handleOpenNotification(item)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{item.display.title}</p>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatNotificationTime(item.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{item.display.body}</p>
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                      {!item.isRead ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => void handleMarkRead(item.id)}
                        >
                          {t.appChrome.markRead}
                        </Button>
                      ) : null}
                      {item.requestId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            navigate(`/requests/${item.requestId}`);
                            setNotificationsOpen(false);
                          }}
                        >
                          {t.appChrome.openRequest}
                        </Button>
                      ) : null}
                      {!item.requestId && typeof item.payload?.actionPath === 'string' && item.payload.actionPath ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            navigate(item.payload?.actionPath as string);
                            setNotificationsOpen(false);
                          }}
                        >
                          {String(item.payload?.actionPath).startsWith('/downloads')
                            ? t.downloads.openDownloads
                            : String(item.payload?.actionPath).startsWith('/contract-approvals')
                              ? t.appChrome.openContract
                              : String(item.payload?.actionPath).includes('tab=feedback')
                                ? t.appChrome.openFeedback
                                : t.appChrome.openItem}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default DesktopAppChrome;
