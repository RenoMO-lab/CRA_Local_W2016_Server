import React from 'react';

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

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

type DesktopUpdateProgressPhase = 'checking' | 'downloading' | 'installing' | 'ready_to_restart' | 'failed';
type DesktopUpdateFailureKind = 'scope_blocked' | 'transient';

interface DesktopUpdateProgressDialogProps {
  open: boolean;
  phase: DesktopUpdateProgressPhase;
  progressPercent: number;
  message: string;
  errorMessage: string;
  failureKind: DesktopUpdateFailureKind;
  canCancelInstall: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelInstall: () => void;
  onRetry: () => void;
  onRestartNow: () => void;
  onOpenDownloads: () => void;
}

const DesktopUpdateProgressDialog: React.FC<DesktopUpdateProgressDialogProps> = ({
  open,
  phase,
  progressPercent,
  message,
  errorMessage,
  failureKind,
  canCancelInstall,
  onOpenChange,
  onCancelInstall,
  onRetry,
  onRestartNow,
  onOpenDownloads,
}) => {
  const { t } = useLanguage();

  const stepLabel =
    phase === 'checking'
      ? t.appChrome.desktopUpdateProgressChecking
      : phase === 'downloading'
        ? t.appChrome.desktopUpdateProgressDownloading
        : phase === 'installing'
          ? t.appChrome.desktopUpdateProgressInstalling
          : phase === 'ready_to_restart'
            ? t.appChrome.desktopUpdateProgressReady
            : t.appChrome.desktopUpdateProgressFailed;

  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const showProgress = phase !== 'failed' && phase !== 'ready_to_restart';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.appChrome.desktopUpdateProgressTitle}</DialogTitle>
          <DialogDescription>{stepLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            ) : phase === 'ready_to_restart' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            <span>{message || stepLabel}</span>
          </div>

          {showProgress ? (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                />
              </div>
              <div className="text-right text-xs text-muted-foreground">{Math.max(0, Math.min(100, progressPercent)).toFixed(0)}%</div>
            </div>
          ) : null}

          {phase === 'failed' ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errorMessage || t.appChrome.desktopUpdateInstallFailedTitle}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {(phase === 'downloading' || phase === 'installing') && canCancelInstall ? (
            <Button type="button" variant="outline" onClick={onCancelInstall}>
              {t.appChrome.desktopUpdateCancelInstall}
            </Button>
          ) : null}

          {phase === 'ready_to_restart' ? (
            <>
              <Button type="button" onClick={onRestartNow}>
                {t.appChrome.desktopUpdateRestartNow}
              </Button>
            </>
          ) : null}

          {phase === 'failed' ? (
            <>
              <Button type="button" onClick={onOpenDownloads}>
                {t.downloads.openDownloads}
              </Button>
              {failureKind !== 'scope_blocked' ? (
                <Button type="button" variant="outline" onClick={onRetry}>
                  {t.appChrome.desktopUpdateRetry}
                </Button>
              ) : null}
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DesktopUpdateProgressDialog;
