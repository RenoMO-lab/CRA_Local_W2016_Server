import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAdminSettings, ListItem, UserItem, ListCategory } from '@/context/AdminSettingsContext';
import { useLanguage } from '@/context/LanguageContext';
import { useRequests } from '@/context/RequestContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Plus, Trash2, Users, Settings as SettingsIcon, Globe, Truck, Pencil, Layers, ArrowRightLeft, Box, Circle, Download, Droplets, Route, Wind, Repeat, PackageCheck, MessageCircle, Server, Database, RefreshCw, Mail, ChevronDown, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { ROLE_CONFIG, UserRole } from '@/types';
import { cn } from '@/lib/utils';
import ListManager from '@/components/settings/ListManager';
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

const DEFAULT_TEMPLATES: M365Templates = {
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
  };
  log: {
    lines: number;
    content: string;
    available: boolean;
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

const Settings: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { requests, isLoading } = useRequests();
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
    setUsers,
  } = useAdminSettings();

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
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', role: 'sales' as UserRole, password: '' });
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
  const [m365Info, setM365Info] = useState<M365AdminResponse | null>(null);
  const [isM365Loading, setIsM365Loading] = useState(false);
  const [hasM365Error, setHasM365Error] = useState(false);
  const [m365TestEmail, setM365TestEmail] = useState('');
  const [m365LastPollStatus, setM365LastPollStatus] = useState<string | null>(null);
  const [m365SelectedAction, setM365SelectedAction] = useState<M365ActionKey>('request_created');
  const [m365PreviewStatus, setM365PreviewStatus] = useState<string>('submitted');
  const [m365PreviewRequestId, setM365PreviewRequestId] = useState<string>('');
  const [m365PreviewSubject, setM365PreviewSubject] = useState<string>('');
  const [m365PreviewHtml, setM365PreviewHtml] = useState<string>('');
  const [isM365PreviewLoading, setIsM365PreviewLoading] = useState(false);
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
    setIsM365Loading(true);
    setHasM365Error(false);
    try {
      const res = await fetch('/api/admin/m365');
      if (!res.ok) throw new Error(`Failed to load M365 settings: ${res.status}`);
      const data = await res.json();
      setM365Info({
        settings: {
          ...defaultM365Settings,
          ...(data?.settings ?? {}),
          flowMap: data?.settings?.flowMap || DEFAULT_FLOW_MAP,
          templates: data?.settings?.templates || DEFAULT_TEMPLATES,
        },
        connection: data?.connection ?? { hasRefreshToken: false, expiresAt: null },
        deviceCode: data?.deviceCode ?? null,
      });
    } catch (error) {
      console.error('Failed to load M365 settings:', error);
      setM365Info(null);
      setHasM365Error(true);
    } finally {
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

  const updateTemplateField = (action: M365ActionKey, field: keyof M365EmailTemplate, value: string) => {
    setM365Info((prev) => {
      const settings = prev?.settings ?? defaultM365Settings;
      const templates = ((settings.templates as any) || DEFAULT_TEMPLATES) as M365Templates;
      const nextTemplates: M365Templates = {
        ...DEFAULT_TEMPLATES,
        ...templates,
        [action]: {
          ...(DEFAULT_TEMPLATES[action] || {}),
          ...(templates[action] || {}),
          [field]: value,
        },
      };
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
    setIsDeployLoading(true);
    setHasDeployError(false);
    try {
      const res = await fetch('/api/admin/deploy-info?lines=200');
      if (!res.ok) throw new Error(`Failed to load deploy info: ${res.status}`);
      const data = await res.json();
      setDeployInfo(data);
    } catch (error) {
      console.error('Failed to load deploy info:', error);
      setDeployInfo(null);
      setHasDeployError(true);
    } finally {
      setIsDeployLoading(false);
    }
  };

  const loadDbMonitor = async () => {
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
      setIsDbMonitorLoading(false);
    }
  };

  const refreshDbMonitor = async () => {
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
      setIsDbMonitorLoading(false);
    }
  };

  useEffect(() => {
    loadDeployInfo();
    loadM365Info();
    loadDbMonitor();
  }, []);

  const loadFeedback = useCallback(async () => {
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

  const handleAddUser = () => {
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

    const newUser: UserItem = {
      id: Date.now().toString(),
      name: newUserForm.name.trim(),
      email: newUserForm.email.trim(),
      role: newUserForm.role,
      password: newUserForm.password,
    };

    setUsers([...users, newUser]);
    setNewUserForm({ name: '', email: '', role: 'sales', password: '' });
    setIsAddUserOpen(false);

    toast({
      title: t.settings.userAdded,
      description: `${newUser.name} ${t.settings.userAddedDesc}`,
    });
  };

  const handleEditUser = () => {
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

    const updatedUser: UserItem = {
      id: editingUser.id,
      name: editingUser.name.trim(),
      email: editingUser.email.trim(),
      role: editingUser.role,
      password: editingUser.newPassword?.trim() || editingUser.password,
    };

    setUsers(users.map(u => u.id === editingUser.id ? updatedUser : u));
    setIsEditUserOpen(false);
    setEditingUser(null);

    toast({
      title: t.settings.userUpdated,
      description: t.settings.userUpdatedDesc,
    });
  };

  const handleDeleteUser = (userId: string) => {
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

    setUsers(users.filter(u => u.id !== userId));

    toast({
      title: t.settings.userDeleted,
      description: `${userToDelete?.name} ${t.settings.userDeletedDesc}`,
    });
  };

  const openEditUserDialog = (userItem: UserItem) => {
    setEditingUser({ ...userItem, newPassword: '' });
    setIsEditUserOpen(true);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">{t.settings.title}</h1>
        <p className="text-muted-foreground mt-1">
          {t.settings.description}
        </p>
      </div>

      <div className="bg-card rounded-lg border border-border p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{t.settings.adminTools}</h2>
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

      <Tabs defaultValue="lists" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="lists" className="data-[state=active]:bg-background">
            <SettingsIcon size={16} className="mr-2" />
            {t.settings.systemLists}
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-background">
            <Users size={16} className="mr-2" />
            {t.settings.usersRoles}
          </TabsTrigger>
          <TabsTrigger value="feedback" className="data-[state=active]:bg-background">
            <MessageCircle size={16} className="mr-2" />
            {t.settings.feedbackTab}
          </TabsTrigger>
          <TabsTrigger value="m365" className="data-[state=active]:bg-background">
            <Mail size={16} className="mr-2" />
            {t.settings.m365Tab}
          </TabsTrigger>
          <TabsTrigger value="dbmonitor" className="data-[state=active]:bg-background">
            <Database size={16} className="mr-2" />
            {t.settings.dbMonitorTab}
          </TabsTrigger>
          <TabsTrigger value="deployments" className="data-[state=active]:bg-background">
            <Server size={16} className="mr-2" />
            {t.settings.deploymentsTab}
          </TabsTrigger>
          <TabsTrigger value="test" className="data-[state=active]:bg-background">
            <CheckCircle2 size={16} className="mr-2" />
            {t.settings.testTab}
          </TabsTrigger>
        </TabsList>

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
          <div className="flex justify-end">
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
                  <TableHead className="font-semibold text-right">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((userItem) => (
                  <TableRow key={userItem.id}>
                    <TableCell className="font-medium">{userItem.name}</TableCell>
                    <TableCell>{userItem.email}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                        ROLE_CONFIG[userItem.role].color
                      )}>
                        {t.roles[userItem.role]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditUserDialog(userItem)}
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
            <DialogContent className="bg-card">
              <DialogHeader>
                <DialogTitle>{t.settings.editUser}</DialogTitle>
                <DialogDescription>
                  {t.settings.updateUserDesc}
                </DialogDescription>
              </DialogHeader>
              {editingUser && (
                <div className="space-y-4 py-4">
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
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditUserOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button onClick={handleEditUser}>{t.settings.saveChanges}</Button>
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
                <RefreshCw size={16} className="mr-2" />
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
              <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
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
              <DialogContent className="bg-card max-h-[90vh] overflow-y-auto">
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
          <div className="bg-card rounded-lg border border-border overflow-visible">
            <div className="sticky top-0 z-10 bg-card/90 backdrop-blur border-b border-border px-4 md:px-6 py-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{t.settings.m365Title}</h3>
                <p className="text-sm text-muted-foreground">{t.settings.m365Description}</p>
              </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={saveM365Settings} disabled={hasM365Error || isM365Loading}>
                    {t.settings.saveChanges}
                  </Button>
                  <Button variant="outline" onClick={loadM365Info} disabled={isM365Loading}>
                    <RefreshCw size={16} className="mr-2" />
                    {isM365Loading ? t.common.loading : t.feedback.refresh}
                  </Button>
                </div>
            </div>
            </div>

            <div className="p-4 md:p-6">
              {hasM365Error ? (
                <p className="text-sm text-destructive">{t.settings.m365LoadError}</p>
              ) : (
                <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-4 space-y-4">
                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">{t.settings.m365Enabled}</div>
                        <div className="text-xs text-muted-foreground">{t.settings.m365EnabledDesc}</div>
                      </div>
                      <Switch
                        checked={(m365Info?.settings ?? defaultM365Settings).enabled}
                        onCheckedChange={(checked) =>
                          setM365Info((prev) => ({
                            settings: { ...(prev?.settings ?? defaultM365Settings), enabled: checked },
                            connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                            deviceCode: prev?.deviceCode ?? null,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
                      <div className="space-y-0.5">
                        <div className="text-sm font-medium text-foreground">{t.settings.m365TestMode}</div>
                        <div className="text-xs text-muted-foreground">{t.settings.m365TestModeDesc}</div>
                      </div>
                      <Switch
                        checked={(m365Info?.settings ?? defaultM365Settings).testMode}
                        onCheckedChange={(checked) =>
                          setM365Info((prev) => ({
                            settings: { ...(prev?.settings ?? defaultM365Settings), testMode: checked },
                            connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                            deviceCode: prev?.deviceCode ?? null,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="m365-test-recipient">{t.settings.m365TestRecipient}</Label>
                      <Input
                        id="m365-test-recipient"
                        value={(m365Info?.settings ?? defaultM365Settings).testEmail}
                        onChange={(e) =>
                          setM365Info((prev) => ({
                            settings: { ...(prev?.settings ?? defaultM365Settings), testEmail: e.target.value },
                            connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                            deviceCode: prev?.deviceCode ?? null,
                          }))
                        }
                        placeholder="r.molinier@qdmonroc.onmicrosoft.com"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="m365-tenant">{t.settings.m365TenantId}</Label>
                        <Input
                          id="m365-tenant"
                          value={(m365Info?.settings ?? defaultM365Settings).tenantId}
                          onChange={(e) =>
                            setM365Info((prev) => ({
                              settings: { ...(prev?.settings ?? defaultM365Settings), tenantId: e.target.value },
                              connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                              deviceCode: prev?.deviceCode ?? null,
                            }))
                          }
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="m365-client">{t.settings.m365ClientId}</Label>
                        <Input
                          id="m365-client"
                          value={(m365Info?.settings ?? defaultM365Settings).clientId}
                          onChange={(e) =>
                            setM365Info((prev) => ({
                              settings: { ...(prev?.settings ?? defaultM365Settings), clientId: e.target.value },
                              connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                              deviceCode: prev?.deviceCode ?? null,
                            }))
                          }
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="m365-sender">{t.settings.m365SenderUpn}</Label>
                      <Input
                        id="m365-sender"
                        value={(m365Info?.settings ?? defaultM365Settings).senderUpn}
                        onChange={(e) =>
                          setM365Info((prev) => ({
                            settings: { ...(prev?.settings ?? defaultM365Settings), senderUpn: e.target.value },
                            connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                            deviceCode: prev?.deviceCode ?? null,
                          }))
                        }
                        placeholder="no-reply@company.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="m365-baseurl">{t.settings.m365AppBaseUrl}</Label>
                      <Input
                        id="m365-baseurl"
                        value={(m365Info?.settings ?? defaultM365Settings).appBaseUrl}
                        onChange={(e) =>
                          setM365Info((prev) => ({
                            settings: { ...(prev?.settings ?? defaultM365Settings), appBaseUrl: e.target.value },
                            connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                            deviceCode: prev?.deviceCode ?? null,
                          }))
                        }
                        placeholder="http://intranet-server:3000"
                      />
                    </div>

                  </div>

                  <div className="lg:col-span-8 space-y-4">
                    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
                      <div className="text-sm font-semibold text-foreground">{t.settings.m365RecipientsTitle}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="m365-rec-sales">{t.settings.m365RecipientsSales}</Label>
                          <Textarea
                            id="m365-rec-sales"
                            className="min-h-[96px]"
                            value={(m365Info?.settings ?? defaultM365Settings).recipientsSales}
                            onChange={(e) =>
                              setM365Info((prev) => ({
                                settings: { ...(prev?.settings ?? defaultM365Settings), recipientsSales: e.target.value },
                                connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                                deviceCode: prev?.deviceCode ?? null,
                              }))
                            }
                            placeholder="sales1@company.com, sales2@company.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="m365-rec-design">{t.settings.m365RecipientsDesign}</Label>
                          <Textarea
                            id="m365-rec-design"
                            className="min-h-[96px]"
                            value={(m365Info?.settings ?? defaultM365Settings).recipientsDesign}
                            onChange={(e) =>
                              setM365Info((prev) => ({
                                settings: { ...(prev?.settings ?? defaultM365Settings), recipientsDesign: e.target.value },
                                connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                                deviceCode: prev?.deviceCode ?? null,
                              }))
                            }
                            placeholder="design1@company.com; design2@company.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="m365-rec-costing">{t.settings.m365RecipientsCosting}</Label>
                          <Textarea
                            id="m365-rec-costing"
                            className="min-h-[96px]"
                            value={(m365Info?.settings ?? defaultM365Settings).recipientsCosting}
                            onChange={(e) =>
                              setM365Info((prev) => ({
                                settings: { ...(prev?.settings ?? defaultM365Settings), recipientsCosting: e.target.value },
                                connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                                deviceCode: prev?.deviceCode ?? null,
                              }))
                            }
                            placeholder="costing@company.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="m365-rec-admin">{t.settings.m365RecipientsAdmin}</Label>
                          <Textarea
                            id="m365-rec-admin"
                            className="min-h-[96px]"
                            value={(m365Info?.settings ?? defaultM365Settings).recipientsAdmin}
                            onChange={(e) =>
                              setM365Info((prev) => ({
                                settings: { ...(prev?.settings ?? defaultM365Settings), recipientsAdmin: e.target.value },
                                connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
                                deviceCode: prev?.deviceCode ?? null,
                              }))
                            }
                            placeholder="admin@company.com"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">{t.settings.m365FlowTitle}</div>
                    <div className="text-xs text-muted-foreground">{t.settings.m365FlowDesc}</div>
                  </div>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableHead className="font-semibold">{t.settings.m365FlowStatus}</TableHead>
                          <TableHead className="font-semibold">{t.settings.m365FlowSales}</TableHead>
                          <TableHead className="font-semibold">{t.settings.m365FlowDesign}</TableHead>
                          <TableHead className="font-semibold">{t.settings.m365FlowCosting}</TableHead>
                          <TableHead className="font-semibold">{t.settings.m365FlowAdmin}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {FLOW_STATUS_KEYS.map((status) => (
                          <TableRow key={status}>
                            <TableCell className="font-medium">{getStatusLabel(status)}</TableCell>
                            <TableCell>
                              <Checkbox
                                checked={getFlowValue(status, 'sales')}
                                onCheckedChange={(checked) => updateFlowValue(status, 'sales', Boolean(checked))}
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={getFlowValue(status, 'design')}
                                onCheckedChange={(checked) => updateFlowValue(status, 'design', Boolean(checked))}
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={getFlowValue(status, 'costing')}
                                onCheckedChange={(checked) => updateFlowValue(status, 'costing', Boolean(checked))}
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={getFlowValue(status, 'admin')}
                                onCheckedChange={(checked) => updateFlowValue(status, 'admin', Boolean(checked))}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">{t.settings.m365TemplatesTitle}</div>
                    <div className="text-xs text-muted-foreground">{t.settings.m365TemplatesDesc}</div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t.settings.m365TemplateAction}</Label>
                          <Select value={m365SelectedAction} onValueChange={(v) => setM365SelectedAction(v as M365ActionKey)}>
                            <SelectTrigger>
                              <SelectValue placeholder={t.settings.m365TemplateAction} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="request_created">{t.settings.m365ActionCreated}</SelectItem>
                              <SelectItem value="request_status_changed">{t.settings.m365ActionStatusChanged}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>{t.settings.m365TemplatePreviewStatus}</Label>
                          <Select value={m365PreviewStatus} onValueChange={(v) => setM365PreviewStatus(v)}>
                            <SelectTrigger>
                              <SelectValue placeholder={t.settings.m365TemplatePreviewStatus} />
                            </SelectTrigger>
                            <SelectContent>
                              {FLOW_STATUS_KEYS.map((s) => (
                                <SelectItem key={s} value={s}>{getStatusLabel(s)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="m365-preview-requestid">{t.settings.m365TemplatePreviewRequestId}</Label>
                        <Input
                          id="m365-preview-requestid"
                          value={m365PreviewRequestId}
                          onChange={(e) => setM365PreviewRequestId(e.target.value)}
                          placeholder="(optional) CRA26020704"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t.settings.m365TemplateSubject}</Label>
                          <Input
                            value={String(((m365Info?.settings?.templates as any) || DEFAULT_TEMPLATES)?.[m365SelectedAction]?.subject ?? '')}
                            onChange={(e) => updateTemplateField(m365SelectedAction, 'subject', e.target.value)}
                            placeholder="[CRA] Request {{requestId}} ..."
                          />
                          <p className="text-xs text-muted-foreground">{t.settings.m365TemplateVars}</p>
                        </div>

                        <div className="space-y-2">
                          <Label>{t.settings.m365TemplateTitle}</Label>
                          <Input
                            value={String(((m365Info?.settings?.templates as any) || DEFAULT_TEMPLATES)?.[m365SelectedAction]?.title ?? '')}
                            onChange={(e) => updateTemplateField(m365SelectedAction, 'title', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t.settings.m365TemplateIntro}</Label>
                        <Textarea
                          value={String(((m365Info?.settings?.templates as any) || DEFAULT_TEMPLATES)?.[m365SelectedAction]?.intro ?? '')}
                          onChange={(e) => updateTemplateField(m365SelectedAction, 'intro', e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t.settings.m365TemplatePrimary}</Label>
                          <Input
                            value={String(((m365Info?.settings?.templates as any) || DEFAULT_TEMPLATES)?.[m365SelectedAction]?.primaryButtonText ?? '')}
                            onChange={(e) => updateTemplateField(m365SelectedAction, 'primaryButtonText', e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t.settings.m365TemplateFooter}</Label>
                        <Textarea
                          value={String(((m365Info?.settings?.templates as any) || DEFAULT_TEMPLATES)?.[m365SelectedAction]?.footerText ?? '')}
                          onChange={(e) => updateTemplateField(m365SelectedAction, 'footerText', e.target.value)}
                        />
                      </div>

                      <div className="flex flex-wrap gap-3 items-center">
                        <Button variant="outline" onClick={previewM365Template} disabled={isM365PreviewLoading}>
                          {isM365PreviewLoading ? t.common.loading : t.settings.m365TemplatePreview}
                        </Button>
                        <span className="text-xs text-muted-foreground">{t.settings.m365TemplateSaveHint}</span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background overflow-hidden">
                      <div className="p-3 border-b border-border">
                        <div className="text-xs text-muted-foreground">{t.settings.m365TemplateSubjectPreview}</div>
                        <div className="text-sm font-medium text-foreground break-words">{m365PreviewSubject || '-'}</div>
                        {!m365PreviewHtml ? (
                          <div className="mt-1 text-xs text-muted-foreground">{t.settings.m365TemplatePreviewEmpty}</div>
                        ) : null}
                      </div>
                      <iframe
                        title="email-preview"
                        style={{ width: '100%', height: 520, border: '0' }}
                        srcDoc={m365PreviewHtml || '<div></div>'}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-6">
                    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="text-sm font-semibold text-foreground">{t.settings.m365Connect}</div>
                          <div className="text-xs text-muted-foreground">{t.settings.m365ConnectDesc}</div>
                        </div>
                        <div className="text-xs text-muted-foreground text-right">
                          <div>
                            {t.settings.m365ConnectionStatus}:{' '}
                            <span className={cn('font-medium', (m365Info?.connection?.hasRefreshToken ? 'text-foreground' : 'text-muted-foreground'))}>
                              {m365Info?.connection?.hasRefreshToken ? t.settings.m365Connected : t.settings.m365NotConnected}
                            </span>
                          </div>
                          {m365LastPollStatus ? <div>{t.settings.m365LastPoll}: {m365LastPollStatus}</div> : null}
                        </div>
                      </div>

                      {m365Info?.deviceCode?.userCode ? (
                        <div className="rounded-md border border-border bg-background p-3 text-sm space-y-2">
                          <div className="font-medium text-foreground">{t.settings.m365DeviceCode}</div>
                          <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {m365Info.deviceCode.message || t.settings.m365DeviceCodeHint}
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="text-xs text-muted-foreground">{t.settings.m365VerificationUrl}</div>
                            <div className="font-mono break-all">
                              {m365Info.deviceCode.verificationUriComplete || m365Info.deviceCode.verificationUri || '-'}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <div className="text-xs text-muted-foreground">{t.settings.m365UserCode}</div>
                            <div className="font-mono text-base">{m365Info.deviceCode.userCode}</div>
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={startM365DeviceCode}>
                          {t.settings.m365StartDeviceCode}
                        </Button>
                        <Button variant="outline" onClick={pollM365Connection}>
                          {t.settings.m365Poll}
                        </Button>
                        <Button variant="outline" onClick={disconnectM365}>
                          {t.settings.m365Disconnect}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-6">
                    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
                      <div className="text-sm font-semibold text-foreground">{t.settings.m365TestEmail}</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div className="md:col-span-2 space-y-2">
                          <Label htmlFor="m365-test-to">{t.settings.m365ToEmail}</Label>
                          <Input
                            id="m365-test-to"
                            value={m365TestEmail}
                            onChange={(e) => setM365TestEmail(e.target.value)}
                            placeholder="someone@company.com"
                          />
                        </div>
                        <Button
                          onClick={sendM365TestEmail}
                          disabled={!m365Info?.connection?.hasRefreshToken}
                        >
                          {t.settings.m365SendTest}
                        </Button>
                      </div>
                      {!m365Info?.connection?.hasRefreshToken ? (
                        <p className="text-xs text-muted-foreground">{t.settings.m365TestEmailHint}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>
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
                  : 'border-red-500/25 bg-red-500/10';
            const iconClasses =
              status === 'green'
                ? 'bg-emerald-500 text-white'
                : status === 'yellow'
                  ? 'bg-amber-500 text-white'
                  : 'bg-red-500 text-white';

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
                      <RefreshCw size={16} className="mr-2" />
                      {isDbMonitorLoading ? t.common.loading : t.settings.dbMonitorRefresh}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          {hasDbMonitorError ? (
            <div className="bg-card rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
              {t.settings.dbMonitorLoadError}
            </div>
          ) : null}

          {dbMonitor?.lastError ? (
            <div className="bg-card rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
              {t.settings.dbMonitorCollectorError}: {dbMonitor.lastError}
            </div>
          ) : null}

          {dbMonitor?.snapshot?.errors?.length ? (
            <div className="bg-card rounded-lg border border-border p-4">
              <div className="text-sm font-semibold text-foreground">{t.settings.dbMonitorPartialTitle}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.settings.dbMonitorPartialDesc}</div>
              <div className="mt-3 space-y-2 text-sm">
                {dbMonitor.snapshot.errors.slice(0, 6).map((e, idx) => (
                  <div key={`${e.section}-${idx}`} className="rounded-md border border-border bg-muted/20 p-2">
                    <div className="font-medium text-foreground">{e.section}</div>
                    <div className="text-xs text-muted-foreground break-words">{e.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-3 lg:col-span-2">
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
        </TabsContent>

        <TabsContent value="deployments" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{t.settings.deployTitle}</h3>
                <p className="text-sm text-muted-foreground">{t.settings.deployDescription}</p>
              </div>
              <Button variant="outline" onClick={loadDeployInfo} disabled={isDeployLoading}>
                <RefreshCw size={16} className="mr-2" />
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
              </div>
            </div>

            <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4">
              <h4 className="text-base font-semibold text-foreground">{t.settings.deployLogTitle}</h4>
              {hasDeployError ? (
                <p className="text-sm text-destructive">{t.settings.deployLoadError}</p>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 max-h-96 overflow-auto">
                  {isDeployLoading ? t.common.loading : (deployInfo?.log?.content || t.settings.deployLogEmpty)}
                </pre>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="test" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-4 md:p-6">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">{t.settings.testTab}</h3>
              <p className="text-sm text-muted-foreground">
                Internal test area for admin diagnostics and feature validation.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-sm font-semibold text-foreground">Quick checks</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Place future test utilities here (DB, email, exports, etc.).
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-sm font-semibold text-foreground">Coming next</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  This is a placeholder page for now.
                </div>
              </div>
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
