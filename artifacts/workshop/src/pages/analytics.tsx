import { useState } from "react";
import { useTranslation } from "react-i18next";
import { 
  useGetSummary, 
  useGetByWorker, 
  useGetTimeseries,
  useGetSettings,
  getGetSummaryQueryKey,
  getGetByWorkerQueryKey,
  getGetTimeseriesQueryKey
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import { 
  ToggleGroup,
  ToggleGroupItem 
} from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Analytics() {
  const [period, setPeriod] = useState<"week" | "month" | "all">("month");
  const { t } = useTranslation();
  
  const { data: settings } = useGetSettings();
  const currency = settings?.currency || "SAR";

  const { data: summary, isLoading: loadingSummary } = useGetSummary({ period }, {
    query: { queryKey: getGetSummaryQueryKey({ period }) }
  });

  const { data: workerStats, isLoading: loadingWorkers } = useGetByWorker({ period }, {
    query: { queryKey: getGetByWorkerQueryKey({ period }) }
  });

  const bucket = period === "week" ? "day" : period === "month" ? "week" : "month";
  const { data: timeseries, isLoading: loadingTimeseries } = useGetTimeseries({ period, bucket }, {
    query: { queryKey: getGetTimeseriesQueryKey({ period, bucket }) }
  });

  const pieData = summary ? [
    { name: t("dashboard.cash"), value: summary.cashIncome, color: 'hsl(var(--emerald-500))' },
    { name: t("dashboard.card"), value: summary.cardIncome, color: 'hsl(var(--secondary))' }
  ] : [];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-3 rounded shadow-md">
          <p className="text-sm font-medium mb-2">{label}</p>
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-muted-foreground">{p.name}:</span>
              <span className="font-mono font-medium">{formatCurrency(p.value, currency)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("analytics.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("analytics.subtitle")}</p>
        </div>
        
        <ToggleGroup type="single" value={period} onValueChange={(val) => val && setPeriod(val as any)} className="bg-card border border-border">
          <ToggleGroupItem value="week">{t("analytics.period.week")}</ToggleGroupItem>
          <ToggleGroupItem value="month">{t("analytics.period.month")}</ToggleGroupItem>
          <ToggleGroupItem value="all">{t("workerDetail.period.all")}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("analytics.revenue")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold">{formatCurrency(summary?.grossIncome || 0, currency)}</div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("analytics.netIncome")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold">{formatCurrency(summary?.netIncome || 0, currency)}</div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("dashboard.totalVat")}</CardTitle>
            <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(summary?.cardFees || 0, currency)}</div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary">{t("analytics.profit")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold text-primary">{formatCurrency(summary?.workshopProfit || 0, currency)}</div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm border-destructive/20 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">{t("analytics.expenses")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-2xl font-bold text-destructive">
                {formatCurrency((summary?.generalExpenses || 0) + (summary?.partsCost || 0), currency)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle>{t("analytics.revenue")} / {t("analytics.expenses")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTimeseries ? (
              <Skeleton className="h-[300px] w-full" />
            ) : timeseries && timeseries.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="bucket" 
                      tickFormatter={(val) => {
                        if (!val) return '';
                        const date = new Date(val);
                        if (isNaN(date.getTime())) return String(val);
                        return bucket === 'day' ? format(date, 'EEE') : format(date, 'MMM d');
                      }}
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(val) => `${Number(val).toLocaleString()} ${currency}`}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="income" name={t("analytics.revenue")} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="expenses" name={t("analytics.expenses")} stroke="hsl(var(--destructive))" strokeWidth={2} />
                    <Line type="monotone" dataKey="profit" name={t("analytics.profit")} stroke="hsl(var(--emerald-500))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full flex items-center justify-center text-muted-foreground">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{t("dashboard.cash")} / {t("dashboard.card")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-[300px] w-full" />
            ) : summary?.grossIncome ? (
              <div className="h-[300px] w-full flex flex-col">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full flex items-center justify-center text-muted-foreground">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle>{t("workers.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingWorkers ? (
              <Skeleton className="h-[300px] w-full" />
            ) : workerStats && workerStats.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={workerStats} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="name" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(val) => `${Number(val).toLocaleString()} ${currency}`}
                    />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="grossIncome" name={t("analytics.revenue")} fill="hsl(var(--chart-4))" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="workerEarned" name={t("workers.totalEarned")} fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="workshopEarned" name={t("nav.dashboard")} fill="hsl(var(--secondary))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] w-full flex items-center justify-center text-muted-foreground">
                {t("common.noData")}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
