import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Eye, Edit, Trash2, MoreHorizontal, Download } from 'lucide-react';
import { CustomerRequest, UserRole, RequestProduct, AXLE_LOCATIONS, ARTICULATION_TYPES, CONFIGURATION_TYPES } from '@/types';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/i18n/translations';
import { toast } from 'sonner';
interface RequestsTableProps {
  requests: CustomerRequest[];
  userRole: UserRole;
  onDelete?: (id: string) => void;
}

const RequestsTable: React.FC<RequestsTableProps> = ({ requests, userRole, onDelete }) => {
  const navigate = useNavigate();
  const { t, translateOption, language } = useLanguage();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pdfLanguage, setPdfLanguage] = useState<Language>(language);
  const [pendingPdfRequest, setPendingPdfRequest] = useState<CustomerRequest | null>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);

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
    
    // Axle Location
    if (product.axleLocation) {
      if (product.axleLocation === 'other' && product.axleLocationOther) {
        addPart(product.axleLocationOther);
      } else {
        const found = AXLE_LOCATIONS.find(p => p.value === product.axleLocation);
        addPart(found ? found.label : String(product.axleLocation));
      }
    }
    
    // Articulation Type
    if (product.articulationType) {
      if (product.articulationType === 'other' && product.articulationTypeOther) {
        addPart(product.articulationTypeOther);
      } else {
        const found = ARTICULATION_TYPES.find(p => p.value === product.articulationType);
        addPart(found ? found.label : String(product.articulationType));
      }
    }
    
    // Configuration Type
    if (product.configurationType) {
      if (product.configurationType === 'other' && product.configurationTypeOther) {
        addPart(product.configurationTypeOther);
      } else {
        const found = CONFIGURATION_TYPES.find(p => p.value === product.configurationType);
        addPart(found ? found.label : String(product.configurationType));
      }
    }
    
    return parts.length > 0 ? parts.join(' / ') : '-';
  };

  const canEditRoute = userRole === 'admin';

  const canDelete = (request: CustomerRequest) => {
    return userRole === 'admin';
  };

  const handleView = (id: string) => {
    navigate(`/requests/${id}`);
  };

  const handleEdit = (id: string) => {
    navigate(`/requests/${id}/edit`);
  };

  const handleDownloadPDF = async (request: CustomerRequest, lang: Language) => {
    try {
      const { generateRequestPDF } = await import('@/utils/pdfExport');
      await generateRequestPDF(request, lang);
      toast.success(`${t.common.pdfDownloaded} ${request.id}`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error(t.common.pdfDownloadFailed);
    }
  };

  const handleOpenPdfDialog = (request: CustomerRequest) => {
    setPendingPdfRequest(request);
    setPdfLanguage(language);
    setIsPdfDialogOpen(true);
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
        {requests.map((request) => (
          <div
            key={request.id}
            className="p-4 space-y-3 cursor-pointer transition-colors hover:bg-muted/20"
            onClick={() => handleView(request.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleView(request.id);
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
                <span className="text-muted-foreground">{t.table.productType}</span>
                <span className="font-medium text-right">{getProductTypeLabel(getPrimaryProduct(request))}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t.table.created}</span>
                <span className="font-medium text-right">{format(new Date(request.createdAt), 'MMM d, yyyy')}</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2" onClick={(event) => event.stopPropagation()}>
              <Button size="sm" variant="outline" onClick={() => handleView(request.id)}>
                <Eye size={14} className="mr-2" />
                {t.table.view}
              </Button>
              {canEditRoute && (
                <Button size="sm" variant="outline" onClick={() => handleEdit(request.id)}>
                  <Edit size={14} className="mr-2" />
                  {t.table.edit}
                </Button>
              )}
              {canDelete(request) && onDelete && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDelete(request.id)}>
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="font-semibold">{t.table.requestId}</TableHead>
              <TableHead className="font-semibold">{t.table.clientName}</TableHead>
              <TableHead className="font-semibold">{t.table.application}</TableHead>
              <TableHead className="font-semibold">{t.table.country}</TableHead>
              <TableHead className="font-semibold">{t.table.productType}</TableHead>
              <TableHead className="font-semibold">{t.table.createdBy}</TableHead>
              <TableHead className="font-semibold">{t.table.created}</TableHead>
              <TableHead className="font-semibold">{t.table.status}</TableHead>
              <TableHead className="text-right font-semibold">{t.table.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request, index) => (
            <TableRow 
              key={request.id}
              className={cn(
                "cursor-pointer transition-colors hover:bg-muted/30",
                index % 2 === 0 ? "bg-card" : "bg-muted/10"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => handleView(request.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleView(request.id);
                }
              }}
            >
                <TableCell className="font-medium text-primary">{request.id}</TableCell>
                <TableCell className="max-w-[200px] truncate">{request.clientName}</TableCell>
                <TableCell className="max-w-[200px] truncate">{translateOption(request.applicationVehicle)}</TableCell>
                <TableCell>{translateOption(request.country)}</TableCell>
                <TableCell>{getProductTypeLabel(getPrimaryProduct(request))}</TableCell>
                <TableCell>{request.createdByName}</TableCell>
                <TableCell>{format(new Date(request.createdAt), 'MMM d, yyyy')}</TableCell>
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 bg-card border border-border shadow-lg">
                        <DropdownMenuItem onClick={() => handleView(request.id)} className="cursor-pointer">
                          <Eye size={14} className="mr-2" />
                          {t.table.view}
                        </DropdownMenuItem>
                        {canEditRoute && (
                          <DropdownMenuItem onClick={() => handleEdit(request.id)} className="cursor-pointer">
                            <Edit size={14} className="mr-2" />
                            {t.table.edit}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleOpenPdfDialog(request)} className="cursor-pointer">
                          <Download size={14} className="mr-2" />
                          {t.table.download}
                        </DropdownMenuItem>
                        {canDelete(request) && onDelete && (
                          <DropdownMenuItem
                            onClick={() => setPendingDeleteId(request.id)}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 size={14} className="mr-2" />
                            {t.table.delete}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.table.deleteConfirm}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.table.deleteDesc}
            </AlertDialogDescription>
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
            <Button onClick={handleConfirmPdfDownload}>
              {t.table.download}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RequestsTable;
