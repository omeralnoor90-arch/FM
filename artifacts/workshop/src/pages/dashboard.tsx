import { useTranslation } from "react-i18next";
import { useGetSummary, useGetSettings, useGetBalances, useGetRecentActivity, getGetSummaryQueryKey, getGetBalancesQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, CreditCard, Banknote, TrendingUp, AlertCircle, Wrench, Briefcase, Receipt } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format } from "date-fns";

export default function Dashboard() {
  const { t } = useTranslation();
  const { data: settings } = useGetSettings();
  const { data: summary, isLoading: loadingSummary, error: summaryError } = useGetSummary({ period: "month" }, { query: { queryKey: getGetSummaryQueryKey({ period: "month" }) } });
  const { data: balances, isLoading: loadingBalances } = useGetBalances({ query: { queryKey: getGetBalancesQueryKey() } });
  const { data: activity, isLoading: loadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });

  const currency = settings?.currency || "SAR";

  if (summaryError) {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("dashboard.error")}</AlertTitle>
          <AlertDescription>{t("dashboard.loadError")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card className="bg-primary text-primary-foreground border-primary-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary-foreground/80">{t("dashboard.cashOnHand")}</CardTitle>
            <Banknote className="h-4 w-4 text-primary-foreground/80" />
          </CardHeader>
          <CardContent>
            {loadingBalances ? (
              <Skeleton className="h-8 w-24 bg-primary-foreground/20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(balances?.cashOnHand || 0, currency)}</div>
                <div className="mt-2 space-y-0.5 text-[11px] text-primary-foreground/60">
                  {(() => {
                    const workerRem = (balances as any)?.sumOfWorkerRemaining ?? 0;
                    const directExp = (balances as any)?.directExpenses ?? 0;
                    const allPts = (balances as any)?.allParts ?? 0;
                    return (
                      <>
                        {workerRem !== 0 && (
                          <div className="flex justify-between gap-2">
                            <span>{workerRem > 0 ? `\u2212 ` : `+ `}{t("dashboard.workerBalancesLbl")}</span>
                            <span className="tabular-nums">{formatCurrency(Math.abs(workerRem), currency)}</span>
                          </div>
                        )}
                        {directExp > 0 && (
                          <div className="flex justify-between gap-2">
                            <span>&minus; {t("dashboard.cashExpensesLbl")}</span>
                            <span className="tabular-nums">{formatCurrency(directExp, currency)}</span>
                          </div>
                        )}
                        {allPts > 0 && (
                          <div className="flex justify-between gap-2">
                            <span>&minus; {t("reports.parts")}</span>
                            <span className="tabular-nums">{formatCurrency(allPts, currency)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="text-primary-foreground/40 pt-0.5">{t("dashboard.allTimeNote")}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        <Card className="bg-secondary text-secondary-foreground border-secondary-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-secondary-foreground/80">{t("dashboard.cardBalance")}</CardTitle>
            <CreditCard className="h-4 w-4 text-secondary-foreground/80" />
          </CardHeader>
          <CardContent>
            {loadingBalances ? (
              <Skeleton className="h-8 w-24 bg-secondary-foreground/20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(balances?.cardBalance || 0, currency)}</div>
                <div className="mt-2 space-y-0.5 text-[11px] text-secondary-foreground/60">
                  <div className="flex justify-between gap-2">
                    <span>{t("dashboard.cardNetLbl")}</span>
                    <span className="tabular-nums">{formatCurrency((balances as any)?.cardNetTotal || 0, currency)}</span>
                  </div>
                  {((balances as any)?.cardDirectExpenses || 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span>&minus; {t("dashboard.cashExpensesLbl")}</span>
                      <span className="tabular-nums">{formatCurrency((balances as any)?.cardDirectExpenses || 0, currency)}</span>
                    </div>
                  )}
                  {((balances as any)?.cardPaidParts || 0) > 0 && (
                    <div className="flex justify-between gap-2">
                      <span>&minus; {t("reports.parts")}</span>
                      <span className="tabular-nums">{formatCurrency((balances as any)?.cardPaidParts || 0, currency)}</span>
                    </div>
                  )}
                  <div className="text-secondary-foreground/40 pt-0.5">{t("dashboard.allTimeNote")}</div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("dashboard.totalVat")}</CardTitle>
            <Receipt className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </CardHeader>
          <CardContent>
            {loadingBalances ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{formatCurrency(balances?.totalVat || 0, currency)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.monthlyProfit")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-500">
                  {formatCurrency(summary?.workshopProfit || 0, currency)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{t("dashboard.formulaMonthlyProfit")}<br /><span className="opacity-70">{t("dashboard.thisMonthNote")}</span></p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("dashboard.jobsThisMonth")}</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.jobCount || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>{t("dashboard.monthlyBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">{t("dashboard.grossIncome")}</span>
                    <span className="font-medium">{formatCurrency(summary?.grossIncome || 0, currency)}</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                    <div className="h-full bg-primary" style={{ width: `${((summary?.cashIncome || 0) / (summary?.grossIncome || 1)) * 100}%` }} />
                    <div className="h-full bg-secondary" style={{ width: `${((summary?.cardIncome || 0) / (summary?.grossIncome || 1)) * 100}%` }} />
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /> {t("dashboard.cash")}</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-secondary" /> {t("dashboard.card")}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("dashboard.workerPayouts")}</p>
                    <p className="text-lg font-medium text-destructive">{formatCurrency(summary?.workerPayouts || 0, currency)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("dashboard.partsExpenses")}</p>
                    <p className="text-lg font-medium text-destructive">{formatCurrency((summary?.partsCost || 0) + (summary?.generalExpenses || 0), currency)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {loadingActivity ? (
              <div className="space-y-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-4">
                {activity.map((item) => (
                  <div key={item.id} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      {item.kind === 'job' && <Briefcase className="w-4 h-4 text-primary" />}
                      {item.kind === 'expense' && <CreditCard className="w-4 h-4 text-destructive" />}
                      {item.kind === 'part' && <Wrench className="w-4 h-4 text-secondary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(item.occurredAt), 'MMM d, h:mm a')}</p>
                    </div>
                    <div className={`text-sm font-medium whitespace-nowrap ${item.kind === 'job' ? 'text-emerald-600 dark:text-emerald-500' : 'text-foreground'}`}>
                      {item.kind === 'job' ? '+' : '-'}{formatCurrency(item.amount, currency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground pb-8">
                <Activity className="w-8 h-8 mb-2 opacity-20" />
                <p className="text-sm">{t("dashboard.noActivity")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
