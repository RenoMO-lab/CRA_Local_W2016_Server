import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Eye, RefreshCw, Search, XCircle } from 'lucide-react';

import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type AuditLogRow = {
  id: string;
  ts: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  result: 'ok' | 'error';
  errorMessage: string | null;
  metadata: any;
};

type AuditLogResponse = {
  page: number;
  pageSize: number;
  total: number;
  rows: AuditLogRow[];
};

const toIsoOrEmpty = (value: string) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
};

const formatTs = (ts: string) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return format(d, 'yyyy-MM-dd HH:mm:ss');
};

const AuditLogPanel: React.FC = () => {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [draft, setDraft] = useState({
    from: '',
    to: '',
    actorEmail: '',
    action: '',
    targetId: '',
    result: 'all' as 'all' | 'ok' | 'error',
    q: '',
  });
  const [filters, setFilters] = useState(draft);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / pageSize)), [total, pageSize]);

  const buildQueryString = useCallback(() => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));

    const fromIso = toIsoOrEmpty(filters.from);
    const toIso = toIsoOrEmpty(filters.to);
    if (fromIso) qs.set('from', fromIso);
    if (toIso) qs.set('to', toIso);
    if (filters.actorEmail.trim()) qs.set('actorEmail', filters.actorEmail.trim());
    if (filters.action.trim()) qs.set('action', filters.action.trim());
    if (filters.targetId.trim()) qs.set('targetId', filters.targetId.trim());
    if (filters.result !== 'all') qs.set('result', filters.result);
    if (filters.q.trim()) qs.set('q', filters.q.trim());
    return qs.toString();
  }, [filters, page, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-log?${buildQueryString()}`);
      const data = (await res.json().catch(() => null)) as AuditLogResponse | null;
      if (!res.ok) {
        const message = String((data as any)?.error ?? `Failed to load audit log (${res.status})`);
        throw new Error(message);
      }
      setRows(Array.isArray(data?.rows) ? data!.rows : []);
      setTotal(typeof data?.total === 'number' ? data.total : 0);
    } catch (e: any) {
      toast({
        title: t.settings.auditLogTab,
        description: String(e?.message ?? e ?? 'Failed to load audit log'),
        variant: 'destructive' as any,
      });
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildQueryString, toast, t.settings.auditLogTab]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = () => {
    setFilters(draft);
    setPage(1);
  };

  const clearFilters = () => {
    const next = { from: '', to: '', actorEmail: '', action: '', targetId: '', result: 'all' as const, q: '' };
    setDraft(next);
    setFilters(next);
    setPage(1);
  };

  const openDetails = (row: AuditLogRow) => {
    setSelected(row);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">{t.settings.auditLogTitle}</h3>
        <p className="text-sm text-muted-foreground">{t.settings.auditLogDesc}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>{t.settings.auditLogFrom}</Label>
            <Input
              type="datetime-local"
              value={draft.from}
              onChange={(e) => setDraft((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t.settings.auditLogTo}</Label>
            <Input
              type="datetime-local"
              value={draft.to}
              onChange={(e) => setDraft((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t.common.email}</Label>
            <Input
              value={draft.actorEmail}
              onChange={(e) => setDraft((p) => ({ ...p, actorEmail: e.target.value }))}
              placeholder="user@company.com"
            />
          </div>
          <div className="space-y-2">
            <Label>{t.settings.auditLogAction}</Label>
            <Input
              value={draft.action}
              onChange={(e) => setDraft((p) => ({ ...p, action: e.target.value }))}
              placeholder="auth.login_success"
            />
          </div>
          <div className="space-y-2">
            <Label>{t.settings.auditLogTarget}</Label>
            <Input
              value={draft.targetId}
              onChange={(e) => setDraft((p) => ({ ...p, targetId: e.target.value }))}
              placeholder={t.table.requestId}
            />
          </div>
          <div className="space-y-2">
            <Label>{t.settings.auditLogResult}</Label>
            <Select value={draft.result} onValueChange={(v) => setDraft((p) => ({ ...p, result: v as any }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.common.all}</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
                <SelectItem value="error">{t.common.error}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2 xl:col-span-2">
            <Label>{t.common.search}</Label>
            <Input
              value={draft.q}
              onChange={(e) => setDraft((p) => ({ ...p, q: e.target.value }))}
              placeholder={t.settings.auditLogSearchHint}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={applyFilters} disabled={loading}>
            <Search size={16} className="mr-2" />
            {t.common.apply}
          </Button>
          <Button variant="outline" onClick={clearFilters} disabled={loading}>
            <XCircle size={16} className="mr-2" />
            {t.common.clear}
          </Button>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={cn('mr-2', loading ? 'animate-spin' : '')} />
            {t.common.refresh}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t.common.page}</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
            >
              {t.common.previous}
            </Button>
            <div className="text-sm text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={loading || page >= totalPages}
            >
              {t.common.next}
            </Button>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[92px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[170px]">{t.common.date}</TableHead>
              <TableHead>{t.common.email}</TableHead>
              <TableHead className="w-[110px]">{t.common.role}</TableHead>
              <TableHead>{t.settings.auditLogAction}</TableHead>
              <TableHead>{t.settings.auditLogTarget}</TableHead>
              <TableHead className="w-[90px]">{t.settings.auditLogResult}</TableHead>
              <TableHead className="w-[140px]">IP</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{formatTs(r.ts)}</TableCell>
                  <TableCell className="text-sm text-foreground">{r.actorEmail ?? '-'}</TableCell>
                  <TableCell className="text-sm text-foreground">{r.actorRole ?? '-'}</TableCell>
                  <TableCell className="text-sm text-foreground">{r.action}</TableCell>
                  <TableCell className="text-sm text-foreground">
                    {r.targetType ? `${r.targetType}: ` : ''}
                    <span className="font-mono text-xs">{r.targetId ?? '-'}</span>
                  </TableCell>
                  <TableCell className={cn('text-sm font-semibold', r.result === 'error' ? 'text-destructive' : 'text-success')}>
                    {r.result}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{r.ip ?? '-'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => openDetails(r)}>
                      <Eye size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground py-10 text-center">
                  {loading ? t.common.loading : t.settings.auditLogEmpty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t.settings.auditLogDetails}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selected ? (
              <>
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm space-y-1">
                  <div><span className="text-muted-foreground">{t.common.date}:</span> {formatTs(selected.ts)}</div>
                  <div><span className="text-muted-foreground">{t.common.email}:</span> {selected.actorEmail ?? '-'}</div>
                  <div><span className="text-muted-foreground">{t.common.role}:</span> {selected.actorRole ?? '-'}</div>
                  <div><span className="text-muted-foreground">{t.settings.auditLogAction}:</span> {selected.action}</div>
                  <div><span className="text-muted-foreground">{t.settings.auditLogTarget}:</span> {selected.targetType ?? '-'} {selected.targetId ?? ''}</div>
                  <div><span className="text-muted-foreground">{t.settings.auditLogResult}:</span> {selected.result}</div>
                  {selected.errorMessage ? (
                    <div className="text-destructive"><span className="text-muted-foreground">{t.common.error}:</span> {selected.errorMessage}</div>
                  ) : null}
                  <div><span className="text-muted-foreground">IP:</span> {selected.ip ?? '-'}</div>
                </div>

                <div className="space-y-2">
                  <Label>{t.settings.auditLogMetadata}</Label>
                  <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(selected.metadata ?? {}, null, 2)}
                  </pre>
                </div>

                <div className="space-y-2">
                  <Label>{t.settings.auditLogUserAgent}</Label>
                  <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto whitespace-pre-wrap break-words">
                    {selected.userAgent ?? '-'}
                  </pre>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">-</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AuditLogPanel;

