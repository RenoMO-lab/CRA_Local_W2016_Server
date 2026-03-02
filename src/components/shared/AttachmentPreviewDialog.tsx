import React from 'react';
import { Download } from 'lucide-react';

import { useLanguage } from '@/context/LanguageContext';
import { Attachment } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { buildAttachmentHref, isImageFile, isPdfFile } from '@/lib/attachmentPreview';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attachment: Attachment | null;
};

const AttachmentPreviewDialog: React.FC<Props> = ({ open, onOpenChange, attachment }) => {
  const { t } = useLanguage();

  const href = attachment ? buildAttachmentHref(attachment) : '';
  const filename = attachment?.filename ?? '';
  const showImage = attachment ? isImageFile(filename) && Boolean(href) : false;
  const showPdf = attachment ? isPdfFile(filename) && Boolean(href) : false;
  const showFallback = Boolean(attachment) && !showImage && !showPdf;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-auto scrollbar-thin"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{filename}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[300px] items-center justify-center">
          {showImage ? <img src={href} alt={filename} className="max-h-[70vh] max-w-full object-contain" /> : null}
          {showPdf ? <iframe src={href} title={filename} className="h-[70vh] w-full border border-border rounded" /> : null}
          {showFallback ? (
            <div className="space-y-3 text-center">
              <div className="text-sm text-muted-foreground">{t.request.previewNotAvailable}</div>
              {href ? (
                <a
                  href={href}
                  download={filename}
                  className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  <Download size={16} className="mr-2" />
                  {t.request.downloadFile}
                </a>
              ) : null}
            </div>
          ) : null}
          {!attachment ? <div className="text-sm text-muted-foreground">{t.request.previewNotAvailable}</div> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AttachmentPreviewDialog;
