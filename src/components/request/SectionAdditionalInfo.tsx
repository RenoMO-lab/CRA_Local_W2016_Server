import React, { useEffect, useRef, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, File, X, Eye, Download } from 'lucide-react';
import { RequestProduct, Attachment } from '@/types';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

interface SectionAdditionalInfoProps {
  formData: Partial<RequestProduct>;
  onChange: (field: keyof RequestProduct, value: any) => void;
  isReadOnly: boolean;
  errors?: Record<string, string>;
  title?: string;
  badgeLabel?: string;
  idPrefix?: string;
}

const SectionAdditionalInfo: React.FC<SectionAdditionalInfoProps> = ({
  formData,
  onChange,
  isReadOnly,
  errors = {},
  title,
  badgeLabel,
  idPrefix,
}) => {
  const rimDrawingInputRef = useRef<HTMLInputElement>(null);
  const picturesInputRef = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { t } = useLanguage();
  const fieldId = (suffix: string) => (idPrefix ? `${idPrefix}-${suffix}` : suffix);

  const openPreview = (attachment: Attachment) => {
    setPreviewAttachment(attachment);
    setIsPreviewOpen(true);
  };

  useEffect(() => {
    if (isPreviewOpen || !previewAttachment) return undefined;
    const timeout = window.setTimeout(() => setPreviewAttachment(null), 200);
    return () => window.clearTimeout(timeout);
  }, [isPreviewOpen, previewAttachment]);

  const isImageFile = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '');
  };

  const isPdfFile = (filename: string) => {
    return filename.toLowerCase().endsWith('.pdf');
  };

  const attachments = formData.attachments || [];

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleFileUpload = async (files: FileList | null, type: 'rim_drawing' | 'picture') => {
    if (!files) return;

    try {
      const newAttachments: Attachment[] = await Promise.all(
        Array.from(files).map(async (file, index) => ({
          id: `${Date.now()}-${index}`,
          type,
          filename: file.name,
          // Persist as data URL (base64) so the server can store it and it still works after reopening.
          url: await readAsDataUrl(file),
          uploadedAt: new Date(),
          uploadedBy: 'current-user',
        }))
      );

      // Ignore any failed reads; keep existing attachments intact.
      const valid = newAttachments.filter((a) => typeof a.url === 'string' && a.url.trim());
      if (valid.length) {
        onChange('attachments', [...attachments, ...valid]);
      }
    } catch {
      // Ignore failed reads; keep existing attachments intact.
    }
  };

  const removeAttachment = (id: string) => {
    onChange('attachments', attachments.filter(a => a.id !== id));
  };

  const rimDrawings = attachments.filter(a => a.type === 'rim_drawing');
  const pictures = attachments.filter(a => a.type === 'picture' || a.type === 'other');

  return (
    <div className="space-y-6">
      <h3 className="section-title flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
          {badgeLabel ?? '5'}
        </span>
        {title ?? t.request.additionalInfo}
      </h3>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rim Drawing Upload */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t.request.rimDrawing}
          </Label>
          <p className="text-xs text-muted-foreground">{t.request.rimDrawingDesc}</p>
          
          {!isReadOnly && (
            <>
              <input
                ref={rimDrawingInputRef}
                id={fieldId('rimDrawing')}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files, 'rim_drawing')}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => rimDrawingInputRef.current?.click()}
                className="w-full border-dashed"
              >
                <Upload size={16} className="mr-2" />
                {t.request.uploadRimDrawing}
              </Button>
            </>
          )}

          {rimDrawings.length > 0 && (
            <div className="space-y-2">
              {rimDrawings.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <File size={16} className="text-primary flex-shrink-0" />
                    <span className="text-sm truncate">{attachment.filename}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openPreview(attachment)}
                      className="p-1.5 hover:bg-primary/20 rounded text-primary"
                      title={t.table.view}
                    >
                      <Eye size={14} />
                    </button>
                    <a
                      href={attachment.url}
                      download={attachment.filename}
                      className="p-1.5 hover:bg-primary/20 rounded text-primary"
                      title={t.request.downloadFile}
                    >
                      <Download size={14} />
                    </a>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="p-1.5 hover:bg-destructive/20 rounded text-destructive"
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

        {/* Pictures Upload */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {t.request.picturesLabel}
          </Label>
          <p className="text-xs text-muted-foreground">{t.request.picturesDesc}</p>
          
          {!isReadOnly && (
            <>
              <input
                ref={picturesInputRef}
                id={fieldId('pictures')}
                type="file"
                accept="image/*,.pdf"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files, 'picture')}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => picturesInputRef.current?.click()}
                className="w-full border-dashed"
              >
                <Upload size={16} className="mr-2" />
                {t.request.uploadPictures}
              </Button>
            </>
          )}

          {pictures.length > 0 && (
            <div className="space-y-2">
              {pictures.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <File size={16} className="text-primary flex-shrink-0" />
                    <span className="text-sm truncate">{attachment.filename}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => openPreview(attachment)}
                      className="p-1.5 hover:bg-primary/20 rounded text-primary"
                      title={t.table.view}
                    >
                      <Eye size={14} />
                    </button>
                    <a
                      href={attachment.url}
                      download={attachment.filename}
                      className="p-1.5 hover:bg-primary/20 rounded text-primary"
                      title={t.request.downloadFile}
                    >
                      <Download size={14} />
                    </a>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="p-1.5 hover:bg-destructive/20 rounded text-destructive"
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
      </div>

      {/* Other Requirements */}
      <div className="space-y-2">
        <Label htmlFor={fieldId('productComments')} className="text-sm font-medium">
          {t.request.productComments}
        </Label>
        <Textarea
          id={fieldId('productComments')}
          value={formData.productComments || ''}
          onChange={(e) => onChange('productComments', e.target.value)}
          placeholder={`${t.common.add} ${t.request.productComments.toLowerCase()}...`}
          rows={4}
          disabled={isReadOnly}
        />
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto" onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewAttachment?.filename}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[300px]">
            {previewAttachment && isImageFile(previewAttachment.filename) && (
              <img
                src={previewAttachment.url}
                alt={previewAttachment.filename}
                className="max-w-full max-h-[70vh] object-contain"
              />
            )}
            {previewAttachment && isPdfFile(previewAttachment.filename) && (
              <iframe
                src={previewAttachment.url}
                title={previewAttachment.filename}
                className="w-full h-[70vh] border-0"
              />
            )}
            {previewAttachment && !isImageFile(previewAttachment.filename) && !isPdfFile(previewAttachment.filename) && (
              <div className="text-center space-y-4">
                <File size={64} className="mx-auto text-muted-foreground" />
                <p className="text-muted-foreground">{t.request.previewNotAvailable}</p>
                <a
                  href={previewAttachment.url}
                  download={previewAttachment.filename}
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <Download size={16} />
                  {t.request.downloadFile}
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SectionAdditionalInfo;

