export const localizeApiError = (t: any, message: unknown): string => {
  const msg = String(message ?? '').trim();
  if (!msg) return '';

  // Server-side error strings we intentionally normalize for translation.
  if (msg === 'Authentication required') return String(t?.common?.authenticationRequired ?? msg);
  if (msg === 'Not found') return String(t?.common?.notFound ?? msg);
  if (msg === 'Payload too large') return String(t?.common?.payloadTooLarge ?? msg);
  if (msg === 'Invalid JSON body') return String(t?.common?.invalidJsonBody ?? msg);

  return msg;
};

