import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, Eye, EyeOff, Shield, UserCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { localizeApiError } from '@/utils/localizeApiError';
import { cn } from '@/lib/utils';

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AccountSection = 'profile' | 'offerContact' | 'security';

const MIN_PASSWORD_LEN = 10;

type OfferContactForm = {
  contactName: string;
  contactEmail: string;
  mobile: string;
};

type OfferContactErrors = Partial<Record<keyof OfferContactForm, string>>;

const emptyOfferContact: OfferContactForm = {
  contactName: '',
  contactEmail: '',
  mobile: '',
};

const sectionButtonClass =
  'w-full justify-start rounded-lg px-3 py-2 text-left text-sm transition-colors';

const AccountDialog: React.FC<AccountDialogProps> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const [activeSection, setActiveSection] = useState<AccountSection>('profile');

  const [isOfferContactLoading, setIsOfferContactLoading] = useState(false);
  const [isOfferContactSaving, setIsOfferContactSaving] = useState(false);
  const [offerContactInitial, setOfferContactInitial] = useState<OfferContactForm>(emptyOfferContact);
  const [offerContactDraft, setOfferContactDraft] = useState<OfferContactForm>(emptyOfferContact);
  const [offerContactErrors, setOfferContactErrors] = useState<OfferContactErrors>({});
  const [offerContactSaveError, setOfferContactSaveError] = useState('');
  const [offerContactSaved, setOfferContactSaved] = useState(false);

  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [securitySaved, setSecuritySaved] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const roleLabel = user ? t.roles[user.role] : '-';
  const preferredLanguageLabel =
    language === 'fr' ? t.common.languageFrench : language === 'zh' ? t.common.languageChinese : t.common.languageEnglish;

  const isOfferContactDirty = useMemo(() => {
    return (
      offerContactDraft.contactName !== offerContactInitial.contactName ||
      offerContactDraft.contactEmail !== offerContactInitial.contactEmail ||
      offerContactDraft.mobile !== offerContactInitial.mobile
    );
  }, [offerContactDraft, offerContactInitial]);

  const newPasswordTooShort = newPassword.trim().length > 0 && newPassword.trim().length < MIN_PASSWORD_LEN;
  const passwordMismatch = confirmPassword.trim().length > 0 && newPassword !== confirmPassword;

  const sections = useMemo(
    () => [
      { id: 'profile' as const, icon: UserCircle2, label: t.account.sections.profile },
      { id: 'offerContact' as const, icon: BriefcaseBusiness, label: t.account.sections.offerContact },
      { id: 'security' as const, icon: Shield, label: t.account.sections.security },
    ],
    [t.account.sections.offerContact, t.account.sections.profile, t.account.sections.security]
  );

  useEffect(() => {
    if (open) return;
    setActiveSection('profile');
    setIsOfferContactLoading(false);
    setIsOfferContactSaving(false);
    setOfferContactSaveError('');
    setOfferContactErrors({});
    setOfferContactSaved(false);
    setSecurityError('');
    setSecuritySaved(false);
    setIsSavingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
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
        const next: OfferContactForm = {
          contactName: String(data?.contactName ?? '').trim() || String(data?.defaults?.name ?? '').trim(),
          contactEmail: String(data?.contactEmail ?? '').trim() || String(data?.defaults?.email ?? '').trim(),
          mobile: String(data?.mobile ?? '').trim(),
        };
        setOfferContactInitial(next);
        setOfferContactDraft(next);
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

  const updateOfferContactField = (field: keyof OfferContactForm, value: string) => {
    setOfferContactDraft((prev) => ({ ...prev, [field]: value }));
    setOfferContactSaved(false);
    setOfferContactSaveError('');
    setOfferContactErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const resetOfferContact = () => {
    setOfferContactDraft(offerContactInitial);
    setOfferContactErrors({});
    setOfferContactSaveError('');
    setOfferContactSaved(false);
  };

  const validateOfferContact = (candidate: OfferContactForm) => {
    const nextErrors: OfferContactErrors = {};
    const payload = {
      contactName: candidate.contactName.trim(),
      contactEmail: candidate.contactEmail.trim(),
      mobile: candidate.mobile.trim(),
    };

    if (!payload.contactName) nextErrors.contactName = t.common.required;
    if (!payload.contactEmail) nextErrors.contactEmail = t.common.required;
    if (!payload.mobile) nextErrors.mobile = t.common.required;
    if (payload.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail)) {
      nextErrors.contactEmail = t.account.invalidEmailInline;
    }

    return { payload, nextErrors };
  };

  const handleSaveOfferContact = async () => {
    const { payload, nextErrors } = validateOfferContact(offerContactDraft);
    setOfferContactErrors(nextErrors);
    setOfferContactSaved(false);
    setOfferContactSaveError('');

    if (Object.keys(nextErrors).length) {
      toast({
        title: t.account.offerContactProfile,
        description: t.account.offerContactRequired,
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
      const saved: OfferContactForm = {
        contactName: String(data?.contactName ?? payload.contactName).trim(),
        contactEmail: String(data?.contactEmail ?? payload.contactEmail).trim(),
        mobile: String(data?.mobile ?? payload.mobile).trim(),
      };
      setOfferContactInitial(saved);
      setOfferContactDraft(saved);
      setOfferContactSaved(true);
      toast({
        title: t.account.offerContactProfile,
        description: t.account.offerContactSaved,
      });
    } catch (e: any) {
      const message = localizeApiError(t, e?.message ?? e) || t.account.offerContactSaveFailed;
      setOfferContactSaveError(message);
      toast({
        title: t.account.offerContactProfile,
        description: message,
        variant: 'destructive' as any,
      });
    } finally {
      setIsOfferContactSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    const cur = currentPassword.trim();
    const next = newPassword.trim();
    const confirm = confirmPassword.trim();
    setSecuritySaved(false);
    setSecurityError('');

    if (!cur || !next || !confirm) {
      setSecurityError(t.common.required);
      return;
    }
    if (next.length < MIN_PASSWORD_LEN) {
      setSecurityError(t.account.passwordTooShort);
      toast({ title: t.account.changePassword, description: t.account.passwordTooShort, variant: 'destructive' as any });
      return;
    }
    if (next !== confirm) {
      setSecurityError(t.account.passwordMismatchInline);
      toast({ title: t.account.changePassword, description: t.account.passwordMismatch, variant: 'destructive' as any });
      return;
    }

    setIsSavingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = localizeApiError(t, data?.error) || t.account.passwordUpdateFailed;
        setSecurityError(message);
        toast({ title: t.account.changePassword, description: message, variant: 'destructive' as any });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecuritySaved(true);
      setSecurityError('');
      toast({ title: t.account.passwordUpdatedTitle, description: t.account.passwordUpdatedDesc });
    } catch (e: any) {
      const message = localizeApiError(t, e?.message ?? e) || t.account.passwordUpdateFailed;
      setSecurityError(message);
      toast({
        title: t.account.changePassword,
        description: message,
        variant: 'destructive' as any,
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const PasswordInput = ({
    id,
    value,
    onChange,
    placeholder,
    shown,
    onToggle,
    disabled,
  }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    shown: boolean;
    onToggle: () => void;
    disabled?: boolean;
  }) => (
    <div className="relative">
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-10 pr-11"
      />
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={shown ? t.account.hidePassword : t.account.showPassword}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-4xl w-[min(96vw,64rem)] h-[92vh] md:h-[88vh] max-h-[92vh] md:max-h-[88vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-base font-semibold text-primary">
              {(user?.name || t.appChrome.userLabel).charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <DialogTitle>{t.account.myAccount}</DialogTitle>
              <DialogDescription>{t.account.myAccountDesc}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="hidden w-56 shrink-0 border-r border-border bg-muted/10 p-3 md:block">
            <nav className="space-y-1.5">
              {sections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      sectionButtonClass,
                      active
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon size={15} />
                      {section.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="h-full min-h-0 flex-1 overflow-y-scroll scrollbar-thin p-4 md:p-5" style={{ scrollbarGutter: 'stable' }}>
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 md:hidden">
              {sections.map((section) => {
                const active = activeSection === section.id;
                return (
                  <Button
                    key={section.id}
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="shrink-0"
                    onClick={() => setActiveSection(section.id)}
                  >
                    {section.label}
                  </Button>
                );
              })}
            </div>

            <section className={cn('space-y-3', activeSection === 'profile' ? 'block' : 'hidden')}>
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="text-sm font-semibold text-foreground">{t.account.sections.profile}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.account.profileReadOnlyHint}</p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{t.common.name}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{user?.name || '-'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{t.common.email}</p>
                      <p className="mt-1 text-sm font-medium text-foreground break-all">{user?.email || '-'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{t.common.role}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{roleLabel || '-'}</p>
                    </div>
                    <div className="rounded-lg border border-border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{t.common.language}</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{preferredLanguageLabel}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{t.account.managedByAdmin}</p>
                </div>
            </section>

            <section className={cn('space-y-3', activeSection === 'offerContact' ? 'block' : 'hidden')}>
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="text-sm font-semibold text-foreground">{t.account.offerContactProfile}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.account.offerContactProfileDesc}</p>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="account-offer-contact-name">
                        {t.account.offerContactName} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="account-offer-contact-name"
                        className="h-10"
                        value={offerContactDraft.contactName}
                        onChange={(event) => updateOfferContactField('contactName', event.target.value)}
                        disabled={isOfferContactLoading || isOfferContactSaving}
                      />
                      {offerContactErrors.contactName ? (
                        <p className="text-xs text-destructive">{offerContactErrors.contactName}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="account-offer-contact-email">
                        {t.account.offerContactEmail} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="account-offer-contact-email"
                        className="h-10"
                        value={offerContactDraft.contactEmail}
                        onChange={(event) => updateOfferContactField('contactEmail', event.target.value)}
                        disabled={isOfferContactLoading || isOfferContactSaving}
                      />
                      {offerContactErrors.contactEmail ? (
                        <p className="text-xs text-destructive">{offerContactErrors.contactEmail}</p>
                      ) : null}
                    </div>
                    <div className="space-y-1.5 sm:col-span-2 md:max-w-xs">
                      <Label htmlFor="account-offer-contact-mobile">
                        {t.account.offerContactMobile} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="account-offer-contact-mobile"
                        className="h-10"
                        value={offerContactDraft.mobile}
                        onChange={(event) => updateOfferContactField('mobile', event.target.value)}
                        disabled={isOfferContactLoading || isOfferContactSaving}
                      />
                      {offerContactErrors.mobile ? <p className="text-xs text-destructive">{offerContactErrors.mobile}</p> : null}
                    </div>
                  </div>

                  {offerContactSaveError ? (
                    <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {offerContactSaveError}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button onClick={handleSaveOfferContact} disabled={!isOfferContactDirty || isOfferContactLoading || isOfferContactSaving}>
                      {isOfferContactSaving ? t.common.saving : t.account.saveOfferContact}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={resetOfferContact}
                      disabled={!isOfferContactDirty || isOfferContactLoading || isOfferContactSaving}
                    >
                      {t.account.resetChanges}
                    </Button>
                    {offerContactSaved ? (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
                        <CheckCircle2 size={14} />
                        {t.account.saved}
                      </span>
                    ) : null}
                  </div>
                </div>
            </section>

            <section className={cn('space-y-3', activeSection === 'security' ? 'block' : 'hidden')}>
                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="text-sm font-semibold text-foreground">{t.account.changePassword}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.account.passwordStrengthHint}</p>

                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="account-current-password">{t.account.currentPassword}</Label>
                      <PasswordInput
                        id="account-current-password"
                        value={currentPassword}
                        onChange={setCurrentPassword}
                        placeholder={t.auth.enterPassword}
                        shown={showCurrentPassword}
                        onToggle={() => setShowCurrentPassword((prev) => !prev)}
                        disabled={isSavingPassword}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="account-new-password">{t.account.newPassword}</Label>
                      <PasswordInput
                        id="account-new-password"
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder={t.auth.enterPassword}
                        shown={showNewPassword}
                        onToggle={() => setShowNewPassword((prev) => !prev)}
                        disabled={isSavingPassword}
                      />
                      <p className={cn('text-xs', newPasswordTooShort ? 'text-destructive' : 'text-muted-foreground')}>
                        {t.account.passwordMinHint}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="account-confirm-password">{t.account.confirmNewPassword}</Label>
                      <PasswordInput
                        id="account-confirm-password"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder={t.auth.enterPassword}
                        shown={showConfirmPassword}
                        onToggle={() => setShowConfirmPassword((prev) => !prev)}
                        disabled={isSavingPassword}
                      />
                      {passwordMismatch ? <p className="text-xs text-destructive">{t.account.passwordMismatchInline}</p> : null}
                    </div>
                  </div>

                  {securityError ? (
                    <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {securityError}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button onClick={handleUpdatePassword} disabled={isSavingPassword}>
                      {isSavingPassword ? t.common.saving : t.account.updatePassword}
                    </Button>
                    {securitySaved ? (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
                        <CheckCircle2 size={14} />
                        {t.account.saved}
                      </span>
                    ) : null}
                  </div>
                </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AccountDialog;
