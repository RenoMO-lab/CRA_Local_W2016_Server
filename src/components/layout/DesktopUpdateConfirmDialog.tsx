import React from 'react';

import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DesktopUpdateConfirmDialogProps {
  open: boolean;
  targetVersion: string;
  notes: string | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

const DesktopUpdateConfirmDialog: React.FC<DesktopUpdateConfirmDialogProps> = ({
  open,
  targetVersion,
  notes,
  isSubmitting,
  onOpenChange,
  onConfirm,
}) => {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.appChrome.desktopUpdateConfirmTitle}</DialogTitle>
          <DialogDescription>{t.appChrome.desktopUpdateConfirmBody}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium text-foreground">
              {t.appChrome.desktopUpdateConfirmVersion}: {targetVersion || '-'}
            </div>
            {notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{notes}</p> : null}
          </div>
          <p className="text-xs text-muted-foreground">{t.appChrome.desktopUpdateConfirmRestartHint}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t.common.cancel}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {t.appChrome.desktopUpdateConfirmAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DesktopUpdateConfirmDialog;
