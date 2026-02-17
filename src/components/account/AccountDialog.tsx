import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { localizeApiError } from '@/utils/localizeApiError';

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_PASSWORD_LEN = 10;

const AccountDialog: React.FC<AccountDialogProps> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canSubmit = useMemo(() => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) return false;
    if (newPassword.trim().length < MIN_PASSWORD_LEN) return false;
    if (newPassword !== confirmPassword) return false;
    return true;
  }, [currentPassword, newPassword, confirmPassword]);

  useEffect(() => {
    if (open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsSaving(false);
  }, [open]);

  const submit = async () => {
    const cur = currentPassword.trim();
    const next = newPassword.trim();
    const confirm = confirmPassword.trim();

    if (next.length < MIN_PASSWORD_LEN) {
      toast({ title: t.account.changePassword, description: t.account.passwordTooShort, variant: 'destructive' as any });
      return;
    }
    if (next !== confirm) {
      toast({ title: t.account.changePassword, description: t.account.passwordMismatch, variant: 'destructive' as any });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = localizeApiError(t, data?.error) || t.account.passwordUpdateFailed;
        toast({ title: t.account.changePassword, description: message, variant: 'destructive' as any });
        return;
      }
      toast({ title: t.account.passwordUpdatedTitle, description: t.account.passwordUpdatedDesc });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: t.account.changePassword,
        description: localizeApiError(t, e?.message ?? e) || t.account.passwordUpdateFailed,
        variant: 'destructive' as any,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{t.account.myAccount}</DialogTitle>
          <DialogDescription>{t.account.myAccountDesc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.common.name}</Label>
              <Input value={user?.name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t.common.email}</Label>
              <Input value={user?.email || ''} disabled />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4 bg-muted/10 space-y-3">
            <div className="text-sm font-semibold text-foreground">{t.account.changePassword}</div>
            <div className="space-y-2">
              <Label htmlFor="account-current-password">{t.account.currentPassword}</Label>
              <Input
                id="account-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t.auth.enterPassword}
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-new-password">{t.account.newPassword}</Label>
              <Input
                id="account-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t.auth.enterPassword}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">{t.account.passwordMinHint}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm-password">{t.account.confirmNewPassword}</Label>
              <Input
                id="account-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t.auth.enterPassword}
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t.common.cancel}
          </Button>
          <Button onClick={submit} disabled={!canSubmit || isSaving}>
            {isSaving ? t.common.loading : t.account.updatePassword}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AccountDialog;
