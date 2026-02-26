import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Download,
  Edit,
  Eye,
  Files,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  CustomerRequest,
  UserRole,
  RequestProduct,
  AXLE_LOCATIONS,
  ARTICULATION_TYPES,
  CONFIGURATION_TYPES,
  RequestPriority,
} from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import RequestReviewDrawer from '@/components/dashboard/RequestReviewDrawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/LanguageContext';
import { useRequests } from '@/context/RequestContext';
import { useAppShell } from '@/context/AppShellContext';
import { Language } from '@/i18n/translations';

interface RequestsTableProps {
  requests: CustomerRequest[];
  userRole: UserRole;
  onDelete?: (id: string) => void;
}

type SortDirection = 'asc' | 'desc';
type SortKey =
  | 'id'
  | 'priority'
  | 'status'
  | 'clientName'
  | 'applicationVehicle'
  | 'country'
  | 'createdByName'
  | 'createdAt';

interface SortRule {
  key: SortKey;
  direction: SortDirection;
}

interface RowContextMenuState {
  x: number;
  y: number;
  request: CustomerRequest;
}

interface RowActionItem {
  key: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  onSelect: () => void | Promise<void>;
  separatorBefore?: boolean;
  destructive?: boolean;
}

const PRIORITY_OPTIONS: Array<{ value: RequestPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const PRIORITY_WEIGHT: Record<RequestPriority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4,
};

const toPriority = (value?: string): RequestPriority => {
  if (value === 'low' || value === 'normal' || value === 'high' || value === 'urgent') return value;
  return 'normal';
};

const nextSortDirection = (direction?: SortDirection) => {
  if (!direction) return 'asc';
  if (direction === 'asc') return 'desc';
  return null;
};

