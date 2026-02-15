import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAdminSettings, ListItem, UserItem, ListCategory } from '@/context/AdminSettingsContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRequests } from '@/context/RequestContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Plus, Trash2, Users, Settings as SettingsIcon, Globe, Truck, Pencil, Layers, ArrowRightLeft, Box, Circle, Download, Droplets, Route, Wind, Repeat, PackageCheck, MessageCircle, Server, Database, RefreshCw, Mail, ChevronDown, CheckCircle2, AlertTriangle, XCircle, ScrollText } from 'lucide-react';
import { ROLE_CONFIG, UserRole } from '@/types';
import { cn } from '@/lib/utils';
import ListManager from '@/components/settings/ListManager';
import AuditLogPanel from '@/components/settings/AuditLogPanel';
import M365NotificationsTab from '@/components/settings/M365NotificationsTab';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';

type M365RoleKey = 'sales' | 'design' | 'costing' | 'admin';
type M365FlowMap = Record<string, Partial<Record<M365RoleKey, boolean>>>;

type M365ActionKey = 'request_created' | 'request_status_changed';

type M365EmailTemplate = {
  subject?: string;
  title?: string;
  intro?: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  footerText?: string;
};

type M365Templates = Record<M365ActionKey, M365EmailTemplate>;

type NotificationLang = 'en' | 'fr' | 'zh';

const M365_TEMPLATE_LANGS: NotificationLang[] = ['en', 'fr', 'zh'];

const DEFAULT_TEMPLATES_BY_LANG: Record<NotificationLang, M365Templates> = {
  en: {
    request_created: {
      subject: '[CRA] Request {{requestId}} submitted',
      title: 'New Request Submitted',
      intro: 'A new CRA request has been submitted.',
      primaryButtonText: 'Open request',
      secondaryButtonText: 'Open dashboard',
      footerText: 'You received this email because you are subscribed to CRA request notifications.',
    },
    request_status_changed: {
      subject: '[CRA] Request {{requestId}} status changed to {{status}}',
      title: 'Request Update',
      intro: 'A CRA request status has been updated.',
      primaryButtonText: 'Open request',
      secondaryButtonText: 'Open dashboard',
      footerText: 'You received this email because you are subscribed to CRA request notifications.',
    },
  },
  fr: {
    request_created: {
      subject: '[CRA] Demande {{requestId}} soumise',
      title: 'Nouvelle demande soumise',
      intro: 'Une nouvelle demande CRA a ete soumise.',
      primaryButtonText: 'Ouvrir la demande',
      secondaryButtonText: 'Ouvrir le tableau de bord',
      footerText: 'Vous recevez cet e-mail car vous etes abonne aux notifications des demandes CRA.',
    },
    request_status_changed: {
      subject: '[CRA] Demande {{requestId}} : statut modifie en {{status}}',
      title: 'Mise a jour de la demande',
      intro: "Le statut d'une demande CRA a ete mis a jour.",
      primaryButtonText: 'Ouvrir la demande',
      secondaryButtonText: 'Ouvrir le tableau de bord',
      footerText: 'Vous recevez cet e-mail car vous etes abonne aux notifications des demandes CRA.',
    },
  },
  zh: {
    request_created: {
      subject: '[CRA] 请求 {{requestId}} 已提交',
      title: '新请求已提交',
      intro: '已提交一条新的 CRA 请求。',
      primaryButtonText: '打开请求',
      secondaryButtonText: '打开仪表板',
      footerText: '您收到此邮件是因为您订阅了 CRA 请求通知。',
    },
    request_status_changed: {
      subject: '[CRA] 请求 {{requestId}} 状态已变更为 {{status}}',
      title: '请求更新',
      intro: 'CRA 请求状态已更新。',
      primaryButtonText: '打开请求',
      secondaryButtonText: '打开仪表板',
      footerText: '您收到此邮件是因为您订阅了 CRA 请求通知。',
    },
  },
};

const FLOW_STATUS_KEYS = [
  'draft',
  'submitted',
  'edited',
  'under_review',
  'clarification_needed',
  'feasibility_confirmed',
  'design_result',
  'in_costing',
  'costing_complete',
  'sales_followup',
  'gm_approval_pending',
  'gm_approved',
  'gm_rejected',
  'closed',
] as const;

const DEFAULT_FLOW_MAP: M365FlowMap = {
  submitted: { design: true, admin: true },
  under_review: { design: true, admin: true },
  clarification_needed: { sales: true, admin: true },
  feasibility_confirmed: { costing: true, sales: true, admin: true },
  design_result: { costing: true, sales: true, admin: true },
  in_costing: { costing: true, admin: true },
  costing_complete: { sales: true, admin: true },
  sales_followup: { sales: true, admin: true },
  gm_approval_pending: { sales: true, admin: true },
  gm_approved: { sales: true, admin: true },
  gm_rejected: { sales: true, admin: true },
  closed: { sales: true },
  edited: { admin: true },
};

interface FeedbackItem {
  id: string;
  type: 'bug' | 'feature' | string;
  title: string;
  description: string;
  steps: string;
  severity: string;
  pagePath: string;
  userName: string;
  userEmail: string;
  userRole: string;
  status?: 'submitted' | 'ongoing' | 'finished' | 'cancelled' | string;
  createdAt: string;
  updatedAt?: string;
}

interface DeployInfo {
  git: {
    hash: string;
    message: string;
    author: string;
    date: string;
    builtAt?: string;
  };
  build?: {
    builtAt?: string;
  };
  log: {
    lines: number;
    content: string;
    available: boolean;
    fileName?: string;
    directory?: string;
    tried?: string[];
    candidates?: Array<{ name: string; sizeBytes: number; modifiedAt: string }>;
  };
}

interface M365Settings {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  senderUpn: string;
  appBaseUrl: string;
  recipientsSales: string;
  recipientsDesign: string;
  recipientsCosting: string;
  recipientsAdmin: string;
  testMode: boolean;
  testEmail: string;
  flowMap: M365FlowMap | null;
  templates: Record<string, any> | null;
}

interface M365AdminResponse {
  settings: M365Settings;
  connection: {
    hasRefreshToken: boolean;
    expiresAt: string | null;
  };
  deviceCode: {
    userCode: string | null;
    verificationUri: string | null;
    verificationUriComplete: string | null;
    message: string | null;
    expiresAt: string | null;
    status: string | null;
    createdAt: string | null;
  } | null;
}

interface AccessEmailPreview {
  toEmail: string;
  userName: string;
  loginEmail: string;
  appUrl: string;
  temporaryPassword: string;
  subject: string;
  html: string;
}

type DbMonitorWaitRow = {
  waitType: string;
  waitMs: number | null;
  deltaWaitMs?: number | null;
  isNoise?: boolean;
};

type DbMonitorQueryRow = {
  queryHash: string;
  execCount: number | null;
  totalMs: number | null;
  avgMs: number | null;
  cpuMs: number | null;
  logicalReads: number | null;
};

type DbMonitorSnapshot = {
  collectedAt: string;
  sqlserverStartTime?: string | null;
  database: {
    databaseName: string;
    serverName: string;
    productVersion: string;
    edition: string;
  } | null;
  sizeMb: number | null;
  sessions: {
    userSessions: number | null;
    activeRequests: number | null;
    blockedRequests: number | null;
  };
  topWaits: DbMonitorWaitRow[];
  allWaits?: DbMonitorWaitRow[];
  baselineCollectedAt?: string | null;
  topQueries: DbMonitorQueryRow[];
  errors: { section: string; message: string }[];
};

type DbMonitorState = {
  health?: { status: 'green' | 'yellow' | 'red'; label: string };
  snapshot: DbMonitorSnapshot | null;
  history?: {
    keep: number;
    points: Array<{
      collectedAt: string;
      sizeMb: number | null;
      userSessions: number | null;
      activeRequests: number | null;
      blockedRequests: number | null;
      partialErrors: number;
    }>;
  };
  refreshing: boolean;
  lastError: string | null;
  lastRefreshedAt: string | null;
  nextRefreshAt: string | null;
};

type DbBackupItem = {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type DbBackupArtifact = {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
};

type DbBackupSet = {
  prefix: string;
  createdAt: string;
  totalSizeBytes: number;
  restoreReady: boolean;
  isComplete: boolean;
  artifacts: {
    dump: DbBackupArtifact | null;
    globals: DbBackupArtifact | null;
    manifest: DbBackupArtifact | null;
  };
};

type DbBackupRetentionKept = {
  day: string | null;
  'day-1': string | null;
  'week-1': string | null;
};

type DbBackupRun = {
  id: string;
  mode: string;
  status: string;
  message: string;
  started_at: string;
  finished_at?: string | null;
};

type DbBackupAutomaticState = {
  enabled: boolean;
  configured: boolean;
  frequency: string;
  schedule?: {
    hour: number;
    minute: number;
  } | null;
  taskName: string;
  policy: string;
  nextRunAt?: string | null;
  latestManual?: DbBackupRun | null;
  latestAuto?: DbBackupRun | null;
  latestRestore?: DbBackupRun | null;
};

type DbBackupConfig = {
  enabled: boolean;
  configured: boolean;
  host: string;
  port: number;
  databaseName: string;
  backupUser: string;
  scheduleHour: number;
  scheduleMinute: number;
  taskName: string;
  retentionPolicy: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  encryptionUsingFallback?: boolean;
};

const LEGACY_DB_BACKUP_DIR = 'C:\\CRA_Local_W2016_Main\\db-backups';
const CANONICAL_DB_BACKUP_DIR = 'C:\\CRA_Local_W2016_Main\\backups\\postgres';
const LEGACY_USERS_STORAGE_KEYS = ['monroc_admin_settings_v5', 'monroc_admin_settings_v4'] as const;

const normalizeDbBackupDirectory = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\//g, '\\');
  if (normalized.toLowerCase() === LEGACY_DB_BACKUP_DIR.toLowerCase()) {
    return CANONICAL_DB_BACKUP_DIR;
  }
  return normalized;
};

const normalizeDbBackupRetentionKept = (value: unknown): DbBackupRetentionKept | null => {
  if (!value || typeof value !== 'object') return null;
  const src = value as Record<string, unknown>;
  const asName = (key: string) => {
    const raw = String(src[key] ?? '').trim();
    return raw || null;
  };
  return {
    day: asName('day'),
    'day-1': asName('day-1'),
    'week-1': asName('week-1'),
  };
};

const normalizeDbBackupSets = (value: unknown): DbBackupSet[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const src = raw as Record<string, any>;
      const normalizeArtifact = (item: any): DbBackupArtifact | null => {
        if (!item || typeof item !== 'object') return null;
        const fileName = String(item.fileName ?? '').trim();
        if (!fileName) return null;
        return {
          fileName,
          sizeBytes: Number(item.sizeBytes ?? 0) || 0,
          createdAt: String(item.createdAt ?? ''),
        };
      };
      const prefix = String(src.prefix ?? '').trim();
      if (!prefix) return null;
      return {
        prefix,
        createdAt: String(src.createdAt ?? ''),
        totalSizeBytes: Number(src.totalSizeBytes ?? 0) || 0,
        restoreReady: Boolean(src.restoreReady),
        isComplete: Boolean(src.isComplete),
        artifacts: {
          dump: normalizeArtifact(src?.artifacts?.dump),
          globals: normalizeArtifact(src?.artifacts?.globals),
          manifest: normalizeArtifact(src?.artifacts?.manifest),
        },
      } as DbBackupSet;
    })
    .filter((v): v is DbBackupSet => Boolean(v));
};

