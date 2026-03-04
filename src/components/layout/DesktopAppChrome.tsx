import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
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
  installUpdate: (payload?: Record<string, any>) => Promise<{ started: boolean } | boolean | void>;
  restartApp: () => Promise<void>;
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

const DESKTOP_UPDATE_PLATFORM = 'windows-x86_64';

const getDesktopUpdaterBridge = (): DesktopUpdaterBridge | null => {
  const bridge = (window as any)?.__CRA_DESKTOP_UPDATER__;
  if (!bridge) return null;
  if (typeof bridge.getCurrentVersion !== 'function') return null;
  if (typeof bridge.installUpdate !== 'function') return null;
  if (typeof bridge.restartApp !== 'function') return null;
  return bridge as DesktopUpdaterBridge;
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
  const desktopUpdatePromptedVersionRef = useRef<string>('');
  const desktopUpdateManifestUrlRef = useRef<string>('');
  const desktopUpdateInstallBusyRef = useRef(false);
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

  const installDesktopUpdate = useCallback(
    async (prepare: ClientUpdatePrepareResponse) => {
      const bridge = getDesktopUpdaterBridge();
      if (!bridge) {
        navigate('/downloads');
        return;
      }
      const manifestUrl = String(prepare?.manifestUrl ?? desktopUpdateManifestUrlRef.current ?? '').trim();
      if (!manifestUrl) {
        toast.error(t.appChrome.desktopUpdateManifestMissing);
        navigate('/downloads');
        return;
      }
      if (desktopUpdateInstallBusyRef.current) return;
      desktopUpdateInstallBusyRef.current = true;
      try {
        const manifestRes = await fetch(manifestUrl, { cache: 'no-store' });
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
        await bridge.installUpdate({
          manifestUrl,
          artifactUrl,
          targetVersion: prepare?.targetVersion || null,
        });
        toast.success(t.appChrome.desktopUpdateInstallReadyTitle, {
          description: t.appChrome.desktopUpdateInstallReadyBody,
          action: {
            label: t.appChrome.desktopUpdateRestartNow,
            onClick: () => {
              void bridge.restartApp().catch(() => {
                toast.error(t.appChrome.desktopUpdateRestartFailed);
              });
            },
          },
        });
      } catch (error) {
        const reason = String((error as any)?.message ?? error).trim();
        toast.error(t.appChrome.desktopUpdateInstallFailedTitle, {
          description: interpolate(t.appChrome.desktopUpdateInstallFailedBody, { reason: reason || '-' }),
          action: {
            label: t.downloads.openDownloads,
            onClick: () => navigate('/downloads'),
          },
        });
      } finally {
        desktopUpdateInstallBusyRef.current = false;
      }
    },
    [navigate, t.appChrome, t.downloads.openDownloads]
  );

  const checkDesktopInAppUpdate = useCallback(
    async (opts?: { forcePrompt?: boolean }) => {
      const bridge = getDesktopUpdaterBridge();
      if (!bridge || !user) return false;

      const currentVersion = String(await bridge.getCurrentVersion().catch(() => '')).trim();
      if (!currentVersion) return false;

      const prepareRes = await fetch('/api/client/update/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentVersion,
          platform: DESKTOP_UPDATE_PLATFORM,
          channel: 'stable',
        }),
      });
      if (!prepareRes.ok) return false;

      const prepare = (await prepareRes.json().catch(() => null)) as ClientUpdatePrepareResponse | null;
      if (!prepare?.updateAvailable || !prepare.targetVersion || !prepare.manifestUrl) return false;

      desktopUpdateManifestUrlRef.current = String(prepare.manifestUrl ?? '').trim();
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
              void installDesktopUpdate(prepare);
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
    [installDesktopUpdate, t.appChrome, user]
  );

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
      if (data?.createdForCurrentUser === true) {
        const prompted = await checkDesktopInAppUpdate({ forcePrompt: true });
        if (!prompted) {
          toast.success(t.downloads.updateToastTitle, {
            description: t.downloads.updateToastDesc,
            action: {
              label: t.downloads.openDownloads,
              onClick: () => navigate('/downloads'),
            },
          });
        }
      }
      await fetchUnreadCount();
      if (notificationsOpen) {
        await fetchNotifications(notificationsFilter);
      }
    } catch {
      // ignore transient sync errors
    }
  }, [checkDesktopInAppUpdate, fetchNotifications, fetchUnreadCount, navigate, notificationsFilter, notificationsOpen, t.downloads, user]);

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
    if (!getDesktopUpdaterBridge()) return;

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
  }, [checkDesktopInAppUpdate, user]);

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
      const prompted = await checkDesktopInAppUpdate({ forcePrompt: true });
      if (!prompted) {
        navigate('/downloads');
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