const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const buildRowCsv = (request: CustomerRequest) => {
  const header = ['id', 'priority', 'status', 'clientName', 'applicationVehicle', 'country', 'createdByName', 'createdAt', 'updatedAt'];
  const values = [
    request.id,
    toPriority(request.priority),
    request.status,
    request.clientName,
    request.applicationVehicle,
    request.country,
    request.createdByName,
    request.createdAt instanceof Date ? request.createdAt.toISOString() : String(request.createdAt ?? ''),
    request.updatedAt instanceof Date ? request.updatedAt.toISOString() : String(request.updatedAt ?? ''),
  ];
  const escapeCsv = (raw: unknown) => {
    const text = String(raw ?? '');
    if (!text.includes(',') && !text.includes('"') && !text.includes('\n')) return text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return `${header.join(',')}\n${values.map(escapeCsv).join(',')}`;
};

const compareString = (left: string, right: string, direction: SortDirection) => {
  const result = left.localeCompare(right, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
};

const compareNumber = (left: number, right: number, direction: SortDirection) => {
  const result = left - right;
  return direction === 'asc' ? result : -result;
};

const RequestsTable: React.FC<RequestsTableProps> = ({ requests, userRole, onDelete }) => {
  const navigate = useNavigate();
  const { t, translateOption, language } = useLanguage();
  const { density, setSaveState } = useAppShell();
  const { getRequestByIdAsync, updateRequest } = useRequests();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pdfLanguage, setPdfLanguage] = useState<Language>(language);
  const [pendingPdfRequest, setPendingPdfRequest] = useState<CustomerRequest | null>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const quickReviewTimerRef = useRef<number | null>(null);

  const getPrimaryProduct = (request: CustomerRequest): Partial<RequestProduct> => {
    if (request.products && request.products.length) {
      return request.products[0];
    }
    return {
      axleLocation: request.axleLocation,
      axleLocationOther: request.axleLocationOther,
      articulationType: request.articulationType,
      articulationTypeOther: request.articulationTypeOther,
      configurationType: request.configurationType,
      configurationTypeOther: request.configurationTypeOther,
    };
  };

  const getProductTypeLabel = (product: Partial<RequestProduct>) => {
    const parts: string[] = [];
    const excludedValues = ['n/a', 'na', '-', ''];

    const addPart = (value: string | undefined) => {
      if (value && !excludedValues.includes(value.toLowerCase().trim())) {
        parts.push(translateOption(value));
      }
    };

    if (product.axleLocation) {
      if (product.axleLocation === 'other' && product.axleLocationOther) {
        addPart(product.axleLocationOther);
      } else {
        const found = AXLE_LOCATIONS.find((item) => item.value === product.axleLocation);
        addPart(found ? found.label : String(product.axleLocation));
      }
    }

    if (product.articulationType) {
      if (product.articulationType === 'other' && product.articulationTypeOther) {
        addPart(product.articulationTypeOther);
      } else {
        const found = ARTICULATION_TYPES.find((item) => item.value === product.articulationType);
        addPart(found ? found.label : String(product.articulationType));
      }
    }

    if (product.configurationType) {
      if (product.configurationType === 'other' && product.configurationTypeOther) {
        addPart(product.configurationTypeOther);
      } else {
        const found = CONFIGURATION_TYPES.find((item) => item.value === product.configurationType);
        addPart(found ? found.label : String(product.configurationType));
      }
    }

    return parts.length > 0 ? parts.join(' / ') : '-';
  };

  const canEditRoute = userRole === 'admin';
  const canDelete = () => userRole === 'admin';

  const getNextActionLabel = (request: CustomerRequest) => {
    if (request.nextActionRole === 'none') return '';
    if (request.nextActionRole && t.roles[request.nextActionRole]) {
      return t.roles[request.nextActionRole];
    }
    const raw = String(request.nextActionLabel ?? '').trim();
    if (!raw || raw.toLowerCase() === 'no action') return '';
    return raw;
  };

  const handleQuickReview = (id: string) => {
    setReviewRequestId(id);
    setIsReviewOpen(true);
  };

  const handleView = (id: string) => {
    navigate(`/requests/${id}`);
  };

  const handleEdit = (id: string) => {
    navigate(`/requests/${id}/edit`);
  };

  const handleDuplicate = (id: string) => {
    navigate(`/requests/new?duplicateOf=${encodeURIComponent(id)}`);
  };

  const handleExportRow = (request: CustomerRequest) => {
    const csv = buildRowCsv(request);
    downloadTextFile(`cra-request-${request.id}.csv`, csv, 'text/csv;charset=utf-8');
    toast.success(`Exported ${request.id}`);
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(`Copied ${id}`);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleOpenPdfDialog = (request: CustomerRequest) => {
    setPendingPdfRequest(request);
    setPdfLanguage(language);
    setIsPdfDialogOpen(true);
  };

  const handleDownloadPDF = async (request: CustomerRequest, lang: Language) => {
    try {
      const fullRequest = await getRequestByIdAsync(request.id);
      const { generateRequestPDF } = await import('@/utils/pdfExport');
      await generateRequestPDF(fullRequest ?? request, lang);
      toast.success(`${t.common.pdfDownloaded} ${request.id}`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error(t.common.pdfDownloadFailed);
    }
  };

  const handleConfirmPdfDownload = async () => {
    if (!pendingPdfRequest) return;
    setIsPdfDialogOpen(false);
    await handleDownloadPDF(pendingPdfRequest, pdfLanguage);
    setPendingPdfRequest(null);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId || !onDelete) return;
    await onDelete(pendingDeleteId);
    setPendingDeleteId(null);
  };

  const handlePriorityChange = async (requestId: string, priority: RequestPriority) => {
    try {
      setSaveState('saving');
      await updateRequest(requestId, { priority, historyEvent: 'edited' });
      setSaveState('saved');
      toast.success('Priority updated');
    } catch (error) {
      setSaveState('error', String((error as Error)?.message ?? 'Failed to save priority'));
      toast.error('Failed to update priority');
    }
  };

  const getDesktopRowActions = (request: CustomerRequest): RowActionItem[] => {
    const actions: RowActionItem[] = [
      {
        key: 'view',
        label: t.table.view,
        icon: Eye,
        onSelect: () => handleView(request.id),
      },
      ...(canEditRoute
        ? [
            {
              key: 'edit',
              label: t.table.edit,
              icon: Edit,
              onSelect: () => handleEdit(request.id),
            } as RowActionItem,
          ]
        : []),
      {
        key: 'duplicate',
        label: 'Duplicate',
        icon: Files,
        onSelect: () => handleDuplicate(request.id),
      },
      {
        key: 'download-pdf',
        label: t.table.download,
        icon: Download,
        onSelect: () => handleOpenPdfDialog(request),
      },
      {
        key: 'export-row',
        label: 'Export row',
        icon: Download,
        onSelect: () => handleExportRow(request),
      },
      {
        key: 'copy-id',
        label: 'Copy ID',
        icon: Copy,
        onSelect: () => handleCopyId(request.id),
      },
    ];

    if (canDelete() && onDelete) {
      actions.push({
        key: 'delete',
        label: t.table.delete,
        icon: Trash2,
        onSelect: () => setPendingDeleteId(request.id),
        separatorBefore: true,
        destructive: true,
      });
    }

    return actions;
  };

  const sortedRequests = useMemo(() => {
    if (!sortRules.length) return requests;
    const sorted = [...requests];
    sorted.sort((left, right) => {
      for (const rule of sortRules) {
        let result = 0;
        switch (rule.key) {
          case 'id':
            result = compareString(left.id, right.id, rule.direction);
            break;
          case 'priority':
            result = compareNumber(PRIORITY_WEIGHT[toPriority(left.priority)], PRIORITY_WEIGHT[toPriority(right.priority)], rule.direction);
            break;
          case 'status':
            result = compareString(left.status, right.status, rule.direction);
            break;
          case 'clientName':
            result = compareString(left.clientName ?? '', right.clientName ?? '', rule.direction);
            break;
          case 'applicationVehicle':
            result = compareString(left.applicationVehicle ?? '', right.applicationVehicle ?? '', rule.direction);
            break;
          case 'country':
            result = compareString(left.country ?? '', right.country ?? '', rule.direction);
            break;
          case 'createdByName':
            result = compareString(left.createdByName ?? '', right.createdByName ?? '', rule.direction);
            break;
          case 'createdAt':
            result = compareNumber(new Date(left.createdAt).getTime(), new Date(right.createdAt).getTime(), rule.direction);
            break;
          default:
            result = 0;
        }
        if (result !== 0) return result;
      }
      return 0;
    });
    return sorted;
  }, [requests, sortRules]);

  const updateSort = (key: SortKey, append: boolean) => {
    setSortRules((previous) => {
      const existing = previous.find((rule) => rule.key === key);
      const nextDirection = nextSortDirection(existing?.direction);
      if (!append) {
        if (!nextDirection) return [];
        return [{ key, direction: nextDirection }];
      }
      const withoutCurrent = previous.filter((rule) => rule.key !== key);
      if (!nextDirection) return withoutCurrent;
      return [...withoutCurrent, { key, direction: nextDirection }];
    });
  };

  const sortIcon = (key: SortKey) => {
    const current = sortRules.find((rule) => rule.key === key);
    if (!current) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return current.direction === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary" />
    );
  };

  const sortOrderBadge = (key: SortKey) => {
    const index = sortRules.findIndex((rule) => rule.key === key);
    if (index < 0 || sortRules.length < 2) return null;
    return <span className="text-[10px] text-primary border border-primary/30 rounded px-1">{index + 1}</span>;
  };

  const openRowContextMenu = (event: React.MouseEvent, request: CustomerRequest) => {
    event.preventDefault();
    setRowContextMenu({
      x: event.clientX,
      y: event.clientY,
      request,
    });
  };

  useEffect(() => {
    if (!rowContextMenu) return undefined;
    const close = () => setRowContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [rowContextMenu]);

  useEffect(() => {
    return () => {
      if (quickReviewTimerRef.current) {
        window.clearTimeout(quickReviewTimerRef.current);
      }
    };
  }, []);

  const onRowClick = (requestId: string) => {
    if (quickReviewTimerRef.current) window.clearTimeout(quickReviewTimerRef.current);
    quickReviewTimerRef.current = window.setTimeout(() => {
      handleQuickReview(requestId);
    }, 180);
  };

  const onRowDoubleClick = (requestId: string) => {
    if (quickReviewTimerRef.current) {
      window.clearTimeout(quickReviewTimerRef.current);
      quickReviewTimerRef.current = null;
    }
    handleView(requestId);
  };

  const renderSortableHead = (label: string, key: SortKey) => (
    <TableHead className="font-semibold">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={(event) => updateSort(key, event.shiftKey)}
      >
        <span>{label}</span>
        {sortIcon(key)}
        {sortOrderBadge(key)}
      </button>
    </TableHead>
  );

  if (requests.length === 0) {
    return (
      <div className="text-center py-12 bg-card rounded-lg border border-border">
        <p className="text-muted-foreground">{t.table.noRequestsFound}</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="md:hidden divide-y divide-border">
        {sortedRequests.map((request) => (
          <div
            key={request.id}
            className={cn('space-y-3 cursor-pointer transition-colors hover:bg-muted/20', density === 'compact' ? 'p-3' : 'p-4')}
            onClick={() => handleQuickReview(request.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleQuickReview(request.id);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{t.table.requestId}</p>
                <p className="font-semibold text-primary">{request.id}</p>
              </div>
              <StatusBadge status={request.status} />
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.table.clientName}</span>
                <span className="font-medium text-right">{request.clientName}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.table.application}</span>
                <span className="font-medium text-right">{translateOption(request.applicationVehicle)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.table.country}</span>
                <span className="font-medium text-right">{translateOption(request.country)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Priority</span>
                <span className="font-medium text-right">
                  {PRIORITY_OPTIONS.find((option) => option.value === toPriority(request.priority))?.label ?? 'Normal'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2" onClick={(event) => event.stopPropagation()}>
              <Button size="sm" variant="outline" onClick={() => handleView(request.id)}>
                <Eye size={14} className="mr-2" />
                {t.table.view}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleDuplicate(request.id)}>
                Duplicate
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-card border border-border shadow-lg">
                  {canEditRoute ? (
                    <DropdownMenuItem onClick={() => handleEdit(request.id)}>
                      <Edit size={14} className="mr-2" />
                      {t.table.edit}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => handleOpenPdfDialog(request)}>
                    <Download size={14} className="mr-2" />
                    {t.table.download}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleCopyId(request.id)}>
                    <Copy size={14} className="mr-2" />
                    Copy ID
                  </DropdownMenuItem>
                  {canDelete() && onDelete ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setPendingDeleteId(request.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 size={14} className="mr-2" />
                        {t.table.delete}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {renderSortableHead(t.table.requestId, 'id')}
              {renderSortableHead('Priority', 'priority')}
              {renderSortableHead(t.table.status, 'status')}
              <TableHead className="font-semibold">{t.table.nextActionBy}</TableHead>
              {renderSortableHead(t.table.clientName, 'clientName')}
              {renderSortableHead(t.table.application, 'applicationVehicle')}
              {renderSortableHead(t.table.country, 'country')}
              <TableHead className="font-semibold">{t.table.productType}</TableHead>
              {renderSortableHead(t.table.createdBy, 'createdByName')}
              <TableHead className="font-semibold whitespace-nowrap min-w-[132px]">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
                  onClick={(event) => updateSort('createdAt', event.shiftKey)}
                >
                  <span className="whitespace-nowrap">{t.table.created}</span>
                  {sortIcon('createdAt')}
                  {sortOrderBadge('createdAt')}
                </button>
              </TableHead>
              <TableHead className="text-right font-semibold">{t.table.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRequests.map((request, index) => (
              <TableRow
                key={request.id}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/30',
                  index % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                  density === 'compact' ? 'h-10' : 'h-12'
                )}
                style={{ animationDelay: `${index * 40}ms` }}
                onClick={() => onRowClick(request.id)}
                onDoubleClick={() => onRowDoubleClick(request.id)}
                onContextMenu={(event) => openRowContextMenu(event, request)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleQuickReview(request.id);
                  }
                }}
              >
                <TableCell className={cn('font-medium text-primary', density === 'compact' ? 'py-1.5' : 'py-2')}>{request.id}</TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')} onClick={(event) => event.stopPropagation()}>
                    <Select
                      value={toPriority(request.priority)}
                      onValueChange={(value) => handlePriorityChange(request.id, value as RequestPriority)}
                    >
                      <SelectTrigger
                        className={cn(
                          'w-[104px] rounded-full border-border/70 bg-muted/25 text-foreground shadow-none transition-colors hover:bg-muted/45 focus:ring-0 focus:ring-offset-0',
                          density === 'compact' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm'
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border border-border shadow-lg">
                        {PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="focus:bg-muted focus:text-foreground">
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')}>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')}>
                  {getNextActionLabel(request)}
                </TableCell>
                <TableCell className={cn('max-w-[180px] truncate', density === 'compact' ? 'py-1.5' : 'py-2')}>{request.clientName}</TableCell>
                <TableCell className={cn('max-w-[180px] truncate', density === 'compact' ? 'py-1.5' : 'py-2')}>
                  {translateOption(request.applicationVehicle)}
                </TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')}>{translateOption(request.country)}</TableCell>
                <TableCell className={cn('max-w-[220px] truncate', density === 'compact' ? 'py-1.5' : 'py-2')}>
                  {getProductTypeLabel(getPrimaryProduct(request))}
                </TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')}>{request.createdByName}</TableCell>
                <TableCell className={cn('whitespace-nowrap min-w-[132px]', density === 'compact' ? 'py-1.5' : 'py-2')}>
                  {format(new Date(request.createdAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className={cn('text-right', density === 'compact' ? 'py-1.5' : 'py-2')} onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 bg-card border border-border shadow-lg">
                        {getDesktopRowActions(request).map((action) => (
                          <React.Fragment key={action.key}>
                            {action.separatorBefore ? <DropdownMenuSeparator /> : null}
                            <DropdownMenuItem
                              onClick={() => {
                                void action.onSelect();
                              }}
                              className={cn(
                                'cursor-pointer',
                                action.destructive && 'text-destructive focus:text-destructive'
                              )}
                            >
                              {action.icon ? <action.icon size={14} className="mr-2" /> : null}
                              {action.label}
                            </DropdownMenuItem>
                          </React.Fragment>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rowContextMenu ? (
        <div
          className="fixed z-[100] min-w-[180px] bg-popover border border-border rounded-md shadow-xl py-1"
          style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {getDesktopRowActions(rowContextMenu.request).map((action) => (
            <React.Fragment key={`ctx-${action.key}`}>
              {action.separatorBefore ? <div className="my-1 border-t border-border" /> : null}
              <button
                type="button"
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center',
                  action.destructive && 'text-destructive'
                )}
                onClick={() => {
                  void action.onSelect();
                  setRowContextMenu(null);
                }}
              >
                {action.icon ? <action.icon size={14} className="mr-2" /> : null}
                {action.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.table.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>{t.table.deleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>{t.table.selectPdfLanguage}</DialogTitle>
            <DialogDescription>{t.table.selectPdfLanguageDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.table.pdfLanguage}</Label>
            <Select value={pdfLanguage} onValueChange={(value) => setPdfLanguage(value as Language)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="zh">Chinese</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPdfDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleConfirmPdfDownload}>{t.table.download}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RequestReviewDrawer
        open={isReviewOpen}
        onOpenChange={(next) => {
          setIsReviewOpen(next);
          if (!next) setReviewRequestId(null);
        }}
        requestId={reviewRequestId}
        userRole={userRole}
      />
    </div>
  );
};

export default RequestsTable;