const Settings: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { requests, isLoading } = useRequests();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
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
  } = useAdminSettings();

  const validTabs = new Set([
    'export',
    'lists',
    'users',
    'feedback',
    'm365',
    'dbmonitor',
    'auditlog',
    'deployments',
  ]);
  const activeTabCandidate = String(searchParams.get('tab') ?? '').trim() || 'export';
  const activeTab = validTabs.has(activeTabCandidate) ? activeTabCandidate : 'export';
  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  if (user?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const [editingItem, setEditingItem] = useState<{ category: ListCategory; listName: string; item: ListItem } | null>(null);
  const [editItemValue, setEditItemValue] = useState('');
  const [isEditItemOpen, setIsEditItemOpen] = useState(false);
  
  // User form states
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<(UserItem & { newPassword?: string }) | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    role: 'sales' as UserRole,
    preferredLanguage: 'en' as 'en' | 'fr' | 'zh',
    password: '',
  });
  const [languageUpdatingUserIds, setLanguageUpdatingUserIds] = useState<Record<string, boolean>>({});
  const [isAccessEmailOpen, setIsAccessEmailOpen] = useState(false);
  const [accessEmailUser, setAccessEmailUser] = useState<UserItem | null>(null);
  const [accessEmailAppUrl, setAccessEmailAppUrl] = useState('');
  const [accessEmailTemporaryPassword, setAccessEmailTemporaryPassword] = useState('');
  const [accessEmailSubject, setAccessEmailSubject] = useState('');
  const [accessEmailHtml, setAccessEmailHtml] = useState('');
  const [isAccessEmailPreviewLoading, setIsAccessEmailPreviewLoading] = useState(false);
  const [isAccessEmailSending, setIsAccessEmailSending] = useState(false);
  const [isLegacyUserImporting, setIsLegacyUserImporting] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [hasFeedbackError, setHasFeedbackError] = useState(false);
  const isMobile = useIsMobile();
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
  const [isFeedbackDetailsOpen, setIsFeedbackDetailsOpen] = useState(false);
  const [feedbackDeleteId, setFeedbackDeleteId] = useState<string | null>(null);
  const [deployInfo, setDeployInfo] = useState<DeployInfo | null>(null);
  const [isDeployLoading, setIsDeployLoading] = useState(false);
  const [hasDeployError, setHasDeployError] = useState(false);
  const [dbMonitor, setDbMonitor] = useState<DbMonitorState | null>(null);
  const [isDbMonitorLoading, setIsDbMonitorLoading] = useState(false);
  const [hasDbMonitorError, setHasDbMonitorError] = useState(false);
  const [dbWaitsShowNoise, setDbWaitsShowNoise] = useState(false);
  const [dbBackups, setDbBackups] = useState<DbBackupItem[]>([]);
  const [dbBackupSets, setDbBackupSets] = useState<DbBackupSet[]>([]);
  const [dbBackupDirectory, setDbBackupDirectory] = useState<string>('');
  const [dbBackupRetentionKept, setDbBackupRetentionKept] = useState<DbBackupRetentionKept | null>(null);
  const [dbBackupAutomatic, setDbBackupAutomatic] = useState<DbBackupAutomaticState | null>(null);
  const [dbBackupConfig, setDbBackupConfig] = useState<DbBackupConfig | null>(null);
  const [isDbBackupsLoading, setIsDbBackupsLoading] = useState(false);
  const [isDbBackupCreating, setIsDbBackupCreating] = useState(false);
  const [isDbBackupSetupOpen, setIsDbBackupSetupOpen] = useState(false);
  const [isDbBackupSetupSaving, setIsDbBackupSetupSaving] = useState(false);
  const [isDbBackupRestoring, setIsDbBackupRestoring] = useState(false);
  const [dbBackupRestoreTarget, setDbBackupRestoreTarget] = useState<string | null>(null);
  const [dbBackupSetupForm, setDbBackupSetupForm] = useState({
    adminHost: 'localhost',
    adminPort: 5432,
    adminDatabase: 'postgres',
    adminUser: 'postgres',
    adminPassword: '',
    backupHost: 'localhost',
    backupPort: 5432,
    backupDatabase: 'cra_local',
    backupUser: 'cra_backup',
    backupPassword: '',
    enabled: true,
    scheduleHour: 1,
    scheduleMinute: 0,
  });
  const [dbBackupError, setDbBackupError] = useState<string | null>(null);

  const [dbBackupImportId, setDbBackupImportId] = useState<string | null>(null);
  const [dbBackupImportDirectory, setDbBackupImportDirectory] = useState<string>('');
  const [dbBackupImportSets, setDbBackupImportSets] = useState<DbBackupSet[]>([]);
  const [dbBackupImportFiles, setDbBackupImportFiles] = useState<File[]>([]);
  const [dbBackupImportIncludeGlobals, setDbBackupImportIncludeGlobals] = useState(true);
  const [isDbBackupImportUploading, setIsDbBackupImportUploading] = useState(false);
  const [isDbBackupImportValidating, setIsDbBackupImportValidating] = useState(false);
  const [isDbBackupImportRestoring, setIsDbBackupImportRestoring] = useState(false);
  const [dbBackupImportError, setDbBackupImportError] = useState<string | null>(null);
  const [dbBackupImportRestoreTarget, setDbBackupImportRestoreTarget] = useState<string | null>(null);
  const [m365Info, setM365Info] = useState<M365AdminResponse | null>(null);
  const [isM365Loading, setIsM365Loading] = useState(false);
  const [hasM365Error, setHasM365Error] = useState(false);
  const [m365TestEmail, setM365TestEmail] = useState('');
  const [m365LastPollStatus, setM365LastPollStatus] = useState<string | null>(null);
  const [m365SelectedAction, setM365SelectedAction] = useState<M365ActionKey>('request_created');
  const [m365TemplateLang, setM365TemplateLang] = useState<NotificationLang>(() =>
    (language === 'fr' || language === 'zh') ? (language as NotificationLang) : 'en'
  );
  const [m365PreviewStatus, setM365PreviewStatus] = useState<string>('submitted');
  const [m365PreviewRequestId, setM365PreviewRequestId] = useState<string>('');
  const [m365PreviewSubject, setM365PreviewSubject] = useState<string>('');
  const [m365PreviewHtml, setM365PreviewHtml] = useState<string>('');
  const [isM365PreviewLoading, setIsM365PreviewLoading] = useState(false);
  const [m365BaselineSettingsJson, setM365BaselineSettingsJson] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('csv');
  const severityLabels: Record<string, string> = {
    low: t.feedback.severityLow,
    medium: t.feedback.severityMedium,
    high: t.feedback.severityHigh,
    critical: t.feedback.severityCritical,
  };

  const FEEDBACK_STATUSES = ['submitted', 'ongoing', 'finished', 'cancelled'] as const;
  type FeedbackStatus = typeof FEEDBACK_STATUSES[number];

  const normalizeFeedbackStatus = (value?: string): FeedbackStatus => {
    const v = String(value || 'submitted').trim().toLowerCase();
    return (FEEDBACK_STATUSES as readonly string[]).includes(v) ? (v as FeedbackStatus) : 'submitted';
  };

  const getFeedbackStatusLabel = (status?: string) => {
    const s = normalizeFeedbackStatus(status);
    if (s === 'ongoing') return t.feedback.statusOngoing;
    if (s === 'finished') return t.feedback.statusFinished;
    if (s === 'cancelled') return t.feedback.statusCancelled;
    return t.feedback.statusSubmitted;
  };

  const getFeedbackStatusPillClasses = (status?: string) => {
    const s = normalizeFeedbackStatus(status);
    // Light, modern pill: soft bg + readable text, supports dark mode.
    if (s === 'ongoing') return {
      wrap: 'border-sky-500/20 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:text-sky-200',
      dot: 'bg-sky-500',
    };
    if (s === 'finished') return {
      wrap: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200',
      dot: 'bg-emerald-500',
    };
    if (s === 'cancelled') return {
      wrap: 'border-rose-500/20 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-200',
      dot: 'bg-rose-500',
    };
    return {
      wrap: 'border-slate-500/20 bg-slate-500/10 text-slate-700 hover:bg-slate-500/15 dark:text-slate-200',
      dot: 'bg-slate-500',
    };
  };

  const selectedFeedback = useMemo(() => {
    if (!selectedFeedbackId) return null;
    return feedbackItems.find((f) => f.id === selectedFeedbackId) ?? null;
  }, [feedbackItems, selectedFeedbackId]);

  const openFeedbackDetails = (item: FeedbackItem) => {
    setSelectedFeedbackId(item.id);
    setIsFeedbackDetailsOpen(true);
  };

  const closeFeedbackDetails = () => {
    setIsFeedbackDetailsOpen(false);
  };

  const renderStatusPill = (item: FeedbackItem) => {
    const current = normalizeFeedbackStatus(item.status);
    const classes = getFeedbackStatusPillClasses(current);
    const otherStatuses = FEEDBACK_STATUSES.filter((s) => s !== current);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              classes.wrap
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", classes.dot)} />
            <span>{getFeedbackStatusLabel(current)}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-70" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="bg-popover border border-border shadow-lg rounded-lg p-1"
          onClick={(e) => e.stopPropagation()}
        >
          {otherStatuses.map((s) => (
            <DropdownMenuItem
              key={s}
              className="cursor-pointer"
              onClick={() => updateFeedbackStatus(item.id, s)}
            >
              {getFeedbackStatusLabel(s)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const getStatusLabel = (status: string) => {
    const key = status as keyof typeof t.statuses;
    return (t.statuses && t.statuses[key]) || status;
  };

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
  };

  const toBackupSetsFromItems = (items: DbBackupItem[]): DbBackupSet[] => {
    return items.map((item) => ({
      prefix: String(item.fileName || '').replace(/\.dump$/i, ''),
      createdAt: item.createdAt,
      totalSizeBytes: Number(item.sizeBytes || 0),
      restoreReady: false,
      isComplete: false,
      artifacts: {
        dump: item.fileName ? { fileName: item.fileName, sizeBytes: item.sizeBytes, createdAt: item.createdAt } : null,
        globals: null,
        manifest: null,
      },
    }));
  };

  const downloadBackupFile = (fileName: string) => {
    const safe = String(fileName || '').trim();
    if (!safe) return;
    const link = document.createElement('a');
    link.href = `/api/admin/db-backups/${encodeURIComponent(safe)}/download`;
    link.download = safe;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadAllBackupArtifacts = (set: DbBackupSet) => {
    const files = [set.artifacts.dump?.fileName, set.artifacts.globals?.fileName, set.artifacts.manifest?.fileName]
      .filter((v): v is string => Boolean(v));
    files.forEach((file, index) => {
      window.setTimeout(() => downloadBackupFile(file), index * 250);
    });
  };

  const getBackupPrefixFromFileName = (fileName: string) => {
    const raw = String(fileName ?? '').trim();
    if (!raw) return '';
    return raw
      .replace(/\.dump$/i, '')
      .replace(/_globals\.sql$/i, '')
      .replace(/_manifest\.json$/i, '');
  };

  const getRetentionBucketForDump = (dumpFileName: string | null | undefined) => {
    const name = String(dumpFileName ?? '').trim();
    if (!name) return '';
    if (dbBackupRetentionKept?.day && name === dbBackupRetentionKept.day) return 'day';
    if (dbBackupRetentionKept?.['day-1'] && name === dbBackupRetentionKept['day-1']) return 'day-1';
    if (dbBackupRetentionKept?.['week-1'] && name === dbBackupRetentionKept['week-1']) return 'week-1';
    return '';
  };

  const formatDateTime = (value: string | null | undefined) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '-';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return format(d, 'MMM d, yyyy HH:mm');
  };

  const MIN_SPINNER_MS = 600;
  const sleepMs = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  const ensureMinSpinnerMs = async (startedAtMs: number, minMs = MIN_SPINNER_MS) => {
    const elapsed = Date.now() - startedAtMs;
    if (elapsed < minMs) await sleepMs(minMs - elapsed);
  };

  const stableStringify = (value: any) => {
    const seen = new WeakSet<object>();
    const normalize = (v: any): any => {
      if (v && typeof v === 'object') {
        if (seen.has(v as object)) return null;
        seen.add(v as object);
        if (Array.isArray(v)) return v.map(normalize);
        const out: Record<string, any> = {};
        for (const k of Object.keys(v).sort()) {
          out[k] = normalize(v[k]);
        }
        return out;
      }
      return v;
    };
    try {
      return JSON.stringify(normalize(value));
    } catch {
      return '';
    }
  };

  const isI18nTemplateShape = (raw: any): raw is Record<string, any> => {
    if (!raw || typeof raw !== 'object') return false;
    return M365_TEMPLATE_LANGS.some((lang) => raw?.[lang] && typeof raw?.[lang] === 'object');
  };

  const getTemplateForUi = (
    rawTemplates: any,
    lang: NotificationLang,
    action: M365ActionKey
  ): M365EmailTemplate => {
    const defaults = DEFAULT_TEMPLATES_BY_LANG[lang]?.[action] ?? DEFAULT_TEMPLATES_BY_LANG.en[action];
    if (!rawTemplates || typeof rawTemplates !== 'object') return { ...defaults };

    if (isI18nTemplateShape(rawTemplates)) {
      const bucket = rawTemplates?.[lang] && typeof rawTemplates?.[lang] === 'object' ? rawTemplates[lang] : null;
      const override = bucket?.[action] && typeof bucket?.[action] === 'object' ? bucket[action] : null;
      return { ...defaults, ...(override ?? {}) };
    }

    const override = rawTemplates?.[action] && typeof rawTemplates?.[action] === 'object' ? rawTemplates[action] : null;
    return { ...defaults, ...(override ?? {}) };
  };

  const ensureI18nTemplates = (rawTemplates: any): Record<NotificationLang, Record<string, any>> => {
    if (isI18nTemplateShape(rawTemplates)) {
      const next: any = { ...(rawTemplates ?? {}) };
      for (const lang of M365_TEMPLATE_LANGS) {
        if (!next[lang] || typeof next[lang] !== 'object') next[lang] = {};
      }
      return next as Record<NotificationLang, Record<string, any>>;
    }

    const legacy = rawTemplates && typeof rawTemplates === 'object' ? rawTemplates : {};
    return {
      en: { ...legacy },
      fr: { ...legacy },
      zh: { ...legacy },
    };
  };

  const parseEmailListUi = (raw: string) => {
    const text = String(raw ?? '');
    const parts = text
      .split(/[\s,;]+/g)
      .map((p) => p.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      const key = p.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  };

  const isValidEmailUi = (value: string) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(value ?? '').trim());

  const getFlowValue = (status: string, role: M365RoleKey) => {
    const map = (m365Info?.settings?.flowMap ?? DEFAULT_FLOW_MAP) as M365FlowMap;
    return Boolean(map?.[status]?.[role]);
  };

  const updateFlowValue = (status: string, role: M365RoleKey, checked: boolean) => {
    setM365Info((prev) => {
      const settings = prev?.settings ?? defaultM365Settings;
      const flowMap = { ...(settings.flowMap ?? DEFAULT_FLOW_MAP) } as M365FlowMap;
      const entry = { ...(flowMap[status] ?? {}) };
      entry[role] = checked;
      flowMap[status] = entry;
      return {
        settings: { ...settings, flowMap },
        connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
        deviceCode: prev?.deviceCode ?? null,
      };
    });
  };

  const setFlowValuesBulk = (nextFlowMap: M365FlowMap) => {
    setM365Info((prev) => {
      const settings = prev?.settings ?? defaultM365Settings;
      return {
        settings: { ...settings, flowMap: nextFlowMap },
        connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
        deviceCode: prev?.deviceCode ?? null,
      };
    });
  };

  const toggleFlowColumn = (role: M365RoleKey) => {
    const settings = m365Info?.settings ?? defaultM365Settings;
    const current = (settings.flowMap ?? DEFAULT_FLOW_MAP) as M365FlowMap;
    const allOn = FLOW_STATUS_KEYS.every((status) => Boolean(current?.[status]?.[role]));
    const next: M365FlowMap = { ...current };
    for (const status of FLOW_STATUS_KEYS) {
      const entry = { ...(next[status] ?? {}) };
      entry[role] = !allOn;
      next[status] = entry;
    }
    setFlowValuesBulk(next);
  };

  const toggleFlowRow = (status: string) => {
    const settings = m365Info?.settings ?? defaultM365Settings;
    const current = (settings.flowMap ?? DEFAULT_FLOW_MAP) as M365FlowMap;
    const roles: M365RoleKey[] = ['sales', 'design', 'costing', 'admin'];
    const allOn = roles.every((role) => Boolean(current?.[status]?.[role]));
    const next: M365FlowMap = { ...current };
    const entry = { ...(next[status] ?? {}) };
    for (const role of roles) entry[role] = !allOn;
    next[status] = entry;
    setFlowValuesBulk(next);
  };

  const defaultM365Settings: M365Settings = {
    enabled: false,
    tenantId: '',
    clientId: '',
    senderUpn: '',
    appBaseUrl: '',
    recipientsSales: '',
    recipientsDesign: '',
    recipientsCosting: '',
    recipientsAdmin: '',
    testMode: false,
    testEmail: '',
    flowMap: DEFAULT_FLOW_MAP,
    templates: null,
  };

  const loadM365Info = async () => {
    const startedAt = Date.now();
    setIsM365Loading(true);
    setHasM365Error(false);
    try {
      const res = await fetch('/api/admin/m365');
      if (!res.ok) throw new Error(`Failed to load M365 settings: ${res.status}`);
      const data = await res.json();
      const nextSettings: M365Settings = {
        ...defaultM365Settings,
        ...(data?.settings ?? {}),
        flowMap: data?.settings?.flowMap ?? DEFAULT_FLOW_MAP,
        templates: data?.settings?.templates ?? null,
      };
      setM365Info({
        settings: nextSettings,
        connection: data?.connection ?? { hasRefreshToken: false, expiresAt: null },
        deviceCode: data?.deviceCode ?? null,
      });
      setM365BaselineSettingsJson(stableStringify(nextSettings));
    } catch (error) {
      console.error('Failed to load M365 settings:', error);
      setM365Info(null);
      setHasM365Error(true);
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsM365Loading(false);
    }
  };

  const saveM365Settings = async () => {
    const payload = m365Info?.settings ?? defaultM365Settings;
    try {
      const res = await fetch('/api/admin/m365', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error || `Failed to save M365 settings: ${res.status}`;
        throw new Error(msg);
      }
      setM365Info((prev) => ({
        settings: data?.settings ?? payload,
        connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
        deviceCode: prev?.deviceCode ?? null,
      }));
      setM365BaselineSettingsJson(stableStringify(data?.settings ?? payload));
      toast({ title: t.settings.saveChanges, description: t.settings.saveChanges });
    } catch (error) {
      console.error('Failed to save M365 settings:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const updateTemplateField = (lang: NotificationLang, action: M365ActionKey, field: keyof M365EmailTemplate, value: string) => {
    setM365Info((prev) => {
      const settings = prev?.settings ?? defaultM365Settings;
      const raw = settings.templates;
      const nextTemplates = ensureI18nTemplates(raw);
      const bucket = { ...(nextTemplates[lang] ?? {}) };
      const current = getTemplateForUi(nextTemplates, lang, action);
      bucket[action] = { ...current, [field]: value };
      nextTemplates[lang] = bucket;
      return {
        settings: { ...settings, templates: nextTemplates },
        connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
        deviceCode: prev?.deviceCode ?? null,
      };
    });
  };

  const previewM365Template = async () => {
    setIsM365PreviewLoading(true);
    try {
      const res = await fetch('/api/admin/m365/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventType: m365SelectedAction,
          status: m365PreviewStatus,
          requestId: m365PreviewRequestId,
          lang: m365TemplateLang,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
      setM365PreviewSubject(String(data?.subject ?? ''));
      setM365PreviewHtml(String(data?.html ?? ''));
    } catch (error) {
      console.error('Failed to preview template:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    } finally {
      setIsM365PreviewLoading(false);
    }
  };

  const startM365DeviceCode = async () => {
    try {
      const res = await fetch('/api/admin/m365/device-code', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error || `Failed to start device code: ${res.status}`;
        throw new Error(msg);
      }
      setM365LastPollStatus(null);
      await loadM365Info();
      toast({ title: t.settings.m365Connect, description: t.settings.m365DeviceCodeHint });
    } catch (error) {
      console.error('Failed to start device code flow:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const pollM365Connection = async () => {
    try {
      const isConnected = Boolean(m365Info?.connection?.hasRefreshToken);
      const url = isConnected ? '/api/admin/m365/check' : '/api/admin/m365/poll';
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          typeof data?.error === 'string'
            ? data.error
            : data?.error
              ? JSON.stringify(data.error)
              : `Poll failed: ${res.status}`;
        throw new Error(msg);
      }
      setM365LastPollStatus(data?.status ?? null);
      await loadM365Info();
      toast({ title: t.settings.m365ConnectionStatus, description: String(data?.status ?? '') });
    } catch (error) {
      console.error('Failed to poll M365 connection:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const disconnectM365 = async () => {
    try {
      const res = await fetch('/api/admin/m365/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`);
      setM365LastPollStatus(null);
      await loadM365Info();
      toast({ title: t.settings.m365Disconnect, description: t.settings.m365Disconnect });
    } catch (error) {
      console.error('Failed to disconnect M365:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const sendM365TestEmail = async () => {
    try {
      const res = await fetch('/api/admin/m365/test-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toEmail: m365TestEmail }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error || `Test email failed: ${res.status}`;
        throw new Error(msg);
      }
      toast({ title: t.settings.m365TestEmail, description: t.settings.m365TestEmail });
    } catch (error) {
      console.error('Failed to send test email:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const loadDeployInfo = async () => {
    const startedAt = Date.now();
    setIsDeployLoading(true);
    setHasDeployError(false);
    try {
      const res = await fetch(`/api/admin/deploy-info?lines=200&ts=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Failed to load deploy info: ${res.status}`);
      const data = await res.json();

      const hasGitInfo = Boolean(
        data?.git?.hash || data?.git?.message || data?.git?.author || data?.git?.date
      );

      if (hasGitInfo) {
        setDeployInfo(data);
        return;
      }

      // Fallback for deployments that only ship `dist/` without a local git repo.
      try {
        const buildRes = await fetch('/build-info.json', { cache: 'no-store' });
        if (!buildRes.ok) {
          setDeployInfo(data);
          return;
        }

        const buildInfo = await buildRes.json();
        setDeployInfo({
          ...data,
          git: {
            hash: String(buildInfo?.hash ?? ''),
            message: String(buildInfo?.message ?? ''),
            author: String(buildInfo?.author ?? ''),
            date: String(buildInfo?.date ?? ''),
          },
        });
      } catch {
        setDeployInfo(data);
      }
    } catch (error) {
      console.error('Failed to load deploy info:', error);
      setDeployInfo(null);
      setHasDeployError(true);
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsDeployLoading(false);
    }
  };

  const copyText = async (text: string) => {
    const raw = String(text ?? '');
    if (!raw.trim()) return;
    try {
      await navigator.clipboard.writeText(raw);
      toast({ title: t.common.copied, description: raw.length > 24 ? `${raw.slice(0, 24)}...` : raw });
    } catch (e) {
      console.error('Failed to copy:', e);
      toast({ title: t.request.error, description: 'Copy failed', variant: 'destructive' });
    }
  };

  const loadDbMonitor = async () => {
    const startedAt = Date.now();
    setIsDbMonitorLoading(true);
    setHasDbMonitorError(false);
    try {
      const res = await fetch('/api/admin/db-monitor');
      if (!res.ok) throw new Error(`Failed to load DB monitor: ${res.status}`);
      const data = await res.json();
      setDbMonitor(data);
    } catch (error) {
      console.error('Failed to load DB monitor:', error);
      setDbMonitor(null);
      setHasDbMonitorError(true);
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsDbMonitorLoading(false);
    }
  };

  const loadDbBackups = async () => {
    const startedAt = Date.now();
    setIsDbBackupsLoading(true);
    setDbBackupError(null);
    try {
      const res = await fetch('/api/admin/db-backups');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Failed to load backups: ${res.status}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      setDbBackups(items);
      const sets = normalizeDbBackupSets(data?.sets);
      setDbBackupSets(sets.length ? sets : toBackupSetsFromItems(items));
      setDbBackupDirectory(normalizeDbBackupDirectory(data?.directory));
      setDbBackupRetentionKept(normalizeDbBackupRetentionKept(data?.retention?.kept));
      setDbBackupAutomatic((data?.automatic ?? null) as DbBackupAutomaticState | null);
    } catch (error) {
      console.error('Failed to load DB backups:', error);
      setDbBackupError(String((error as any)?.message ?? error));
      setDbBackups([]);
      setDbBackupSets([]);
      setDbBackupRetentionKept(null);
      setDbBackupAutomatic(null);
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsDbBackupsLoading(false);
    }
  };

  const loadDbBackupConfig = async () => {
    try {
      const res = await fetch('/api/admin/db-backup-config');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Failed to load backup config: ${res.status}`);
      setDbBackupConfig(data as DbBackupConfig);
      setDbBackupSetupForm((prev) => ({
        ...prev,
        backupHost: String(data?.host ?? prev.backupHost),
        backupPort: Number.isFinite(Number(data?.port)) ? Number(data?.port) : prev.backupPort,
        backupDatabase: String(data?.databaseName ?? prev.backupDatabase),
        backupUser: String(data?.backupUser ?? prev.backupUser),
        enabled: data?.enabled !== false,
        scheduleHour: Number.isFinite(Number(data?.scheduleHour)) ? Number(data?.scheduleHour) : prev.scheduleHour,
        scheduleMinute: Number.isFinite(Number(data?.scheduleMinute)) ? Number(data?.scheduleMinute) : prev.scheduleMinute,
      }));
    } catch (error) {
      console.error('Failed to load backup config:', error);
    }
  };

  const createDbBackup = async () => {
    setIsDbBackupCreating(true);
    setDbBackupError(null);
    try {
      const res = await fetch('/api/admin/db-backups', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Backup failed: ${res.status}`);
      const items = Array.isArray(data?.items) ? data.items : [];
      setDbBackups(items);
      const sets = normalizeDbBackupSets(data?.sets);
      setDbBackupSets(sets.length ? sets : toBackupSetsFromItems(items));
      setDbBackupDirectory(normalizeDbBackupDirectory(data?.directory ?? dbBackupDirectory));
      setDbBackupRetentionKept(
        normalizeDbBackupRetentionKept(data?.retention?.kept ?? data?.created?.retention?.kept)
      );
      setDbBackupAutomatic((data?.automatic ?? null) as DbBackupAutomaticState | null);
      const createdName = String(data?.created?.fileName ?? '').trim();
      toast({
        title: 'Backup created',
        description: createdName ? `${createdName}` : 'Database backup completed.',
      });
    } catch (error) {
      console.error('Failed to create DB backup:', error);
      const message = String((error as any)?.message ?? error);
      setDbBackupError(message);
      toast({
        title: t.request.error,
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDbBackupCreating(false);
    }
  };

  const saveDbBackupSetup = async () => {
    setIsDbBackupSetupSaving(true);
    setDbBackupError(null);
    try {
      const payload = {
        ...dbBackupSetupForm,
        adminPort: Number(dbBackupSetupForm.adminPort),
        backupPort: Number(dbBackupSetupForm.backupPort),
        scheduleHour: Number(dbBackupSetupForm.scheduleHour),
        scheduleMinute: Number(dbBackupSetupForm.scheduleMinute),
      };
      const res = await fetch('/api/admin/db-backup-config/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Backup setup failed: ${res.status}`);
      setDbBackupConfig(data as DbBackupConfig);
      setIsDbBackupSetupOpen(false);
      await loadDbBackups();
      toast({
        title: 'Backup setup complete',
        description: 'Backup credentials were saved and validated.',
      });
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      setDbBackupError(message);
      toast({
        title: t.request.error,
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDbBackupSetupSaving(false);
    }
  };

  const restoreDbBackup = async (fileName: string) => {
    setIsDbBackupRestoring(true);
    setDbBackupError(null);
    try {
      const res = await fetch('/api/admin/db-backups/restore', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName, includeGlobals: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Restore failed: ${res.status}`);
      setDbBackupRestoreTarget(null);
      const items = Array.isArray(data?.items) ? data.items : [];
      setDbBackups(items);
      const sets = normalizeDbBackupSets(data?.sets);
      setDbBackupSets(sets.length ? sets : toBackupSetsFromItems(items));
      setDbBackupRetentionKept(normalizeDbBackupRetentionKept(data?.retention?.kept));
      setDbBackupAutomatic((data?.automatic ?? null) as DbBackupAutomaticState | null);
      toast({
        title: 'Restore completed',
        description: `${fileName} restored successfully.`,
      });
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      setDbBackupError(message);
      toast({
        title: t.request.error,
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsDbBackupRestoring(false);
      setDbBackupRestoreTarget(null);
    }
  };

  const initDbBackupImport = async () => {
    const res = await fetch('/api/admin/db-backups/import/init', { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Import init failed: ${res.status}`);
    const importId = String(data?.importId ?? '').trim();
    const directory = String(data?.directory ?? '').trim();
    if (!importId) throw new Error('Import init failed: missing importId');
    setDbBackupImportId(importId);
    setDbBackupImportDirectory(directory);
    setDbBackupImportSets(normalizeDbBackupSets(data?.sets));
    return importId;
  };

  const validateDbBackupImport = async (importId: string) => {
    const startedAt = Date.now();
    setIsDbBackupImportValidating(true);
    setDbBackupImportError(null);
    try {
      const res = await fetch(`/api/admin/db-backups/import/${encodeURIComponent(importId)}/validate`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Import validate failed: ${res.status}`);
      setDbBackupImportDirectory(String(data?.directory ?? dbBackupImportDirectory));
      setDbBackupImportSets(normalizeDbBackupSets(data?.sets));
      toast({ title: 'Import validated', description: 'Uploaded files were scanned successfully.' });
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      setDbBackupImportError(message);
      toast({ title: t.request.error, description: message, variant: 'destructive' });
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsDbBackupImportValidating(false);
    }
  };

  const uploadDbBackupImportFiles = async () => {
    if (!dbBackupImportFiles.length) {
      toast({ title: t.request.error, description: 'Select the 3 backup files first (.dump, _globals.sql, _manifest.json).', variant: 'destructive' });
      return;
    }
    setIsDbBackupImportUploading(true);
    setDbBackupImportError(null);
    try {
      const importId = dbBackupImportId || (await initDbBackupImport());
      const form = new FormData();
      dbBackupImportFiles.forEach((f) => form.append('files', f, f.name));
      const res = await fetch(`/api/admin/db-backups/import/${encodeURIComponent(importId)}/upload`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Upload failed: ${res.status}`);
      setDbBackupImportDirectory(String(data?.directory ?? dbBackupImportDirectory));
      setDbBackupImportSets(normalizeDbBackupSets(data?.sets));
      toast({ title: 'Files uploaded', description: 'Import files were uploaded successfully.' });
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      setDbBackupImportError(message);
      toast({ title: t.request.error, description: message, variant: 'destructive' });
    } finally {
      setIsDbBackupImportUploading(false);
    }
  };

  const restoreDbBackupImport = async (prefix: string) => {
    const importId = String(dbBackupImportId ?? '').trim();
    if (!importId) return;
    setIsDbBackupImportRestoring(true);
    setDbBackupImportError(null);
    try {
      const res = await fetch(`/api/admin/db-backups/import/${encodeURIComponent(importId)}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, includeGlobals: dbBackupImportIncludeGlobals }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Import restore failed: ${res.status}`);

      const items = Array.isArray(data?.items) ? data.items : [];
      setDbBackups(items);
      const sets = normalizeDbBackupSets(data?.sets);
      setDbBackupSets(sets.length ? sets : toBackupSetsFromItems(items));
      setDbBackupRetentionKept(normalizeDbBackupRetentionKept(data?.retention?.kept));
      setDbBackupAutomatic((data?.automatic ?? null) as DbBackupAutomaticState | null);

      toast({ title: 'Restore completed', description: `${prefix} restored successfully.` });
    } catch (error) {
      const message = String((error as any)?.message ?? error);
      setDbBackupImportError(message);
      toast({ title: t.request.error, description: message, variant: 'destructive' });
    } finally {
      setIsDbBackupImportRestoring(false);
      setDbBackupImportRestoreTarget(null);
    }
  };

  const refreshDbMonitor = async () => {
    const startedAt = Date.now();
    setIsDbMonitorLoading(true);
    setHasDbMonitorError(false);
    try {
      const res = await fetch('/api/admin/db-monitor/refresh', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Refresh failed: ${res.status}`);
      setDbMonitor(data);
    } catch (error) {
      console.error('Failed to refresh DB monitor:', error);
      setHasDbMonitorError(true);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsDbMonitorLoading(false);
    }
  };

  useEffect(() => {
    loadDeployInfo();
    loadM365Info();
    loadDbMonitor();
    loadDbBackups();
    loadDbBackupConfig();
    refreshUsers().catch((error) => {
      console.error('Failed to load users:', error);
    });
  }, []);

  const loadFeedback = useCallback(async () => {
    const startedAt = Date.now();
    setIsFeedbackLoading(true);
    setHasFeedbackError(false);
    try {
      const res = await fetch('/api/feedback');
      if (!res.ok) throw new Error(`Failed to load feedback: ${res.status}`);
      const data = await res.json();
      setFeedbackItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load feedback:', error);
      setFeedbackItems([]);
      setHasFeedbackError(true);
    } finally {
      await ensureMinSpinnerMs(startedAt);
      setIsFeedbackLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedFeedbackId) return;
    if (!isFeedbackDetailsOpen) return;
    const stillExists = feedbackItems.some((f) => f.id === selectedFeedbackId);
    if (!stillExists) {
      setIsFeedbackDetailsOpen(false);
      setSelectedFeedbackId(null);
    }
  }, [feedbackItems, isFeedbackDetailsOpen, selectedFeedbackId]);

  const updateFeedbackStatus = async (id: string, status: 'submitted' | 'ongoing' | 'finished' | 'cancelled') => {
    try {
      const res = await fetch(`/api/feedback/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Failed to update feedback: ${res.status}`);
      }
      setFeedbackItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status, updatedAt: data?.updatedAt ?? item.updatedAt } : item))
      );
      if (selectedFeedbackId === id) {
        // Keep the details panel in sync.
        setSelectedFeedbackId(id);
      }
      toast({ title: t.common.update, description: t.feedback.statusUpdated });
    } catch (error) {
      console.error('Failed to update feedback status:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const deleteFeedback = async (id: string) => {
    try {
      const res = await fetch(`/api/feedback/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to delete feedback: ${res.status}`);
      }
      setFeedbackItems((prev) => prev.filter((item) => item.id !== id));
      if (selectedFeedbackId === id) {
        setIsFeedbackDetailsOpen(false);
        setSelectedFeedbackId(null);
      }
      toast({ title: t.common.delete, description: t.feedback.deleted });
    } catch (error) {
      console.error('Failed to delete feedback:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    } finally {
      setFeedbackDeleteId(null);
    }
  };

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    const handleFeedbackSubmitted = () => {
      loadFeedback();
    };
    window.addEventListener('feedback:submitted', handleFeedbackSubmitted);
    return () => {
      window.removeEventListener('feedback:submitted', handleFeedbackSubmitted);
    };
  }, [loadFeedback]);

  const exportRequestsCsv = () => {
    if (isLoading) {
      toast({
        title: t.common.loading,
        description: t.common.loading,
      });
      return;
    }

    if (!requests.length) {
      toast({
        title: t.table.noRequestsFound,
        description: t.table.noRequestsFound,
      });
      return;
    }

    const headers = [
      'id',
      'status',
      'clientName',
      'clientContact',
      'applicationVehicle',
      'applicationVehicleOther',
      'country',
      'countryOther',
      'city',
      'expectedQty',
      'repeatability',
      'expectedDeliverySelections',
      'clientExpectedDeliveryDate',
      'workingCondition',
      'workingConditionOther',
      'usageType',
      'usageTypeOther',
      'environment',
      'environmentOther',
      'products',
      'axleLocation',
      'axleLocationOther',
      'articulationType',
      'articulationTypeOther',
      'configurationType',
      'configurationTypeOther',
      'quantity',
      'loadsKg',
      'speedsKmh',
      'tyreSize',
      'trackMm',
      'studsPcdMode',
      'studsPcdStandardSelections',
      'studsPcdSpecialText',
      'wheelBase',
      'finish',
      'brakeType',
      'brakeSize',
      'brakePowerType',
      'brakeCertificate',
      'mainBodySectionType',
      'clientSealingRequest',
      'cupLogo',
      'suspension',
      'otherRequirements',
      'attachments',
      'createdBy',
      'createdByName',
      'createdAt',
      'updatedAt',
      'designNotes',
      'acceptanceMessage',
      'expectedDesignReplyDate',
      'clarificationComment',
      'clarificationResponse',
      'costingNotes',
      'deliveryLeadtime',
      'sellingPrice',
      'calculatedMargin',
      'history',
    ];

    const formatValue = (value: any) => {
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value) || typeof value === 'object') {
        return JSON.stringify(value, (key, val) => (val instanceof Date ? val.toISOString() : val));
      }
      return String(value);
    };

    const escapeCsv = (value: string) => {
      if (/[",\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const rows = requests.map((req) =>
      headers.map((header) => escapeCsv(formatValue((req as any)[header]))).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const filename = `requests-${new Date().toISOString().slice(0, 10)}.csv`;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportRequestsXlsx = async () => {
    if (isLoading) {
      toast({
        title: t.common.loading,
        description: t.common.loading,
      });
      return;
    }

    if (!requests.length) {
      toast({
        title: t.table.noRequestsFound,
        description: t.table.noRequestsFound,
      });
      return;
    }

    // Dynamic import to avoid loading XLSX for all users.
    const XLSX = await import('xlsx');

    const headers = [
      'id',
      'status',
      'clientName',
      'clientContact',
      'applicationVehicle',
      'applicationVehicleOther',
      'country',
      'countryOther',
      'city',
      'expectedQty',
      'repeatability',
      'expectedDeliverySelections',
      'clientExpectedDeliveryDate',
      'workingCondition',
      'workingConditionOther',
      'usageType',
      'usageTypeOther',
      'environment',
      'environmentOther',
      'products',
      'axleLocation',
      'axleLocationOther',
      'articulationType',
      'articulationTypeOther',
      'configurationType',
      'configurationTypeOther',
      'quantity',
      'loadsKg',
      'speedsKmh',
      'tyreSize',
      'trackMm',
      'studsPcdMode',
      'studsPcdStandardSelections',
      'studsPcdSpecialText',
      'wheelBase',
      'finish',
      'brakeType',
      'brakeSize',
      'brakePowerType',
      'brakeCertificate',
      'mainBodySectionType',
      'clientSealingRequest',
      'cupLogo',
      'suspension',
      'otherRequirements',
      'attachments',
      'createdBy',
      'createdByName',
      'createdAt',
      'updatedAt',
      'designNotes',
      'acceptanceMessage',
      'expectedDesignReplyDate',
      'clarificationComment',
      'clarificationResponse',
      'costingNotes',
      'deliveryLeadtime',
      'sellingPrice',
      'calculatedMargin',
      'history',
    ];

    const formatValue = (value: any) => {
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value) || typeof value === 'object') {
        return JSON.stringify(value, (key, val) => (val instanceof Date ? val.toISOString() : val));
      }
      return String(value);
    };

    const data = requests.map((req) => {
      const row: Record<string, string> = {};
      for (const h of headers) {
        row[h] = formatValue((req as any)[h]);
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Requests');

    const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const filename = `requests-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isIOS) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const openEditItemDialog = (category: ListCategory, listName: string, item: ListItem) => {
    setEditingItem({ category, listName, item });
    setEditItemValue(item.value);
    setIsEditItemOpen(true);
  };

  const handleEditItem = async () => {
    if (!editingItem || !editItemValue.trim()) return;

    try {
      await updateListItem(editingItem.category, editingItem.item.id, editItemValue.trim());
      setIsEditItemOpen(false);
      setEditingItem(null);
      setEditItemValue('');
      toast({
        title: t.settings.itemUpdated,
        description: t.settings.itemUpdatedDesc,
      });
    } catch (error) {
      console.error('Failed to update item:', error);
      toast({
        title: t.request.error,
        description: t.request.failedSubmit,
        variant: 'destructive',
      });
    }
  };

  const handleToast = (title: string, description: string) => {
    toast({ title, description });
  };

  const handleAddUser = async () => {
    if (!newUserForm.name.trim() || !newUserForm.email.trim() || !newUserForm.password.trim()) {
      toast({
        title: t.settings.validationError,
        description: t.settings.validationErrorDesc,
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate email
    if (users.some(u => u.email.toLowerCase() === newUserForm.email.toLowerCase())) {
      toast({
        title: t.settings.duplicateEmail,
        description: t.settings.duplicateEmailDesc,
        variant: 'destructive',
      });
      return;
    }

    try {
      const newUser = await createUser({
        name: newUserForm.name,
        email: newUserForm.email,
        role: newUserForm.role,
        preferredLanguage: newUserForm.preferredLanguage,
        password: newUserForm.password,
      });
      setNewUserForm({ name: '', email: '', role: 'sales', preferredLanguage: 'en', password: '' });
      setIsAddUserOpen(false);
      toast({
        title: t.settings.userAdded,
        description: `${newUser.name} ${t.settings.userAddedDesc}`,
      });
    } catch (error) {
      console.error('Failed to add user:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const handleEditUser = async () => {
    if (!editingUser) return;

    if (!editingUser.name.trim() || !editingUser.email.trim()) {
      toast({
        title: t.settings.validationError,
        description: t.settings.validationErrorEditDesc,
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate email (excluding current user)
    if (users.some(u => u.id !== editingUser.id && u.email.toLowerCase() === editingUser.email.toLowerCase())) {
      toast({
        title: t.settings.duplicateEmail,
        description: t.settings.duplicateEmailDesc,
        variant: 'destructive',
      });
      return;
    }

    try {
      await updateUser(editingUser.id, {
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        preferredLanguage: editingUser.preferredLanguage,
        newPassword: editingUser.newPassword?.trim() || '',
      });
      setIsEditUserOpen(false);
      setEditingUser(null);
      toast({
        title: t.settings.userUpdated,
        description: t.settings.userUpdatedDesc,
      });
    } catch (error) {
      console.error('Failed to update user:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const handleQuickUpdateUserLanguage = async (userItem: UserItem, nextLanguage: 'en' | 'fr' | 'zh') => {
    const userId = String(userItem?.id ?? '').trim();
    if (!userId) return;
    const normalized = (nextLanguage === 'fr' || nextLanguage === 'zh') ? nextLanguage : 'en';
    if ((userItem.preferredLanguage ?? 'en') === normalized) return;

    setLanguageUpdatingUserIds((prev) => ({ ...prev, [userId]: true }));
    try {
      await updateUser(userId, {
        name: userItem.name,
        email: userItem.email,
        role: userItem.role,
        preferredLanguage: normalized,
        newPassword: '',
      });
      toast({
        title: t.settings.userUpdated,
        description: t.settings.userUpdatedDesc,
      });
    } catch (error) {
      console.error('Failed to update user language:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    } finally {
      setLanguageUpdatingUserIds((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    
    // Prevent deleting current user
    if (userToDelete?.email === user?.email) {
      toast({
        title: t.settings.cannotDeleteTitle,
        description: t.settings.cannotDeleteSelf,
        variant: 'destructive',
      });
      return;
    }

    try {
      await deleteUser(userId);
      toast({
        title: t.settings.userDeleted,
        description: `${userToDelete?.name} ${t.settings.userDeletedDesc}`,
      });
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    }
  };

  const openEditUserDialog = (userItem: UserItem) => {
    setEditingUser({ ...userItem, newPassword: '' });
    setIsEditUserOpen(true);
  };

  const loadAccessEmailPreview = async (
    userId: string,
    appUrl: string,
    temporaryPassword: string
  ) => {
    setIsAccessEmailPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/access-email/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appUrl, temporaryPassword }),
      });
      const data = (await res.json().catch(() => null)) as AccessEmailPreview | { error?: string } | null;
      if (!res.ok) {
        throw new Error(String((data as any)?.error ?? `Failed to load preview: ${res.status}`));
      }
      const parsed = data as AccessEmailPreview;
      setAccessEmailAppUrl(String(parsed.appUrl ?? appUrl));
      setAccessEmailTemporaryPassword(String(parsed.temporaryPassword ?? temporaryPassword));
      setAccessEmailSubject(String(parsed.subject ?? ''));
      setAccessEmailHtml(String(parsed.html ?? ''));
    } catch (error) {
      console.error('Failed to load access email preview:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    } finally {
      setIsAccessEmailPreviewLoading(false);
    }
  };

  const openAccessEmailDialog = (userItem: UserItem) => {
    const fallbackBaseUrl =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : '';
    const defaultAppUrl = String(m365Info?.settings?.appBaseUrl ?? fallbackBaseUrl).trim();
    setAccessEmailUser(userItem);
    setAccessEmailAppUrl(defaultAppUrl);
    setAccessEmailTemporaryPassword('');
    setAccessEmailSubject('');
    setAccessEmailHtml('');
    setIsAccessEmailOpen(true);
    loadAccessEmailPreview(userItem.id, defaultAppUrl, '');
  };

  const handleSendAccessEmail = async () => {
    if (!accessEmailUser) return;
    if (!accessEmailAppUrl.trim()) {
      toast({
        title: t.settings.validationError,
        description: t.settings.m365AppBaseUrl,
        variant: 'destructive',
      });
      return;
    }
    if (!accessEmailTemporaryPassword.trim()) {
      toast({
        title: t.settings.validationError,
        description: t.settings.passwordRequired,
        variant: 'destructive',
      });
      return;
    }

    setIsAccessEmailSending(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(accessEmailUser.id)}/access-email/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appUrl: accessEmailAppUrl.trim(),
          temporaryPassword: accessEmailTemporaryPassword.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(String(data?.error ?? `Failed to send access email: ${res.status}`));
      }

      toast({
        title: t.settings.accessEmailSentTitle,
        description: `${accessEmailUser.email} ${t.settings.accessEmailSentDesc}`,
      });
      setIsAccessEmailOpen(false);
      setAccessEmailUser(null);
      setAccessEmailHtml('');
      setAccessEmailSubject('');
    } catch (error) {
      console.error('Failed to send access email:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    } finally {
      setIsAccessEmailSending(false);
    }
  };

  const handleImportLegacyUsers = async () => {
    setIsLegacyUserImporting(true);
    try {
      let payloadUsers: Array<{ name: string; email: string; role: UserRole; password: string }> = [];
      for (const key of LEGACY_USERS_STORAGE_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const usersFromKey = Array.isArray(parsed?.users) ? parsed.users : [];
        if (!usersFromKey.length) continue;
        payloadUsers = usersFromKey
          .map((entry: any) => ({
            name: String(entry?.name ?? '').trim(),
            email: String(entry?.email ?? '').trim(),
            role: String(entry?.role ?? '').trim() as UserRole,
            password: String(entry?.password ?? '').trim(),
          }))
          .filter(
            (entry) =>
              entry.name &&
              entry.email &&
              entry.password &&
              (entry.role === 'sales' || entry.role === 'design' || entry.role === 'costing' || entry.role === 'admin')
          );
        if (payloadUsers.length) break;
      }

      if (!payloadUsers.length) {
        throw new Error('No legacy users found in this browser.');
      }

      const result = await importLegacyUsers(payloadUsers);
      toast({
        title: 'Legacy users imported',
        description: `Created: ${result.created}, Updated: ${result.updated}`,
      });
    } catch (error) {
      console.error('Failed to import legacy users:', error);
      toast({
        title: t.request.error,
        description: String((error as any)?.message ?? error),
        variant: 'destructive',
      });
    } finally {
      setIsLegacyUserImporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t.settings.title}</h1>
        <p className="text-muted-foreground mt-1">
          {t.settings.description}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsContent value="export" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">{t.settings.export}</h2>
                <p className="text-sm text-muted-foreground">{t.settings.exportDataDesc || t.settings.exportCsvDesc}</p>
              </div>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:self-start">
                <div className="inline-flex items-center rounded-xl border border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => setExportFormat('csv')}
                    aria-pressed={exportFormat === 'csv'}
                    className={cn(
                      'px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors',
                      exportFormat === 'csv'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-primary/10 hover:text-primary'
                    )}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('xlsx')}
                    aria-pressed={exportFormat === 'xlsx'}
                    className={cn(
                      'px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors',
                      exportFormat === 'xlsx'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-primary/10 hover:text-primary'
                    )}
                  >
                    Excel
                  </button>
                </div>
                <Button
                  onClick={() => (exportFormat === 'csv' ? exportRequestsCsv() : exportRequestsXlsx())}
                  className="md:min-w-32"
                >
                  <Download size={16} className="mr-2" />
                  {t.settings.export}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="lists" className="space-y-6">
          {(() => {
            const renderListPanel = (
              category: ListCategory,
              title: string,
              icon: any,
              list: ListItem[],
            ) => {
              const Icon = icon;
              return (
                <AccordionItem value={category} className="border border-border rounded-lg bg-card px-4 border-b-0">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex flex-1 items-center justify-between pr-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">{title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{(list?.length ?? 0)} items</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <ListManager
                      title={title}
                      icon={icon}
                      list={list}
                      listName={title}
                      onAddItem={(value) => addListItem(category, value)}
                      onDeleteItem={(id) => deleteListItem(category, id)}
                      onEditItem={(listName, item) => openEditItemDialog(category, listName, item)}
                      onReorderItems={(ids) => reorderListItems(category, ids)}
                      onToast={handleToast}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            };

            const productTypesCount =
              (configurationTypes?.length ?? 0) +
              (axleLocations?.length ?? 0) +
              (articulationTypes?.length ?? 0);

            return (
              <Accordion type="multiple" className="space-y-3">
                <AccordionItem value="product-types" className="border border-border rounded-lg bg-card px-4 border-b-0">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex flex-1 items-center justify-between pr-2">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">{t.settings.productTypes}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{productTypesCount} items</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <ListManager
                        title={t.settings.configurationTypes}
                        icon={Box}
                        list={configurationTypes}
                        listName={t.settings.configurationTypes}
                        onAddItem={(value) => addListItem('configurationTypes', value)}
                        onDeleteItem={(id) => deleteListItem('configurationTypes', id)}
                        onEditItem={(listName, item) => openEditItemDialog('configurationTypes', listName, item)}
                        onReorderItems={(ids) => reorderListItems('configurationTypes', ids)}
                        onToast={handleToast}
                      />
                      <ListManager
                        title={t.settings.axleLocations}
                        icon={Layers}
                        list={axleLocations}
                        listName={t.settings.axleLocations}
                        onAddItem={(value) => addListItem('axleLocations', value)}
                        onDeleteItem={(id) => deleteListItem('axleLocations', id)}
                        onEditItem={(listName, item) => openEditItemDialog('axleLocations', listName, item)}
                        onReorderItems={(ids) => reorderListItems('axleLocations', ids)}
                        onToast={handleToast}
                      />
                      <ListManager
                        title={t.settings.articulationTypes}
                        icon={ArrowRightLeft}
                        list={articulationTypes}
                        listName={t.settings.articulationTypes}
                        onAddItem={(value) => addListItem('articulationTypes', value)}
                        onDeleteItem={(id) => deleteListItem('articulationTypes', id)}
                        onEditItem={(listName, item) => openEditItemDialog('articulationTypes', listName, item)}
                        onReorderItems={(ids) => reorderListItems('articulationTypes', ids)}
                        onToast={handleToast}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {renderListPanel('applicationVehicles', t.settings.applicationVehicles, Truck, applicationVehicles)}
                {renderListPanel('countries', t.settings.countries, Globe, countries)}
                {renderListPanel('brakeSizes', t.settings.brakeSizes, SettingsIcon, brakeSizes)}
                {renderListPanel('brakeTypes', t.settings.brakeTypes, Circle, brakeTypes)}
                {renderListPanel('brakePowerTypes', t.settings.brakePowerTypes, SettingsIcon, brakePowerTypes)}
                {renderListPanel('brakeCertificates', t.settings.brakeCertificates, SettingsIcon, brakeCertificates)}
                {renderListPanel('mainBodySectionTypes', t.settings.mainBodySectionTypes, Box, mainBodySectionTypes)}
                {renderListPanel('clientSealingRequests', t.settings.clientSealingRequests, SettingsIcon, clientSealingRequests)}
                {renderListPanel('cupLogoOptions', t.settings.cupLogoOptions, Circle, cupLogoOptions)}
                {renderListPanel('suspensions', t.settings.suspensions, SettingsIcon, suspensions)}
                {renderListPanel('repeatabilityTypes', t.settings.repeatabilityTypes, Repeat, repeatabilityTypes)}
                {renderListPanel('expectedDeliveryOptions', t.settings.expectedDeliveryOptions, PackageCheck, expectedDeliveryOptions)}
                {renderListPanel('workingConditions', t.settings.workingConditions, Droplets, workingConditions)}
                {renderListPanel('usageTypes', t.settings.usageTypes, Route, usageTypes)}
                {renderListPanel('environments', t.settings.environments, Wind, environments)}
              </Accordion>
            );
          })()}
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => refreshUsers()} disabled={isUsersLoading || isLegacyUserImporting}>
              <span className={cn("mr-2 inline-flex", isUsersLoading ? "animate-spin" : "")}>
                <RefreshCw size={16} />
              </span>
              {isUsersLoading ? t.common.loading : 'Refresh users'}
            </Button>
            <Button
              variant="outline"
              onClick={handleImportLegacyUsers}
              disabled={isLegacyUserImporting || isUsersLoading}
            >
              {isLegacyUserImporting ? t.common.loading : 'Import legacy users'}
            </Button>
            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus size={16} className="mr-2" />
                  {t.settings.addUser}
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card">
                <DialogHeader>
                  <DialogTitle>{t.settings.addNewUser}</DialogTitle>
                  <DialogDescription>
                    {t.settings.createUserDesc}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-name">{t.common.name}</Label>
                    <Input
                      id="new-name"
                      value={newUserForm.name}
                      onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                      placeholder={t.settings.enterFullName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-email">{t.common.email}</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={newUserForm.email}
                      onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                      placeholder={t.settings.enterEmailAddress}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">{t.common.password}</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newUserForm.password}
                      onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                      placeholder={t.settings.enterPassword}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-role">{t.common.role}</Label>
                    <Select
                      value={newUserForm.role}
                      onValueChange={(value) => setNewUserForm({ ...newUserForm, role: value as UserRole })}
                    >
                      <SelectTrigger id="new-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border">
                        <SelectItem value="sales">{t.roles.sales}</SelectItem>
                        <SelectItem value="design">{t.roles.design}</SelectItem>
                        <SelectItem value="costing">{t.roles.costing}</SelectItem>
                        <SelectItem value="admin">{t.roles.admin}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-lang">{t.common.language}</Label>
                    <Select
                      value={newUserForm.preferredLanguage}
                      onValueChange={(value) =>
                        setNewUserForm({ ...newUserForm, preferredLanguage: value as 'en' | 'fr' | 'zh' })
                      }
                    >
                      <SelectTrigger id="new-lang">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border">
                        <SelectItem value="en">EN</SelectItem>
                        <SelectItem value="fr">FR</SelectItem>
                        <SelectItem value="zh">ZH</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddUserOpen(false)}>
                    {t.common.cancel}
                  </Button>
                  <Button onClick={handleAddUser}>{t.settings.addUser}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="font-semibold">{t.common.name}</TableHead>
                  <TableHead className="font-semibold">{t.common.email}</TableHead>
                  <TableHead className="font-semibold">{t.common.role}</TableHead>
                  <TableHead className="font-semibold">{t.common.language}</TableHead>
                  <TableHead className="font-semibold text-right">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isUsersLoading && users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t.common.loading}
                    </TableCell>
                  </TableRow>
                ) : null}
                {users.map((userItem) => (
                  <TableRow
                    key={userItem.id}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEditUserDialog(userItem)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEditUserDialog(userItem);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{userItem.name}</TableCell>
                    <TableCell>{userItem.email}</TableCell>
                    <TableCell>
                      {(() => {
                        const roleLabel = t.roles[userItem.role] || ROLE_CONFIG[userItem.role].label;
                        const roleDotClass: Record<UserRole, string> = {
                          sales: 'bg-info',
                          design: 'bg-warning',
                          costing: 'bg-success',
                          // Keep admin as a "danger" marker; chip remains neutral.
                          admin: 'bg-destructive',
                        };

                        return (
                          <span
                            title={roleLabel}
                            className={cn(
                              'inline-flex items-center justify-center gap-2',
                              // fixed size for consistent visuals across roles
                              'h-8 w-32 px-3 rounded-full',
                              // neutral chip style
                              'border border-border bg-muted/25 text-foreground/90',
                              'text-xs font-semibold tracking-wide shadow-sm'
                            )}
                          >
                            <span className={cn('h-2.5 w-2.5 rounded-full ring-1 ring-border/60', roleDotClass[userItem.role])} />
                            <span className="truncate">{roleLabel}</span>
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={userItem.preferredLanguage ?? 'en'}
                        onValueChange={(value) =>
                          handleQuickUpdateUserLanguage(userItem, value as 'en' | 'fr' | 'zh')
                        }
                        disabled={isUsersLoading || isLegacyUserImporting || Boolean(languageUpdatingUserIds[userItem.id])}
                      >
                        <SelectTrigger className="h-8 w-20" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border">
                          <SelectItem value="en">EN</SelectItem>
                          <SelectItem value="fr">FR</SelectItem>
                          <SelectItem value="zh">ZH</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAccessEmailDialog(userItem);
                          }}
                          title={t.settings.sendAccessEmail}
                        >
                          <Mail size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditUserDialog(userItem);
                          }}
                        >
                          <Pencil size={14} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={userItem.email === user?.email}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card">
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t.settings.deleteUser}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t.settings.deleteUserConfirm} {userItem.name}? {t.settings.deleteUserWarning}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDeleteUser(userItem.id)}
                              >
                                {t.common.delete}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Edit User Dialog */}
          <Dialog open={isEditUserOpen} onOpenChange={setIsEditUserOpen}>
            <DialogContent className="bg-card max-h-[90vh] overflow-hidden p-0 flex flex-col">
              <div className="px-6 pt-6 pb-4">
                <DialogHeader>
                  <DialogTitle>{t.settings.editUser}</DialogTitle>
                  <DialogDescription>
                    {t.settings.updateUserDesc}
                  </DialogDescription>
                </DialogHeader>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-4">
                {editingUser && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-name">{t.common.name}</Label>
                      <Input
                        id="edit-name"
                        value={editingUser.name}
                        onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-email">{t.common.email}</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editingUser.email}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-password">{t.settings.newPassword}</Label>
                      <Input
                        id="edit-password"
                        type="password"
                        value={editingUser.newPassword || ''}
                        onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                        placeholder={t.settings.leaveBlankKeepCurrent}
                      />
                      <p className="text-xs text-muted-foreground">{t.settings.leaveBlankKeepCurrent}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-role">{t.common.role}</Label>
                      <Select
                        value={editingUser.role}
                        onValueChange={(value) => setEditingUser({ ...editingUser, role: value as UserRole })}
                      >
                        <SelectTrigger id="edit-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border">
                          <SelectItem value="sales">{t.roles.sales}</SelectItem>
                          <SelectItem value="design">{t.roles.design}</SelectItem>
                          <SelectItem value="costing">{t.roles.costing}</SelectItem>
                          <SelectItem value="admin">{t.roles.admin}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-lang">{t.common.language}</Label>
                      <Select
                        value={editingUser.preferredLanguage}
                        onValueChange={(value) =>
                          setEditingUser({ ...editingUser, preferredLanguage: value as 'en' | 'fr' | 'zh' })
                        }
                      >
                        <SelectTrigger id="edit-lang">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border border-border">
                          <SelectItem value="en">EN</SelectItem>
                          <SelectItem value="fr">FR</SelectItem>
                          <SelectItem value="zh">ZH</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border bg-card px-6 py-4">
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>
                    {t.common.cancel}
                  </Button>
                  <Button onClick={handleEditUser}>{t.settings.saveChanges}</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isAccessEmailOpen}
            onOpenChange={(open) => {
              setIsAccessEmailOpen(open);
              if (!open) {
                setAccessEmailUser(null);
                setAccessEmailHtml('');
                setAccessEmailSubject('');
              }
            }}
          >
            <DialogContent className="bg-card max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin">
              <DialogHeader>
                <DialogTitle>{t.settings.sendAccessEmail}</DialogTitle>
                <DialogDescription>{t.settings.sendAccessEmailDesc}</DialogDescription>
              </DialogHeader>
              {accessEmailUser ? (
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t.common.name}</Label>
                      <Input value={accessEmailUser.name} disabled />
                    </div>
                    <div className="space-y-2">
                      <Label>{t.common.email}</Label>
                      <Input value={accessEmailUser.email} disabled />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="access-app-url">{t.settings.appPlatformLink}</Label>
                      <Input
                        id="access-app-url"
                        value={accessEmailAppUrl}
                        onChange={(e) => setAccessEmailAppUrl(e.target.value)}
                        placeholder="https://your-app-url"
                        disabled={isAccessEmailSending}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="access-temp-password">{t.settings.temporaryPassword}</Label>
                      <Input
                        id="access-temp-password"
                        value={accessEmailTemporaryPassword}
                        onChange={(e) => setAccessEmailTemporaryPassword(e.target.value)}
                        placeholder={t.settings.enterPassword}
                        disabled={isAccessEmailSending}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        loadAccessEmailPreview(
                          accessEmailUser.id,
                          accessEmailAppUrl.trim(),
                          accessEmailTemporaryPassword.trim()
                        )
                      }
                      disabled={isAccessEmailPreviewLoading || isAccessEmailSending}
                    >
                      {isAccessEmailPreviewLoading ? t.common.loading : t.settings.previewEmail}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => loadAccessEmailPreview(accessEmailUser.id, accessEmailAppUrl.trim(), '')}
                      disabled={isAccessEmailPreviewLoading || isAccessEmailSending}
                    >
                      {t.settings.regeneratePassword}
                    </Button>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <div className="text-xs text-muted-foreground">{t.settings.accessEmailSubject}</div>
                    <div className="text-sm font-medium text-foreground break-words">{accessEmailSubject || '-'}</div>
                    <div className="text-xs text-muted-foreground">{t.settings.accessEmailPreview}</div>
                    <iframe
                      title="access-email-preview"
                      className="w-full h-[360px] rounded-md border border-border bg-background"
                      srcDoc={accessEmailHtml || '<div></div>'}
                    />
                  </div>
                </div>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAccessEmailOpen(false)} disabled={isAccessEmailSending}>
                  {t.common.cancel}
                </Button>
                <Button onClick={handleSendAccessEmail} disabled={!accessEmailUser || isAccessEmailSending}>
                  {isAccessEmailSending ? t.common.loading : t.settings.sendAccessEmail}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </TabsContent>

        <TabsContent value="feedback" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold text-foreground">{t.feedback.tableTitle}</h3>
                <p className="text-sm text-muted-foreground">{t.feedback.tableDesc}</p>
              </div>
              <Button variant="outline" onClick={loadFeedback} disabled={isFeedbackLoading}>
                <span className={cn("mr-2 inline-flex", isFeedbackLoading ? "animate-spin" : "")}>
                  <RefreshCw size={16} />
                </span>
                {isFeedbackLoading ? t.common.loading : t.feedback.refresh}
              </Button>
            </div>

            <div className="mt-4">
              {hasFeedbackError ? (
                <p className="text-sm text-destructive">{t.feedback.loadFailed}</p>
              ) : isFeedbackLoading ? (
                <p className="text-sm text-muted-foreground">{t.common.loading}</p>
              ) : feedbackItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.feedback.noFeedback}</p>
              ) : (
                <>
                  <div className="space-y-3 md:hidden">
                    {feedbackItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border bg-card p-4 space-y-2 cursor-pointer hover:bg-muted/10 transition-colors"
                        onClick={() => openFeedbackDetails(item)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {item.type === 'bug' ? t.feedback.typeBug : t.feedback.typeFeature}
                          </span>
                          {renderStatusPill(item)}
                        </div>
                        <div className="font-semibold text-foreground">{item.title}</div>
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{t.feedback.severity}: {item.severity ? severityLabels[item.severity] || item.severity : '-'}</span>
                          <span>{t.feedback.page}: {item.pagePath || '-'}</span>
                          <span>{item.createdAt ? format(new Date(item.createdAt), 'MMM d, yyyy') : '-'}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t.feedback.reportedBy}: {item.userName || '-'} {item.userEmail ? `(${item.userEmail})` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="font-semibold">{t.feedback.type}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.title}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.status}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.severity}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.reportedBy}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.page}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.createdAt}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feedbackItems.map((item) => (
                          <TableRow
                            key={item.id}
                            className="cursor-pointer hover:bg-muted/20"
                            onClick={() => openFeedbackDetails(item)}
                          >
                            <TableCell className="capitalize">
                              {item.type === 'bug' ? t.feedback.typeBug : t.feedback.typeFeature}
                            </TableCell>
                            <TableCell className="font-medium">{item.title}</TableCell>
                            <TableCell>
                              {renderStatusPill(item)}
                            </TableCell>
                            <TableCell>{item.severity ? severityLabels[item.severity] || item.severity : '-'}</TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div className="font-medium">{item.userName || '-'}</div>
                                <div className="text-xs text-muted-foreground">{item.userEmail || '-'}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.pagePath || '-'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.createdAt ? format(new Date(item.createdAt), 'MMM d, yyyy') : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Feedback details: drawer on desktop, modal on mobile */}
          {selectedFeedback && !isMobile && (
            <Sheet open={isFeedbackDetailsOpen} onOpenChange={setIsFeedbackDetailsOpen}>
              <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto scrollbar-thin">
                <SheetHeader className="pr-8">
                  <SheetTitle>{selectedFeedback.title}</SheetTitle>
                </SheetHeader>

                <div className="mt-4 space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderStatusPill(selectedFeedback)}
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {selectedFeedback.type === 'bug' ? t.feedback.typeBug : t.feedback.typeFeature}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.feedback.severity}: {selectedFeedback.severity ? severityLabels[selectedFeedback.severity] || selectedFeedback.severity : '-'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.reportedBy}</div>
                      <div className="font-medium text-foreground">{selectedFeedback.userName || '-'}</div>
                      <div className="text-xs text-muted-foreground">{selectedFeedback.userEmail || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.page}</div>
                      <div className="font-medium text-foreground break-all">{selectedFeedback.pagePath || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.createdAt}</div>
                      <div className="font-medium text-foreground">
                        {selectedFeedback.createdAt ? format(new Date(selectedFeedback.createdAt), 'MMM d, yyyy') : '-'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.common.update}</div>
                      <div className="font-medium text-foreground">
                        {selectedFeedback.updatedAt ? format(new Date(selectedFeedback.updatedAt), 'MMM d, yyyy') : '-'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.description}</div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground whitespace-pre-wrap">
                      {selectedFeedback.description || '-'}
                    </div>
                  </div>

                  {selectedFeedback.steps ? (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.steps}</div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground whitespace-pre-wrap">
                        {selectedFeedback.steps}
                      </div>
                    </div>
                  ) : null}

                  <div className="pt-2 flex items-center justify-end">
                    <Button
                      variant="destructive"
                      onClick={() => setFeedbackDeleteId(selectedFeedback.id)}
                    >
                      <Trash2 size={16} />
                      {t.common.delete}
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          )}

          {selectedFeedback && isMobile && (
            <Dialog open={isFeedbackDetailsOpen} onOpenChange={setIsFeedbackDetailsOpen}>
              <DialogContent className="bg-card max-h-[90vh] overflow-y-auto scrollbar-thin">
                <DialogHeader>
                  <DialogTitle>{selectedFeedback.title}</DialogTitle>
                </DialogHeader>

                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderStatusPill(selectedFeedback)}
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {selectedFeedback.type === 'bug' ? t.feedback.typeBug : t.feedback.typeFeature}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.feedback.severity}: {selectedFeedback.severity ? severityLabels[selectedFeedback.severity] || selectedFeedback.severity : '-'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.reportedBy}</div>
                      <div className="font-medium text-foreground">{selectedFeedback.userName || '-'}</div>
                      <div className="text-xs text-muted-foreground">{selectedFeedback.userEmail || '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.page}</div>
                      <div className="font-medium text-foreground break-all">{selectedFeedback.pagePath || '-'}</div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{t.feedback.createdAt}: {selectedFeedback.createdAt ? format(new Date(selectedFeedback.createdAt), 'MMM d, yyyy') : '-'}</span>
                      <span>{t.common.update}: {selectedFeedback.updatedAt ? format(new Date(selectedFeedback.updatedAt), 'MMM d, yyyy') : '-'}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.description}</div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground whitespace-pre-wrap">
                      {selectedFeedback.description || '-'}
                    </div>
                  </div>

                  {selectedFeedback.steps ? (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.feedback.steps}</div>
                      <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-foreground whitespace-pre-wrap">
                        {selectedFeedback.steps}
                      </div>
                    </div>
                  ) : null}

                  <DialogFooter>
                    <Button variant="outline" onClick={closeFeedbackDetails}>
                      {t.common.close}
                    </Button>
                    <Button variant="destructive" onClick={() => setFeedbackDeleteId(selectedFeedback.id)}>
                      <Trash2 size={16} />
                      {t.common.delete}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          )}

          <AlertDialog open={!!feedbackDeleteId} onOpenChange={(open) => !open && setFeedbackDeleteId(null)}>
            <AlertDialogContent className="bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle>{t.feedback.deleteTitle}</AlertDialogTitle>
                <AlertDialogDescription>{t.feedback.deleteDesc}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => feedbackDeleteId && deleteFeedback(feedbackDeleteId)}
                >
                  {t.common.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="m365" className="space-y-6">
          <M365NotificationsTab
            t={t}
            m365Info={m365Info}
            setM365Info={setM365Info}
            defaultM365Settings={defaultM365Settings}
            hasM365Error={hasM365Error}
            isM365Loading={isM365Loading}
            saveM365Settings={saveM365Settings}
            loadM365Info={loadM365Info}
            m365BaselineSettingsJson={m365BaselineSettingsJson}
            stableStringify={stableStringify}
            m365LastPollStatus={m365LastPollStatus}
            startM365DeviceCode={startM365DeviceCode}
            pollM365Connection={pollM365Connection}
            disconnectM365={disconnectM365}
            parseEmailListUi={parseEmailListUi}
            isValidEmailUi={isValidEmailUi}
            FLOW_STATUS_KEYS={FLOW_STATUS_KEYS}
            getStatusLabel={getStatusLabel}
            getFlowValue={getFlowValue}
            updateFlowValue={updateFlowValue}
            toggleFlowColumn={toggleFlowColumn}
            toggleFlowRow={toggleFlowRow}
            m365TestEmail={m365TestEmail}
            setM365TestEmail={setM365TestEmail}
            sendM365TestEmail={sendM365TestEmail}
            m365SelectedAction={m365SelectedAction}
            setM365SelectedAction={setM365SelectedAction}
            m365TemplateLang={m365TemplateLang}
            setM365TemplateLang={setM365TemplateLang}
            m365PreviewStatus={m365PreviewStatus}
            setM365PreviewStatus={setM365PreviewStatus}
            m365PreviewRequestId={m365PreviewRequestId}
            setM365PreviewRequestId={setM365PreviewRequestId}
            m365PreviewSubject={m365PreviewSubject}
            m365PreviewHtml={m365PreviewHtml}
            isM365PreviewLoading={isM365PreviewLoading}
            previewM365Template={previewM365Template}
            getTemplateForUi={getTemplateForUi}
            updateTemplateField={updateTemplateField}
            copyText={copyText}
          />
        </TabsContent>

        <TabsContent value="dbmonitor" className="space-y-6">
          {(() => {
            const status = dbMonitor?.health?.status || 'red';
            const label = dbMonitor?.health?.label || '-';
            const hasPartial = (dbMonitor?.snapshot?.errors?.length ?? 0) > 0;
            const Icon = status === 'green' ? CheckCircle2 : status === 'yellow' ? AlertTriangle : XCircle;
            const wrapClasses =
              status === 'green'
                ? 'border-emerald-500/20 bg-emerald-500/10'
                : status === 'yellow'
                  ? 'border-amber-500/25 bg-amber-500/10'
                  : 'border-destructive/25 bg-destructive/10';
            const iconClasses =
              status === 'green'
                ? 'bg-emerald-500 text-white'
                : status === 'yellow'
                  ? 'bg-amber-500 text-white'
                  : 'bg-destructive text-destructive-foreground';

            return (
              <div className="bg-card rounded-lg border border-border p-4 md:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                  <div className={cn('rounded-xl border p-4 md:p-5 lg:col-span-2', wrapClasses)}>
                    <div className="flex items-start gap-4">
                      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm', iconClasses)}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                            {t.settings.dbMonitorStatus}
                          </div>
                          <div className="text-2xl font-semibold text-foreground leading-none">
                            {label}
                          </div>
                          {hasPartial ? (
                            <span className="text-xs font-medium rounded-full border border-border bg-background/60 px-2 py-0.5 text-foreground">
                              {t.settings.dbMonitorPartialTitle}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            {t.settings.dbMonitorLastUpdated}:{' '}
                            <span className="text-foreground">
                              {dbMonitor?.snapshot?.collectedAt ? format(new Date(dbMonitor.snapshot.collectedAt), 'MMM d, yyyy HH:mm') : '-'}
                            </span>
                          </span>
                          {dbMonitor?.nextRefreshAt ? (
                            <span>
                              {t.settings.dbMonitorNext}:{' '}
                              <span className="text-foreground">{format(new Date(dbMonitor.nextRefreshAt), 'MMM d, HH:mm')}</span>
                            </span>
                          ) : null}
                          {dbMonitor?.snapshot?.sqlserverStartTime ? (
                            <span>
                              {t.settings.dbMonitorSqlStart}:{' '}
                              <span className="text-foreground">
                                {format(new Date(dbMonitor.snapshot.sqlserverStartTime), 'MMM d, yyyy HH:mm')}
                              </span>
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          {t.settings.dbMonitorAutoRefresh}: {t.settings.dbMonitorHourly}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-4 md:p-5 flex flex-col justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorTitle}</div>
                    <p className="text-sm text-muted-foreground">{t.settings.dbMonitorDescription}</p>
                    <Button variant="outline" onClick={refreshDbMonitor} disabled={isDbMonitorLoading} className="self-start">
                      <span className={cn("mr-2 inline-flex", isDbMonitorLoading ? "animate-spin" : "")}>
                        <RefreshCw size={16} />
                      </span>
                      {isDbMonitorLoading ? t.common.loading : t.settings.dbMonitorRefresh}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-5">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">Backups</h3>
              <p className="text-sm text-muted-foreground">
                Automatic schedule, manual backups, and migration restore workflow.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-background/30 p-4 md:p-5 space-y-4">
              {(() => {
                const configured = Boolean(dbBackupAutomatic?.configured);
                const enabled = Boolean(dbBackupAutomatic?.enabled);
                const keptCount = [
                  dbBackupRetentionKept?.day,
                  dbBackupRetentionKept?.['day-1'],
                  dbBackupRetentionKept?.['week-1'],
                ].filter(Boolean).length;

                const pill = (label: string, value: string, tone: 'ok' | 'warn' | 'error' | 'muted' = 'muted') => {
                  const toneCls =
                    tone === 'ok'
                      ? 'border-green-500/40 text-green-300 bg-green-500/10'
                      : tone === 'warn'
                        ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                        : tone === 'error'
                          ? 'border-destructive/40 text-destructive bg-destructive/10'
                        : 'border-border text-muted-foreground bg-muted/10';
                  return (
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs border', toneCls)}>
                      <span className="text-foreground/80 mr-1.5">{label}:</span>
                      <span className="font-semibold">{value}</span>
                    </span>
                  );
                };

                return (
                  <>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <h4 className="text-base font-semibold text-foreground">Backup Status</h4>
                        <p className="text-sm text-muted-foreground">
                          Automatic schedule, retained files, manual backups, and restore workflow.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto md:min-w-[440px] md:justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={loadDbBackups}
                          disabled={isDbBackupsLoading || isDbBackupCreating}
                          className="h-11 w-full justify-center"
                        >
                          <span className={cn("mr-2 inline-flex", isDbBackupsLoading ? "animate-spin" : "")}>
                            <RefreshCw size={16} />
                          </span>
                          {isDbBackupsLoading ? t.common.loading : 'Refresh'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={createDbBackup}
                          disabled={isDbBackupCreating || isDbBackupsLoading}
                          className="h-11 w-full justify-center"
                        >
                          <Database size={16} className="mr-2" />
                          {isDbBackupCreating ? 'Creating backup...' : 'Run backup now'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsDbBackupSetupOpen(true)}
                          disabled={isDbBackupSetupSaving}
                          className="h-11 w-full justify-center sm:col-span-2"
                        >
                          <SettingsIcon size={16} className="mr-2" />
                          {configured ? 'Update setup' : 'Setup credentials'}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {pill('Configured', configured ? 'Yes' : 'No', configured ? 'ok' : 'warn')}
                      {pill('Auto', enabled ? 'Enabled' : 'Disabled', enabled ? 'ok' : 'warn')}
                      {pill(
                        'Last auto',
                        dbBackupAutomatic?.latestAuto?.started_at
                          ? `${formatDateTime(dbBackupAutomatic.latestAuto.started_at)} (${dbBackupAutomatic.latestAuto.status})`
                          : '-',
                        dbBackupAutomatic?.latestAuto?.status === 'success' ? 'ok' : dbBackupAutomatic?.latestAuto?.status ? 'warn' : 'muted'
                      )}
                      {pill('Retention', `${keptCount}/3 files`, keptCount === 3 ? 'ok' : 'error')}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                      <div className="flex flex-col gap-2 h-full">
                        <div className="text-sm font-medium text-foreground">Schedule details</div>
                        <div className="rounded-lg border border-border bg-muted/10 p-3 text-xs space-y-1 flex-1">
                          <div>
                            <span className="text-muted-foreground">Frequency:</span>{' '}
                            <span className="text-foreground">{dbBackupAutomatic?.frequency || 'Daily at 01:00'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Policy:</span>{' '}
                            <span className="text-foreground">{dbBackupAutomatic?.policy || 'Keep latest day, day-1, and week-1 backup'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Task name:</span>{' '}
                            <span className="text-foreground font-mono break-all">{dbBackupAutomatic?.taskName || 'CRA_Local_DailyDbBackup'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Next run:</span>{' '}
                            <span className="text-foreground">
                              {dbBackupAutomatic?.nextRunAt ? formatDateTime(dbBackupAutomatic.nextRunAt) : '-'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 h-full">
                        <div className="text-sm font-medium text-foreground">Recent activity</div>
                        <div className="rounded-lg border border-border bg-muted/10 p-3 text-xs space-y-1 flex-1">
                          <div>
                            <span className="text-muted-foreground">Last restore:</span>{' '}
                            <span className="text-foreground">
                              {dbBackupAutomatic?.latestRestore?.started_at
                                ? `${formatDateTime(dbBackupAutomatic.latestRestore.started_at)} (${dbBackupAutomatic.latestRestore.status})`
                                : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Last manual:</span>{' '}
                            <span className="text-foreground">
                              {dbBackupAutomatic?.latestManual?.started_at
                                ? `${formatDateTime(dbBackupAutomatic.latestManual.started_at)} (${dbBackupAutomatic.latestManual.status})`
                                : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="h-px bg-border/60" />

            <div className="rounded-xl border border-border bg-background/30 p-4 md:p-5 space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-foreground">Import / Restore (Migration)</h4>
                  <p className="text-sm text-muted-foreground">
                    Upload a backup set from another server and restore this instance.
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    Storage path:{' '}
                    {dbBackupImportDirectory
                      ? dbBackupImportDirectory
                      : dbBackupImportId
                        ? `${CANONICAL_DB_BACKUP_DIR}\\imports\\${dbBackupImportId}`
                        : `${CANONICAL_DB_BACKUP_DIR}\\imports\\<new>`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDbBackupImportId(null);
                      setDbBackupImportDirectory('');
                      setDbBackupImportSets([]);
                      setDbBackupImportFiles([]);
                      setDbBackupImportError(null);
                      setDbBackupImportRestoreTarget(null);
                    }}
                    disabled={isDbBackupImportUploading || isDbBackupImportValidating || isDbBackupImportRestoring}
                  >
                    New import session
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                <div className="lg:col-span-2 flex flex-col h-full">
                  <div className="rounded-md border border-border bg-muted/10 p-3 space-y-2 flex flex-col h-full">
                    <div className="text-sm font-medium text-foreground">Upload files</div>
                    <p className="text-xs text-muted-foreground">
                      Select the 3 files generated by the app: <span className="font-mono">*.dump</span>,{' '}
                      <span className="font-mono">*_globals.sql</span>, <span className="font-mono">*_manifest.json</span>
                    </p>
                    <Input
                      type="file"
                      multiple
                      accept=".dump,.sql,.json"
                      onChange={(e) => setDbBackupImportFiles(Array.from(e.target.files ?? []))}
                      disabled={isDbBackupImportUploading || isDbBackupImportValidating || isDbBackupImportRestoring}
                    />
                    {dbBackupImportFiles.length ? (
                      <div className="text-xs text-muted-foreground space-y-1">
                        {dbBackupImportFiles.slice(0, 8).map((f) => (
                          <div key={`${f.name}-${f.size}`} className="font-mono break-all">
                            {f.name} ({formatBytes(f.size)})
                          </div>
                        ))}
                        {dbBackupImportFiles.length > 8 ? (
                          <div>+{dbBackupImportFiles.length - 8} more</div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 pt-1 mt-auto">
                      <Button
                        onClick={uploadDbBackupImportFiles}
                        disabled={isDbBackupImportUploading || isDbBackupImportValidating || isDbBackupImportRestoring}
                      >
                        <Database size={16} className="mr-2" />
                        {isDbBackupImportUploading ? 'Uploading...' : 'Upload'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => dbBackupImportId && void validateDbBackupImport(dbBackupImportId)}
                        disabled={!dbBackupImportId || isDbBackupImportUploading || isDbBackupImportValidating || isDbBackupImportRestoring}
                      >
                        <span className={cn("mr-2 inline-flex", isDbBackupImportValidating ? "animate-spin" : "")}>
                          <RefreshCw size={16} />
                        </span>
                        {isDbBackupImportValidating ? t.common.loading : 'Validate'}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  <div className="rounded-md border border-border bg-muted/10 p-3 space-y-2 flex flex-col h-full">
                    <div className="text-sm font-medium text-foreground">Restore options</div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">Include globals (roles/users)</span>
                      <Switch
                        checked={dbBackupImportIncludeGlobals}
                        onCheckedChange={(checked) => setDbBackupImportIncludeGlobals(Boolean(checked))}
                        disabled={isDbBackupImportUploading || isDbBackupImportValidating || isDbBackupImportRestoring}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave enabled for full migration. Disable only if you intentionally want data-only restore.
                    </p>
                    <div className="flex-1" />
                  </div>
                </div>
              </div>

              {dbBackupImportError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {dbBackupImportError}
                </div>
              ) : null}

              {dbBackupImportSets.length ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Backup set</TableHead>
                        <TableHead>Artifacts</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dbBackupImportSets.map((item) => {
                        const createdDate = new Date(item.createdAt);
                        const createdLabel = Number.isNaN(createdDate.getTime())
                          ? item.createdAt
                          : format(createdDate, 'MMM d, yyyy HH:mm');
                        const dump = item.artifacts.dump;
                        const globals = item.artifacts.globals;
                        const manifest = item.artifacts.manifest;
                        const allReady = Boolean(dump && globals && manifest);

                        return (
                          <TableRow key={`import-${item.prefix}`}>
                            <TableCell className="text-xs">
                              <div className="font-mono break-all">{item.prefix}</div>
                              <div className={cn('mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] border', item.isComplete ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-amber-500/40 text-amber-400 bg-amber-500/10')}>
                                {item.isComplete ? 'Complete' : 'Partial'}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="space-y-1">
                                <div className={cn('font-mono break-all', dump ? 'text-foreground' : 'text-destructive')}>dump: {dump?.fileName || 'missing'}</div>
                                <div className={cn('font-mono break-all', globals ? 'text-foreground' : 'text-destructive')}>globals: {globals?.fileName || 'missing'}</div>
                                <div className={cn('font-mono break-all', manifest ? 'text-foreground' : 'text-destructive')}>manifest: {manifest?.fileName || 'missing'}</div>
                                {allReady ? null : (
                                  <div className="text-[11px] text-muted-foreground">
                                    Upload the missing files to make this set restorable.
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{createdLabel || '-'}</TableCell>
                            <TableCell className="text-right text-sm">{formatBytes(item.totalSizeBytes)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDbBackupImportRestoreTarget(item.prefix)}
                                disabled={isDbBackupImportRestoring || !item.restoreReady || !dbBackupImportId}
                              >
                                {isDbBackupImportRestoring && dbBackupImportRestoreTarget === item.prefix ? 'Restoring...' : 'Restore'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No imported backup sets yet. Upload the 3 files to start.
                </p>
              )}
            </div>

            <div className="h-px bg-border/60" />

            <div className="rounded-xl border border-border bg-background/30 p-4 md:p-5 space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-foreground">Available Backup Sets</h4>
                  <p className="text-sm text-muted-foreground">
                    View, download, and restore backup sets (auto and manual).
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    Storage path: {dbBackupDirectory || CANONICAL_DB_BACKUP_DIR}
                  </p>
                </div>
              </div>

            <Dialog open={isDbBackupSetupOpen} onOpenChange={setIsDbBackupSetupOpen}>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Backup Setup</DialogTitle>
                  <DialogDescription>
                    Configure Postgres admin credentials once so the app can create full backups with globals.sql.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Admin host</Label>
                    <Input value={dbBackupSetupForm.adminHost} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, adminHost: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Admin port</Label>
                    <Input type="number" value={dbBackupSetupForm.adminPort} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, adminPort: Number(e.target.value || 5432) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Admin database</Label>
                    <Input value={dbBackupSetupForm.adminDatabase} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, adminDatabase: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Admin user</Label>
                    <Input value={dbBackupSetupForm.adminUser} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, adminUser: e.target.value }))} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Admin password</Label>
                    <Input type="password" value={dbBackupSetupForm.adminPassword} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, adminPassword: e.target.value }))} />
                  </div>

                  <div className="space-y-1">
                    <Label>Backup host</Label>
                    <Input value={dbBackupSetupForm.backupHost} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, backupHost: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Backup port</Label>
                    <Input type="number" value={dbBackupSetupForm.backupPort} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, backupPort: Number(e.target.value || 5432) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Backup database</Label>
                    <Input value={dbBackupSetupForm.backupDatabase} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, backupDatabase: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Backup user</Label>
                    <Input value={dbBackupSetupForm.backupUser} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, backupUser: e.target.value }))} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Backup user password</Label>
                    <Input type="password" value={dbBackupSetupForm.backupPassword} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, backupPassword: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Schedule hour (0-23)</Label>
                    <Input type="number" min={0} max={23} value={dbBackupSetupForm.scheduleHour} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, scheduleHour: Number(e.target.value || 1) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Schedule minute (0-59)</Label>
                    <Input type="number" min={0} max={59} value={dbBackupSetupForm.scheduleMinute} onChange={(e) => setDbBackupSetupForm((p) => ({ ...p, scheduleMinute: Number(e.target.value || 0) }))} />
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm text-muted-foreground">Enable automatic daily backups</span>
                    <Switch checked={dbBackupSetupForm.enabled} onCheckedChange={(checked) => setDbBackupSetupForm((p) => ({ ...p, enabled: checked }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDbBackupSetupOpen(false)} disabled={isDbBackupSetupSaving}>
                    Cancel
                  </Button>
                  <Button onClick={saveDbBackupSetup} disabled={isDbBackupSetupSaving}>
                    {isDbBackupSetupSaving ? 'Saving...' : 'Save backup setup'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {dbBackupError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {dbBackupError}
              </div>
            ) : null}

            {isDbBackupsLoading ? (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            ) : dbBackupSets.length ? (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Retained</TableHead>
                      <TableHead>Backup set</TableHead>
                      <TableHead className="w-[190px]">Created</TableHead>
                      <TableHead className="w-[110px] text-right">Size</TableHead>
                      <TableHead className="w-[200px]">Files</TableHead>
                      <TableHead className="w-[220px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const retainedTargets = [
                        { bucket: 'day' as const, title: 'day', dumpFileName: dbBackupRetentionKept?.day ?? null },
                        { bucket: 'day-1' as const, title: 'day-1', dumpFileName: dbBackupRetentionKept?.['day-1'] ?? null },
                        { bucket: 'week-1' as const, title: 'week-1', dumpFileName: dbBackupRetentionKept?.['week-1'] ?? null },
                      ];

                      const retainedRows = retainedTargets.map((t) => {
                        const prefix = t.dumpFileName ? getBackupPrefixFromFileName(t.dumpFileName) : '';
                        const set = prefix ? dbBackupSets.find((s) => s.prefix === prefix) : null;
                        const dump = set?.artifacts.dump ?? null;
                        const globals = set?.artifacts.globals ?? null;
                        const manifest = set?.artifacts.manifest ?? null;
                        const allReady = Boolean(dump && globals && manifest);
                        const missing = !t.dumpFileName || !set || !dump;
                        return { ...t, prefix, set, dump, globals, manifest, allReady, missing };
                      });

                      const retainedPrefixes = new Set(retainedRows.map((r) => r.set?.prefix).filter(Boolean));
                      const otherSets = dbBackupSets.filter((s) => !retainedPrefixes.has(s.prefix));

                      const retainedBadge = (bucket: 'day' | 'day-1' | 'week-1') => (
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[11px] border',
                            bucket === 'day'
                              ? 'border-green-500/40 text-green-300 bg-green-500/10'
                              : bucket === 'day-1'
                                ? 'border-blue-500/40 text-blue-300 bg-blue-500/10'
                                : 'border-purple-500/40 text-purple-300 bg-purple-500/10'
                          )}
                        >
                          {bucket}
                        </span>
                      );

                      const renderRowForSet = (item: DbBackupSet) => {
                        const dump = item.artifacts.dump;
                        const globals = item.artifacts.globals;
                        const manifest = item.artifacts.manifest;
                        const allReady = Boolean(dump && globals && manifest);
                        const retained = getRetentionBucketForDump(dump?.fileName ?? null);

                        return (
                          <TableRow key={item.prefix}>
                            <TableCell className="text-xs">
                              {retained ? retainedBadge(retained as 'day' | 'day-1' | 'week-1') : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div className="font-mono break-all">{item.prefix}</div>
                              <div
                                className={cn(
                                  'mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] border',
                                  item.isComplete
                                    ? 'border-green-500/40 text-green-400 bg-green-500/10'
                                    : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                                )}
                              >
                                {item.isComplete ? 'Complete' : 'Partial'}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{formatDateTime(item.createdAt)}</TableCell>
                            <TableCell className="text-right text-sm">{formatBytes(item.totalSizeBytes)}</TableCell>
                            <TableCell className="text-xs">
                              <div className="flex flex-wrap gap-2">
                                <span className={cn('px-2 py-0.5 rounded-full text-[11px] border', dump ? 'border-green-500/40 text-green-300 bg-green-500/10' : 'border-destructive/40 text-destructive bg-destructive/10')}>
                                  dump
                                </span>
                                <span className={cn('px-2 py-0.5 rounded-full text-[11px] border', globals ? 'border-green-500/40 text-green-300 bg-green-500/10' : 'border-destructive/40 text-destructive bg-destructive/10')}>
                                  globals
                                </span>
                                <span className={cn('px-2 py-0.5 rounded-full text-[11px] border', manifest ? 'border-green-500/40 text-green-300 bg-green-500/10' : 'border-destructive/40 text-destructive bg-destructive/10')}>
                                  manifest
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-2">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline">
                                      <Download size={14} className="mr-2" />
                                      Download
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem disabled={!dump} onClick={() => dump && downloadBackupFile(dump.fileName)}>
                                      dump
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={!globals} onClick={() => globals && downloadBackupFile(globals.fileName)}>
                                      globals
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={!manifest} onClick={() => manifest && downloadBackupFile(manifest.fileName)}>
                                      manifest
                                    </DropdownMenuItem>
                                    <DropdownMenuItem disabled={!allReady} onClick={() => downloadAllBackupArtifacts(item)}>
                                      all
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => dump && setDbBackupRestoreTarget(dump.fileName)}
                                  disabled={isDbBackupRestoring || !item.restoreReady || !dump}
                                >
                                  {isDbBackupRestoring && dbBackupRestoreTarget === dump?.fileName ? 'Restoring...' : 'Restore'}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      };

                      return (
                        <>
                          {retainedRows.map((r) => {
                            const item = r.set;
                            const createdAt = item?.createdAt ? formatDateTime(item.createdAt) : '-';
                            const size = item ? formatBytes(item.totalSizeBytes) : '-';
                            const statusBadge = r.missing ? (
                              <span className="ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] border border-destructive/40 text-destructive bg-destructive/10">
                                Missing
                              </span>
                            ) : null;

                            return (
                              <TableRow key={`retained-${r.bucket}`} className="bg-muted/5">
                                <TableCell className="text-xs">
                                  {retainedBadge(r.bucket)}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {item ? (
                                    <>
                                      <div className="font-mono break-all">{item.prefix}</div>
                                      <div
                                        className={cn(
                                          'mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] border',
                                          item.isComplete
                                            ? 'border-green-500/40 text-green-400 bg-green-500/10'
                                            : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                                        )}
                                      >
                                        {item.isComplete ? 'Complete' : 'Partial'}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-sm text-muted-foreground">
                                      Retention target {statusBadge}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">{createdAt}</TableCell>
                                <TableCell className="text-right text-sm">{size}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex flex-wrap gap-2">
                                    <span className={cn('px-2 py-0.5 rounded-full text-[11px] border', r.dump ? 'border-green-500/40 text-green-300 bg-green-500/10' : 'border-destructive/40 text-destructive bg-destructive/10')}>
                                      dump
                                    </span>
                                    <span className={cn('px-2 py-0.5 rounded-full text-[11px] border', r.globals ? 'border-green-500/40 text-green-300 bg-green-500/10' : 'border-destructive/40 text-destructive bg-destructive/10')}>
                                      globals
                                    </span>
                                    <span className={cn('px-2 py-0.5 rounded-full text-[11px] border', r.manifest ? 'border-green-500/40 text-green-300 bg-green-500/10' : 'border-destructive/40 text-destructive bg-destructive/10')}>
                                      manifest
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="outline" disabled={!item}>
                                          <Download size={14} className="mr-2" />
                                          Download
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem disabled={!r.dump} onClick={() => r.dump && downloadBackupFile(r.dump.fileName)}>
                                          dump
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={!r.globals} onClick={() => r.globals && downloadBackupFile(r.globals.fileName)}>
                                          globals
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={!r.manifest} onClick={() => r.manifest && downloadBackupFile(r.manifest.fileName)}>
                                          manifest
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={!r.allReady} onClick={() => item && downloadAllBackupArtifacts(item)}>
                                          all
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => r.dump && setDbBackupRestoreTarget(r.dump.fileName)}
                                      disabled={isDbBackupRestoring || !item?.restoreReady || !r.dump}
                                    >
                                      Restore
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}

                          {otherSets.length ? (
                            <TableRow>
                              <TableCell colSpan={6} className="p-0">
                                <div className="h-px bg-border/60" />
                              </TableCell>
                            </TableRow>
                          ) : null}

                          {otherSets.map(renderRowForSet)}
                        </>
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No backups found yet. Create the first backup to start.</p>
            )}
            </div>
          </div>

          <AlertDialog open={Boolean(dbBackupRestoreTarget)} onOpenChange={(open) => { if (!open) setDbBackupRestoreTarget(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore backup?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will replace current database data with backup{' '}
                  <span className="font-mono">{dbBackupRestoreTarget}</span>. The app may be unavailable briefly.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDbBackupRestoring}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDbBackupRestoring || !dbBackupRestoreTarget}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!dbBackupRestoreTarget) return;
                    void restoreDbBackup(dbBackupRestoreTarget);
                  }}
                >
                  {isDbBackupRestoring ? 'Restoring...' : 'Restore now'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={Boolean(dbBackupImportRestoreTarget)}
            onOpenChange={(open) => {
              if (!open) setDbBackupImportRestoreTarget(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restore imported backup?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will replace current database data with imported backup set{' '}
                  <span className="font-mono">{dbBackupImportRestoreTarget}</span>. The app may be unavailable briefly.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDbBackupImportRestoring}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDbBackupImportRestoring || !dbBackupImportRestoreTarget || !dbBackupImportId}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!dbBackupImportRestoreTarget) return;
                    void restoreDbBackupImport(dbBackupImportRestoreTarget);
                  }}
                >
                  {isDbBackupImportRestoring ? 'Restoring...' : 'Restore now'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-3">
              <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorDbInfo}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground">{t.settings.dbMonitorDbName}</div>
                  <div className="font-medium text-foreground break-all">{dbMonitor?.snapshot?.database?.databaseName || '-'}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground">{t.settings.dbMonitorServer}</div>
                  <div className="font-medium text-foreground break-all">{dbMonitor?.snapshot?.database?.serverName || '-'}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground">{t.settings.dbMonitorEdition}</div>
                  <div className="font-medium text-foreground break-words">{dbMonitor?.snapshot?.database?.edition || '-'}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground">{t.settings.dbMonitorVersion}</div>
                  <div className="font-medium text-foreground">{dbMonitor?.snapshot?.database?.productVersion || '-'}</div>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-3">
              <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorActivity}</div>
              <div className="space-y-3 text-sm">
                <div className="rounded-md border border-border bg-muted/10 p-3">
                  <div className="text-xs text-muted-foreground">{t.settings.dbMonitorDbSize}</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {dbMonitor?.snapshot?.sizeMb !== null && dbMonitor?.snapshot?.sizeMb !== undefined
                      ? `${Math.round(dbMonitor.snapshot.sizeMb)} MB`
                      : '-'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-border bg-muted/10 p-3">
                    <div className="text-[11px] text-muted-foreground">{t.settings.dbMonitorSessions}</div>
                    <div className="text-lg font-semibold text-foreground">{dbMonitor?.snapshot?.sessions?.userSessions ?? '-'}</div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/10 p-3">
                    <div className="text-[11px] text-muted-foreground">{t.settings.dbMonitorActive}</div>
                    <div className="text-lg font-semibold text-foreground">{dbMonitor?.snapshot?.sessions?.activeRequests ?? '-'}</div>
                  </div>
                  <div className="rounded-md border border-border bg-muted/10 p-3">
                    <div className="text-[11px] text-muted-foreground">{t.settings.dbMonitorBlocked}</div>
                    <div className={cn('text-lg font-semibold', (dbMonitor?.snapshot?.sessions?.blockedRequests ?? 0) > 0 ? 'text-destructive' : 'text-foreground')}>
                      {dbMonitor?.snapshot?.sessions?.blockedRequests ?? '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorChartLoad}</div>
                <span className="text-xs text-muted-foreground">{t.settings.dbMonitorLast24h}</span>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(dbMonitor?.history?.points ?? []).slice(-24).map((p) => ({
                      time: p.collectedAt ? format(new Date(p.collectedAt), 'HH:mm') : '',
                      sessions: p.userSessions ?? null,
                      active: p.activeRequests ?? null,
                      blocked: p.blockedRequests ?? null,
                    }))}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="sessions" stroke="#0EA5E9" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="active" stroke="#A855F7" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="blocked" stroke="#EF4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground">{t.settings.dbMonitorChartLoadHint}</p>
            </div>

            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorChartSize}</div>
                <span className="text-xs text-muted-foreground">{t.settings.dbMonitorLast24h}</span>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={(dbMonitor?.history?.points ?? []).slice(-24).map((p) => ({
                      time: p.collectedAt ? format(new Date(p.collectedAt), 'HH:mm') : '',
                      sizeMb: p.sizeMb ?? null,
                    }))}
                    margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} />
                    <Tooltip />
                    <Line type="monotone" dataKey="sizeMb" stroke="#10B981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground">{t.settings.dbMonitorChartSizeHint}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorTopWaits}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    id="db-waits-show-noise"
                    checked={dbWaitsShowNoise}
                    onCheckedChange={(v) => setDbWaitsShowNoise(Boolean(v))}
                  />
                  <Label htmlFor="db-waits-show-noise" className="text-xs text-muted-foreground cursor-pointer">
                    {t.settings.dbMonitorShowNoise}
                  </Label>
                </div>
              </div>
              {dbMonitor?.snapshot?.baselineCollectedAt ? (
                <div className="text-xs text-muted-foreground">
                  {t.settings.dbMonitorDeltaBaseline}:{' '}
                  <span className="text-foreground">
                    {format(new Date(dbMonitor.snapshot.baselineCollectedAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              ) : null}
              {dbMonitor?.snapshot?.topWaits?.length ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.settings.dbMonitorWaitType}</TableHead>
                        <TableHead className="text-right">{t.settings.dbMonitorDeltaMs}</TableHead>
                        <TableHead className="text-right">{t.settings.dbMonitorWaitMs}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const all = (dbMonitor.snapshot.allWaits ?? dbMonitor.snapshot.topWaits ?? []) as DbMonitorWaitRow[];
                        const rows = dbWaitsShowNoise
                          ? all
                          : all.filter((r) => !r.isNoise);
                        const sorted = rows
                          .slice()
                          .sort((a, b) => (Number(b.deltaWaitMs ?? 0) - Number(a.deltaWaitMs ?? 0)) || (Number(b.waitMs ?? 0) - Number(a.waitMs ?? 0)));
                        return sorted.slice(0, 10);
                      })().map((row, idx) => (
                        <TableRow key={`${row.waitType}-${idx}`}>
                          <TableCell className="font-mono text-xs break-all">{row.waitType}</TableCell>
                          <TableCell className="text-right text-sm">
                            {row.deltaWaitMs !== null && row.deltaWaitMs !== undefined ? Math.round(row.deltaWaitMs) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-sm">{row.waitMs ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.settings.dbMonitorNoData}</p>
              )}
            </div>

            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorTopQueries}</div>
              </div>
              {dbMonitor?.snapshot?.topQueries?.length ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.settings.dbMonitorQueryHash}</TableHead>
                        <TableHead className="text-right">{t.settings.dbMonitorExec}</TableHead>
                        <TableHead className="text-right">{t.settings.dbMonitorAvgMs}</TableHead>
                        <TableHead className="text-right">{t.settings.dbMonitorTotalMs}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dbMonitor.snapshot.topQueries.slice(0, 10).map((row, idx) => (
                        <TableRow key={`${row.queryHash}-${idx}`}>
                          <TableCell className="font-mono text-xs break-all">{row.queryHash}</TableCell>
                          <TableCell className="text-right text-sm">{row.execCount ?? '-'}</TableCell>
                          <TableCell className="text-right text-sm">{row.avgMs !== null && row.avgMs !== undefined ? Math.round(row.avgMs) : '-'}</TableCell>
                          <TableCell className="text-right text-sm">{row.totalMs !== null && row.totalMs !== undefined ? Math.round(row.totalMs) : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.settings.dbMonitorNoData}</p>
              )}
              <p className="text-xs text-muted-foreground">{t.settings.dbMonitorPermissionHint}</p>
            </div>
          </div>

          {(() => {
            const status = dbMonitor?.health?.status || 'red';
            const hasDiagnostics =
              Boolean(hasDbMonitorError) ||
              Boolean(dbMonitor?.lastError) ||
              Boolean(dbMonitor?.snapshot?.errors?.length);
            if (!hasDiagnostics) return null;

            return (
              <div className="bg-card rounded-lg border border-border p-4 md:p-6">
                <div className="text-lg font-semibold text-foreground">Diagnostics</div>
                <Accordion
                  type="single"
                  collapsible
                  defaultValue={status === 'red' ? 'diagnostics' : undefined}
                  className="mt-3"
                >
                  <AccordionItem value="diagnostics" className="border border-border rounded-lg bg-background/30 px-4 border-b-0">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex flex-1 items-center justify-between pr-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-semibold text-foreground">Errors and partial data</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pb-4 space-y-3">
                      {hasDbMonitorError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                          {t.settings.dbMonitorLoadError}
                        </div>
                      ) : null}

                      {dbMonitor?.lastError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                          {t.settings.dbMonitorCollectorError}: {dbMonitor.lastError}
                        </div>
                      ) : null}

                      {dbMonitor?.snapshot?.errors?.length ? (
                        <div className="rounded-md border border-border bg-muted/10 p-3">
                          <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorPartialTitle}</div>
                          <div className="text-xs text-muted-foreground mt-1">{t.settings.dbMonitorPartialDesc}</div>
                          <div className="mt-3 space-y-2 text-sm">
                            {dbMonitor.snapshot.errors.slice(0, 12).map((e, idx) => (
                              <div key={`${e.section}-${idx}`} className="rounded-md border border-border bg-muted/20 p-2">
                                <div className="font-medium text-foreground">{e.section}</div>
                                <div className="text-xs text-muted-foreground break-words">{e.message}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="auditlog" className="space-y-6">
          <AuditLogPanel />
        </TabsContent>

        <TabsContent value="deployments" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{t.settings.deployTitle}</h3>
                <p className="text-sm text-muted-foreground">{t.settings.deployDescription}</p>
              </div>
              <Button variant="outline" onClick={loadDeployInfo} disabled={isDeployLoading}>
                <span className={cn("mr-2 inline-flex", isDeployLoading ? "animate-spin" : "")}>
                  <RefreshCw size={16} />
                </span>
                {isDeployLoading ? t.common.loading : t.settings.deployRefresh}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4">
              <h4 className="text-base font-semibold text-foreground">{t.settings.deployCommitTitle}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">{t.settings.deployHash}</span>
                  <span className="font-mono text-right break-all">{deployInfo?.git?.hash || '-'}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">{t.settings.deployMessage}</span>
                  <span className="text-right">{deployInfo?.git?.message || '-'}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">{t.settings.deployAuthor}</span>
                  <span className="text-right">{deployInfo?.git?.author || '-'}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">{t.settings.deployDate}</span>
                  <span className="text-right">
                    {deployInfo?.git?.date ? format(new Date(deployInfo.git.date), 'MMM d, yyyy HH:mm') : '-'}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Built</span>
                  <span className="text-right">
                    {(() => {
                      const raw = String(deployInfo?.build?.builtAt || deployInfo?.git?.builtAt || '').trim();
                      if (!raw) return '-';
                      const d = new Date(raw);
                      return Number.isNaN(d.getTime()) ? raw : format(d, 'MMM d, yyyy HH:mm');
                    })()}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4">
              <h4 className="text-base font-semibold text-foreground">{t.settings.deployLogTitle}</h4>
              {hasDeployError ? (
                <p className="text-sm text-destructive">{t.settings.deployLoadError}</p>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 max-h-96 overflow-auto scrollbar-thin">
                  {isDeployLoading
                    ? t.common.loading
                    : (() => {
                        const log = deployInfo?.log;
                        if (!log) return t.settings.deployLogEmpty;
                        if (log.available) return log.content || t.settings.deployLogEmpty;
                        const candidates = Array.isArray(log.candidates) ? log.candidates : [];
                        const names = candidates.map((c) => c.name).filter(Boolean);
                        const lines: string[] = [];
                        lines.push('Deploy log is not available on this host.');
                        if (names.length) {
                          lines.push('Found log files:');
                          lines.push(...names.slice(0, 10).map((n) => `- ${n}`));
                        } else {
                          lines.push('No log files found under deploy/logs/.');
                        }
                        return lines.join('\n');
                      })()}
                </pre>
              )}
            </div>
          </div>
        </TabsContent>

      </Tabs>

      {/* Edit Item Dialog - moved outside TabsContent so it works on all tabs */}
      <Dialog open={isEditItemOpen} onOpenChange={setIsEditItemOpen}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>{t.settings.editItem}</DialogTitle>
            <DialogDescription>
              {t.settings.editItemDesc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-item-value">{t.settings.value}</Label>
              <Input
                id="edit-item-value"
                value={editItemValue}
                onChange={(e) => setEditItemValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditItemOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleEditItem}>{t.settings.saveChanges}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
