import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MIN_PASSWORD_LEN = 10;

const AccountDialog: React.FC<AccountDialogProps> = ({ open, onOpenChange }) => {
  const { user, refreshMe } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [emailNewEmail, setEmailNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailExpiresAt, setEmailExpiresAt] = useState<string>('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isConfirmingCode, setIsConfirmingCode] = useState(false);

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
    setEmailNewEmail('');
    setEmailCurrentPassword('');
    setEmailCode('');
    setEmailExpiresAt('');
    setIsSendingCode(false);
    setIsConfirmingCode(false);
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
        const message = String(data?.error ?? 'Failed to update password');
        toast({ title: t.account.changePassword, description: message, variant: 'destructive' as any });
        return;
      }
      toast({ title: t.account.passwordUpdatedTitle, description: t.account.passwordUpdatedDesc });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: t.account.changePassword,
        description: String(e?.message ?? e ?? 'Failed to update password'),
        variant: 'destructive' as any,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const requestEmailChange = async () => {
    const nextEmail = String(emailNewEmail ?? '').trim();
    const pw = String(emailCurrentPassword ?? '').trim();
    if (!nextEmail || !pw) {
      toast({ title: t.account.changeEmail, description: t.account.missingEmailOrPassword, variant: 'destructive' as any });
      return;
    }
    setIsSendingCode(true);
    try {
      const res = await fetch('/api/auth/change-email/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newEmail: nextEmail, currentPassword: pw }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = String(data?.error ?? 'Failed to request email change');
        toast({ title: t.account.changeEmail, description: message, variant: 'destructive' as any });
        return;
      }
      setEmailExpiresAt(String(data?.expiresAt ?? ''));
      toast({ title: t.account.emailChangeRequestedTitle, description: t.account.emailChangeRequestedDesc });
    } catch (e: any) {
      toast({
        title: t.account.changeEmail,
        description: String(e?.message ?? e ?? 'Failed to request email change'),
        variant: 'destructive' as any,
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  const confirmEmailChange = async () => {
    const code = String(emailCode ?? '').trim();
    if (!code) {
      toast({ title: t.account.changeEmail, description: t.account.missingVerificationCode, variant: 'destructive' as any });
      return;
    }
    setIsConfirmingCode(true);
    try {
      const res = await fetch('/api/auth/change-email/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = String(data?.error ?? 'Failed to confirm email change');
        toast({ title: t.account.changeEmail, description: message, variant: 'destructive' as any });
        return;
      }
      await refreshMe();
      toast({ title: t.account.emailUpdatedTitle, description: t.account.emailUpdatedDesc });
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: t.account.changeEmail,
        description: String(e?.message ?? e ?? 'Failed to confirm email change'),
        variant: 'destructive' as any,
      });
    } finally {
      setIsConfirmingCode(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card">
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

          <div className="rounded-lg border border-border p-4 bg-muted/10 space-y-3">
            <div className="text-sm font-semibold text-foreground">{t.account.changeEmail}</div>
            <div className="space-y-2">
              <Label htmlFor="account-new-email">{t.account.newEmail}</Label>
              <Input
                id="account-new-email"
                type="email"
                value={emailNewEmail}
                onChange={(e) => setEmailNewEmail(e.target.value)}
                placeholder={t.auth.enterEmail}
                disabled={isSendingCode || isConfirmingCode}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-email-password">{t.account.currentPassword}</Label>
              <Input
                id="account-email-password"
                type="password"
                value={emailCurrentPassword}
                onChange={(e) => setEmailCurrentPassword(e.target.value)}
                placeholder={t.auth.enterPassword}
                disabled={isSendingCode || isConfirmingCode}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={requestEmailChange} disabled={isSendingCode || isConfirmingCode}>
                {isSendingCode ? t.common.loading : t.account.sendVerificationCode}
              </Button>
              {emailExpiresAt ? (
                <span className="text-xs text-muted-foreground self-center">
                  {t.account.codeExpiresHint} {emailExpiresAt}
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-email-code">{t.account.verificationCode}</Label>
              <Input
                id="account-email-code"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value)}
                placeholder="123456"
                disabled={isSendingCode || isConfirmingCode}
              />
            </div>
            <Button onClick={confirmEmailChange} disabled={isSendingCode || isConfirmingCode || !String(emailCode ?? '').trim()}>
              {isConfirmingCode ? t.common.loading : t.account.confirmEmailChange}
            </Button>
            <p className="text-xs text-muted-foreground">{t.account.changeEmailSecurityHint}</p>
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
