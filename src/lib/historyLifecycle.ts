import { StatusHistoryEntry } from '@/types';

const asTime = (value: string | Date | undefined) => {
  if (!value) return Number.NaN;
  const d = value instanceof Date ? value : new Date(value);
  return d.getTime();
};

export const filterLifecycleHistory = (history: StatusHistoryEntry[] | null | undefined): StatusHistoryEntry[] => {
  if (!Array.isArray(history) || history.length === 0) return [];

  let firstSubmittedAt = Number.POSITIVE_INFINITY;
  for (const entry of history) {
    if (entry?.status !== 'submitted') continue;
    const ts = asTime(entry.timestamp);
    if (!Number.isNaN(ts) && ts < firstSubmittedAt) {
      firstSubmittedAt = ts;
    }
  }

  return history.filter((entry) => {
    if (!entry || entry.status !== 'edited') return true;
    if (!Number.isFinite(firstSubmittedAt)) return false;
    const ts = asTime(entry.timestamp);
    if (Number.isNaN(ts)) return false;
    return ts >= firstSubmittedAt;
  });
};

