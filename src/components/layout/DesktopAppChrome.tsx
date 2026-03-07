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

type ClientUpdateSyncResponse = {
  createdForCurrentUser?: boolean;
  version?: string | null;
  targetVersion?: string | null;
  inAppReady?: boolean | null;
  updateAvailable?: boolean | null;
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
type DesktopUpdateFailureKind = 'scope_blocked' | 'transient';
type DesktopUpdaterBridgeState =
  | 'unknown'
  | 'ready'
  | 'probe_failed_soft'
  | 'warning_ipv4_host'
  | 'scope_incompatible'
  | 'not_desktop_runtime'
  | 'bridge_missing'
  | 'invoke_unavailable'
  | 'bridge_incomplete'
  | 'legacy_updater_missing_commands'
  | 'legacy_version_detected'
  | 'capability_disabled'
  | 'version_unavailable'
  | 'prepare_failed';
type DesktopUpdaterDiagnostics = {
  state: DesktopUpdaterBridgeState;
  detail: string;
};

const DESKTOP_UPDATE_PLATFORM = 'windows-x86_64';
const DESKTOP_UPDATE_UNKNOWN_VERSION_FALLBACK = '0.0.0';
const DESKTOP_UPDATE_TOAST_ID = 'desktop-update-available';
const DESKTOP_UPDATE_TOAST_DEDUP_MS = 15000;
const DESKTOP_SCOPE_RESCUE_SESSION_KEY = 'cra-desktop-scope-rescue-v1';

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

type DesktopAboutInfoResponse = {
  version?: string | null;
  currentVersion?: string | null;
  appVersion?: string | null;
  clientVersion?: string | null;
  value?: string | null;
  title?: string | null;
  app_host?: string | null;
};

type DesktopHostMetadata = {
  runtime?: string;
  bridgeVersion?: number;
  version?: string | null;
  appVersion?: string | null;
  clientVersion?: string | null;
  activeAppUrl?: string | null;
  fallbackAppUrl?: string | null;
  scopeCompatible?: boolean;
  hostCandidates?: string[];
};

const isLegacyBootstrapState = (state: DesktopUpdaterBridgeState) =>
  state === 'legacy_updater_missing_commands' || state === 'legacy_version_detected' || state === 'scope_incompatible';

let tauriIpcCallbackId = Math.floor(Date.now() % 1000000) * 2;

const invokeViaTauriIpc = (
  ipc: (message: { cmd: string; callback: number; error: number; [key: string]: any }) => void,
  command: string,
  payload: Record<string, any> = {}
) =>
  new Promise<any>((resolve, reject) => {
    tauriIpcCallbackId += 2;
    const callback = tauriIpcCallbackId;
    const error = tauriIpcCallbackId + 1;
    const callbackKey = `_${callback}`;
    const errorKey = `_${error}`;
    const cleanup = () => {
      try {
        delete (window as any)[callbackKey];
      } catch {
        // ignore cleanup failures
      }
      try {
        delete (window as any)[errorKey];
      } catch {
        // ignore cleanup failures
      }
    };

    Object.defineProperty(window, callbackKey, {
      configurable: true,
      writable: false,
      value: (result: any) => {
        cleanup();
        resolve(result);
      },
    });
    Object.defineProperty(window, errorKey, {
      configurable: true,
      writable: false,
      value: (result: any) => {
        cleanup();
        reject(result);
      },
    });

    try {
      ipc({
        cmd: command,
        callback,
        error,
        ...payload,
      });
    } catch (invokeError) {
      cleanup();
      reject(invokeError);
    }
  });

const describeDesktopInvokeProbes = (): string => {
  const tauriObj = (window as any)?.__TAURI__;
  return [
    `scripted=${typeof (window as any)?.__CRA_DESKTOP_UPDATER__ === 'object'}`,
    `tauri.invoke=${typeof tauriObj?.invoke === 'function'}`,
    `tauri.core.invoke=${typeof tauriObj?.core?.invoke === 'function'}`,
    `tauriInternals.invoke=${typeof (window as any)?.__TAURI_INTERNALS__?.invoke === 'function'}`,
    `tauriInvoke=${typeof (window as any)?.__TAURI_INVOKE__ === 'function'}`,
    `tauriIPC=${typeof (window as any)?.__TAURI_IPC__ === 'function'}`,
  ].join(', ');
};

const resolveDesktopInvoke = (): DesktopInvokeResolution => {
  const tauriObj = (window as any)?.__TAURI__;
  const invokeCandidates: Array<{
    source: string;
    run: (command: string, payload?: Record<string, any>) => Promise<any>;
  }> = [];

  if (typeof tauriObj?.invoke === 'function') {
    invokeCandidates.push({
      source: '__TAURI__.invoke',
      run: (command: string, payload: Record<string, any> = {}) => tauriObj.invoke(command, payload),
    });
  }
  if (typeof tauriObj?.core?.invoke === 'function') {
    invokeCandidates.push({
      source: '__TAURI__.core.invoke',
      run: (command: string, payload: Record<string, any> = {}) => tauriObj.core.invoke(command, payload),
    });
  }
  if (typeof (window as any)?.__TAURI_INTERNALS__?.invoke === 'function') {
    invokeCandidates.push({
      source: '__TAURI_INTERNALS__.invoke',
      run: (command: string, payload: Record<string, any> = {}) => (window as any).__TAURI_INTERNALS__.invoke(command, payload),
    });
  }
  if (typeof (window as any)?.__TAURI_INVOKE__ === 'function') {
    invokeCandidates.push({
      source: '__TAURI_INVOKE__',
      run: (command: string, payload: Record<string, any> = {}) => (window as any).__TAURI_INVOKE__(command, payload),
    });
  }
  if (typeof (window as any)?.__TAURI_IPC__ === 'function') {
    const ipc = (window as any).__TAURI_IPC__;
    invokeCandidates.push({
      source: '__TAURI_IPC__',
      run: (command: string, payload: Record<string, any> = {}) => invokeViaTauriIpc(ipc, command, payload),
    });
  }

  if (invokeCandidates.length > 0) {
    return {
      invoke: async (command: string, payload: Record<string, any> = {}) => {
        const errors: string[] = [];
        for (const candidate of invokeCandidates) {
          try {
            return await candidate.run(command, payload);
          } catch (error) {
            const detail = String((error as any)?.message ?? error).trim() || 'unknown error';
            errors.push(`${candidate.source}: ${detail}`);
          }
        }
        throw new Error(`all invoke paths failed for ${command}: ${errors.join(' | ')}`);
      },
      source: invokeCandidates.map((candidate) => candidate.source).join(' -> '),
    };
  }

  return { invoke: null, source: null };
};

const asTauriPayloadArg = (payload: Record<string, any> = {}): Record<string, any> => ({
  payload,
});

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
  const invokeResolution = resolveDesktopInvoke();
  const invokeFallback = invokeResolution.invoke;
  const probeSnapshot = describeDesktopInvokeProbes();

  if (hasScriptedBridge && scriptedBridgeComplete) {
    if (invokeFallback) {
      const scripted = scriptedBridge as DesktopUpdaterBridge;
      const resilientBridge: DesktopUpdaterBridge = {
        ...scripted,
        getCurrentVersion: async () => {
          let scriptedError = '';
          try {
            const scriptedVersion = extractDesktopVersion(await scripted.getCurrentVersion());
            if (scriptedVersion) return scriptedVersion;
          } catch (error) {
            scriptedError = String((error as any)?.message ?? error).trim();
          }

          let invokeError = '';
          try {
            const invokeVersion = extractDesktopVersion(await invokeFallback('desktop_get_current_version'));
            if (invokeVersion) return invokeVersion;
          } catch (error) {
            invokeError = String((error as any)?.message ?? error).trim();
          }

          const detailParts: string[] = [];
          detailParts.push(scriptedError ? `scripted error: ${scriptedError}` : 'scripted returned empty');
          detailParts.push(invokeError ? `invoke error: ${invokeError}` : 'invoke returned empty');
          throw new Error(`desktop_get_current_version unresolved (${detailParts.join('; ')})`);
        },
        pingUpdater: async () => {
          if (typeof scripted.pingUpdater === 'function') {
            try {
              return await scripted.pingUpdater();
            } catch {
              // continue with direct invoke fallback
            }
          }
          return await invokeFallback('desktop_ping_updater');
        },
        installUpdate: async (payload: Record<string, any> = {}) => {
          try {
            return await scripted.installUpdate(payload);
          } catch {
            return await invokeFallback('desktop_prepare_update_install', asTauriPayloadArg(payload));
          }
        },
        restartApp: async () => {
          try {
            await scripted.restartApp();
            return;
          } catch {
            await invokeFallback('desktop_apply_prepared_update');
          }
        },
      };
      return {
        bridge: resilientBridge,
        state: 'ready',
        detail: `bridge ready (__CRA_DESKTOP_UPDATER__ + ${invokeResolution.source} fallback); probes: ${probeSnapshot}`,
      };
    }
    return {
      bridge: scriptedBridge as DesktopUpdaterBridge,
      state: 'ready',
      detail: `bridge ready (__CRA_DESKTOP_UPDATER__); probes: ${probeSnapshot}`,
    };
  }

  if (!invokeFallback) {
    return {
      bridge: null,
      state: hasScriptedBridge ? 'legacy_updater_missing_commands' : 'invoke_unavailable',
      detail: hasScriptedBridge
        ? `legacy desktop updater bridge is missing required methods and invoke fallback is unavailable; probes: ${probeSnapshot}`
        : `window.__CRA_DESKTOP_UPDATER__ is missing and no tauri invoke bridge was found; probes: ${probeSnapshot}`,
    };
  }

  const fallbackBridge: DesktopUpdaterBridge = {
    getCurrentVersion: () => invokeFallback('desktop_get_current_version'),
    installUpdate: (payload: Record<string, any> = {}) =>
      invokeFallback('desktop_prepare_update_install', asTauriPayloadArg(payload)),
    restartApp: () => invokeFallback('desktop_apply_prepared_update'),
  };

  return {
    bridge: fallbackBridge,
    state: 'ready',
    detail: `bridge adapter ready (${invokeResolution.source}); probes: ${probeSnapshot}`,
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

const extractDesktopVersion = (rawValue: unknown): string => {
  if (typeof rawValue === 'string') {
    return rawValue.trim();
  }
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return String(rawValue);
  }
  if (!rawValue || typeof rawValue !== 'object') {
    return '';
  }
  const payload = rawValue as Record<string, unknown>;
  const candidates = [
    payload.version,
    payload.currentVersion,
    payload.appVersion,
    payload.clientVersion,
    payload.value,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return '';
};

const readDesktopHostVersion = (): string => extractDesktopVersion((window as any)?.__CRA_DESKTOP_HOST__);

const readDesktopHostMetadata = (): DesktopHostMetadata | null => {
  const payload = (window as any)?.__CRA_DESKTOP_HOST__;
  if (!payload || typeof payload !== 'object') return null;
  return payload as DesktopHostMetadata;
};

const isIpv4Host = (host: string): boolean => {
  const value = String(host ?? '').trim();
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
};

const isNonIpDomainHost = (host: string): boolean => {
  const normalized = String(host ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === 'tauri.localhost') {
    return false;
  }
  return !isIpv4Host(normalized);
};

const normalizeDesktopUpdateNotes = (rawValue: string | null | undefined): string => {
  const raw = String(rawValue ?? '').replace(/\r/g, '').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1: $2')
    .replace(/`([^`]+)`/g, '$1')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .reduce<string[]>((lines, line) => {
      if (!line && lines[lines.length - 1] === '') return lines;
      lines.push(line);
      return lines;
    }, [])
    .filter((line) => line !== '');
  return cleaned
    .slice(0, 6)
    .map((line) => (line.length > 160 ? `${line.slice(0, 157)}...` : line))
    .join('\n')
    .trim();
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

const isDesktopUpdateIpcScopeFailure = (reason: string) => {
  const normalized = String(reason ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('scope not defined for url') ||
    normalized.includes('dangerousremotedomainipcaccess') ||
    normalized.includes('configure_remote_access')
  );
};

const resolveDesktopUpdateFailure = (
  reason: string,
  t: any
): {
  message: string;
  autoOpenDownloads: boolean;
} => {
  if (isDesktopUpdateIpcScopeFailure(reason)) {
    return {
      message: t.appChrome.desktopUpdateIpcScopeBlocked,
      autoOpenDownloads: true,
    };
  }
  return {
    message: reason,
    autoOpenDownloads: false,
  };
};

const extractManifestPath = (rawUrl: string) => {
  const value = String(rawUrl ?? '').trim();
  if (!value) return '';
  if (value.startsWith('/api/client/update/manifest')) return value;
  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith('/api/client/update/manifest')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // ignore parse error and return empty path
  }
  return '';
};

const normalizeManifestUrlForDesktopFetch = (rawUrl: string) => {
  const value = String(rawUrl ?? '').trim();
  if (!value) return '';
  const path = extractManifestPath(value);
  if (!path) return value;
  const origin = String(window.location?.origin ?? '').trim();
  if (!origin) return path;
  return `${origin}${path}`;
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
  const desktopUpdateToastVersionRef = useRef<string>('');
  const desktopUpdateToastAtRef = useRef<number>(0);
  const desktopUpdateManifestUrlRef = useRef<string>('');
  const desktopUpdateInstallBusyRef = useRef(false);
  const desktopUpdateScopeBlockedRef = useRef(false);
  const desktopUpdateScopeToastShownRef = useRef(false);
  const [desktopUpdatePillState, setDesktopUpdatePillState] = useState<DesktopUpdatePillState>('hidden');
  const [desktopUpdateTargetVersion, setDesktopUpdateTargetVersion] = useState<string>('');
  const [desktopUpdateNotifiedVersion, setDesktopUpdateNotifiedVersion] = useState<string>('');
  const [desktopUpdateActionableVersion, setDesktopUpdateActionableVersion] = useState<string>('');
  const [desktopUpdateLegacyVersion, setDesktopUpdateLegacyVersion] = useState<string>('');
  const [desktopClientVersion, setDesktopClientVersion] = useState<string>('');
  const [desktopUpdatePrepare, setDesktopUpdatePrepare] = useState<ClientUpdatePrepareResponse | null>(null);
  const [desktopUpdateConfirmOpen, setDesktopUpdateConfirmOpen] = useState(false);
  const [desktopUpdateProgressOpen, setDesktopUpdateProgressOpen] = useState(false);
  const [desktopUpdateProgressPhase, setDesktopUpdateProgressPhase] = useState<DesktopUpdateProgressPhase>('checking');
  const [desktopUpdateProgressPercent, setDesktopUpdateProgressPercent] = useState(0);
  const [desktopUpdateProgressMessage, setDesktopUpdateProgressMessage] = useState('');
  const [desktopUpdateErrorMessage, setDesktopUpdateErrorMessage] = useState('');
  const [desktopUpdateFailureKind, setDesktopUpdateFailureKind] = useState<DesktopUpdateFailureKind>('transient');
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

  const resolveDesktopScopeRescueTarget = useCallback((): string | null => {
    if (typeof window === 'undefined') return null;
    const hostMetadata = readDesktopHostMetadata();
    const currentUrl = new URL(window.location.href);
    const currentOrigin = currentUrl.origin.toLowerCase();
    const candidateValues: string[] = [];
    const hostCandidates = Array.isArray(hostMetadata?.hostCandidates) ? hostMetadata.hostCandidates : [];
    for (const candidate of hostCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        candidateValues.push(candidate.trim());
      }
    }
    for (const candidate of [hostMetadata?.activeAppUrl, hostMetadata?.fallbackAppUrl]) {
      if (typeof candidate === 'string' && candidate.trim()) {
        candidateValues.push(candidate.trim());
      }
    }

    const seenOrigins = new Set<string>();
    for (const candidateRaw of candidateValues) {
      try {
        const parsed = new URL(candidateRaw, currentUrl.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
        const normalizedOrigin = parsed.origin.toLowerCase();
        if (normalizedOrigin === currentOrigin) continue;
        if (!isNonIpDomainHost(parsed.hostname)) continue;
        if (seenOrigins.has(normalizedOrigin)) continue;
        seenOrigins.add(normalizedOrigin);
        return `${parsed.origin}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      } catch {
        // ignore invalid host-candidate metadata
      }
    }

    return null;
  }, []);

  const tryDesktopScopeHostRescue = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const runtimeVersion = readDesktopHostVersion() || desktopClientVersion || desktopUpdateLegacyVersion || 'unknown';
    const markerKey = `${DESKTOP_SCOPE_RESCUE_SESSION_KEY}:${runtimeVersion}`;

    try {
      if (window.sessionStorage.getItem(markerKey)) {
        return false;
      }
    } catch {
      // ignore sessionStorage errors and continue with in-memory behavior
    }

    const target = resolveDesktopScopeRescueTarget();
    try {
      window.sessionStorage.setItem(markerKey, target ? `redirect:${target}` : 'exhausted');
    } catch {
      // ignore sessionStorage errors
    }

    if (!target) {
      return false;
    }

    window.location.assign(target);
    return true;
  }, [desktopClientVersion, desktopUpdateLegacyVersion, resolveDesktopScopeRescueTarget]);

  const activateDesktopUpdateBootstrapFallback = useCallback(
    (reason: string, options?: { navigateToDownloads?: boolean; allowHostRescue?: boolean }) => {
      const normalizedReason = String(reason ?? '').trim() || t.appChrome.desktopUpdateIpcScopeBlocked;
      if (options?.allowHostRescue === true && tryDesktopScopeHostRescue()) {
        return;
      }
      desktopUpdateScopeBlockedRef.current = true;
      setDesktopUpdatePrepare(null);
      setDesktopUpdateConfirmOpen(false);
      setDesktopUpdatePillState('hidden');
      setDesktopUpdateBusy(false);
      setDesktopUpdateProgressOpen(false);
      setDesktopUpdateProgressPhase('failed');
      setDesktopUpdateProgressPercent(0);
      setDesktopUpdateErrorMessage(t.appChrome.desktopUpdateIpcScopeBlocked);
      setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateIpcScopeBlocked);
      setDesktopUpdateFailureKind('scope_blocked');
      updateDesktopUpdaterDiagnostics('scope_incompatible', normalizedReason);

      if (!desktopUpdateScopeToastShownRef.current) {
        desktopUpdateScopeToastShownRef.current = true;
        toast.message(t.appChrome.desktopUpdateIpcScopeOpenDownloads, {
          description: t.appChrome.desktopUpdateIpcScopeBlocked,
        });
      }

      if (options?.navigateToDownloads !== false && !location.pathname.startsWith('/downloads')) {
        navigate('/downloads');
      }
    },
    [
      tryDesktopScopeHostRescue,
      location.pathname,
      navigate,
      t.appChrome.desktopUpdateIpcScopeBlocked,
      t.appChrome.desktopUpdateIpcScopeOpenDownloads,
      updateDesktopUpdaterDiagnostics,
    ]
  );

  const runDesktopUpdaterPreflight = useCallback(async (bridge: DesktopUpdaterBridge): Promise<{ ok: boolean; reason: string }> => {
    const normalizePing = (payload: any): boolean => {
      if (typeof payload === 'boolean') return payload;
      if (payload && typeof payload === 'object' && 'ok' in payload) {
        return (payload as { ok?: boolean }).ok !== false;
      }
      return true;
    };

    if (typeof bridge.pingUpdater === 'function') {
      try {
        const result = await bridge.pingUpdater();
        if (normalizePing(result)) {
          return { ok: true, reason: '' };
        }
        return { ok: false, reason: 'desktop_ping_updater returned not-ok result' };
      } catch (error) {
        return {
          ok: false,
          reason: String((error as any)?.message ?? error).trim() || 'desktop_ping_updater failed',
        };
      }
    }

    const invokeResolution = resolveDesktopInvoke();
    if (invokeResolution.invoke) {
      try {
        const result = await invokeResolution.invoke('desktop_ping_updater');
        if (normalizePing(result)) {
          return { ok: true, reason: '' };
        }
        return {
          ok: false,
          reason: `${invokeResolution.source ?? 'invoke'} desktop_ping_updater returned not-ok result`,
        };
      } catch (error) {
        return {
          ok: false,
          reason: String((error as any)?.message ?? error).trim() || 'desktop_ping_updater invoke failed',
        };
      }
    }

    return { ok: true, reason: '' };
  }, []);

  const hydrateDesktopVersionFromHost = useCallback((): string => {
    const hostVersion = readDesktopHostVersion();
    if (hostVersion) {
      setDesktopClientVersion((prev) => (prev ? prev : hostVersion));
    }
    return hostVersion;
  }, []);

  const requestDesktopUpdatePrepare = useCallback(async (): Promise<ClientUpdatePrepareResponse | null> => {
    if (!user) return null;
    if (!desktopRuntimeDetected) {
      updateDesktopUpdaterDiagnostics('not_desktop_runtime', 'desktop runtime marker not detected');
      return null;
    }
    if (desktopUpdateScopeBlockedRef.current) {
      updateDesktopUpdaterDiagnostics(
        'scope_incompatible',
        'in-app updater disabled for this session due to remote IPC scope mismatch; use Downloads bootstrap path'
      );
      return null;
    }
    const hostVersion = hydrateDesktopVersionFromHost();
    const hostVersionDetail = `hostVersion=${hostVersion || 'empty'}`;
    const hostMetadata = readDesktopHostMetadata();
    const ipv4HostWarning = hostMetadata?.scopeCompatible === false;
    const hostWarningDetail = ipv4HostWarning
      ? `host metadata warning: active_app_url=${String(hostMetadata?.activeAppUrl ?? '-')} scope_compatible=false`
      : '';
    const resolveReadyState = (): DesktopUpdaterBridgeState => {
      if (probeSoftFailureDetail) return 'probe_failed_soft';
      if (ipv4HostWarning) return 'warning_ipv4_host';
      return 'ready';
    };
    const withWarningDetail = (baseDetail: string): string => {
      if (hostWarningDetail && baseDetail) {
        return `${baseDetail}; ${hostWarningDetail}`;
      }
      if (hostWarningDetail) return hostWarningDetail;
      return baseDetail;
    };

    const bridgeResolution = resolveDesktopUpdaterBridge();
    if (!bridgeResolution.bridge) {
      updateDesktopUpdaterDiagnostics(bridgeResolution.state, `${bridgeResolution.detail}; ${hostVersionDetail}`);
      return null;
    }
    const bridge = bridgeResolution.bridge;
    if (typeof bridge.installUpdate !== 'function' || typeof bridge.restartApp !== 'function') {
      updateDesktopUpdaterDiagnostics(
        'bridge_incomplete',
        `desktop updater bridge missing install/restart commands; ${hostVersionDetail}`
      );
      return null;
    }

    let probeSoftFailureDetail = '';

    if (typeof bridge.pingUpdater === 'function') {
      try {
        const pingResult = await bridge.pingUpdater();
        const pingOk =
          typeof pingResult === 'boolean'
            ? pingResult
            : pingResult && typeof pingResult === 'object' && 'ok' in pingResult
              ? (pingResult as { ok?: boolean }).ok !== false
              : pingResult !== null;
        if (!pingOk) {
          const directInvoke = resolveDesktopInvoke();
          probeSoftFailureDetail = `desktop updater probe command failed via ${directInvoke.source ?? 'no invoke source'}; probes: ${describeDesktopInvokeProbes()}; ${hostVersionDetail}`;
          updateDesktopUpdaterDiagnostics('probe_failed_soft', probeSoftFailureDetail);
        }
      } catch (error) {
        const pingError = String((error as any)?.message ?? error).trim();
        if (isDesktopUpdateIpcScopeFailure(pingError)) {
          activateDesktopUpdateBootstrapFallback(`desktop updater preflight blocked by IPC scope: ${pingError}`, {
            navigateToDownloads: false,
          });
          return null;
        }
        const directInvoke = resolveDesktopInvoke();
        probeSoftFailureDetail = `desktop updater probe command failed via ${directInvoke.source ?? 'no invoke source'}; probes: ${describeDesktopInvokeProbes()}; ${hostVersionDetail}`;
        updateDesktopUpdaterDiagnostics('probe_failed_soft', probeSoftFailureDetail);
      }
    }

    if (typeof bridge.getCapabilities === 'function') {
      const capabilities = await bridge.getCapabilities().catch(() => null);
      if (capabilities && capabilities.inAppUpdate === false) {
        updateDesktopUpdaterDiagnostics('capability_disabled', `bridge capability inAppUpdate=false; ${hostVersionDetail}`);
        return null;
      }
    }

    let currentVersion = '';
    let currentVersionError = '';
    let usedUnknownVersionFallback = false;
    const versionResolutionChain: string[] = [];
    try {
      const currentVersionRaw = await bridge.getCurrentVersion();
      currentVersion = extractDesktopVersion(currentVersionRaw);
      if (currentVersion) {
        versionResolutionChain.push(`bridge.getCurrentVersion resolved (${currentVersion})`);
      } else {
        versionResolutionChain.push('bridge.getCurrentVersion returned empty');
      }
    } catch (error) {
      currentVersionError = String((error as any)?.message ?? error).trim();
      versionResolutionChain.push(`bridge.getCurrentVersion error: ${currentVersionError || 'unknown error'}`);
    }
    if (!currentVersion) {
      const invokeResolution = resolveDesktopInvoke();
      let directVersionError = '';
      const directSource = invokeResolution.source ?? 'no invoke bridge';
      if (invokeResolution.invoke) {
        try {
          const directVersionRaw = await invokeResolution.invoke('desktop_get_current_version');
          const directVersion = extractDesktopVersion(directVersionRaw);
          if (directVersion) {
            currentVersion = directVersion;
            versionResolutionChain.push(`${directSource} desktop_get_current_version resolved (${directVersion})`);
          } else {
            versionResolutionChain.push(`${directSource} desktop_get_current_version returned empty`);
          }
        } catch (error) {
          directVersionError = String((error as any)?.message ?? error).trim();
          versionResolutionChain.push(
            `${directSource} desktop_get_current_version error: ${directVersionError || 'unknown error'}`
          );
        }
      } else {
        versionResolutionChain.push('direct desktop_get_current_version unavailable (no invoke bridge)');
      }

      const combinedVersionError = [currentVersionError, directVersionError].filter(Boolean).join(' | ').trim();

      if (invokeResolution.invoke) {
        const aboutPayload = (await invokeResolution.invoke('get_about_info').catch(() => null)) as DesktopAboutInfoResponse | null;
        const legacyVersion = extractDesktopVersion(aboutPayload);
        if (legacyVersion) {
          versionResolutionChain.push(`get_about_info resolved (${legacyVersion})`);
          setDesktopUpdateLegacyVersion(legacyVersion);
          setDesktopClientVersion(legacyVersion);
          updateDesktopUpdaterDiagnostics(
            'legacy_version_detected',
            `legacy desktop client detected (version ${legacyVersion}); bootstrap update required`
          );
          return null;
        } else {
          versionResolutionChain.push('get_about_info returned empty');
        }
      }
      const hostVersion = extractDesktopVersion((window as any)?.__CRA_DESKTOP_HOST__);
      if (hostVersion) {
        currentVersion = hostVersion;
        versionResolutionChain.push(`__CRA_DESKTOP_HOST__ resolved (${hostVersion})`);
      } else {
        versionResolutionChain.push('__CRA_DESKTOP_HOST__ returned empty');
      }
      const normalizedVersionError = combinedVersionError.toLowerCase();
      const ipcAccessDenied =
        normalizedVersionError.includes('tauri api') ||
        normalizedVersionError.includes('not allowed') ||
        normalizedVersionError.includes('forbidden') ||
        normalizedVersionError.includes('ipc') ||
        normalizedVersionError.includes('remote domain');
      if (!currentVersion && combinedVersionError && ipcAccessDenied) {
        updateDesktopUpdaterDiagnostics(
          'invoke_unavailable',
          `tauri remote IPC blocked for current domain: ${combinedVersionError}`
        );
        return null;
      }
      if (
        !currentVersion &&
        normalizedVersionError.includes('desktop_get_current_version') &&
        (normalizedVersionError.includes('unknown') ||
          normalizedVersionError.includes('not found') ||
          normalizedVersionError.includes('does not exist'))
      ) {
        updateDesktopUpdaterDiagnostics(
          'legacy_updater_missing_commands',
          `legacy desktop updater commands unavailable: ${combinedVersionError || 'desktop_get_current_version missing'}`
        );
        return null;
      }
      if (!currentVersion) {
        const detail = combinedVersionError
          ? `desktop_get_current_version failed (${combinedVersionError}); chain=${versionResolutionChain.join(' -> ')}; probes=${describeDesktopInvokeProbes()}; ${hostVersionDetail}`
          : `desktop bridge returned an empty version; chain=${versionResolutionChain.join(' -> ')}; probes=${describeDesktopInvokeProbes()}; ${hostVersionDetail}`;
        updateDesktopUpdaterDiagnostics('version_unavailable', detail);
        currentVersion = DESKTOP_UPDATE_UNKNOWN_VERSION_FALLBACK;
        usedUnknownVersionFallback = true;
      }
    }
    setDesktopUpdateLegacyVersion('');
    if (!usedUnknownVersionFallback && currentVersion) {
      setDesktopClientVersion(currentVersion);
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
    const normalizedManifestUrl = normalizeManifestUrlForDesktopFetch(String(prepare?.manifestUrl ?? ''));
    if (prepare) {
      prepare.manifestUrl = normalizedManifestUrl || null;
    }
    if (!prepare?.updateAvailable || !prepare.targetVersion || !prepare.manifestUrl) {
      setDesktopUpdateActionableVersion('');
      if (prepare?.targetVersion) {
        setDesktopUpdateNotifiedVersion(prepare.targetVersion);
      }
      console.info('[desktop-updater] prepare_success', {
        updateAvailable: false,
        targetVersion: prepare?.targetVersion ?? null,
      });
      if (usedUnknownVersionFallback) {
        updateDesktopUpdaterDiagnostics('version_unavailable', 'desktop client version unavailable; update not actionable');
      } else {
        updateDesktopUpdaterDiagnostics(
          resolveReadyState(),
          withWarningDetail(
            probeSoftFailureDetail
              ? `in-app updater ready despite probe warning; ${probeSoftFailureDetail}`
              : 'in-app updater ready (no newer version for current client)'
          )
        );
      }
      return null;
    }
    setDesktopUpdateNotifiedVersion(prepare.targetVersion);
    setDesktopUpdateActionableVersion(prepare.targetVersion);
    console.info('[desktop-updater] prepare_success', {
      updateAvailable: true,
      targetVersion: prepare.targetVersion,
    });
    updateDesktopUpdaterDiagnostics(
      resolveReadyState(),
      withWarningDetail(
        usedUnknownVersionFallback
          ? probeSoftFailureDetail
            ? `in-app updater ready (fallback currentVersion=0.0.0) despite probe warning; ${probeSoftFailureDetail}`
            : 'in-app updater ready (fallback currentVersion=0.0.0)'
          : probeSoftFailureDetail
            ? `in-app updater ready despite probe warning; ${probeSoftFailureDetail}`
            : 'in-app updater ready'
      )
    );
    return prepare;
  }, [
    activateDesktopUpdateBootstrapFallback,
    desktopRuntimeDetected,
    hydrateDesktopVersionFromHost,
    updateDesktopUpdaterDiagnostics,
    user,
  ]);

  const handleDesktopRestartNow = useCallback(async () => {
    const bridge = getDesktopUpdaterBridge();
    if (!bridge) {
      setDesktopUpdatePillState('failed');
      setDesktopUpdateProgressPhase('failed');
      setDesktopUpdateErrorMessage(t.appChrome.desktopUpdateBridgeUnavailable);
      setDesktopUpdateProgressMessage(t.appChrome.desktopUpdateBridgeUnavailable);
      setDesktopUpdateFailureKind('transient');
      setDesktopUpdateProgressOpen(true);
      return;
    }
    await bridge.restartApp().catch((error) => {
      const reason = String((error as any)?.message ?? error).trim() || t.appChrome.desktopUpdateRestartFailed;
      setDesktopUpdatePillState('failed');
      setDesktopUpdateProgressPhase('failed');
      setDesktopUpdateProgressPercent(0);
      setDesktopUpdateErrorMessage(reason);
      setDesktopUpdateProgressMessage(reason);
      setDesktopUpdateFailureKind('transient');
      setDesktopUpdateProgressOpen(true);
      toast.error(t.appChrome.desktopUpdateRestartFailed);
    });
  }, [t.appChrome.desktopUpdateBridgeUnavailable, t.appChrome.desktopUpdateRestartFailed]);

  const markDesktopUpdateFailure = useCallback(
    (
      reason: string,
      options?: {
        rawReason?: string;
        autoOpenDownloads?: boolean;
        failureKind?: DesktopUpdateFailureKind;
      }
    ) => {
      const displayReason = String(reason ?? '').trim() || t.appChrome.desktopUpdateInstallFailedUnknown;
      const normalizedRawReason = String(options?.rawReason ?? '').trim();
      const failureKind =
        options?.failureKind ??
        (isDesktopUpdateIpcScopeFailure(normalizedRawReason || displayReason) ? 'scope_blocked' : 'transient');
      setDesktopUpdatePillState('failed');
      setDesktopUpdateProgressPhase('failed');
      setDesktopUpdateProgressPercent(0);
      setDesktopUpdateErrorMessage(displayReason);
      setDesktopUpdateProgressMessage(displayReason);
      setDesktopUpdateFailureKind(failureKind);
      setDesktopUpdateProgressOpen(true);
      toast.error(t.appChrome.desktopUpdateInstallFailedTitle, {
        description: interpolate(t.appChrome.desktopUpdateInstallFailedBody, { reason: displayReason || '-' }),
      });

      if (options?.rawReason && options.rawReason !== displayReason) {
        console.warn('[desktop-updater] install_failed_sanitized', {
          displayReason,
          rawReason: options.rawReason,
        });
      }

      if (options?.autoOpenDownloads) {
        toast.message(t.appChrome.desktopUpdateIpcScopeOpenDownloads);
        if (!location.pathname.startsWith('/downloads')) {
          navigate('/downloads');
        }
      }
    },
    [
      location.pathname,
      navigate,
      t.appChrome.desktopUpdateInstallFailedBody,
      t.appChrome.desktopUpdateInstallFailedTitle,
      t.appChrome.desktopUpdateInstallFailedUnknown,
      t.appChrome.desktopUpdateIpcScopeOpenDownloads,
    ]
  );

  const installDesktopUpdate = useCallback(
    async (prepareInput?: ClientUpdatePrepareResponse | null) => {
      const bridge = getDesktopUpdaterBridge();
      if (!bridge) {
        markDesktopUpdateFailure(t.appChrome.desktopUpdateBridgeUnavailable);
        return;
      }
      if (desktopUpdateScopeBlockedRef.current) {
        activateDesktopUpdateBootstrapFallback(t.appChrome.desktopUpdateIpcScopeBlocked, { allowHostRescue: true });
        return;
      }

      const preflight = await runDesktopUpdaterPreflight(bridge);
      if (!preflight.ok && isDesktopUpdateIpcScopeFailure(preflight.reason)) {
        activateDesktopUpdateBootstrapFallback(preflight.reason, { allowHostRescue: true });
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
      setDesktopUpdateFailureKind('transient');
      setDesktopUpdateCanCancelInstall(typeof bridge.cancelInstall === 'function');
      setDesktopUpdatePillState('downloading');

      try {
        let prepare = prepareInput;
        if (!prepare?.manifestUrl || !prepare?.targetVersion) {
          prepare = await requestDesktopUpdatePrepare();
        }
        if (!prepare?.manifestUrl || !prepare?.targetVersion) {
          throw new Error(t.appChrome.desktopUpdatePrepareFailed);
        }

        const manifestUrl = normalizeManifestUrlForDesktopFetch(String(prepare.manifestUrl ?? ''));
        if (!manifestUrl) {
          throw new Error(t.appChrome.desktopUpdatePrepareFailed);
        }
        desktopUpdateManifestUrlRef.current = manifestUrl;
        setDesktopUpdatePrepare(prepare);
        setDesktopUpdateTargetVersion(prepare.targetVersion);

        let manifestRes: Response;
        try {
          manifestRes = await fetch(manifestUrl, {
            cache: 'no-store',
            credentials: 'include',
          });
        } catch (manifestFetchError) {
          const manifestPath = extractManifestPath(String(prepare.manifestUrl ?? ''));
          if (!manifestPath) {
            const detail = String((manifestFetchError as any)?.message ?? manifestFetchError).trim() || 'network_error';
            throw new Error(`Failed to load update manifest: ${detail}`);
          }
          manifestRes = await fetch(manifestPath, {
            cache: 'no-store',
            credentials: 'include',
          });
        }
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
          manifestUrl,
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
        await handleDesktopRestartNow();
      } catch (error) {
        const rawReason = String((error as any)?.message ?? error).trim() || t.appChrome.desktopUpdateInstallFailedUnknown;
        const failure = resolveDesktopUpdateFailure(rawReason, t);
        if (failure.autoOpenDownloads) {
          activateDesktopUpdateBootstrapFallback(rawReason, { allowHostRescue: true });
          return;
        }
        markDesktopUpdateFailure(failure.message, {
          rawReason,
          autoOpenDownloads: failure.autoOpenDownloads,
        });
      } finally {
        desktopUpdateInstallBusyRef.current = false;
        setDesktopUpdateBusy(false);
      }
    },
    [
      activateDesktopUpdateBootstrapFallback,
      handleDesktopRestartNow,
      markDesktopUpdateFailure,
      requestDesktopUpdatePrepare,
      runDesktopUpdaterPreflight,
      t.appChrome.desktopUpdateArtifactMissing,
      t.appChrome.desktopUpdateBridgeUnavailable,
      t.appChrome.desktopUpdateInstallFailedUnknown,
      t.appChrome.desktopUpdateIpcScopeBlocked,
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

      desktopUpdateManifestUrlRef.current = normalizeManifestUrlForDesktopFetch(String(prepare.manifestUrl ?? ''));
      setDesktopUpdateTargetVersion(prepare.targetVersion);
      setDesktopUpdatePrepare(prepare);
      if (
        desktopUpdatePillState !== 'ready_to_restart' &&
        desktopUpdatePillState !== 'downloading' &&
        desktopUpdatePillState !== 'installing'
      ) {
        setDesktopUpdatePillState('available');
      }
      const normalizedNotes = normalizeDesktopUpdateNotes(prepare.notes);
      const now = Date.now();
      const sameToastVersion = desktopUpdateToastVersionRef.current === prepare.targetVersion;
      const recentlyPrompted = now - desktopUpdateToastAtRef.current < DESKTOP_UPDATE_TOAST_DEDUP_MS;
      const updateDialogBusy =
        desktopUpdateConfirmOpen ||
        desktopUpdateProgressOpen ||
        desktopUpdateBusy ||
        desktopUpdatePillState === 'confirming' ||
        desktopUpdatePillState === 'downloading' ||
        desktopUpdatePillState === 'installing';

      if (sameToastVersion && (recentlyPrompted || updateDialogBusy)) {
        return true;
      }
      if (
        !opts?.forcePrompt &&
        desktopUpdatePromptedVersionRef.current &&
        desktopUpdatePromptedVersionRef.current === prepare.targetVersion
      ) {
        return true;
      }
      desktopUpdatePromptedVersionRef.current = prepare.targetVersion;
      desktopUpdateToastVersionRef.current = prepare.targetVersion;
      desktopUpdateToastAtRef.current = now;

      toast.message(
        interpolate(t.appChrome.desktopUpdateAvailableTitle, {
          version: prepare.targetVersion,
        }),
        {
          id: DESKTOP_UPDATE_TOAST_ID,
          description: normalizedNotes || t.appChrome.desktopUpdateAvailableBody,
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
    [
      desktopUpdateBusy,
      desktopUpdateConfirmOpen,
      desktopUpdatePillState,
      desktopUpdateProgressOpen,
      requestDesktopUpdatePrepare,
      t.appChrome,
      user,
    ]
  );

  const handleDesktopUpdatePillClick = useCallback(async () => {
    const bridge = getDesktopUpdaterBridge();
    if (!bridge) {
      setDesktopUpdatePillState('hidden');
      return;
    }
    if (desktopUpdateScopeBlockedRef.current) {
      activateDesktopUpdateBootstrapFallback(t.appChrome.desktopUpdateIpcScopeBlocked);
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
        setDesktopUpdateFailureKind('transient');
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
  }, [
    activateDesktopUpdateBootstrapFallback,
    checkDesktopInAppUpdate,
    desktopUpdatePillState,
    desktopUpdatePrepare,
    t.appChrome.desktopUpdateIpcScopeBlocked,
    t.appChrome.desktopUpdatePrepareFailed,
  ]);

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
    if (desktopUpdateScopeBlockedRef.current) {
      activateDesktopUpdateBootstrapFallback(t.appChrome.desktopUpdateIpcScopeBlocked, { allowHostRescue: true });
      return;
    }
    setDesktopUpdateConfirmOpen(false);
    void installDesktopUpdate(desktopUpdatePrepare);
  }, [activateDesktopUpdateBootstrapFallback, desktopUpdatePrepare, installDesktopUpdate, t.appChrome.desktopUpdateIpcScopeBlocked]);

  const handleDesktopUpdateCancelInstall = useCallback(async () => {
    const bridge = getDesktopUpdaterBridge();
    if (!bridge || typeof bridge.cancelInstall !== 'function') return;
    await bridge.cancelInstall().catch(() => null);
    markDesktopUpdateFailure(t.appChrome.desktopUpdateInstallCancelled);
  }, [markDesktopUpdateFailure, t.appChrome.desktopUpdateInstallCancelled]);

  const handleDesktopUpdateRetry = useCallback(() => {
    if (desktopUpdateScopeBlockedRef.current) {
      activateDesktopUpdateBootstrapFallback(t.appChrome.desktopUpdateIpcScopeBlocked, { allowHostRescue: true });
      return;
    }
    void installDesktopUpdate(desktopUpdatePrepare);
  }, [activateDesktopUpdateBootstrapFallback, desktopUpdatePrepare, installDesktopUpdate, t.appChrome.desktopUpdateIpcScopeBlocked]);

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

  const handleDesktopUpdateOpenDownloads = useCallback(() => {
    navigate('/downloads');
  }, [navigate]);

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
      const currentVersion = readDesktopHostVersion() || desktopClientVersion || desktopUpdateLegacyVersion || '';
      const res = await fetch('/api/notifications/client-update/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentVersion: currentVersion || null,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as ClientUpdateSyncResponse | null;
      const syncVersion = String(data?.targetVersion ?? data?.version ?? '').trim();
      if (syncVersion) {
        setDesktopUpdateNotifiedVersion(syncVersion);
      }
      if (desktopRuntimeDetected) {
        if (data?.updateAvailable === true && syncVersion) {
          setDesktopUpdateActionableVersion(syncVersion);
        } else if (data?.updateAvailable === false) {
          setDesktopUpdateActionableVersion('');
        }
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
  }, [
    checkDesktopInAppUpdate,
    desktopClientVersion,
    desktopRuntimeDetected,
    desktopUpdateLegacyVersion,
    fetchNotifications,
    fetchUnreadCount,
    notificationsFilter,
    notificationsOpen,
    user,
  ]);

  useEffect(() => {
    if (!user) return;

    let timerId: number | undefined;
    const tick = async (allowHidden = false) => {
      if (!allowHidden && document.visibilityState !== 'visible') return;
      await syncClientUpdateNotification();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void tick(true);
      }
    };

    // Run immediately even if the webview visibility state is stale during bootstrap.
    void tick(true);
    timerId = window.setInterval(() => void tick(), 10 * 60_000);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timerId) window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [syncClientUpdateNotification, user]);

  useEffect(() => {
    if (!user) return;
    if (!desktopRuntimeDetected) return;
    hydrateDesktopVersionFromHost();

    let timerId: number | undefined;
    const tick = async (allowHidden = false) => {
      if (!allowHidden && document.visibilityState !== 'visible') return;
      try {
        await checkDesktopInAppUpdate();
      } catch {
        // Best effort only; do not interrupt user flow.
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void tick(true);
      }
    };

    // Run immediately even if the webview visibility state is stale during bootstrap.
    void tick(true);
    timerId = window.setInterval(() => void tick(), 6 * 60 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timerId) window.clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkDesktopInAppUpdate, desktopRuntimeDetected, hydrateDesktopVersionFromHost, user]);

  useEffect(() => {
    if (user) return;
    setDesktopUpdatePillState('hidden');
    setDesktopUpdateTargetVersion('');
    setDesktopUpdatePrepare(null);
    setDesktopUpdateConfirmOpen(false);
    setDesktopUpdateProgressOpen(false);
    setDesktopUpdateBusy(false);
    setDesktopUpdateErrorMessage('');
    setDesktopUpdateFailureKind('transient');
    setDesktopUpdateNotifiedVersion('');
    setDesktopUpdateActionableVersion('');
    setDesktopUpdateLegacyVersion('');
    setDesktopClientVersion('');
    desktopUpdateScopeBlockedRef.current = false;
    desktopUpdateScopeToastShownRef.current = false;
    setDesktopUpdaterDiagnostics({ state: 'unknown', detail: '' });
  }, [user]);

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
      } else if (desktopRuntimeDetected && isLegacyBootstrapState(desktopUpdaterDiagnostics.state)) {
        toast.message(t.appChrome.desktopUpdateLegacyDetected, {
          description: desktopUpdateBootstrapRequiredBody,
        });
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

  const desktopUpdatePillVisible = desktopUpdatePillState !== 'hidden';
  const desktopUpdaterStateLabel =
    desktopUpdaterDiagnostics.state === 'ready'
      ? t.appChrome.desktopUpdateBridgeStateReady
      : desktopUpdaterDiagnostics.state === 'warning_ipv4_host'
        ? t.appChrome.desktopUpdateBridgeStateIpv4Warning
      : desktopUpdaterDiagnostics.state === 'scope_incompatible'
        ? t.appChrome.desktopUpdateBridgeStateInvokeUnavailable
      : desktopUpdaterDiagnostics.state === 'not_desktop_runtime'
        ? t.appChrome.desktopUpdateBridgeStateNotDesktop
        : desktopUpdaterDiagnostics.state === 'invoke_unavailable'
          ? t.appChrome.desktopUpdateBridgeStateInvokeUnavailable
        : desktopUpdaterDiagnostics.state === 'probe_failed_soft'
          ? t.appChrome.desktopUpdateBridgeStateProbeSoftFailed
        : desktopUpdaterDiagnostics.state === 'legacy_updater_missing_commands'
          ? t.appChrome.desktopUpdateBridgeStateLegacyMissingCommands
        : desktopUpdaterDiagnostics.state === 'legacy_version_detected'
          ? t.appChrome.desktopUpdateBridgeStateLegacyVersionDetected
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
  const desktopUpdateBootstrapRequiredVisible =
    desktopRuntimeDetected &&
    !desktopUpdatePillVisible &&
    Boolean(desktopUpdateActionableVersion) &&
    isLegacyBootstrapState(desktopUpdaterDiagnostics.state);
  const desktopUpdateUnavailableVisible =
    desktopRuntimeDetected &&
    !desktopUpdatePillVisible &&
    Boolean(desktopUpdateActionableVersion) &&
    desktopUpdaterDiagnostics.state !== 'ready' &&
    desktopUpdaterDiagnostics.state !== 'probe_failed_soft' &&
    desktopUpdaterDiagnostics.state !== 'warning_ipv4_host' &&
    !desktopUpdateBootstrapRequiredVisible;
  const desktopUpdateUnavailableTitle = interpolate(t.appChrome.desktopUpdateUnavailableTitle, {
    version: desktopUpdateActionableVersion || desktopUpdateNotifiedVersion || '-',
    state: desktopUpdaterStateLabel,
  });
  const desktopUpdateBootstrapRequiredTitle = interpolate(t.appChrome.desktopUpdateBootstrapRequiredTitle, {
    version: desktopUpdateActionableVersion || desktopUpdateNotifiedVersion || '-',
  });
  const desktopUpdateBootstrapRequiredBody =
    desktopUpdaterDiagnostics.state === 'scope_incompatible'
      ? t.appChrome.desktopUpdateIpcScopeBlocked
      : interpolate(t.appChrome.desktopUpdateBootstrapRequiredBody, {
          version: desktopUpdateLegacyVersion || '-',
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
  const desktopFooterVersionLabel = desktopRuntimeDetected ? t.appChrome.clientVersionLabel : t.appChrome.buildLabel;
  const desktopFooterVersionValue = desktopRuntimeDetected
    ? (desktopClientVersion || desktopUpdateLegacyVersion || '--')
    : (shellStatus?.build?.hash ? shellStatus.build.hash.slice(0, 8) : '--');

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
          {desktopUpdateBootstrapRequiredVisible ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-full px-3 text-xs font-semibold border-amber-500/40 text-amber-600 bg-amber-500/10 hover:bg-amber-500/15"
              onClick={handleDesktopUpdateOpenDownloads}
              title={desktopUpdateBootstrapRequiredTitle}
              aria-label={desktopUpdateBootstrapRequiredTitle}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{t.appChrome.desktopUpdateBootstrapRequiredIndicator}</span>
            </Button>
          ) : null}
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
          <span className="truncate">{desktopFooterVersionLabel}: {desktopFooterVersionValue}</span>
          {syncError ? <span className="text-red-600 truncate">{t.appChrome.syncError}</span> : null}
          {shellStatusError ? <span className="text-red-600 truncate">{t.appChrome.statusError}</span> : null}
        </div>
      </div>

      <DesktopUpdateConfirmDialog
        open={desktopUpdateConfirmOpen}
        onOpenChange={handleDesktopUpdateConfirmOpenChange}
        targetVersion={desktopUpdateTargetVersion}
        notes={normalizeDesktopUpdateNotes(desktopUpdatePrepare?.notes) || null}
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
        failureKind={desktopUpdateFailureKind}
        canCancelInstall={desktopUpdateCanCancelInstall}
        onCancelInstall={() => {
          void handleDesktopUpdateCancelInstall();
        }}
        onRetry={handleDesktopUpdateRetry}
        onRestartNow={() => {
          void handleDesktopRestartNow();
        }}
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
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.appChrome.clientVersionLabel}: {desktopClientVersion || desktopUpdateLegacyVersion || '--'}
                </p>
                {desktopUpdateBootstrapRequiredVisible ? (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-amber-600">{desktopUpdateBootstrapRequiredBody}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-amber-700 hover:text-amber-800"
                      onClick={handleDesktopUpdateOpenDownloads}
                    >
                      {t.appChrome.desktopUpdateLegacyOpenDownloads}
                    </Button>
                  </div>
                ) : null}
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
                      {(() => {
                        const notificationType = String(item.payload?.eventType ?? item.type ?? '').trim().toLowerCase();
                        const isClientUpdateNotification = notificationType === 'client_update_available';
                        if (!isClientUpdateNotification) return null;

                        const desktopUpdateCanUseInApp =
                          desktopRuntimeDetected &&
                          (desktopUpdatePillVisible || (!desktopUpdateBootstrapRequiredVisible && !desktopUpdateUnavailableVisible));
                        if (desktopUpdateCanUseInApp) {
                          return (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                setNotificationsOpen(false);
                                void handleOpenNotification(item);
                              }}
                            >
                              {t.appChrome.desktopUpdatePillUpdate}
                            </Button>
                          );
                        }

                        if (desktopRuntimeDetected && desktopUpdateBootstrapRequiredVisible) {
                          return (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                handleDesktopUpdateOpenDownloads();
                                setNotificationsOpen(false);
                              }}
                            >
                              {t.appChrome.desktopUpdateLegacyOpenDownloads}
                            </Button>
                          );
                        }

                        return (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              handleDesktopUpdateOpenDownloads();
                              setNotificationsOpen(false);
                            }}
                          >
                            {t.downloads.openDownloads}
                          </Button>
                        );
                      })()}
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
                      {!item.requestId &&
                      String(item.payload?.eventType ?? item.type ?? '').trim().toLowerCase() !== 'client_update_available' &&
                      typeof item.payload?.actionPath === 'string' &&
                      item.payload.actionPath ? (
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
