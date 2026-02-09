import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays, startOfDay, startOfWeek, startOfMonth, startOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, isWithinInterval } from 'date-fns';
import { TrendingUp, Calendar, Clock, FileText, MessageSquare, Gauge } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, ReferenceLine } from 'recharts';
import { CustomerRequest } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface MetricsChartsProps {
  requests: CustomerRequest[];
}

type TimePeriod = 'day' | 'week' | 'month' | 'last30' | 'last90' | 'year';

const COLORS = [
  'hsl(221, 83%, 53%)',  // Blue
  'hsl(142, 71%, 45%)',  // Green
  'hsl(38, 92%, 50%)',   // Orange
  'hsl(280, 87%, 60%)',  // Purple
  'hsl(0, 84%, 60%)',    // Red
  'hsl(180, 70%, 45%)',  // Teal
  'hsl(320, 70%, 55%)',  // Pink
  'hsl(60, 70%, 45%)',   // Yellow
];

const DESIGN_REPLY_STATUSES = ['under_review', 'clarification_needed', 'feasibility_confirmed', 'design_result'] as const;
const TOTAL_SERIES_KEY = '__total';

const getTimeRange = (period: TimePeriod): { start: Date; end: Date; groupBy: 'day' | 'week' | 'month' } => {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  switch (period) {
    case 'day':
      return { start: startOfDay(now), end: endOfToday, groupBy: 'day' };
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfToday, groupBy: 'day' };
    case 'month':
      return { start: startOfMonth(now), end: endOfToday, groupBy: 'day' };
    case 'last30':
      return { start: subDays(endOfToday, 30), end: endOfToday, groupBy: 'day' };
    case 'last90':
      return { start: subDays(endOfToday, 90), end: endOfToday, groupBy: 'week' };
    case 'year':
      return { start: startOfYear(now), end: endOfToday, groupBy: 'month' };
    default:
      return { start: subDays(endOfToday, 30), end: endOfToday, groupBy: 'day' };
  }
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
  if (!Number.isFinite(hours)) return '-';
  return `${hours.toFixed(1)}`;
};

