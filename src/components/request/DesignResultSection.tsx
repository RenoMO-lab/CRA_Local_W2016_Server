import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, File, X, Eye, Download } from 'lucide-react';
import { Attachment } from '@/types';
import { useLanguage } from '@/context/LanguageContext';

interface DesignResultSectionProps {
  comments: string;
  attachments: Attachment[];
  onCommentsChange?: (value: string) => void;
  onAttachmentsChange?: (attachments: Attachment[]) => void;
  isReadOnly?: boolean;
  showEmptyState?: boolean;
}

const DesignResultSection: React.FC<DesignResultSectionProps> = ({
  comments,
  attachments,
  onCommentsChange,
  onAttachmentsChange,
  isReadOnly = false,
  showEmptyState = true,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const { t } = useLanguage();

  const isImageFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '');
  };

  const isPdfFile = (filename: string) => {
    return filename.toLowerCase().endsWith('.pdf');
  };

  const getPreviewUrl = (attachment: Attachment | null) => {
    const url = attachment?.url ?? '';
    if (!url) return '';

    if (
      url.startsWith('data:') ||
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('blob:') ||
      url.startsWith('/')
    ) {
      return url;
    }

    const ext = attachment?.filename?.split('.').pop()?.toLowerCase() ?? '';
    const imageTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
    };

    if (ext === 'pdf') {
      return `data:application/pdf;base64,${url}`;
    }

    if (imageTypes[ext]) {
      return `data:${imageTypes[ext]};base64,${url}`;
    }

    return url;
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || !onAttachmentsChange) return;

    const readAsDataUrl = (file: File, index: number) =>
      new Promise<Attachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            id: `${Date.now()}-${index}`,
            type: 'other',
            filename: file.name,
            url: typeof reader.result === 'string' ? reader.result : '',
            uploadedAt: new Date(),
            uploadedBy: 'current-user',
          });
        };
        reader.onerror = () => {
          reject(reader.error);
        };
        reader.readAsDataURL(file);
      });

    try {
      const newAttachments = await Promise.all(
        Array.from(files).map((file, index) => readAsDataUrl(file, index))
      );
      onAttachmentsChange([...attachments, ...newAttachments]);
    } catch {
      // Ignore failed reads; keep existing attachments intact.
    }
  };

  const removeAttachment = (id: string) => {
    if (!onAttachmentsChange) return;
    onAttachmentsChange(attachments.filter(a => a.id !== id));
  };

  const hasContent = comments.trim().length > 0 || attachments.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-base font-semibold text-foreground">{t.panels.designResult}</h4>
        <p className="text-sm text-muted-foreground">{t.panels.designResultDesc}</p>
      </div>

      {!hasContent && showEmptyState && isReadOnly && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          {t.panels.designResultEmpty}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t.panels.designResultComments}</Label>
        <Textarea
          value={comments}
          onChange={(e) => onCommentsChange?.(e.target.value)}
          placeholder={t.panels.designResultPlaceholder}
          rows={3}
          disabled={isReadOnly}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t.panels.designResultUploads}</Label>
        {!isReadOnly && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              className="w-full border-dashed"
            >
              <Upload size={16} className="mr-2" />
              {t.panels.uploadDesignDocs}
            </Button>
          </>
        )}

        {attachments.length > 0 && (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <File size={16} className="text-primary" />
                  <span className="text-sm truncate">{attachment.filename}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(attachment)}
                    className="rounded p-1.5 text-primary hover:bg-primary/20"
                    title={t.table.view}
                  >
                    <Eye size={14} />
                  </button>
                  <a
                    href={getPreviewUrl(attachment) || attachment.url}
                    download={attachment.filename}
                    className="rounded p-1.5 text-primary hover:bg-primary/20"
                    title={t.request.downloadFile}
                  >
                    <Download size={14} />
                  </a>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="rounded p-1.5 text-destructive hover:bg-destructive/20"
                      title={t.common.delete}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!previewAttachment} onOpenChange={() => setPreviewAttachment(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewAttachment?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-[300px] items-center justify-center">
            {previewAttachment && isImageFile(previewAttachment.filename) && getPreviewUrl(previewAttachment) && (
              <img
                src={getPreviewUrl(previewAttachment)}
                alt={previewAttachment.filename}
                className="max-h-[70vh] max-w-full object-contain"
              />
            )}
            {previewAttachment && isPdfFile(previewAttachment.filename) && getPreviewUrl(previewAttachment) && (
              <iframe
                src={getPreviewUrl(previewAttachment)}
                title={previewAttachment.filename}
                className="h-[70vh] w-full border border-border rounded"
              />
            )}
            {previewAttachment &&
              !isImageFile(previewAttachment.filename) &&
              !isPdfFile(previewAttachment.filename) && (
                <div className="text-sm text-muted-foreground">
                  {t.request.downloadFile}
                </div>
              )}
            {previewAttachment && !getPreviewUrl(previewAttachment) && (
              <div className="text-sm text-muted-foreground">
                {t.request.previewNotAvailable}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DesignResultSection;
