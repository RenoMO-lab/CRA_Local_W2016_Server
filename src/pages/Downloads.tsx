import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { localizeApiError } from "@/utils/localizeApiError";

type ClientDownloadInfo = {
  name: string;
  version: string | null;
  sizeBytes: number;
  sha256: string | null;
  updatedAt: string | null;
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let idx = 0;
  while (n >= 1024 && idx < units.length - 1) {
    n /= 1024;
    idx += 1;
  }
  const decimals = idx === 0 ? 0 : 1;
  return `${n.toFixed(decimals)} ${units[idx]}`;
};

const Downloads: React.FC = () => {
  const { t } = useLanguage();
  const [info, setInfo] = useState<ClientDownloadInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/client/download-info", {
        method: "GET",
        credentials: "include",
      });
      if (!res.ok) {
        let rawMessage = `Request failed with status ${res.status}`;
        try {
          const payload = await res.json();
          rawMessage = String(payload?.error ?? rawMessage);
        } catch {
          // Keep status message fallback.
        }
        throw new Error(rawMessage);
      }
      const payload = (await res.json()) as ClientDownloadInfo;
      setInfo(payload);
    } catch (err) {
      setError(localizeApiError(String((err as Error)?.message ?? err), t.common));
    } finally {
      setIsLoading(false);
    }
  }, [t.common]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const updatedAtLabel = useMemo(() => {
    const raw = String(info?.updatedAt ?? "").trim();
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString();
  }, [info?.updatedAt]);

  const handleDownload = () => {
    window.location.href = "/api/client/download";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_20%_20%,rgba(255,0,0,0.1),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(255,0,0,0.08),transparent_35%)]" />
        <div className="relative px-6 py-8 md:px-12 md:py-12 text-center">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-border bg-background/70 px-4 py-2">
            <img src="/monroc-favicon.png?v=3" alt="Monroc" className="h-6 w-6 object-contain" />
            <span className="text-sm font-medium">{t.downloads.clientInstaller}</span>
          </div>

          <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight md:text-5xl">
            {t.downloads.headline}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground md:text-lg">
            {t.downloads.subheadline}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button
              onClick={handleDownload}
              disabled={!info || isLoading}
              className="h-12 rounded-full px-7 text-base font-semibold"
            >
              <Download size={18} className="mr-2" />
              {t.downloads.downloadButton}
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">{t.downloads.compatibility}</p>
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-destructive/40 bg-destructive/10 p-5">
          <h2 className="text-base font-semibold text-destructive">{t.downloads.unavailableTitle}</h2>
          <p className="mt-1 text-sm text-destructive">{t.downloads.unavailableDesc}</p>
          <p className="mt-2 text-sm text-destructive/90">{error}</p>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-card/60 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t.downloads.version}</div>
              <div className="font-medium">{info?.version || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t.downloads.fileSize}</div>
              <div className="font-medium">{formatBytes(Number(info?.sizeBytes ?? 0))}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t.downloads.updatedAt}</div>
              <div className="font-medium">{updatedAtLabel}</div>
            </div>
          </div>
        </section>
      )}

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck size={15} />
        <span>{t.downloads.trustNote}</span>
      </div>
    </div>
  );
};

export default Downloads;