const MetricsCharts: React.FC<MetricsChartsProps> = ({ requests }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [period, setPeriod] = useState<TimePeriod>('last30');
  const [activeTab, setActiveTab] = useState<'requests' | 'replies' | 'response'>('requests');
  const [showTotalSeries, setShowTotalSeries] = useState(true);
  const [slaHours, setSlaHours] = useState<number>(24);

  const timeRange = useMemo(() => getTimeRange(period), [period]);
  const { start, end, groupBy } = timeRange;

  const intervals = useMemo(() => {
    if (groupBy === 'day') return eachDayOfInterval({ start, end });
    if (groupBy === 'week') return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
    return eachMonthOfInterval({ start, end });
  }, [groupBy, start, end]);

  const intervalLabel = (date: Date) => (groupBy === 'month' ? format(date, 'MMM yyyy') : format(date, 'MMM dd'));

  const intervalEnd = (date: Date) => {
    if (groupBy === 'day') return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
    if (groupBy === 'week') return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  };

  const pickIntervalStartForTimestamp = (ts: Date) => {
    for (const d of intervals) {
      if (isWithinInterval(ts, { start: d, end: intervalEnd(d) })) return d;
    }
    return null;
  };

  const requestsPerSalesData = useMemo(() => {
    const people = Array.from(new Set(requests.map(r => r.createdByName))).filter(Boolean);
    const bucket: Record<string, Record<string, number>> = {};
    const totalByLabel: Record<string, number> = {};

    intervals.forEach((d) => {
      const label = intervalLabel(d);
      bucket[label] = {};
      totalByLabel[label] = 0;
      people.forEach((p) => { bucket[label][p] = 0; });
    });

    requests.forEach((r) => {
      if (!r.createdByName) return;
      const createdAt = new Date(r.createdAt);
      if (!isWithinInterval(createdAt, { start, end })) return;
      const d = pickIntervalStartForTimestamp(createdAt);
      if (!d) return;
      const label = intervalLabel(d);
      bucket[label][r.createdByName] = (bucket[label][r.createdByName] ?? 0) + 1;
      totalByLabel[label] = (totalByLabel[label] ?? 0) + 1;
    });

    const data = intervals.map((d) => {
      const label = intervalLabel(d);
      const point: Record<string, any> = { date: label };
      people.forEach((p) => { point[p] = bucket[label]?.[p] ?? 0; });
      point[TOTAL_SERIES_KEY] = totalByLabel[label] ?? 0;
      return point;
    });

    return { data, people };
  }, [requests, intervals, start, end, groupBy]);

  const repliesPerDesignerData = useMemo(() => {
    const peopleSet = new Set<string>();
    requests.forEach((r) => {
      r.history.forEach((h) => {
        if ((DESIGN_REPLY_STATUSES as readonly string[]).includes(h.status) && h.userName) {
          peopleSet.add(h.userName);
        }
      });
    });
    const people = Array.from(peopleSet).filter(Boolean);

    const bucket: Record<string, Record<string, number>> = {};
    const totalByLabel: Record<string, number> = {};
    intervals.forEach((d) => {
      const label = intervalLabel(d);
      bucket[label] = {};
      totalByLabel[label] = 0;
      people.forEach((p) => { bucket[label][p] = 0; });
    });

    requests.forEach((r) => {
      r.history.forEach((h) => {
        if (!(DESIGN_REPLY_STATUSES as readonly string[]).includes(h.status)) return;
        if (!h.userName) return;
        const ts = new Date(h.timestamp);
        if (!isWithinInterval(ts, { start, end })) return;
        const d = pickIntervalStartForTimestamp(ts);
        if (!d) return;
        const label = intervalLabel(d);
        bucket[label][h.userName] = (bucket[label][h.userName] ?? 0) + 1;
        totalByLabel[label] = (totalByLabel[label] ?? 0) + 1;
      });
    });

    const data = intervals.map((d) => {
      const label = intervalLabel(d);
      const point: Record<string, any> = { date: label };
      people.forEach((p) => { point[p] = bucket[label]?.[p] ?? 0; });
      point[TOTAL_SERIES_KEY] = totalByLabel[label] ?? 0;
      return point;
    });

    return { data, people };
  }, [requests, intervals, start, end, groupBy]);

  const responseTimeData = useMemo(() => {
    const bucket: Record<string, number[]> = {};
    intervals.forEach((d) => { bucket[intervalLabel(d)] = []; });

    type Outlier = {
      requestId: string;
      clientName: string;
      submittedAt: string;
      repliedAt: string;
      repliedBy: string;
      hours: number;
    };
    const outliers: Outlier[] = [];

    requests.forEach((r) => {
      const submitted = r.history.find(h => h.status === 'submitted');
      if (!submitted) return;

      const replies = r.history
        .filter(h => (DESIGN_REPLY_STATUSES as readonly string[]).includes(h.status))
        .map(h => ({ ...h, ts: new Date(h.timestamp).getTime() }))
        .filter(h => Number.isFinite(h.ts));

      if (replies.length === 0) return;
      replies.sort((a, b) => a.ts - b.ts);
      const firstReply = replies[0];

      const replyTime = new Date(firstReply.timestamp);
      if (!isWithinInterval(replyTime, { start, end })) return;

      const submittedTime = new Date(submitted.timestamp);
      const diffHours = (replyTime.getTime() - submittedTime.getTime()) / (1000 * 60 * 60);
      if (diffHours < 0) return;

      const d = pickIntervalStartForTimestamp(replyTime);
      if (!d) return;
      const label = intervalLabel(d);
      bucket[label].push(diffHours);

      outliers.push({
        requestId: r.id,
        clientName: r.clientName || '-',
        submittedAt: submitted.timestamp,
        repliedAt: firstReply.timestamp,
        repliedBy: firstReply.userName || '-',
        hours: Number(diffHours.toFixed(1)),
      });
    });

    const data = intervals.map((d) => {
      const label = intervalLabel(d);
      const values = bucket[label] || [];
      const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
      return {
        date: label,
        avgHours: Number(avg.toFixed(1)),
        count: values.length,
      };
    });

    outliers.sort((a, b) => b.hours - a.hours);
    const allValues = Object.values(bucket).flat();

    return { data, outliers: outliers.slice(0, 10), allValues };
  }, [requests, intervals, start, end, groupBy]);

  // Build chart configs
  const requestsChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    requestsPerSalesData.people.forEach((person, index) => {
      config[person] = {
        label: person,
        color: COLORS[index % COLORS.length],
      };
    });
    if (showTotalSeries) {
      config[TOTAL_SERIES_KEY] = {
        label: t.performance.totalSeries,
        color: 'hsl(0, 0%, 100%)',
      };
    }
    return config;
  }, [requestsPerSalesData.people, showTotalSeries, t.performance.totalSeries]);

  const repliesChartConfig: ChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    repliesPerDesignerData.people.forEach((person, index) => {
      config[person] = {
        label: person,
        color: COLORS[index % COLORS.length],
      };
    });
    if (showTotalSeries) {
      config[TOTAL_SERIES_KEY] = {
        label: t.performance.totalSeries,
        color: 'hsl(0, 0%, 100%)',
      };
    }
    return config;
  }, [repliesPerDesignerData.people, showTotalSeries, t.performance.totalSeries]);

  const responseChartConfig: ChartConfig = {
    avgHours: {
      label: t.performance.avgResponseHours,
      color: 'hsl(221, 83%, 53%)',
    },
  };

  const overview = useMemo(() => {
    const newRequests = requests.filter((r) => {
      const createdAt = new Date(r.createdAt);
      return isWithinInterval(createdAt, { start, end });
    }).length;

    let designReplies = 0;
    requests.forEach((r) => {
      r.history.forEach((h) => {
        if (!(DESIGN_REPLY_STATUSES as readonly string[]).includes(h.status)) return;
        const ts = new Date(h.timestamp);
        if (isWithinInterval(ts, { start, end })) designReplies++;
      });
    });

    const values = responseTimeData.allValues;
    const avg = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    const median = quantile(values, 0.5);
    const p90 = quantile(values, 0.9);
    const met = values.length ? Math.round((values.filter(v => v <= slaHours).length / values.length) * 100) : 0;

    return {
      newRequests,
      designReplies,
      avgHours: Number(avg.toFixed(1)),
      medianHours: Number(median.toFixed(1)),
      p90Hours: Number(p90.toFixed(1)),
      slaMetPct: met,
      samples: values.length,
    };
  }, [requests, start, end, responseTimeData.allValues, slaHours]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t.performance.kpiNewRequests}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{overview.newRequests}</p>
            </div>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t.performance.kpiDesignReplies}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{overview.designReplies}</p>
            </div>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t.performance.kpiAvgResponse}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formatHours(overview.avgHours)}{t.performance.hoursUnit}</p>
            </div>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t.performance.kpiMedian}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formatHours(overview.medianHours)}{t.performance.hoursUnit}</p>
            </div>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Gauge className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t.performance.kpiP90}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{formatHours(overview.p90Hours)}{t.performance.hoursUnit}</p>
            </div>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t.performance.kpiSlaMet}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{overview.slaMetPct}%</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.performance.samplesLabel}: {overview.samples}</p>
            </div>
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </div>
          </div>
        </Card>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">{t.performance.metricsTitle}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={period} onValueChange={(value) => setPeriod(value as TimePeriod)}>
                <SelectTrigger className="w-[160px]">
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
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTotalSeries((v) => !v)}
              className={showTotalSeries ? 'border-primary text-primary' : ''}
              title={t.performance.toggleTotalSeries}
            >
              {t.performance.totalSeries}
            </Button>

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
                className="h-9 w-[90px]"
              />
            </div>
          </div>
        </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="requests" className="text-xs sm:text-sm px-2 py-1.5">{t.performance.tabRequestsSales}</TabsTrigger>
          <TabsTrigger value="replies" className="text-xs sm:text-sm px-2 py-1.5">{t.performance.tabRepliesDesigner}</TabsTrigger>
          <TabsTrigger value="response" className="text-xs sm:text-sm px-2 py-1.5">{t.performance.tabResponseTime}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-0">
          {requestsPerSalesData.people.length > 0 ? (
            <div className="space-y-4">
              <ChartContainer config={requestsChartConfig} className="h-[250px] sm:h-[300px] w-full">
                <LineChart data={requestsPerSalesData.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    className="text-muted-foreground"
                    width={30}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {showTotalSeries && (
                    <Line
                      type="monotone"
                      dataKey={TOTAL_SERIES_KEY}
                      stroke="hsl(0, 0%, 100%)"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )}
                  {requestsPerSalesData.people.map((person, index) => (
                    <Line
                      key={person}
                      type="monotone"
                      dataKey={person}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={{ fill: COLORS[index % COLORS.length], strokeWidth: 0, r: 2 }}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {showTotalSeries && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-3 h-3 rounded-full bg-white" />
                    <span className="text-muted-foreground">{t.performance.totalSeries}</span>
                  </div>
                )}
                {requestsPerSalesData.people.map((person, index) => (
                  <div key={person} className="flex items-center gap-1.5 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-muted-foreground">{person}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              {t.performance.noData}
            </div>
          )}
        </TabsContent>

        <TabsContent value="replies" className="mt-0">
          {repliesPerDesignerData.people.length > 0 ? (
            <div className="space-y-4">
              <ChartContainer config={repliesChartConfig} className="h-[250px] sm:h-[300px] w-full">
                <LineChart data={repliesPerDesignerData.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={30}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  {showTotalSeries && (
                    <Line
                      type="monotone"
                      dataKey={TOTAL_SERIES_KEY}
                      stroke="hsl(0, 0%, 100%)"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  )}
                  {repliesPerDesignerData.people.map((person, index) => (
                    <Line
                      key={person}
                      type="monotone"
                      dataKey={person}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={{ fill: COLORS[index % COLORS.length], strokeWidth: 0, r: 2 }}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {showTotalSeries && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-3 h-3 rounded-full bg-white" />
                    <span className="text-muted-foreground">{t.performance.totalSeries}</span>
                  </div>
                )}
                {repliesPerDesignerData.people.map((person, index) => (
                  <div key={person} className="flex items-center gap-1.5 text-xs">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-muted-foreground">{person}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              {t.performance.noData}
            </div>
          )}
        </TabsContent>

        <TabsContent value="response" className="mt-0">
          <ChartContainer config={responseChartConfig} className="h-[250px] sm:h-[300px] w-full">
            <BarChart data={responseTimeData.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 10 }} 
                tickLine={false}
                axisLine={false}
                width={40}
                label={{ value: t.performance.hoursLabel, angle: -90, position: 'insideLeft', fontSize: 10, offset: 10 }}
              />
              <ChartTooltip 
                content={<ChartTooltipContent />}
                formatter={(value: number) => [`${value}${t.performance.hoursUnit}`, t.performance.avgResponseLabel]}
              />
              <ReferenceLine
                y={slaHours}
                stroke="hsl(38, 92%, 50%)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
              />
              <Bar 
                dataKey="avgHours" 
                fill="hsl(221, 83%, 53%)" 
                radius={[4, 4, 0, 0]}
                name={t.performance.avgResponseHours}
              />
            </BarChart>
          </ChartContainer>

          <div className="mt-6 bg-background/30 border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
              <div>
                <p className="text-sm font-semibold text-foreground">{t.performance.outliersTitle}</p>
                <p className="text-xs text-muted-foreground">{t.performance.outliersDesc}</p>
              </div>
            </div>
            {responseTimeData.outliers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-semibold">{t.performance.outliersColRequest}</TableHead>
                    <TableHead className="font-semibold">{t.performance.outliersColClient}</TableHead>
                    <TableHead className="font-semibold">{t.performance.outliersColSubmitted}</TableHead>
                    <TableHead className="font-semibold">{t.performance.outliersColReplied}</TableHead>
                    <TableHead className="font-semibold">{t.performance.outliersColBy}</TableHead>
                    <TableHead className="text-right font-semibold">{t.performance.outliersColHours}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responseTimeData.outliers.map((o) => (
                    <TableRow key={`${o.requestId}-${o.repliedAt}`} className="hover:bg-muted/20">
                      <TableCell className="font-medium">
                        <Button variant="link" className="px-0" onClick={() => navigate(`/requests/${o.requestId}`)}>
                          {o.requestId}
                        </Button>
                      </TableCell>
                      <TableCell>{o.clientName}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(o.submittedAt), 'MMM d, yyyy HH:mm')}</TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(o.repliedAt), 'MMM d, yyyy HH:mm')}</TableCell>
                      <TableCell className="text-muted-foreground">{o.repliedBy}</TableCell>
                      <TableCell className="text-right font-semibold">{formatHours(o.hours)}{t.performance.hoursUnit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">{t.performance.noData}</div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    </div>
  );
};

export default MetricsCharts;
