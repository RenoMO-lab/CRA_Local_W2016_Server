import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

type FeedbackType = 'bug' | 'feature';

interface FeedbackFormState {
  type: FeedbackType;
  title: string;
  description: string;
  steps: string;
  severity: string;
}

interface FeedbackDialogProps {
  trigger: React.ReactNode;
}

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ trigger }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submitAttemptRef = useRef(0);
  const wasClosedForSubmitRef = useRef(false);
  const [form, setForm] = useState<FeedbackFormState>({
    type: 'bug',
    title: '',
    description: '',
    steps: '',
    severity: 'medium',
  });

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('feedback:open', handler as any);
    return () => {
      window.removeEventListener('feedback:open', handler as any);
    };
  }, []);

  const severityOptions = useMemo(
    () => [
      { value: 'low', label: t.feedback.severityLow },
      { value: 'medium', label: t.feedback.severityMedium },
      { value: 'high', label: t.feedback.severityHigh },
      { value: 'critical', label: t.feedback.severityCritical },
    ],
    [t]
  );

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = `${t.feedback.title} ${t.common.required.toLowerCase()}`;
    if (!form.description.trim()) nextErrors.description = `${t.feedback.description} ${t.common.required.toLowerCase()}`;
    if (form.type === 'bug' && !form.severity) nextErrors.severity = `${t.feedback.severity} ${t.common.required.toLowerCase()}`;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setForm({
      type: 'bug',
      title: '',
      description: '',
      steps: '',
      severity: 'medium',
    });
    setErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) {
      toast.error(t.feedback.validationFailed);
      return;
    }

    const attemptId = submitAttemptRef.current + 1;
    submitAttemptRef.current = attemptId;
    wasClosedForSubmitRef.current = true;
    setIsSubmitting(true);
    setOpen(false);
    try {
      const payload = {
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        steps: form.type === 'bug' ? form.steps.trim() : '',
        severity: form.type === 'bug' ? form.severity : '',
        pagePath: location.pathname,
        userName: user?.name ?? '',
        userEmail: user?.email ?? '',
        userRole: user?.role ?? '',
      };

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(`Feedback submit failed: ${res.status}`);
      }

      if (submitAttemptRef.current !== attemptId) {
        return;
      }

      const ticketNumber = String(data?.ticketNumber ?? '').trim();
      const successDescription = ticketNumber
        ? String(t.feedback.submittedDescWithTicket ?? t.feedback.submittedDesc).replace('{ticketNumber}', ticketNumber)
        : t.feedback.submittedDesc;
      toast.success(t.feedback.submittedTitle, { description: successDescription });
      window.dispatchEvent(new CustomEvent('feedback:submitted'));
      resetForm();
      wasClosedForSubmitRef.current = false;
    } catch (error) {
      if (submitAttemptRef.current !== attemptId) {
        return;
      }
      console.error('Failed to submit feedback:', error);
      toast.error(t.feedback.submitFailed);
      if (wasClosedForSubmitRef.current) {
        setOpen(true);
      }
      wasClosedForSubmitRef.current = false;
    } finally {
      if (submitAttemptRef.current === attemptId) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-card max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{t.feedback.dialogTitle}</DialogTitle>
          <DialogDescription>{t.feedback.dialogDesc}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="feedback-type">{t.feedback.type}</Label>
            <Select
              value={form.type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as FeedbackType }))}
            >
              <SelectTrigger id="feedback-type">
                <SelectValue placeholder={t.feedback.selectType} />
              </SelectTrigger>
              <SelectContent className="bg-card border border-border">
                <SelectItem value="bug">{t.feedback.typeBug}</SelectItem>
                <SelectItem value="feature">{t.feedback.typeFeature}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-title">{t.feedback.title}</Label>
            <Input
              id="feedback-title"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder={t.feedback.titlePlaceholder}
              className={errors.title ? 'border-destructive' : ''}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-description">{t.feedback.description}</Label>
            <Textarea
              id="feedback-description"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t.feedback.descriptionPlaceholder}
              className={errors.description ? 'border-destructive' : ''}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </div>

          {form.type === 'bug' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="feedback-steps">{t.feedback.steps}</Label>
                <Textarea
                  id="feedback-steps"
                  value={form.steps}
                  onChange={(e) => setForm((prev) => ({ ...prev, steps: e.target.value }))}
                  placeholder={t.feedback.stepsPlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feedback-severity">{t.feedback.severity}</Label>
                <Select
                  value={form.severity}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, severity: value }))}
                >
                  <SelectTrigger id="feedback-severity" className={errors.severity ? 'border-destructive' : ''}>
                    <SelectValue placeholder={t.feedback.selectSeverity} />
                  </SelectTrigger>
                  <SelectContent className="bg-card border border-border">
                    {severityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.severity && <p className="text-xs text-destructive">{errors.severity}</p>}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t.feedback.submitting : t.feedback.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
