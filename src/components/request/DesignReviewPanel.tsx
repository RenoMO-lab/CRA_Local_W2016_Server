import React, { useState } from 'react';
import { format, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { CustomerRequest, RequestStatus } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';
interface DesignReviewPanelProps {
  request: CustomerRequest;
  onUpdateStatus: (status: RequestStatus, data?: { comment?: string; message?: string; date?: Date }) => void;
  isUpdating: boolean;
  showActions?: boolean;
  forceEnableActions?: boolean;
  variant?: 'card' | 'embedded';
}

const DesignReviewPanel: React.FC<DesignReviewPanelProps> = ({
  request,
  onUpdateStatus,
  isUpdating,
  showActions = true,
  forceEnableActions = false,
  variant = 'card',
}) => {
  const [clarificationComment, setClarificationComment] = useState('');
  const [acceptanceMessage, setAcceptanceMessage] = useState('');
  const [expectedDate, setExpectedDate] = useState<Date>();
  const [showClarificationForm, setShowClarificationForm] = useState(false);
  const [showAcceptanceForm, setShowAcceptanceForm] = useState(false);
  const { t } = useLanguage();
  const today = startOfDay(new Date());

  const handleSetUnderReview = () => {
    onUpdateStatus('under_review');
  };

  const handleRequestClarification = () => {
    if (!clarificationComment.trim()) return;
    onUpdateStatus('clarification_needed', { comment: clarificationComment });
    setClarificationComment('');
    setShowClarificationForm(false);
  };

  const handleAccept = () => {
    if (!acceptanceMessage.trim() || !expectedDate) return;
    onUpdateStatus('feasibility_confirmed', { message: acceptanceMessage, date: expectedDate });
    setAcceptanceMessage('');
    setExpectedDate(undefined);
    setShowAcceptanceForm(false);
  };

  const canSetUnderReview = forceEnableActions || request.status === 'submitted';
  const canRequestClarification = forceEnableActions || request.status === 'submitted' || request.status === 'under_review';
  const canAccept = forceEnableActions || request.status === 'submitted' || request.status === 'under_review';
  const isAccepted = [
    'feasibility_confirmed',
    'design_result',
    'in_costing',
    'costing_complete',
    'sales_followup',
    'gm_approval_pending',
    'gm_approved',
    'gm_rejected',
    'cancelled',
    'closed',
  ].includes(request.status);
  const statusLabel = t.statuses[request.status as keyof typeof t.statuses] || request.status;
  const hasReviewNotes = Boolean(
    request.clarificationComment ||
    request.acceptanceMessage ||
    request.expectedDesignReplyDate
  );
  const canSaveDesignResult = ['submitted', 'under_review', 'feasibility_confirmed', 'design_result'].includes(request.status);

  const content = (
    <>
      {variant === 'card' && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
            <Clock size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{t.panels.designReviewActions}</h3>
            <p className="text-sm text-muted-foreground">{t.panels.updateStatusDesc}</p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.common.status}</p>
        <p className="text-sm font-medium text-foreground">{statusLabel}</p>
      </div>

      {showActions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Button
            variant="outline"
            onClick={handleSetUnderReview}
            disabled={!canSetUnderReview || isUpdating}
            className="w-full min-w-0 justify-start text-left whitespace-normal leading-tight h-auto py-2.5"
          >
            <Clock size={16} className="mr-2 text-info" />
            {t.panels.setUnderReview}
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setShowClarificationForm(!showClarificationForm);
              setShowAcceptanceForm(false);
            }}
            disabled={!canRequestClarification || isUpdating}
            className={cn(
              "w-full min-w-0 justify-start text-left whitespace-normal leading-tight h-auto py-2.5",
              showClarificationForm && "ring-2 ring-destructive"
            )}
          >
            <AlertCircle size={16} className="mr-2 text-destructive" />
            {t.panels.requestClarification}
          </Button>

          {isAccepted ? (
            <Button
              variant="outline"
              disabled
              className="w-full min-w-0 justify-start text-left whitespace-normal leading-tight h-auto py-2.5 border-success/40 text-success"
            >
              <CheckCircle size={16} className="mr-2 text-success" />
              {t.panels.applicationAccepted}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setShowAcceptanceForm(!showAcceptanceForm);
                setShowClarificationForm(false);
              }}
              disabled={!canAccept || isUpdating}
              className={cn(
                "w-full min-w-0 justify-start text-left whitespace-normal leading-tight h-auto py-2.5",
                showAcceptanceForm && "ring-2 ring-success"
              )}
            >
              <CheckCircle size={16} className="mr-2 text-success" />
              {t.panels.acceptApplication}
            </Button>
          )}
        </div>
      )}

      {/* Clarification Form */}
      {showActions && showClarificationForm && (
        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 space-y-4">
          <Label className="text-sm font-medium">{t.panels.clarificationRequired}</Label>
          <Textarea
            value={clarificationComment}
            onChange={(e) => setClarificationComment(e.target.value)}
            placeholder={t.panels.describeClarification}
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowClarificationForm(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleRequestClarification}
              disabled={!clarificationComment.trim() || isUpdating}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
              {t.panels.requestClarification}
            </Button>
          </div>
        </div>
      )}

      {/* Acceptance Form */}
      {showActions && showAcceptanceForm && (
        <div className="p-4 rounded-lg bg-success/5 border border-success/20 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.panels.acceptanceRequired}</Label>
            <Textarea
              value={acceptanceMessage}
              onChange={(e) => setAcceptanceMessage(e.target.value)}
              placeholder={t.panels.enterAcceptanceMessage}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">{t.panels.expectedDesignReplyDate}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !expectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expectedDate ? format(expectedDate, "PPP") : t.panels.selectDate}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-card border border-border" align="start">
                <Calendar
                  mode="single"
                  selected={expectedDate}
                  onSelect={setExpectedDate}
                  initialFocus
                  disabled={(date) => date < today}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowAcceptanceForm(false)}>
              {t.common.cancel}
            </Button>
            <Button
              onClick={handleAccept}
              disabled={!acceptanceMessage.trim() || !expectedDate || isUpdating}
              className="bg-success hover:bg-success/90 text-success-foreground"
            >
              {isUpdating && <Loader2 size={16} className="mr-2 animate-spin" />}
              {t.panels.confirmAcceptance}
            </Button>
          </div>
        </div>
      )}

      {hasReviewNotes && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">{t.panels.previousComments}</p>
          {request.clarificationComment && (
            <div className="text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.panels.lastClarification}
              </span>
              <p className="mt-1 whitespace-pre-line">{request.clarificationComment}</p>
            </div>
          )}
          {request.acceptanceMessage && (
            <div className="text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.panels.lastAcceptance}
              </span>
              <p className="mt-1 whitespace-pre-line">{request.acceptanceMessage}</p>
            </div>
          )}
          {request.expectedDesignReplyDate && (
            <div className="text-sm text-foreground">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.panels.expectedReplyDateLabel}
              </span>
              <p className="mt-1">{format(new Date(request.expectedDesignReplyDate), 'PPP')}</p>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (variant === 'embedded') {
    return <div className="space-y-6">{content}</div>;
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-6">
      {content}
    </div>
  );
};

export default DesignReviewPanel;
