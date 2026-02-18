import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import {
  Activity,
  BarChart3,
  Briefcase,
  Calculator,
  CheckCircle2,
  Clock,
  Inbox,
  Layers,
  ListChecks,
  PenTool,
  FileEdit,
  UserCheck,
  Workflow,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { CustomerRequest, RequestStatus } from "@/types";
import { useLanguage } from "@/context/LanguageContext";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TimePeriod = "day" | "week" | "month" | "last30" | "last90" | "year";

// "Completed" means finished/approved/closed. A GM rejection is not completed:
// it returns to Sales follow-up per business process.
const COMPLETED_STATUSES: RequestStatus[] = ["gm_approved", "closed"];
const SUBMITTED_STATUSES: RequestStatus[] = ["submitted"];

type StageKey = "design" | "costing" | "sales" | "gm" | "clarification";

type StageDef = {
  key: StageKey;
  wipStatuses: RequestStatus[];
  startStatuses: RequestStatus[];
  endStatuses: RequestStatus[];
};

const getTimeRange = (period: TimePeriod): { start: Date; end: Date; groupBy: "day" | "week" | "month" } => {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (period) {
    case "day":
      return { start: startOfDay(now), end: endOfToday, groupBy: "day" };
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfToday, groupBy: "day" };
    case "month":
      return { start: startOfMonth(now), end: endOfToday, groupBy: "day" };
    case "last30":
      return { start: subDays(endOfToday, 30), end: endOfToday, groupBy: "day" };
    case "last90":
      return { start: subDays(endOfToday, 90), end: endOfToday, groupBy: "week" };
    case "year":
      return { start: startOfYear(now), end: endOfToday, groupBy: "month" };
    default:
      return { start: subDays(endOfToday, 30), end: endOfToday, groupBy: "day" };
  }
};

const toValidDate = (value: unknown): Date | null => {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(+d) ? null : d;
};

const quantile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
};

const formatHours = (hours: number) => {
  if (!Number.isFinite(hours)) return "-";
  return `${hours.toFixed(1)}`;
};

