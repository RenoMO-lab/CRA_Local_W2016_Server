import { Attachment } from '@/types';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const fileExtension = (filename?: string) => String(filename ?? '').toLowerCase().split('.').pop() ?? '';

export const isImageFile = (filename?: string) => Boolean(IMAGE_MIME_BY_EXT[fileExtension(filename)]);

export const isPdfFile = (filename?: string) => fileExtension(filename) === 'pdf';

export const buildAttachmentHref = (attachment: Attachment | null | undefined) => {
  if (!attachment) return '';

  const url = String(attachment.url ?? '').trim();
  if (url) {
    if (
      url.startsWith('data:') ||
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('blob:') ||
      url.startsWith('/')
    ) {
      return url;
    }

    const ext = fileExtension(attachment.filename);
    if (ext === 'pdf') return `data:application/pdf;base64,${url}`;
    if (IMAGE_MIME_BY_EXT[ext]) return `data:${IMAGE_MIME_BY_EXT[ext]};base64,${url}`;
    return `data:application/octet-stream;base64,${url}`;
  }

  const id = String(attachment.id ?? '').trim();
  if (!id) return '';
  return `/api/attachments/${encodeURIComponent(id)}`;
};
