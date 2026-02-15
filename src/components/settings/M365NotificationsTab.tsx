import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ROLE_CONFIG } from '@/types';
import { CheckCheck, Copy, ExternalLink, RefreshCw, X } from 'lucide-react';

type M365RoleKey = 'sales' | 'design' | 'costing' | 'admin';
type M365ActionKey = 'request_created' | 'request_status_changed';
type NotificationLang = 'en' | 'fr' | 'zh';

const RoleChip = ({ role, label }: { role: M365RoleKey; label: string }) => {
  const dot: Record<M365RoleKey, string> = {
    sales: 'bg-info',
    design: 'bg-warning',
    costing: 'bg-success',
    admin: 'bg-destructive',
  };
  return (
    <span className="inline-flex w-[110px] items-center justify-center gap-2 rounded-full border border-border bg-muted/20 px-2.5 py-0.5 text-[11px] font-semibold text-foreground/90">
      <span className={cn('h-2 w-2 rounded-full ring-1 ring-border/60', dot[role])} />
      <span className="truncate">{label}</span>
    </span>
  );
};

export default function M365NotificationsTab(props: any) {
  const {
    t,
    m365Info,
    setM365Info,
    defaultM365Settings,
    hasM365Error,
    isM365Loading,
    saveM365Settings,
    loadM365Info,
    m365BaselineSettingsJson,
    stableStringify,
    m365LastPollStatus,
    startM365DeviceCode,
    pollM365Connection,
    disconnectM365,
    parseEmailListUi,
    isValidEmailUi,
    FLOW_STATUS_KEYS,
    getStatusLabel,
    getFlowValue,
    updateFlowValue,
    toggleFlowColumn,
    toggleFlowRow,
    m365TestEmail,
    setM365TestEmail,
    sendM365TestEmail,
    m365SelectedAction,
    setM365SelectedAction,
    m365TemplateLang,
    setM365TemplateLang,
    m365PreviewStatus,
    setM365PreviewStatus,
    m365PreviewRequestId,
    setM365PreviewRequestId,
    m365PreviewSubject,
    m365PreviewHtml,
    isM365PreviewLoading,
    previewM365Template,
    getTemplateForUi,
    updateTemplateField,
    copyText,
  } = props;

  const settings = m365Info?.settings ?? defaultM365Settings;
  const isConnected = Boolean(m365Info?.connection?.hasRefreshToken);
  const isDirty = Boolean(m365BaselineSettingsJson && stableStringify(settings) !== m365BaselineSettingsJson);

  const template = getTemplateForUi(settings?.templates, m365TemplateLang as NotificationLang, m365SelectedAction as M365ActionKey);

  const deviceUrl =
    m365Info?.deviceCode?.verificationUriComplete || m365Info?.deviceCode?.verificationUri || '';
  const deviceCode = m365Info?.deviceCode?.userCode || '';

  const patchSettings = (patch: Record<string, any>) => {
    setM365Info((prev: any) => ({
      settings: { ...(prev?.settings ?? defaultM365Settings), ...patch },
      connection: prev?.connection ?? { hasRefreshToken: false, expiresAt: null },
      deviceCode: prev?.deviceCode ?? null,
    }));
  };

  const appendVar = (field: string, token: string) => {
    const cur = String(template?.[field] ?? '');
    const sep = cur.trim().length && !cur.endsWith(' ') ? ' ' : '';
    updateTemplateField(m365TemplateLang, m365SelectedAction, field, `${cur}${sep}${token}`.trim());
  };

  const roleLabel = (role: M365RoleKey) => (t.roles as any)?.[role] ?? ROLE_CONFIG[role as any]?.label ?? role;

  const roles: M365RoleKey[] = ['sales', 'design', 'costing', 'admin'];
  const isColumnAllOn = (role: M365RoleKey) => FLOW_STATUS_KEYS.every((status: string) => getFlowValue(status, role));
  const isRowAllOn = (status: string) => roles.every((role) => getFlowValue(status, role));

  const jumpToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const RecipientsField = ({
    id,
    label,
    value,
    placeholder,
    onChange,
  }: {
    id: string;
    label: string;
    value: string;
    placeholder: string;
    onChange: (next: string) => void;
  }) => {
    const emails = parseEmailListUi(value);
    const invalidCount = emails.filter((e: string) => !isValidEmailUi(e)).length;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={id}>{label}</Label>
          {emails.length ? (
            <span className={cn('text-[11px]', invalidCount ? 'text-destructive' : 'text-muted-foreground')}>
              {emails.length} {t.common.email}{emails.length > 1 ? 's' : ''}{invalidCount ? ` (${invalidCount} invalid)` : ''}
            </span>
          ) : null}
        </div>
        <Textarea
          id={id}
          className="min-h-[96px]"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {emails.length ? (
          <div className="flex flex-wrap gap-1.5">
            {emails.slice(0, 18).map((email: string) => {
              const ok = isValidEmailUi(email);
              return (
                <span
                  key={email}
                  title={email}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] leading-4',
                    ok ? 'border-border bg-background/60 text-foreground/80' : 'border-destructive/40 bg-destructive/10 text-destructive'
                  )}
                >
                  {email}
                </span>
              );
            })}
            {emails.length > 18 ? (
              <span className="text-[11px] text-muted-foreground px-1.5 py-0.5">+{emails.length - 18}</span>
            ) : null}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">{t.settings.m365RecipientsTitle}</div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-visible">
      <div className="sticky top-0 z-40 bg-card border-b border-border px-4 md:px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-foreground">{t.settings.m365Title}</h3>
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold',
                  isConnected ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600' : 'border-border bg-muted/30 text-muted-foreground'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', isConnected ? 'bg-emerald-500' : 'bg-slate-400')} />
                {isConnected ? t.settings.m365Connected : t.settings.m365NotConnected}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold',
                  isDirty ? 'border-amber-500/25 bg-amber-500/10 text-amber-700' : 'border-border bg-muted/20 text-muted-foreground'
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', isDirty ? 'bg-amber-500' : 'bg-emerald-500')} />
                {isDirty ? t.settings.m365UnsavedChanges : t.settings.m365AllChangesSaved}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{t.settings.m365Description}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground">{t.settings.m365JumpTo}:</span>
              <Select onValueChange={(v) => jumpToSection(v)}>
                <SelectTrigger className="h-9 w-[220px] bg-background/60">
                  <SelectValue placeholder={t.settings.m365JumpTo} />
                </SelectTrigger>
                <SelectContent className="bg-card border border-border">
                  <SelectItem value="m365-basics">{t.settings.m365Enabled}</SelectItem>
                  <SelectItem value="m365-connection">{t.settings.m365Connect}</SelectItem>
                  <SelectItem value="m365-recipients">{t.settings.m365RecipientsTitle}</SelectItem>
                  <SelectItem value="m365-routing">{t.settings.m365FlowTitle}</SelectItem>
                  <SelectItem value="m365-templates">{t.settings.m365TemplatesTitle}</SelectItem>
                  <SelectItem value="m365-test">{t.settings.m365TestEmail}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex w-full flex-col sm:flex-row gap-3 lg:w-auto lg:justify-end">
            <Button size="lg" className="w-full sm:w-auto sm:min-w-48" onClick={saveM365Settings} disabled={hasM365Error || isM365Loading}>
              {t.settings.saveChanges}
            </Button>
            <Button size="lg" className="w-full sm:w-auto sm:min-w-48" variant="outline" onClick={loadM365Info} disabled={isM365Loading}>
              <span className={cn('mr-2 inline-flex', isM365Loading ? 'animate-spin' : '')}>
                <RefreshCw size={16} />
              </span>
              {isM365Loading ? t.common.loading : t.common.refresh}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        {hasM365Error ? (
          <p className="text-sm text-destructive">{t.settings.m365LoadError}</p>
        ) : (
          <div className="space-y-6">
            <section id="m365-basics" className="scroll-mt-28 md:scroll-mt-32 rounded-xl border border-border bg-muted/10 p-4 space-y-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{t.settings.m365Enabled}</div>
                  <div className="text-xs text-muted-foreground">{t.settings.m365EnabledDesc}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-foreground">{t.settings.m365Enabled}</div>
                      <div className="text-xs text-muted-foreground">{t.settings.m365EnabledDesc}</div>
                    </div>
                    <Switch checked={Boolean(settings.enabled)} onCheckedChange={(checked) => patchSettings({ enabled: checked })} />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border bg-background/60 p-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-foreground">{t.settings.m365TestMode}</div>
                      <div className="text-xs text-muted-foreground">{t.settings.m365TestModeDesc}</div>
                    </div>
                    <Switch checked={Boolean(settings.testMode)} onCheckedChange={(checked) => patchSettings({ testMode: checked })} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="m365-test-recipient">{t.settings.m365TestRecipient}</Label>
                    <Input
                      id="m365-test-recipient"
                      value={String(settings.testEmail ?? '')}
                      onChange={(e) => patchSettings({ testEmail: e.target.value })}
                      placeholder="someone@company.com"
                    />
                  </div>
                </div>
              </section>

            <section id="m365-connection" className="scroll-mt-28 md:scroll-mt-32 rounded-xl border border-border bg-muted/10 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">{t.settings.m365Connect}</div>
                    <div className="text-xs text-muted-foreground">{t.settings.m365ConnectDesc}</div>
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    <div>
                      {t.settings.m365ConnectionStatus}:{' '}
                      <span className={cn('font-medium', isConnected ? 'text-foreground' : 'text-muted-foreground')}>
                        {isConnected ? t.settings.m365Connected : t.settings.m365NotConnected}
                      </span>
                    </div>
                    {m365LastPollStatus ? <div>{t.settings.m365LastPoll}: {m365LastPollStatus}</div> : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="m365-tenant">{t.settings.m365TenantId}</Label>
                    <Input id="m365-tenant" value={String(settings.tenantId ?? '')} onChange={(e) => patchSettings({ tenantId: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="m365-client">{t.settings.m365ClientId}</Label>
                    <Input id="m365-client" value={String(settings.clientId ?? '')} onChange={(e) => patchSettings({ clientId: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="m365-sender">{t.settings.m365SenderUpn}</Label>
                    <Input id="m365-sender" value={String(settings.senderUpn ?? '')} onChange={(e) => patchSettings({ senderUpn: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="m365-baseurl">{t.settings.m365AppBaseUrl}</Label>
                    <Input id="m365-baseurl" value={String(settings.appBaseUrl ?? '')} onChange={(e) => patchSettings({ appBaseUrl: e.target.value })} />
                  </div>
                </div>

                {deviceCode ? (
                  <div className="rounded-lg border border-border bg-background/70 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="font-medium text-foreground">{t.settings.m365DeviceCode}</div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => copyText(deviceCode)} title={t.settings.m365CopyCode}>
                          <Copy size={14} className="mr-2" />
                          {t.settings.m365CopyCode}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deviceUrl && window.open(deviceUrl, '_blank')}
                          disabled={!deviceUrl}
                          title={t.settings.m365OpenVerification}
                        >
                          <ExternalLink size={14} className="mr-2" />
                          {t.settings.m365OpenVerification}
                        </Button>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {m365Info?.deviceCode?.message || t.settings.m365DeviceCodeHint}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">{t.settings.m365VerificationUrl}</div>
                        <div className="font-mono break-all text-sm">{deviceUrl || '-'}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">{t.settings.m365UserCode}</div>
                        <div className="font-mono text-base">{deviceCode}</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={startM365DeviceCode}
                    disabled={!String(settings.tenantId ?? '').trim() || !String(settings.clientId ?? '').trim()}
                  >
                    {t.settings.m365StartDeviceCode}
                  </Button>
                  <Button variant="outline" onClick={pollM365Connection}>
                    {t.settings.m365Poll}
                  </Button>
                  <Button variant="outline" onClick={disconnectM365}>
                    {t.settings.m365Disconnect}
                  </Button>
                </div>
              </section>

            <section id="m365-recipients" className="scroll-mt-28 md:scroll-mt-32 rounded-xl border border-border bg-muted/10 p-4 space-y-4">
                <div className="text-sm font-semibold text-foreground">{t.settings.m365RecipientsTitle}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RecipientsField
                    id="m365-rec-sales"
                    label={t.settings.m365RecipientsSales}
                    value={String(settings.recipientsSales ?? '')}
                    placeholder="sales1@company.com, sales2@company.com"
                    onChange={(next) => patchSettings({ recipientsSales: next })}
                  />
                  <RecipientsField
                    id="m365-rec-design"
                    label={t.settings.m365RecipientsDesign}
                    value={String(settings.recipientsDesign ?? '')}
                    placeholder="design1@company.com; design2@company.com"
                    onChange={(next) => patchSettings({ recipientsDesign: next })}
                  />
                  <RecipientsField
                    id="m365-rec-costing"
                    label={t.settings.m365RecipientsCosting}
                    value={String(settings.recipientsCosting ?? '')}
                    placeholder="costing@company.com"
                    onChange={(next) => patchSettings({ recipientsCosting: next })}
                  />
                  <RecipientsField
                    id="m365-rec-admin"
                    label={t.settings.m365RecipientsAdmin}
                    value={String(settings.recipientsAdmin ?? '')}
                    placeholder="admin@company.com"
                    onChange={(next) => patchSettings({ recipientsAdmin: next })}
                  />
                </div>
              </section>

            <section id="m365-routing" className="scroll-mt-28 md:scroll-mt-32 rounded-xl border border-border bg-muted/10 p-4 space-y-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{t.settings.m365FlowTitle}</div>
                  <div className="text-xs text-muted-foreground">{t.settings.m365FlowDesc}</div>
                </div>

                <div className="rounded-lg border border-border bg-background/60 overflow-hidden">
                  <Table containerClassName="max-h-[60vh]">
                    <TableHeader>
                      <TableRow className="bg-muted hover:bg-muted">
                        <TableHead className="font-semibold sticky top-0 left-0 z-30 bg-muted w-[220px] min-w-[220px] h-10 px-3">
                          {t.settings.m365FlowStatus}
                        </TableHead>
                        {roles.map((role) => {
                          const allOn = isColumnAllOn(role);
                          return (
                            <TableHead
                              key={role}
                              className="font-semibold sticky top-0 z-20 bg-muted w-[130px] min-w-[130px] text-center h-10 px-2"
                            >
                              <div className="flex flex-col items-center justify-center gap-2 py-1">
                                <RoleChip role={role} label={roleLabel(role)} />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => toggleFlowColumn(role)}
                                  title={allOn ? t.settings.m365ClearAll : t.settings.m365SelectAll}
                                  aria-label={allOn ? t.settings.m365ClearAll : t.settings.m365SelectAll}
                                >
                                  {allOn ? <X size={16} /> : <CheckCheck size={16} />}
                                </Button>
                              </div>
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {FLOW_STATUS_KEYS.map((status: string) => {
                        const allOn = isRowAllOn(status);
                        return (
                          <TableRow key={status}>
                            <TableCell className="font-medium sticky left-0 z-10 bg-background w-[220px] min-w-[220px] py-2 px-3">
                              <div className="flex items-center justify-between gap-3">
                                <span>{getStatusLabel(status)}</span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => toggleFlowRow(status)}
                                  title={allOn ? t.settings.m365ClearAll : t.settings.m365SelectAll}
                                  aria-label={allOn ? t.settings.m365ClearAll : t.settings.m365SelectAll}
                                >
                                  {allOn ? <X size={16} /> : <CheckCheck size={16} />}
                                </Button>
                              </div>
                            </TableCell>
                            {roles.map((role) => (
                              <TableCell key={role} className="w-[130px] min-w-[130px] py-2 px-2">
                                <div className="flex items-center justify-center">
                                  <Checkbox checked={getFlowValue(status, role)} onCheckedChange={(c) => updateFlowValue(status, role, Boolean(c))} />
                                </div>
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </section>

            <section id="m365-templates" className="scroll-mt-28 md:scroll-mt-32 rounded-xl border border-border bg-muted/10 p-4 space-y-4">
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
                            {FLOW_STATUS_KEYS.map((s: string) => (
                              <SelectItem key={s} value={s}>
                                {getStatusLabel(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t.settings.m365TemplateLanguage}</Label>
                      <Tabs value={m365TemplateLang} onValueChange={(v) => setM365TemplateLang(v as NotificationLang)}>
                        <TabsList className="h-9">
                          <TabsTrigger className="h-8 text-xs" value="en">EN</TabsTrigger>
                          <TabsTrigger className="h-8 text-xs" value="fr">FR</TabsTrigger>
                          <TabsTrigger className="h-8 text-xs" value="zh">ZH</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="m365-preview-requestid">{t.settings.m365TemplatePreviewRequestId}</Label>
                      <Input id="m365-preview-requestid" value={m365PreviewRequestId} onChange={(e) => setM365PreviewRequestId(e.target.value)} placeholder="(optional) CRA26020704" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <Label>{t.settings.m365TemplateSubject}</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => appendVar('subject', '{{requestId}}')}>{'{{requestId}}'}</Button>
                          <Button size="sm" variant="outline" onClick={() => appendVar('subject', '{{status}}')}>{'{{status}}'}</Button>
                          <Button size="sm" variant="outline" onClick={() => appendVar('subject', '{{statusCode}}')}>{'{{statusCode}}'}</Button>
                        </div>
                      </div>
                      <Input value={String(template.subject ?? '')} onChange={(e) => updateTemplateField(m365TemplateLang, m365SelectedAction, 'subject', e.target.value)} placeholder="[CRA] Request {{requestId}} ..." />
                      <p className="text-xs text-muted-foreground">{t.settings.m365TemplateVars}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t.settings.m365TemplateTitle}</Label>
                        <Input value={String(template.title ?? '')} onChange={(e) => updateTemplateField(m365TemplateLang, m365SelectedAction, 'title', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t.settings.m365TemplatePrimary}</Label>
                        <Input value={String(template.primaryButtonText ?? '')} onChange={(e) => updateTemplateField(m365TemplateLang, m365SelectedAction, 'primaryButtonText', e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t.settings.m365TemplateSecondary}</Label>
                        <Input value={String(template.secondaryButtonText ?? '')} onChange={(e) => updateTemplateField(m365TemplateLang, m365SelectedAction, 'secondaryButtonText', e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>{t.settings.m365TemplateIntro}</Label>
                      <Textarea value={String(template.intro ?? '')} onChange={(e) => updateTemplateField(m365TemplateLang, m365SelectedAction, 'intro', e.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label>{t.settings.m365TemplateFooter}</Label>
                      <Textarea value={String(template.footerText ?? '')} onChange={(e) => updateTemplateField(m365TemplateLang, m365SelectedAction, 'footerText', e.target.value)} />
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
                    <iframe title="email-preview" style={{ width: '100%', height: 520, border: '0' }} srcDoc={m365PreviewHtml || '<div></div>'} />
                  </div>
                </div>
              </section>

            <section id="m365-test" className="scroll-mt-28 md:scroll-mt-32 rounded-xl border border-border bg-muted/10 p-4 space-y-3">
                <div className="text-sm font-semibold text-foreground">{t.settings.m365TestEmail}</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="m365-test-to">{t.settings.m365ToEmail}</Label>
                    <Input id="m365-test-to" value={m365TestEmail} onChange={(e) => setM365TestEmail(e.target.value)} placeholder="someone@company.com" />
                  </div>
                  <Button onClick={sendM365TestEmail} disabled={!m365Info?.connection?.hasRefreshToken}>
                    {t.settings.m365SendTest}
                  </Button>
                </div>
                {!m365Info?.connection?.hasRefreshToken ? (
                  <p className="text-xs text-muted-foreground">{t.settings.m365TestEmailHint}</p>
                ) : null}
              </section>
          </div>
        )}
      </div>
    </div>
  );
}
