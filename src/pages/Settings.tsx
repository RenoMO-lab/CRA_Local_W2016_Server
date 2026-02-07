import React, { useCallback, useEffect, useState } from 'react';
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
import { Plus, Trash2, Users, Settings as SettingsIcon, Globe, Truck, Pencil, Layers, ArrowRightLeft, Box, Circle, Download, Droplets, Route, Wind, Repeat, PackageCheck, MessageCircle, Server, RefreshCw, Mail } from 'lucide-react';
import { ROLE_CONFIG, UserRole } from '@/types';
import { cn } from '@/lib/utils';
import ListManager from '@/components/settings/ListManager';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';

type M365RoleKey = 'sales' | 'design' | 'costing' | 'admin';
type M365FlowMap = Record<string, Partial<Record<M365RoleKey, boolean>>>;

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
  createdAt: string;
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
  const [deployInfo, setDeployInfo] = useState<DeployInfo | null>(null);
  const [isDeployLoading, setIsDeployLoading] = useState(false);
  const [hasDeployError, setHasDeployError] = useState(false);
  const [m365Info, setM365Info] = useState<M365AdminResponse | null>(null);
  const [isM365Loading, setIsM365Loading] = useState(false);
  const [hasM365Error, setHasM365Error] = useState(false);
  const [m365TestEmail, setM365TestEmail] = useState('');
  const [m365LastPollStatus, setM365LastPollStatus] = useState<string | null>(null);
  const severityLabels: Record<string, string> = {
    low: t.feedback.severityLow,
    medium: t.feedback.severityMedium,
    high: t.feedback.severityHigh,
    critical: t.feedback.severityCritical,
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
      if (!res.ok) throw new Error(`Failed to save M365 settings: ${res.status}`);
      const data = await res.json();
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
        description: t.request.failedSubmit,
        variant: 'destructive',
      });
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
      const res = await fetch('/api/admin/m365/poll', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error ? JSON.stringify(data.error) : `Poll failed: ${res.status}`;
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

  useEffect(() => {
    loadDeployInfo();
    loadM365Info();
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
            <p className="text-sm text-muted-foreground">{t.settings.exportCsvDesc}</p>
          </div>
          <Button onClick={exportRequestsCsv} className="md:self-start">
            <Download size={16} className="mr-2" />
            {t.settings.exportCsv}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="lists" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="lists" className="data-[state=active]:bg-background">
            <SettingsIcon size={16} className="mr-2" />
            {t.settings.systemLists}
          </TabsTrigger>
          <TabsTrigger value="product-types" className="data-[state=active]:bg-background">
            <Layers size={16} className="mr-2" />
            {t.settings.productTypes}
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
          <TabsTrigger value="deployments" className="data-[state=active]:bg-background">
            <Server size={16} className="mr-2" />
            {t.settings.deploymentsTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lists" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ListManager
              title={t.settings.applicationVehicles}
              icon={Truck}
              list={applicationVehicles}
              listName={t.settings.applicationVehicles}
              onAddItem={(value) => addListItem('applicationVehicles', value)}
              onDeleteItem={(id) => deleteListItem('applicationVehicles', id)}
              onEditItem={(listName, item) => openEditItemDialog('applicationVehicles', listName, item)}
              onReorderItems={(ids) => reorderListItems('applicationVehicles', ids)}
              onToast={handleToast}
            />
            <ListManager
              title={t.settings.countries}
              icon={Globe}
              list={countries}
              listName={t.settings.countries}
              onAddItem={(value) => addListItem('countries', value)}
              onDeleteItem={(id) => deleteListItem('countries', id)}
              onEditItem={(listName, item) => openEditItemDialog('countries', listName, item)}
              onReorderItems={(ids) => reorderListItems('countries', ids)}
              onToast={handleToast}
            />
              <ListManager
                title={t.settings.brakeSizes}
                icon={SettingsIcon}
                list={brakeSizes}
                listName={t.settings.brakeSizes}
                onAddItem={(value) => addListItem('brakeSizes', value)}
                onDeleteItem={(id) => deleteListItem('brakeSizes', id)}
                onEditItem={(listName, item) => openEditItemDialog('brakeSizes', listName, item)}
                onReorderItems={(ids) => reorderListItems('brakeSizes', ids)}
                onToast={handleToast}
              />
              <ListManager
                title={t.settings.brakeTypes}
                icon={Circle}
                list={brakeTypes}
                listName={t.settings.brakeTypes}
                onAddItem={(value) => addListItem('brakeTypes', value)}
                onDeleteItem={(id) => deleteListItem('brakeTypes', id)}
                onEditItem={(listName, item) => openEditItemDialog('brakeTypes', listName, item)}
                onReorderItems={(ids) => reorderListItems('brakeTypes', ids)}
                onToast={handleToast}
              />
              <ListManager
                title={t.settings.brakePowerTypes}
                icon={SettingsIcon}
                list={brakePowerTypes}
                listName={t.settings.brakePowerTypes}
                onAddItem={(value) => addListItem('brakePowerTypes', value)}
                onDeleteItem={(id) => deleteListItem('brakePowerTypes', id)}
                onEditItem={(listName, item) => openEditItemDialog('brakePowerTypes', listName, item)}
                onReorderItems={(ids) => reorderListItems('brakePowerTypes', ids)}
                onToast={handleToast}
              />
              <ListManager
                title={t.settings.brakeCertificates}
                icon={SettingsIcon}
                list={brakeCertificates}
                listName={t.settings.brakeCertificates}
                onAddItem={(value) => addListItem('brakeCertificates', value)}
                onDeleteItem={(id) => deleteListItem('brakeCertificates', id)}
                onEditItem={(listName, item) => openEditItemDialog('brakeCertificates', listName, item)}
                onReorderItems={(ids) => reorderListItems('brakeCertificates', ids)}
                onToast={handleToast}
              />
              <ListManager
                title={t.settings.mainBodySectionTypes}
                icon={Box}
                list={mainBodySectionTypes}
                listName={t.settings.mainBodySectionTypes}
                onAddItem={(value) => addListItem('mainBodySectionTypes', value)}
                onDeleteItem={(id) => deleteListItem('mainBodySectionTypes', id)}
                onEditItem={(listName, item) => openEditItemDialog('mainBodySectionTypes', listName, item)}
                onReorderItems={(ids) => reorderListItems('mainBodySectionTypes', ids)}
                onToast={handleToast}
              />
              <ListManager
                title={t.settings.clientSealingRequests}
                icon={SettingsIcon}
                list={clientSealingRequests}
                listName={t.settings.clientSealingRequests}
                onAddItem={(value) => addListItem('clientSealingRequests', value)}
                onDeleteItem={(id) => deleteListItem('clientSealingRequests', id)}
                onEditItem={(listName, item) => openEditItemDialog('clientSealingRequests', listName, item)}
                onReorderItems={(ids) => reorderListItems('clientSealingRequests', ids)}
                onToast={handleToast}
              />
              <ListManager
                title={t.settings.cupLogoOptions}
                icon={Circle}
                list={cupLogoOptions}
                listName={t.settings.cupLogoOptions}
                onAddItem={(value) => addListItem('cupLogoOptions', value)}
                onDeleteItem={(id) => deleteListItem('cupLogoOptions', id)}
                onEditItem={(listName, item) => openEditItemDialog('cupLogoOptions', listName, item)}
                onReorderItems={(ids) => reorderListItems('cupLogoOptions', ids)}
                onToast={handleToast}
              />
              <ListManager
                title={t.settings.suspensions}
                icon={SettingsIcon}
              list={suspensions}
              listName={t.settings.suspensions}
              onAddItem={(value) => addListItem('suspensions', value)}
              onDeleteItem={(id) => deleteListItem('suspensions', id)}
              onEditItem={(listName, item) => openEditItemDialog('suspensions', listName, item)}
              onReorderItems={(ids) => reorderListItems('suspensions', ids)}
              onToast={handleToast}
            />
            <ListManager
              title={t.settings.repeatabilityTypes}
              icon={Repeat}
              list={repeatabilityTypes}
              listName={t.settings.repeatabilityTypes}
              onAddItem={(value) => addListItem('repeatabilityTypes', value)}
              onDeleteItem={(id) => deleteListItem('repeatabilityTypes', id)}
              onEditItem={(listName, item) => openEditItemDialog('repeatabilityTypes', listName, item)}
              onReorderItems={(ids) => reorderListItems('repeatabilityTypes', ids)}
              onToast={handleToast}
            />
            <ListManager
              title={t.settings.expectedDeliveryOptions}
              icon={PackageCheck}
              list={expectedDeliveryOptions}
              listName={t.settings.expectedDeliveryOptions}
              onAddItem={(value) => addListItem('expectedDeliveryOptions', value)}
              onDeleteItem={(id) => deleteListItem('expectedDeliveryOptions', id)}
              onEditItem={(listName, item) => openEditItemDialog('expectedDeliveryOptions', listName, item)}
              onReorderItems={(ids) => reorderListItems('expectedDeliveryOptions', ids)}
              onToast={handleToast}
            />
            <ListManager
              title={t.settings.workingConditions}
              icon={Droplets}
              list={workingConditions}
              listName={t.settings.workingConditions}
              onAddItem={(value) => addListItem('workingConditions', value)}
              onDeleteItem={(id) => deleteListItem('workingConditions', id)}
              onEditItem={(listName, item) => openEditItemDialog('workingConditions', listName, item)}
              onReorderItems={(ids) => reorderListItems('workingConditions', ids)}
              onToast={handleToast}
            />
            <ListManager
              title={t.settings.usageTypes}
              icon={Route}
              list={usageTypes}
              listName={t.settings.usageTypes}
              onAddItem={(value) => addListItem('usageTypes', value)}
              onDeleteItem={(id) => deleteListItem('usageTypes', id)}
              onEditItem={(listName, item) => openEditItemDialog('usageTypes', listName, item)}
              onReorderItems={(ids) => reorderListItems('usageTypes', ids)}
              onToast={handleToast}
            />
            <ListManager
              title={t.settings.environments}
              icon={Wind}
              list={environments}
              listName={t.settings.environments}
              onAddItem={(value) => addListItem('environments', value)}
              onDeleteItem={(id) => deleteListItem('environments', id)}
              onEditItem={(listName, item) => openEditItemDialog('environments', listName, item)}
              onReorderItems={(ids) => reorderListItems('environments', ids)}
              onToast={handleToast}
            />
          </div>
        </TabsContent>

        <TabsContent value="product-types" className="space-y-6">
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
                      <div key={item.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {item.type === 'bug' ? t.feedback.typeBug : t.feedback.typeFeature}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.createdAt ? format(new Date(item.createdAt), 'MMM d, yyyy') : '-'}
                          </span>
                        </div>
                        <div className="font-semibold text-foreground">{item.title}</div>
                        <div className="text-sm text-muted-foreground">{item.description}</div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{t.feedback.severity}: {item.severity ? severityLabels[item.severity] || item.severity : '-'}</span>
                          <span>{t.feedback.page}: {item.pagePath || '-'}</span>
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
                          <TableHead className="font-semibold">{t.feedback.severity}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.reportedBy}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.page}</TableHead>
                          <TableHead className="font-semibold">{t.feedback.createdAt}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {feedbackItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="capitalize">
                              {item.type === 'bug' ? t.feedback.typeBug : t.feedback.typeFeature}
                            </TableCell>
                            <TableCell className="font-medium">{item.title}</TableCell>
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
        </TabsContent>

        <TabsContent value="m365" className="space-y-6">
          <div className="bg-card rounded-lg border border-border p-4 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{t.settings.m365Title}</h3>
                <p className="text-sm text-muted-foreground">{t.settings.m365Description}</p>
              </div>
              <Button variant="outline" onClick={loadM365Info} disabled={isM365Loading}>
                <RefreshCw size={16} className="mr-2" />
                {isM365Loading ? t.common.loading : t.feedback.refresh}
              </Button>
            </div>

            {hasM365Error ? (
              <p className="mt-4 text-sm text-destructive">{t.settings.m365LoadError}</p>
            ) : (
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
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

                    <div className="flex gap-3">
                      <Button onClick={saveM365Settings}>{t.settings.saveChanges}</Button>
                      <Button variant="outline" onClick={loadM365Info}>
                        {t.feedback.refresh}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
                      <div className="text-sm font-semibold text-foreground">{t.settings.m365RecipientsTitle}</div>
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="m365-rec-sales">{t.settings.m365RecipientsSales}</Label>
                          <Textarea
                            id="m365-rec-sales"
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