const MiniSparkline: React.FC<{
  values: number[];
  color?: string;
  height?: number;
  width?: number;
}> = ({ values, color = "hsl(var(--foreground))", height = 28, width = 120 }) => {
  const safe = values.filter((v) => Number.isFinite(v));
  if (safe.length < 2) {
    return <div style={{ height }} className="w-full" />;
  }

  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;

  const pts = safe.map((v, idx) => {
    const x = (idx / (safe.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts.join(" ")}
        opacity="0.9"
      />
    </svg>
  );
};

type HistoryWithTs = {
  status: RequestStatus;
  userName?: string;
  timestamp: any;
  ts: Date;
};

type Cycle = {
  requestId: string;
  clientName: string;
  startAt: Date;
  endAt: Date;
  hours: number;
  endBy?: string;
};

const findFirstStatusTime = (history: HistoryWithTs[], statuses: RequestStatus[]) => {
  for (const h of history) {
    if (statuses.includes(h.status)) return h.ts;
  }
  return null;
};

const findFirstStatusTimeAfter = (history: HistoryWithTs[], after: Date, statuses: RequestStatus[]) => {
  for (const h of history) {
    if (+h.ts < +after) continue;
    if (!statuses.includes(h.status)) continue;
    return { ts: h.ts, by: h.userName };
  }
  return null;
};

const computeStageCycles = (
  requests: CustomerRequest[],
  historyById: Map<string, HistoryWithTs[]>,
  stage: StageDef,
  range: { start: Date; end: Date }
) => {
  const cycles: Cycle[] = [];

  requests.forEach((r) => {
    const history = historyById.get(r.id) ?? [];
    const stageStart = findFirstStatusTime(history, stage.startStatuses);
    if (!stageStart) return;
    const endHit = findFirstStatusTimeAfter(history, stageStart, stage.endStatuses);
    if (!endHit) return;
    if (!isWithinInterval(endHit.ts, range)) return;
    const diffHours = (+endHit.ts - +stageStart) / (1000 * 60 * 60);
    if (diffHours < 0) return;
    cycles.push({
      requestId: r.id,
      clientName: r.clientName || "-",
      startAt: stageStart,
      endAt: endHit.ts,
      hours: Number(diffHours.toFixed(1)),
      endBy: endHit.by,
    });
  });

  cycles.sort((a, b) => b.hours - a.hours);
  return cycles;
};

const computeClarificationCycles = (
  requests: CustomerRequest[],
  historyById: Map<string, HistoryWithTs[]>,
  range: { start: Date; end: Date }
) => {
  const cycles: Cycle[] = [];

  requests.forEach((r) => {
    const history = historyById.get(r.id) ?? [];
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      if (h.status !== "clarification_needed") continue;
      const startAt = h.ts;
      let endAt: Date | null = null;
      let endBy: string | undefined;
      for (let j = i + 1; j < history.length; j++) {
        const next = history[j];
        if (next.status === "clarification_needed") continue;
        endAt = next.ts;
        endBy = next.userName;
        break;
      }
      if (!endAt) continue;
      if (!isWithinInterval(endAt, range)) continue;
      const diffHours = (+endAt - +startAt) / (1000 * 60 * 60);
      if (diffHours < 0) continue;
      cycles.push({
        requestId: r.id,
        clientName: r.clientName || "-",
        startAt,
        endAt,
        hours: Number(diffHours.toFixed(1)),
        endBy,
      });
    }
  });

  cycles.sort((a, b) => b.hours - a.hours);
  return cycles;
};

type StageMetrics = {
  throughput: number;
  medianHours: number;
  p90Hours: number;
  slaMetPct: number;
  samples: number;
  cycles: Cycle[];
  wipNow: number;
  oldestWipHours: number;
};

type PerformanceOverviewResponse = {
  overview: {
    submittedCount: number;
    wipCount: number;
    completedCount: number;
    e2eMedian: number;
    e2eP90: number;
    e2eSamples: number;
  };
  series: {
    submitted: number[];
    wip: number[];
    completed: number[];
    e2eMedian: number[];
  };
};

const WorkflowPerformance: React.FC<{ requests: CustomerRequest[] }> = ({ requests }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [period, setPeriod] = useState<TimePeriod>("last30");
  const [slaHours, setSlaHours] = useState<number>(24);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<StageKey | null>(null);
  const [overviewApi, setOverviewApi] = useState<PerformanceOverviewResponse | null>(null);

  const timeRange = useMemo(() => getTimeRange(period), [period]);
  const range = useMemo(() => ({ start: timeRange.start, end: timeRange.end }), [timeRange.end, timeRange.start]);

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      try {
        const qs = new URLSearchParams({
          from: timeRange.start.toISOString(),
          to: timeRange.end.toISOString(),
          groupBy: timeRange.groupBy,
        });
        const res = await fetch(`/api/performance/overview?${qs.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const data = (await res.json()) as PerformanceOverviewResponse;
        if (!controller.signal.aborted) setOverviewApi(data);
      } catch (e) {
        if (!controller.signal.aborted) {
          console.warn("Failed to load performance overview:", e);
          setOverviewApi(null);
        }
      }
    };

    run();
    return () => controller.abort();
  }, [timeRange.end, timeRange.groupBy, timeRange.start]);

  const historyById = useMemo(() => {
    const map = new Map<string, HistoryWithTs[]>();
    requests.forEach((r) => {
      const sorted = (r.history || [])
        .map((h) => {
          const ts = toValidDate(h.timestamp);
          return ts ? ({ ...h, ts } as HistoryWithTs) : null;
        })
        .filter((h): h is HistoryWithTs => !!h)
        .sort((a, b) => +a.ts - +b.ts);
      map.set(r.id, sorted);
    });
    return map;
  }, [requests]);

  const stageDefs: Record<StageKey, StageDef> = useMemo(
    () => ({
      design: {
        key: "design",
        // "Submitted" starts the Design stage (includes initial queueing).
        wipStatuses: ["submitted", "edited", "under_review", "clarification_needed", "feasibility_confirmed"],
        startStatuses: SUBMITTED_STATUSES,
        endStatuses: ["design_result"],
      },
      costing: {
        key: "costing",
        // Design completed -> Costing stage (may sit in design_result before "in_costing").
        wipStatuses: ["design_result", "in_costing"],
        startStatuses: ["in_costing"],
        endStatuses: ["costing_complete"],
      },
      sales: {
        key: "sales",
        // Costing completed -> Sales follow-up. GM rejected returns to Sales.
        wipStatuses: ["costing_complete", "sales_followup", "gm_rejected"],
        startStatuses: ["sales_followup"],
        endStatuses: ["gm_approval_pending"],
      },
      gm: {
        key: "gm",
        wipStatuses: ["gm_approval_pending"],
        startStatuses: ["gm_approval_pending"],
        endStatuses: COMPLETED_STATUSES,
      },
      clarification: {
        key: "clarification",
        wipStatuses: ["clarification_needed"],
        startStatuses: ["clarification_needed"],
        endStatuses: [],
      },
    }),
    []
  );

  const now = new Date();

  const buildStageMetrics = (key: StageKey): StageMetrics => {
    const def = stageDefs[key];
    const cycles =
      key === "clarification"
        ? computeClarificationCycles(requests, historyById, range)
        : computeStageCycles(requests, historyById, def, range);

    const values = cycles.map((c) => c.hours);
    const median = quantile(values, 0.5);
    const p90 = quantile(values, 0.9);
    const met = values.length ? Math.round((values.filter((v) => v <= slaHours).length / values.length) * 100) : 0;

    const wipItems = requests
      .filter((r) => def.wipStatuses.includes(r.status))
      .map((r) => {
        const history = historyById.get(r.id) ?? [];
        let entry = findFirstStatusTime(history, def.startStatuses);
        if (key === "design") entry = findFirstStatusTime(history, SUBMITTED_STATUSES);
        if (key === "clarification") entry = findFirstStatusTime(history, ["clarification_needed"]);
        if (!entry) return null;
        const ageH = (+now - +entry) / (1000 * 60 * 60);
        return Number.isFinite(ageH) && ageH >= 0 ? ageH : null;
      })
      .filter((v): v is number => v !== null);

    const oldest = wipItems.length ? Math.max(...wipItems) : 0;

    return {
      throughput: cycles.length,
      medianHours: Number(median.toFixed(1)),
      p90Hours: Number(p90.toFixed(1)),
      slaMetPct: met,
      samples: values.length,
      cycles: cycles.slice(0, 10),
      wipNow: wipItems.length,
      oldestWipHours: Number(oldest.toFixed(1)),
    };
  };

  const metricsByStage = useMemo(() => {
    return {
      design: buildStageMetrics("design"),
      costing: buildStageMetrics("costing"),
      sales: buildStageMetrics("sales"),
      gm: buildStageMetrics("gm"),
      clarification: buildStageMetrics("clarification"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, range.start, range.end, slaHours]);

  const flowOverview = useMemo(() => {
    const submittedCount = requests.filter((r) => {
      const history = historyById.get(r.id) ?? [];
      const ts = findFirstStatusTime(history, SUBMITTED_STATUSES);
      return ts ? isWithinInterval(ts, range) : false;
    }).length;

    const completedCount = requests.filter((r) => {
      const history = historyById.get(r.id) ?? [];
      const ts = findFirstStatusTime(history, COMPLETED_STATUSES);
      return ts ? isWithinInterval(ts, range) : false;
    }).length;

    // WIP = anything submitted/in-flight but not completed.
    const wipCount = requests.filter((r) => r.status !== "draft" && !COMPLETED_STATUSES.includes(r.status)).length;

    const endToEnd = requests
      .map((r) => {
        const history = historyById.get(r.id) ?? [];
        const startAt = findFirstStatusTime(history, SUBMITTED_STATUSES);
        const endAt = findFirstStatusTime(history, COMPLETED_STATUSES);
        if (!startAt || !endAt) return null;
        if (!isWithinInterval(endAt, range)) return null;
        const hours = (+endAt - +startAt) / (1000 * 60 * 60);
        return hours >= 0 ? hours : null;
      })
      .filter((v): v is number => v !== null);

    const median = quantile(endToEnd, 0.5);
    const p90 = quantile(endToEnd, 0.9);

    // Breakdown must be consistent with WIP: only show WIP buckets (no Draft / no Completed).
    const dist = {
      design: requests.filter((r) => stageDefs.design.wipStatuses.includes(r.status)).length,
      costing: requests.filter((r) => stageDefs.costing.wipStatuses.includes(r.status)).length,
      sales: requests.filter((r) => stageDefs.sales.wipStatuses.includes(r.status)).length,
      gm: requests.filter((r) => stageDefs.gm.wipStatuses.includes(r.status)).length,
    };

    return {
      submittedCount,
      completedCount,
      wipCount,
      e2eMedian: Number(median.toFixed(1)),
      e2eP90: Number(p90.toFixed(1)),
      e2eSamples: endToEnd.length,
      dist,
    };
  }, [requests, range, historyById, stageDefs]);

  const intervalData = useMemo(() => {
    const { start, end, groupBy } = timeRange;
    const intervals =
      groupBy === "day"
        ? eachDayOfInterval({ start, end })
        : groupBy === "week"
          ? eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
          : eachMonthOfInterval({ start, end });

    const intervalLabel = (date: Date) => (groupBy === "month" ? format(date, "MMM yyyy") : format(date, "MMM dd"));
    const intervalEnd = (date: Date) => {
      if (groupBy === "day") return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
      if (groupBy === "week") return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    };

    const pickIntervalStart = (ts: Date) => {
      for (const d of intervals) {
        if (isWithinInterval(ts, { start: d, end: intervalEnd(d) })) return d;
      }
      return null;
    };

    const rows = intervals.map((d) => ({
      date: intervalLabel(d),
      designCount: 0,
      designAvg: 0,
      costingCount: 0,
      costingAvg: 0,
      salesCount: 0,
      salesAvg: 0,
      gmCount: 0,
      gmAvg: 0,
      clarificationCount: 0,
      clarificationAvg: 0,
    }));

    const addCycles = (key: StageKey, cycles: Cycle[]) => {
      const perLabel: Record<string, number[]> = {};
      rows.forEach((r) => (perLabel[r.date] = []));

      cycles.forEach((c) => {
        const d = pickIntervalStart(c.endAt);
        if (!d) return;
        const label = intervalLabel(d);
        if (!perLabel[label]) perLabel[label] = [];
        perLabel[label].push(c.hours);
      });

      rows.forEach((row) => {
        const values = perLabel[row.date] || [];
        const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
        if (key === "design") {
          row.designCount = values.length;
          row.designAvg = Number(avg.toFixed(1));
        } else if (key === "costing") {
          row.costingCount = values.length;
          row.costingAvg = Number(avg.toFixed(1));
        } else if (key === "sales") {
          row.salesCount = values.length;
          row.salesAvg = Number(avg.toFixed(1));
        } else if (key === "gm") {
          row.gmCount = values.length;
          row.gmAvg = Number(avg.toFixed(1));
        } else if (key === "clarification") {
          row.clarificationCount = values.length;
          row.clarificationAvg = Number(avg.toFixed(1));
        }
      });
    };

    addCycles("design", computeStageCycles(requests, historyById, stageDefs.design, { start, end }));
    addCycles("costing", computeStageCycles(requests, historyById, stageDefs.costing, { start, end }));
    addCycles("sales", computeStageCycles(requests, historyById, stageDefs.sales, { start, end }));
    addCycles("gm", computeStageCycles(requests, historyById, stageDefs.gm, { start, end }));
    addCycles("clarification", computeClarificationCycles(requests, historyById, { start, end }));

    return rows;
  }, [historyById, requests, stageDefs, timeRange]);

  const overviewTrends = useMemo(() => {
    const { start, end, groupBy } = timeRange;
    const intervals =
      groupBy === "day"
        ? eachDayOfInterval({ start, end })
        : groupBy === "week"
          ? eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
          : eachMonthOfInterval({ start, end });

    const intervalEnd = (date: Date) => {
      if (groupBy === "day") return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
      if (groupBy === "week") return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
      return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    };

    const submitted: number[] = [];
    const completed: number[] = [];
    const wip: number[] = [];
    const e2eMedian: number[] = [];

    // Precompute end-to-end lead times per request (for median-by-interval).
    const e2eByEnd: { endAt: Date; hours: number }[] = [];
    requests.forEach((r) => {
      const history = historyById.get(r.id) ?? [];
      const s = findFirstStatusTime(history, SUBMITTED_STATUSES);
      const e = findFirstStatusTime(history, COMPLETED_STATUSES);
      if (!s || !e) return;
      const hours = (+e - +s) / (1000 * 60 * 60);
      if (hours < 0) return;
      e2eByEnd.push({ endAt: e, hours });
    });

    // Compute WIP at each interval end using history state at time.
    const histories = requests.map((r) => ({ id: r.id, history: historyById.get(r.id) ?? [] }));

    intervals.forEach((d) => {
      const iEnd = intervalEnd(d);

      // Submitted / Completed counts in interval (by first occurrence).
      let submittedCount = 0;
      let completedCount = 0;
      requests.forEach((r) => {
        const history = historyById.get(r.id) ?? [];
        const s = findFirstStatusTime(history, SUBMITTED_STATUSES);
        if (s && isWithinInterval(s, { start: d, end: iEnd })) submittedCount++;
        const e = findFirstStatusTime(history, COMPLETED_STATUSES);
        if (e && isWithinInterval(e, { start: d, end: iEnd })) completedCount++;
      });
      submitted.push(submittedCount);
      completed.push(completedCount);

      // WIP snapshot at interval end.
      let wipCount = 0;
      histories.forEach(({ history }) => {
        if (!history.length) return;
        let statusAt: RequestStatus | null = null;
        for (const h of history) {
          if (+h.ts > +iEnd) break;
          statusAt = h.status;
        }
        if (!statusAt) return;
        if (statusAt === "draft") return;
        if (COMPLETED_STATUSES.includes(statusAt)) return;
        wipCount++;
      });
      wip.push(wipCount);

      const intervalValues = e2eByEnd
        .filter((x) => isWithinInterval(x.endAt, { start: d, end: iEnd }))
        .map((x) => x.hours);
      e2eMedian.push(Number(quantile(intervalValues, 0.5).toFixed(1)));
    });

    return { submitted, completed, wip, e2eMedian };
  }, [historyById, requests, timeRange]);

  const effectiveFlowOverview = useMemo(() => {
    if (!overviewApi) return flowOverview;
    return {
      ...flowOverview,
      submittedCount: overviewApi.overview.submittedCount,
      wipCount: overviewApi.overview.wipCount,
      completedCount: overviewApi.overview.completedCount,
      e2eMedian: overviewApi.overview.e2eMedian,
      e2eP90: overviewApi.overview.e2eP90,
      e2eSamples: overviewApi.overview.e2eSamples,
    };
  }, [flowOverview, overviewApi]);

  const effectiveOverviewTrends = useMemo(() => {
    if (!overviewApi) return overviewTrends;
    return overviewApi.series;
  }, [overviewApi, overviewTrends]);

  const stageMeta = useMemo(() => {
    const meta: Record<
      StageKey,
      {
        title: string;
        desc: string;
        icon: React.ReactNode;
        accent: string;
        lineKeyAvg: string;
        barKeyCount: string;
      }
    > = {
      design: {
        title: t.performance.stageDesign,
        desc: t.performance.stageDesignDesc,
        icon: <Workflow className="h-4 w-4" />,
        accent: "hsl(221, 83%, 53%)",
        lineKeyAvg: "designAvg",
        barKeyCount: "designCount",
      },
      costing: {
        title: t.performance.stageCosting,
        desc: t.performance.stageCostingDesc,
        icon: <Layers className="h-4 w-4" />,
        accent: "hsl(142, 71%, 45%)",
        lineKeyAvg: "costingAvg",
        barKeyCount: "costingCount",
      },
      sales: {
        title: t.performance.stageSales,
        desc: t.performance.stageSalesDesc,
        icon: <Activity className="h-4 w-4" />,
        accent: "hsl(38, 92%, 50%)",
        lineKeyAvg: "salesAvg",
        barKeyCount: "salesCount",
      },
      gm: {
        title: t.performance.stageGm,
        desc: t.performance.stageGmDesc,
        icon: <ListChecks className="h-4 w-4" />,
        accent: "hsl(0, 84%, 60%)",
        lineKeyAvg: "gmAvg",
        barKeyCount: "gmCount",
      },
      clarification: {
        title: t.performance.stageClarification,
        desc: t.performance.stageClarificationDesc,
        icon: <Clock className="h-4 w-4" />,
        accent: "hsl(280, 87%, 60%)",
        lineKeyAvg: "clarificationAvg",
        barKeyCount: "clarificationCount",
      },
    };
    return meta;
  }, [t]);

  const openStageDetails = (key: StageKey) => {
    setSelectedStage(key);
    setDetailsOpen(true);
  };

  const selected = selectedStage ? metricsByStage[selectedStage] : null;
  const selectedMeta = selectedStage ? stageMeta[selectedStage] : null;

  const trendConfig = useMemo((): ChartConfig => {
    if (!selectedMeta) return {};
    return {
      [selectedMeta.barKeyCount]: { label: t.performance.trendCompleted, color: "hsl(var(--foreground))" },
      [selectedMeta.lineKeyAvg]: { label: t.performance.trendAvgHours, color: selectedMeta.accent },
    };
  }, [selectedMeta, t.performance.trendAvgHours, t.performance.trendCompleted]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t.performance.title}</h1>
          <p className="text-muted-foreground mt-1">{t.performance.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t.performance.periodLabel} />
            </SelectTrigger>
            <SelectContent className="bg-card border border-border">
              <SelectItem value="day">{t.performance.periodDay}</SelectItem>
              <SelectItem value="week">{t.performance.periodWeek}</SelectItem>
              <SelectItem value="month">{t.performance.periodMonth}</SelectItem>
              <SelectItem value="last30">{t.performance.periodLast30}</SelectItem>
              <SelectItem value="last90">{t.performance.periodLast90}</SelectItem>
              <SelectItem value="year">{t.performance.periodYear}</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">{t.performance.slaThresholdLabel}</Label>
            <Input
              type="number"
              min={1}
              step={1}
              value={slaHours}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) setSlaHours(next);
              }}
              className="h-9 w-[92px]"
            />
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/10 border border-border text-primary">
                    <BarChart3 className="h-4 w-4" />
                  </span>
                  <p className="text-xs font-medium text-muted-foreground truncate">{t.performance.kpiSubmitted}</p>
                </div>
                <p className="mt-2 text-3xl font-semibold text-foreground">{effectiveFlowOverview.submittedCount}</p>
              </div>
            </div>
            <div className="mt-2">
              <MiniSparkline values={effectiveOverviewTrends.submitted} color="hsl(0, 84%, 60%)" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/10 border border-border text-primary">
                    <Layers className="h-4 w-4" />
                  </span>
                  <p className="text-xs font-medium text-muted-foreground truncate">{t.performance.kpiWip}</p>
                </div>
                <p className="mt-2 text-3xl font-semibold text-foreground">{effectiveFlowOverview.wipCount}</p>
              </div>
            </div>
            <div className="mt-2">
              <MiniSparkline values={effectiveOverviewTrends.wip} color="hsl(38, 92%, 50%)" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/10 border border-border text-primary">
                    <ListChecks className="h-4 w-4" />
                  </span>
                  <p className="text-xs font-medium text-muted-foreground truncate">{t.performance.kpiCompleted}</p>
                </div>
                <p className="mt-2 text-3xl font-semibold text-foreground">{effectiveFlowOverview.completedCount}</p>
              </div>
            </div>
            <div className="mt-2">
              <MiniSparkline values={effectiveOverviewTrends.completed} color="hsl(142, 71%, 45%)" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/10 border border-border text-primary">
                    <Clock className="h-4 w-4" />
                  </span>
                  <p className="text-xs font-medium text-muted-foreground truncate">{t.performance.kpiE2eLeadTime}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="text-3xl font-semibold text-foreground">
                    {formatHours(effectiveFlowOverview.e2eMedian)}
                    {t.performance.hoursUnit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.performance.kpiE2eP90}: {formatHours(effectiveFlowOverview.e2eP90)}
                    {t.performance.hoursUnit}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.performance.samplesLabel}: {effectiveFlowOverview.e2eSamples}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-2">
              <MiniSparkline values={effectiveOverviewTrends.e2eMedian} color="hsl(221, 83%, 53%)" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div>
          <div className="text-sm font-semibold text-foreground">{t.performance.wipTitle}</div>
          <div className="text-xs text-muted-foreground">{t.performance.wipDesc}</div>
        </div>
        {(() => {
          const segments = [
            { key: "design", label: t.performance.wipDesign, value: flowOverview.dist.design, icon: <PenTool className="h-3.5 w-3.5" />, color: "hsl(280, 87%, 60%)" },
            { key: "costing", label: t.performance.wipCosting, value: flowOverview.dist.costing, icon: <Calculator className="h-3.5 w-3.5" />, color: "hsl(142, 71%, 45%)" },
            { key: "sales", label: t.performance.wipSales, value: flowOverview.dist.sales, icon: <Briefcase className="h-3.5 w-3.5" />, color: "hsl(38, 92%, 50%)" },
            { key: "gm", label: t.performance.wipGm, value: flowOverview.dist.gm, icon: <UserCheck className="h-3.5 w-3.5" />, color: "hsl(0, 84%, 60%)" },
          ];
          const total = segments.reduce((s, x) => s + x.value, 0);

          return (
            <>
              <div className="mt-4">
                <div className="h-3 rounded-full bg-muted/20 overflow-hidden flex">
                  {segments.map((seg) => {
                    const pct = total > 0 ? (seg.value / total) * 100 : 0;
                    return (
                      <div
                        key={seg.key}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: seg.color,
                          opacity: seg.value > 0 ? 0.65 : 0,
                        }}
                        title={`${seg.label}: ${seg.value}`}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
                {segments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted/10 shrink-0"
                      style={{ color: seg.color }}
                    >
                      {seg.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-muted-foreground truncate">{seg.label}</div>
                      <div className="font-semibold text-foreground">{seg.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          );
        })()}
      </Card>

      <div>
        <div>
          <div className="text-sm font-semibold text-foreground">{t.performance.sectionTitle}</div>
          <div className="text-xs text-muted-foreground">{t.performance.sectionDesc}</div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(stageMeta) as StageKey[]).map((key) => {
            const m = metricsByStage[key];
            const meta = stageMeta[key];
            return (
              <button key={key} type="button" onClick={() => openStageDetails(key)} className="text-left">
                <Card className="p-5 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/10"
                          style={{ color: meta.accent }}
                        >
                          {meta.icon}
                        </span>
                        <span className="truncate">{meta.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{meta.desc}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">{t.performance.cardThroughput}</div>
                      <div className="text-lg font-semibold text-foreground">{m.throughput}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-border bg-muted/10 p-3">
                      <div className="text-xs text-muted-foreground">{t.performance.cardMedian}</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {formatHours(m.medianHours)}
                        {t.performance.hoursUnit}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t.performance.cardP90}: {formatHours(m.p90Hours)}
                        {t.performance.hoursUnit}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-muted/10 p-3">
                      <div className="text-xs text-muted-foreground">{t.performance.cardSlaMet}</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{m.slaMetPct}%</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t.performance.samplesLabel}: {m.samples}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div>
                      {t.performance.cardWipNow}: <span className="font-semibold text-foreground">{m.wipNow}</span>
                    </div>
                    <div>
                      {t.performance.cardOldest}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatHours(m.oldestWipHours)}
                        {t.performance.hoursUnit}
                      </span>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto scrollbar-thin">
          <SheetHeader className="pr-8">
            <SheetTitle className="flex items-center gap-2">
              {selectedMeta ? (
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/10"
                  style={{ color: selectedMeta.accent }}
                >
                  {selectedMeta.icon}
                </span>
              ) : null}
              <span>{selectedMeta?.title ?? t.common.loading}</span>
            </SheetTitle>
            <SheetDescription>{selectedMeta?.desc}</SheetDescription>
          </SheetHeader>

          {selected && selectedMeta ? (
            <div className="mt-5 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">{t.performance.drawerThroughput}</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{selected.throughput}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.performance.samplesLabel}: {selected.samples}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">{t.performance.drawerCycleTime}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {t.performance.drawerMedian}: {formatHours(selected.medianHours)}
                    {t.performance.hoursUnit}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {t.performance.drawerP90}: {formatHours(selected.p90Hours)}
                    {t.performance.hoursUnit}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.performance.drawerSlaLabel}: {slaHours}
                    {t.performance.hoursUnit} ({selected.slaMetPct}%)
                  </div>
                </Card>
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-sm font-semibold text-foreground">{t.performance.trendTitle}</div>
                <div className="text-xs text-muted-foreground mb-3">{t.performance.trendDesc}</div>

                <ChartContainer config={trendConfig} className="h-[220px] w-full">
                  <BarChart data={intervalData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey={selectedMeta.barKeyCount}
                      name={t.performance.trendCompleted}
                      fill="hsl(var(--foreground))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>

                <div className="mt-4">
                  <ChartContainer config={trendConfig} className="h-[220px] w-full">
                    <LineChart data={intervalData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        formatter={(value: number) => [`${value}${t.performance.hoursUnit}`, t.performance.trendAvgHours]}
                      />
                      <Line
                        type="monotone"
                        dataKey={selectedMeta.lineKeyAvg}
                        stroke={selectedMeta.accent}
                        strokeWidth={2}
                        dot={{ fill: selectedMeta.accent, strokeWidth: 0, r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </div>

              <div className="bg-background/30 border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.performance.outliersTitleGeneric}</p>
                    <p className="text-xs text-muted-foreground">{t.performance.outliersDescGeneric}</p>
                  </div>
                </div>
                {selected.cycles.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="font-semibold">{t.performance.outliersColRequest}</TableHead>
                        <TableHead className="font-semibold">{t.performance.outliersColClient}</TableHead>
                        <TableHead className="font-semibold">{t.performance.outliersColStart}</TableHead>
                        <TableHead className="font-semibold">{t.performance.outliersColEnd}</TableHead>
                        <TableHead className="font-semibold">{t.performance.outliersColBy}</TableHead>
                        <TableHead className="text-right font-semibold">{t.performance.outliersColHours}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.cycles.map((c) => (
                        <TableRow key={`${c.requestId}-${+c.endAt}`} className="hover:bg-muted/20">
                          <TableCell className="font-medium">
                            <Button variant="link" className="px-0" onClick={() => navigate(`/requests/${c.requestId}`)}>
                              {c.requestId}
                            </Button>
                          </TableCell>
                          <TableCell>{c.clientName}</TableCell>
                          <TableCell className="text-muted-foreground">{format(c.startAt, "MMM d, yyyy HH:mm")}</TableCell>
                          <TableCell className="text-muted-foreground">{format(c.endAt, "MMM d, yyyy HH:mm")}</TableCell>
                          <TableCell className="text-muted-foreground">{c.endBy || "-"}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatHours(c.hours)}
                            {t.performance.hoursUnit}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">{t.performance.noData}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 text-sm text-muted-foreground">{t.performance.noData}</div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default WorkflowPerformance;
