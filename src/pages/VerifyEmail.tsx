import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

const VerifyEmail: React.FC = () => {
  const { t } = useLanguage();
  const { user, refreshMe } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = String(searchParams.get('token') ?? '').trim();
  const [status, setStatus] = useState<'idle' | 'verifying' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token) {
        setStatus('error');
        setError(t.account.verifyEmailMissingToken);
        return;
      }
      setStatus('verifying');
      try {
        const res = await fetch('/api/auth/change-email/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = String(data?.error ?? t.account.verifyEmailFailed);
          if (!cancelled) {
            setStatus('error');
            setError(msg);
          }
          return;
        }
        await refreshMe();
        if (!cancelled) {
          setStatus('ok');
          setError('');
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus('error');
          setError(String(e?.message ?? e ?? t.account.verifyEmailFailed));
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [token, refreshMe, t.account.verifyEmailFailed, t.account.verifyEmailMissingToken]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="text-xl font-semibold text-foreground">{t.account.verifyEmailTitle}</div>

        {status === 'verifying' ? (
          <div className="text-sm text-muted-foreground">{t.account.verifyEmailVerifying}</div>
        ) : null}

        {status === 'ok' ? (
          <div className="text-sm text-foreground">{t.account.verifyEmailSuccess}</div>
        ) : null}

        {status === 'error' ? (
          <div className="text-sm text-destructive">{error || t.account.verifyEmailFailed}</div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" onClick={() => navigate('/login')}>
            {t.account.goToLogin}
          </Button>
          <Button onClick={() => navigate('/dashboard')} disabled={!user}>
            {t.account.goToDashboard}
          </Button>
        </div>
        {!user ? (
          <div className="text-xs text-muted-foreground">{t.account.verifyEmailLoginHint}</div>
        ) : null}
      </div>
    </div>
  );
};

export default VerifyEmail;

