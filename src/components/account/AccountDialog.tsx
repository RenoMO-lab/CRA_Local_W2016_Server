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
  const [isOfferContactLoading, setIsOfferContactLoading] = useState(false);
  const [isOfferContactSaving, setIsOfferContactSaving] = useState(false);
  const [offerContactName, setOfferContactName] = useState('');
  const [offerContactEmail, setOfferContactEmail] = useState('');
  const [offerContactMobile, setOfferContactMobile] = useState('');

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
    setIsOfferContactLoading(false);
    setIsOfferContactSaving(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadOfferContact = async () => {
      setIsOfferContactLoading(true);
      try {
        const res = await fetch('/api/auth/offer-contact-profile');
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || `Failed to load offer contact profile: ${res.status}`);
        }
        if (cancelled) return;
        setOfferContactName(String(data?.contactName ?? '').trim() || String(data?.defaults?.name ?? '').trim());
        setOfferContactEmail(String(data?.contactEmail ?? '').trim() || String(data?.defaults?.email ?? '').trim());
        setOfferContactMobile(String(data?.mobile ?? '').trim());
      } catch (e: any) {
        if (cancelled) return;
        toast({
          title: t.account.offerContactProfile,
          description: localizeApiError(t, e?.message ?? e) || t.account.offerContactLoadFailed,
          variant: 'destructive' as any,
        });
      } finally {
        if (!cancelled) setIsOfferContactLoading(false);
      }
    };
    void loadOfferContact();
    return () => {
      cancelled = true;
    };
  }, [open, t, toast]);

  const saveOfferContact = async () => {
    const payload = {
      contactName: offerContactName.trim(),
      contactEmail: offerContactEmail.trim(),
      mobile: offerContactMobile.trim(),
    };
    if (!payload.contactName || !payload.contactEmail || !payload.mobile) {
      toast({
        title: t.account.offerContactProfile,
        description: t.account.offerContactRequired,
        variant: 'destructive' as any,
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail)) {
      toast({
        title: t.account.offerContactProfile,
        description: t.account.offerContactEmailInvalid,
        variant: 'destructive' as any,
      });
      return;
    }
    setIsOfferContactSaving(true);
    try {
      const res = await fetch('/api/auth/offer-contact-profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Failed to save offer contact profile: ${res.status}`);
      }
      setOfferContactName(String(data?.contactName ?? payload.contactName));
      setOfferContactEmail(String(data?.contactEmail ?? payload.contactEmail));
      setOfferContactMobile(String(data?.mobile ?? payload.mobile));
      toast({
        title: t.account.offerContactProfile,
        description: t.account.offerContactSaved,
      });
    } catch (e: any) {
      toast({
        title: t.account.offerContactProfile,
        description: localizeApiError(t, e?.message ?? e) || t.account.offerContactSaveFailed,
        variant: 'destructive' as any,
      });
    } finally {
      setIsOfferContactSaving(false);
    }
  };

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
            <div className="text-sm font-semibold text-foreground">{t.account.offerContactProfile}</div>
            <p className="text-xs text-muted-foreground">{t.account.offerContactProfileDesc}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="account-offer-contact-name">{t.account.offerContactName}</Label>
                <Input
                  id="account-offer-contact-name"
                  value={offerContactName}
                  onChange={(e) => setOfferContactName(e.target.value)}
                  disabled={isOfferContactLoading || isOfferContactSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-offer-contact-email">{t.account.offerContactEmail}</Label>
                <Input
                  id="account-offer-contact-email"
                  value={offerContactEmail}
                  onChange={(e) => setOfferContactEmail(e.target.value)}
                  disabled={isOfferContactLoading || isOfferContactSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-offer-contact-mobile">{t.account.offerContactMobile}</Label>
                <Input
                  id="account-offer-contact-mobile"
                  value={offerContactMobile}
                  onChange={(e) => setOfferContactMobile(e.target.value)}
                  disabled={isOfferContactLoading || isOfferContactSaving}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={saveOfferContact}
                disabled={isOfferContactLoading || isOfferContactSaving}
              >
                {isOfferContactSaving ? t.common.saving : t.account.saveOfferContact}
              </Button>
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
