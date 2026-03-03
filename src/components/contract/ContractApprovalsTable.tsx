import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, Edit, Eye, MoreHorizontal, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { ContractApproval, UserRole } from '@/types';
import { useAppShell } from '@/context/AppShellContext';
import { useLanguage } from '@/context/LanguageContext';
import ContractStatusBadge from './ContractStatusBadge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Props {
  contracts: ContractApproval[];
  userRole: UserRole;
  onQuickReview: (id: string) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onFinanceUpload: (id: string) => void;
  onComplete: (id: string) => void;
}

type SortKey = 'id' | 'clientName' | 'craNumber' | 'salesOwnerName' | 'contractAmount' | 'status' | 'nextActionLabel' | 'submittedAt' | 'updatedAt';
type SortDirection = 'asc' | 'desc';

interface RowContextMenuState {
  x: number;
  y: number;
  contract: ContractApproval;
}
const CONTEXT_MENU_EDGE_GAP = 8;
const CONTEXT_MENU_BOTTOM_SAFE_GAP = 40;

interface RowActionItem {
  key: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  onSelect: () => void;
  separatorBefore?: boolean;
  destructive?: boolean;
}

const toDate = (value: Date | string | null | undefined) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'yyyy-MM-dd');
};

const toAmount = (value: number | null | undefined) => {
  if (typeof value !== 'number') return '-';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const ContractApprovalsTable: React.FC<Props> = ({
  contracts,
  userRole,
  onQuickReview,
  onView,
  onEdit,
  onFinanceUpload,
  onComplete,
}) => {
  const { t } = useLanguage();
  const { density } = useAppShell();
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenuState | null>(null);
  const rowContextMenuRef = useRef<HTMLDivElement | null>(null);
  const quickReviewTimerRef = useRef<number | null>(null);

  const getNextActionLabel = (contract: ContractApproval) => {
    if (contract.nextActionRole === 'none') return '';
    if (contract.nextActionRole && t.roles[contract.nextActionRole]) {
      return t.roles[contract.nextActionRole];
    }
    const raw = String(contract.nextActionLabel ?? '').trim();
    if (!raw || raw.toLowerCase() === 'no action') return '';
    return raw;
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(`Copied ${id}`);
    } catch {
      toast.error('Copy failed');
    }
  };

  const getRowActions = (contract: ContractApproval): RowActionItem[] => {
    const actions: RowActionItem[] = [
      {
        key: 'view',
        label: t.table.view,
        icon: Eye,
        onSelect: () => onView(contract.id),
      },
    ];

    if ((userRole === 'sales' || userRole === 'admin') && (contract.status === 'draft' || contract.status === 'finance_rejected' || contract.status === 'gm_rejected')) {
      actions.push({
        key: 'edit',
        label: t.table.edit,
        icon: Edit,
        onSelect: () => onEdit(contract.id),
      });
    }

    if (userRole === 'cashier' && contract.status === 'gm_approved') {
      actions.push({
        key: 'cashier-upload',
        label: t.contractApproval.uploadStamped,
        icon: Upload,
        onSelect: () => onFinanceUpload(contract.id),
      });
    }

    if (userRole === 'finance' && contract.status === 'finance_upload') {
      actions.push({
        key: 'complete',
        label: t.contractApproval.markCompleted,
        icon: Check,
        onSelect: () => onComplete(contract.id),
      });
    }

    actions.push({
      key: 'copy-id',
      label: 'Copy ID',
      icon: Copy,
      onSelect: () => {
        void copyId(contract.id);
      },
      separatorBefore: true,
    });

    return actions;
  };

  const updateSort = (nextKey: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey !== nextKey) {
        setSortDirection('asc');
        return nextKey;
      }
      setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
      return prevKey;
    });
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary" />
    );
  };

  const sortedContracts = useMemo(() => {
    const rows = [...contracts];
    const dirFactor = sortDirection === 'asc' ? 1 : -1;
    rows.sort((left, right) => {
      const leftDate = (value: Date | string | null | undefined) => {
        if (!value) return 0;
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
      };
      let result = 0;
      switch (sortKey) {
        case 'id':
          result = String(left.id ?? '').localeCompare(String(right.id ?? ''), undefined, { sensitivity: 'base' });
          break;
        case 'clientName':
          result = String(left.clientName ?? '').localeCompare(String(right.clientName ?? ''), undefined, { sensitivity: 'base' });
          break;
        case 'craNumber':
          result = String(left.craNumber ?? '').localeCompare(String(right.craNumber ?? ''), undefined, { sensitivity: 'base' });
          break;
        case 'salesOwnerName':
          result = String(left.salesOwnerName ?? '').localeCompare(String(right.salesOwnerName ?? ''), undefined, { sensitivity: 'base' });
          break;
        case 'contractAmount':
          result = Number(left.contractAmount ?? Number.NEGATIVE_INFINITY) - Number(right.contractAmount ?? Number.NEGATIVE_INFINITY);
          break;
        case 'status':
          result = String(left.status ?? '').localeCompare(String(right.status ?? ''), undefined, { sensitivity: 'base' });
          break;
        case 'nextActionLabel':
          result = String(getNextActionLabel(left)).localeCompare(String(getNextActionLabel(right)), undefined, { sensitivity: 'base' });
          break;
        case 'submittedAt':
          result = leftDate(left.submittedAt) - leftDate(right.submittedAt);
          break;
        case 'updatedAt':
        default:
          result = leftDate(left.updatedAt) - leftDate(right.updatedAt);
          break;
      }
      return result * dirFactor;
    });
    return rows;
  }, [contracts, sortDirection, sortKey]);

  const openRowContextMenu = (event: React.MouseEvent, contract: ContractApproval) => {
    event.preventDefault();
    const actions = getRowActions(contract);
    const separatorCount = actions.filter((action) => action.separatorBefore).length;
    const estimatedMenuWidth = 220;
    const estimatedMenuHeight = actions.length * 36 + separatorCount * 8 + 12;
    const maxX = window.innerWidth - estimatedMenuWidth - CONTEXT_MENU_EDGE_GAP;
    const maxY = window.innerHeight - estimatedMenuHeight - CONTEXT_MENU_BOTTOM_SAFE_GAP;
    setRowContextMenu({
      x: Math.max(CONTEXT_MENU_EDGE_GAP, Math.min(event.clientX, maxX)),
      y: Math.max(CONTEXT_MENU_EDGE_GAP, Math.min(event.clientY, maxY)),
      contract,
    });
  };

  useEffect(() => {
    if (!rowContextMenu) return undefined;
    const close = () => setRowContextMenu(null);
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [rowContextMenu]);

  useEffect(() => {
    if (!rowContextMenu || !rowContextMenuRef.current) return;
    const rect = rowContextMenuRef.current.getBoundingClientRect();
    let nextX = rowContextMenu.x;
    let nextY = rowContextMenu.y;
    const maxRight = window.innerWidth - CONTEXT_MENU_EDGE_GAP;
    const maxBottom = window.innerHeight - CONTEXT_MENU_BOTTOM_SAFE_GAP;
    if (rect.right > maxRight) {
      nextX -= rect.right - maxRight;
    }
    if (rect.bottom > maxBottom) {
      nextY -= rect.bottom - maxBottom;
    }
    nextX = Math.max(CONTEXT_MENU_EDGE_GAP, nextX);
    nextY = Math.max(CONTEXT_MENU_EDGE_GAP, nextY);
    if (nextX !== rowContextMenu.x || nextY !== rowContextMenu.y) {
      setRowContextMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [rowContextMenu]);

  useEffect(() => {
    return () => {
      if (quickReviewTimerRef.current) {
        window.clearTimeout(quickReviewTimerRef.current);
      }
    };
  }, []);

  const onRowClick = (contractId: string) => {
    if (quickReviewTimerRef.current) window.clearTimeout(quickReviewTimerRef.current);
    quickReviewTimerRef.current = window.setTimeout(() => {
      onQuickReview(contractId);
    }, 180);
  };

  const onRowDoubleClick = (contractId: string) => {
    if (quickReviewTimerRef.current) {
      window.clearTimeout(quickReviewTimerRef.current);
      quickReviewTimerRef.current = null;
    }
    onView(contractId);
  };

  const renderSortableHead = (label: string, key: SortKey, extraClassName?: string) => (
    <TableHead className={cn('font-semibold', extraClassName)}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => updateSort(key)}>
        <span>{label}</span>
        {sortIcon(key)}
      </button>
    </TableHead>
  );

  if (!contracts.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {t.contractApproval.empty}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
      <div className="md:hidden divide-y divide-border">
        {sortedContracts.map((contract) => (
          <div
            key={contract.id}
            className={cn('space-y-3 cursor-pointer transition-colors hover:bg-muted/20', density === 'compact' ? 'p-3' : 'p-4')}
            onClick={() => onQuickReview(contract.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onQuickReview(contract.id);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{t.contractApproval.table.contractId}</p>
                <p className="font-semibold text-primary">{contract.id}</p>
              </div>
              <ContractStatusBadge status={contract.status} />
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.contractApproval.table.clientName}</span>
                <span className="font-medium text-right">{contract.clientName || '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.contractApproval.table.craNumber}</span>
                <span className="font-medium text-right">{contract.craNumber || '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.contractApproval.table.salesOwner}</span>
                <span className="font-medium text-right">{contract.salesOwnerName || '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.contractApproval.table.amount}</span>
                <span className="font-medium text-right tabular-nums">{toAmount(contract.contractAmount)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.table.nextActionBy}</span>
                <span className="font-medium text-right">{getNextActionLabel(contract) || '-'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2" onClick={(event) => event.stopPropagation()}>
              <Button size="sm" variant="outline" onClick={() => onView(contract.id)}>
                <Eye size={14} className="mr-2" />
                {t.table.view}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border border-border shadow-lg">
                  {getRowActions(contract).map((action) => (
                    <React.Fragment key={`mobile-${action.key}`}>
                      {action.separatorBefore ? <DropdownMenuSeparator /> : null}
                      <DropdownMenuItem
                        onClick={action.onSelect}
                        className={cn('cursor-pointer', action.destructive && 'text-destructive focus:text-destructive')}
                      >
                        {action.icon ? <action.icon size={14} className="mr-2" /> : null}
                        {action.label}
                      </DropdownMenuItem>
                    </React.Fragment>
                  ))}
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
              {renderSortableHead(t.contractApproval.table.contractId, 'id')}
              {renderSortableHead(t.contractApproval.table.clientName, 'clientName')}
              {renderSortableHead(t.contractApproval.table.craNumber, 'craNumber')}
              {renderSortableHead(t.contractApproval.table.salesOwner, 'salesOwnerName')}
              {renderSortableHead(t.contractApproval.table.amount, 'contractAmount', 'text-right')}
              {renderSortableHead(t.contractApproval.table.status, 'status')}
              {renderSortableHead(t.table.nextActionBy, 'nextActionLabel')}
              {renderSortableHead(t.contractApproval.table.submissionDate, 'submittedAt')}
              {renderSortableHead(t.contractApproval.table.lastUpdated, 'updatedAt')}
              <TableHead className="text-right font-semibold">{t.contractApproval.table.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedContracts.map((contract, index) => (
              <TableRow
                key={contract.id}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-muted/30',
                  index % 2 === 0 ? 'bg-card' : 'bg-muted/10',
                  density === 'compact' ? 'h-10' : 'h-12'
                )}
                onClick={() => onRowClick(contract.id)}
                onDoubleClick={() => onRowDoubleClick(contract.id)}
                onContextMenu={(event) => openRowContextMenu(event, contract)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onQuickReview(contract.id);
                  }
                }}
              >
                <TableCell className={cn('font-semibold text-primary', density === 'compact' ? 'py-1.5' : 'py-2')}>{contract.id}</TableCell>
                <TableCell className={cn('max-w-[180px] truncate', density === 'compact' ? 'py-1.5' : 'py-2')}>{contract.clientName || '-'}</TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')}>{contract.craNumber || '-'}</TableCell>
                <TableCell className={cn('max-w-[160px] truncate', density === 'compact' ? 'py-1.5' : 'py-2')}>{contract.salesOwnerName || '-'}</TableCell>
                <TableCell className={cn('text-right tabular-nums', density === 'compact' ? 'py-1.5' : 'py-2')}>{toAmount(contract.contractAmount)}</TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')}>
                  <ContractStatusBadge status={contract.status} />
                </TableCell>
                <TableCell className={cn(density === 'compact' ? 'py-1.5' : 'py-2')}>{getNextActionLabel(contract) || '-'}</TableCell>
                <TableCell className={cn('whitespace-nowrap min-w-[128px]', density === 'compact' ? 'py-1.5' : 'py-2')}>{toDate(contract.submittedAt)}</TableCell>
                <TableCell className={cn('whitespace-nowrap min-w-[128px]', density === 'compact' ? 'py-1.5' : 'py-2')}>{toDate(contract.updatedAt)}</TableCell>
                <TableCell className={cn('text-right', density === 'compact' ? 'py-1.5' : 'py-2')} onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-card border border-border shadow-lg">
                      {getRowActions(contract).map((action) => (
                        <React.Fragment key={action.key}>
                          {action.separatorBefore ? <DropdownMenuSeparator /> : null}
                          <DropdownMenuItem
                            onClick={action.onSelect}
                            className={cn('cursor-pointer', action.destructive && 'text-destructive focus:text-destructive')}
                          >
                            {action.icon ? <action.icon size={14} className="mr-2" /> : null}
                            {action.label}
                          </DropdownMenuItem>
                        </React.Fragment>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rowContextMenu ? (
        <div
          ref={rowContextMenuRef}
          className="fixed z-[100] min-w-[180px] max-w-[260px] max-h-[70vh] overflow-y-auto bg-popover border border-border rounded-md shadow-xl py-1"
          style={{ left: rowContextMenu.x, top: rowContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {getRowActions(rowContextMenu.contract).map((action) => (
            <React.Fragment key={`ctx-${action.key}`}>
              {action.separatorBefore ? <div className="my-1 border-t border-border" /> : null}
              <button
                type="button"
                className={cn('w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center', action.destructive && 'text-destructive')}
                onClick={() => {
                  action.onSelect();
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
    </div>
  );
};

export default ContractApprovalsTable;
