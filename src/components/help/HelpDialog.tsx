import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';

interface HelpDialogProps {
  trigger: React.ReactNode;
}

type BuildInfo = {
  hash?: string;
  message?: string;
  author?: string;
  date?: string;
  builtAt?: string;
};

const HelpDialog: React.FC<HelpDialogProps> = ({ trigger }) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  const defaultRoleTab = useMemo(() => {
    const role = String((user as any)?.role ?? 'sales').toLowerCase();
    if (role === 'design') return 'design';
    if (role === 'costing') return 'costing';
    if (role === 'admin') return 'admin';
    return 'sales';
  }, [user]);

  const [roleTab, setRoleTab] = useState<string>(defaultRoleTab);

  useEffect(() => {
    setRoleTab(defaultRoleTab);
  }, [defaultRoleTab]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/build-info.json', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setBuildInfo(null);
          return;
        }
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        setBuildInfo({
          hash: String(data?.hash ?? ''),
          message: String(data?.message ?? ''),
          author: String(data?.author ?? ''),
          date: String(data?.date ?? ''),
          builtAt: String(data?.builtAt ?? ''),
        });
      } catch {
        if (!cancelled) setBuildInfo(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const copyText = async (value: string, label: string) => {
    const raw = String(value ?? '').trim();
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      toast({ title: t.common.copied, description: label });
    } catch {
      toast({ title: t.request.error, description: t.common.copyFailed, variant: 'destructive' });
    }
  };

  const hashShort = buildInfo?.hash ? `${buildInfo.hash.slice(0, 7)}` : '';
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const builtAtLabel = buildInfo?.builtAt ? new Date(buildInfo.builtAt).toLocaleString() : '';

  const workflowPill = (text: string) => (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs border border-border bg-muted/10">
      {text}
    </span>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-card max-h-[85vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>{t.help.title}</DialogTitle>
          <DialogDescription>{t.help.description}</DialogDescription>
        </DialogHeader>

        <Accordion type="multiple" defaultValue={['quickstart', 'workflow']} className="w-full">
          <AccordionItem value="quickstart">
            <AccordionTrigger>{t.help.quickStartTitle}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-3">{t.help.quickStartDesc}</p>
              <Tabs value={roleTab} onValueChange={setRoleTab}>
                <TabsList className="grid grid-cols-4 h-9">
                  <TabsTrigger value="sales" className="text-xs">{t.help.roleSales}</TabsTrigger>
                  <TabsTrigger value="design" className="text-xs">{t.help.roleDesign}</TabsTrigger>
                  <TabsTrigger value="costing" className="text-xs">{t.help.roleCosting}</TabsTrigger>
                  <TabsTrigger value="admin" className="text-xs">{t.help.roleAdmin}</TabsTrigger>
                </TabsList>

                <TabsContent value="sales" className="mt-3">
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>{t.help.qsSales1}</li>
                    <li>{t.help.qsSales2}</li>
                    <li>{t.help.qsSales3}</li>
                    <li>{t.help.qsSales4}</li>
                    <li>{t.help.qsSales5}</li>
                  </ul>
                </TabsContent>

                <TabsContent value="design" className="mt-3">
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>{t.help.qsDesign1}</li>
                    <li>{t.help.qsDesign2}</li>
                    <li>{t.help.qsDesign3}</li>
                    <li>{t.help.qsDesign4}</li>
                    <li>{t.help.qsDesign5}</li>
                  </ul>
                </TabsContent>

                <TabsContent value="costing" className="mt-3">
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>{t.help.qsCosting1}</li>
                    <li>{t.help.qsCosting2}</li>
                    <li>{t.help.qsCosting3}</li>
                    <li>{t.help.qsCosting4}</li>
                    <li>{t.help.qsCosting5}</li>
                  </ul>
                </TabsContent>

                <TabsContent value="admin" className="mt-3">
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>{t.help.qsAdmin1}</li>
                    <li>{t.help.qsAdmin2}</li>
                    <li>{t.help.qsAdmin3}</li>
                    <li>{t.help.qsAdmin4}</li>
                    <li>{t.help.qsAdmin5}</li>
                  </ul>
                </TabsContent>
              </Tabs>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="workflow">
            <AccordionTrigger>{t.help.workflowTitle}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-3">{t.help.workflowDesc}</p>
              <div className="flex flex-wrap gap-2">
                {workflowPill(t.help.workflowStepDraft)}
                {workflowPill(t.help.workflowStepSubmitted)}
                {workflowPill(t.help.workflowStepUnderReview)}
                {workflowPill(t.help.workflowStepFeasibility)}
                {workflowPill(t.help.workflowStepDesign)}
                {workflowPill(t.help.workflowStepCosting)}
                {workflowPill(t.help.workflowStepSales)}
                {workflowPill(t.help.workflowStepGm)}
                {workflowPill(t.help.workflowStepApproved)}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pdf">
            <AccordionTrigger>{t.help.pdfTitle}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-3">{t.help.pdfDesc}</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>{t.help.pdf1}</li>
                <li>{t.help.pdf2}</li>
                <li>{t.help.pdf3}</li>
                <li>{t.help.pdf4}</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="issues">
            <AccordionTrigger>{t.help.issuesTitle}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-3">{t.help.issuesDesc}</p>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>{t.help.issue1}</li>
                <li>{t.help.issue2}</li>
                <li>{t.help.issue3}</li>
                <li>{t.help.issue4}</li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="support">
            <AccordionTrigger>{t.help.supportTitle}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-3">{t.help.supportDesc}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    window.dispatchEvent(new CustomEvent('feedback:open'));
                  }}
                >
                  {t.help.openFeedback}
                </Button>
                {String((user as any)?.role ?? '').toLowerCase() === 'admin' ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      navigate('/settings?tab=feedback');
                    }}
                  >
                    {t.help.openFeedbackAdmin}
                  </Button>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="build">
            <AccordionTrigger>{t.help.buildTitle}</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground mb-3">{t.help.buildDesc}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-border bg-muted/10 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.help.buildHashLabel}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="font-mono break-all">{hashShort || '-'}</div>
                    <Button size="sm" variant="outline" onClick={() => copyText(buildInfo?.hash || '', t.help.buildHashCopied)}>
                      {t.common.copy}
                    </Button>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/10 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.help.buildBuiltAtLabel}</div>
                  <div className="mt-1">{builtAtLabel || '-'}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/10 p-3 sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.help.buildMessageLabel}</div>
                  <div className="mt-1 break-words">{buildInfo?.message?.trim() || '-'}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/10 p-3 sm:col-span-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.help.buildUrlLabel}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="font-mono break-all">{appUrl || '-'}</div>
                    <Button size="sm" variant="outline" onClick={() => copyText(appUrl, t.help.buildUrlCopied)}>
                      {t.common.copy}
                    </Button>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t.common.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HelpDialog;
