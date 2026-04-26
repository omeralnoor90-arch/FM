import { useAuth } from "@/contexts/auth-context";
import { useGetWorkerLedger, useGetWorker } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, Banknote, Receipt } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

export default function WorkerHome() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const workerId = user?.workerId;

  const now = new Date();
  const from = format(startOfMonth(now), "yyyy-MM-dd");
  const to = format(endOfMonth(now), "yyyy-MM-dd");

  const { data: worker } = useGetWorker(workerId!, { query: { enabled: !!workerId } });
  const { data: ledger, isLoading } = useGetWorkerLedger(workerId!, { from, to }, {
    query: { enabled: !!workerId, staleTime: 0, refetchOnMount: "always" as const },
  });

  const net = ledger != null ? ledger.netBalance : null;

  return (
    <div className="space-y-4 pb-4">
      <div className="pt-2">
        <h1 className="text-white text-xl font-bold">
          {t("portal.hello")} {worker?.name ?? user?.username} 👋
        </h1>
        <p className="text-zinc-400 text-sm mt-0.5">{format(now, "MMMM yyyy")} {t("portal.monthSummary")}</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 bg-zinc-800" />)}
        </div>
      ) : (
        <>
          <Card className={`border ${net !== null && net >= 0 ? "border-green-700 bg-green-950/40" : "border-red-700 bg-red-950/40"}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-zinc-400 text-xs uppercase tracking-wider mb-1">{t("portal.netPay")}</p>
                  <p className={`text-2xl font-bold ${net !== null && net >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {net !== null ? formatCurrency(Math.abs(net)) : "—"}
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    {net !== null && net >= 0 ? t("portal.workshopOwes") : t("portal.youOwe")}
                  </p>
                </div>
                <Wallet className="text-zinc-600" size={32} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4">
                <TrendingUp size={18} className="text-blue-400 mb-2" />
                <p className="text-zinc-400 text-xs">{t("portal.earned")}</p>
                <p className="text-white font-semibold">{ledger ? formatCurrency(ledger.totalEarned) : "—"}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4">
                <Banknote size={18} className="text-yellow-400 mb-2" />
                <p className="text-zinc-400 text-xs">{t("portal.cashCollected")}</p>
                <p className="text-white font-semibold">{ledger ? formatCurrency(ledger.totalCashCollected) : "—"}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4">
                <Receipt size={18} className="text-purple-400 mb-2" />
                <p className="text-zinc-400 text-xs">{t("portal.reimbursements")}</p>
                <p className="text-white font-semibold">{ledger ? formatCurrency(ledger.totalReimbursements) : "—"}</p>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4">
                <Wallet size={18} className="text-orange-400 mb-2" />
                <p className="text-zinc-400 text-xs">{t("portal.deductions")}</p>
                <p className="text-white font-semibold">{ledger ? formatCurrency(ledger.totalDeductions) : "—"}</p>
              </CardContent>
            </Card>
          </div>

          {ledger?.entries && ledger.entries.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">{t("portal.recentTransactions")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ledger.entries.slice(0, 5).map((entry, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-zinc-800 last:border-0">
                      <div>
                        <p className="text-zinc-300 text-sm">{entry.label}</p>
                        <p className="text-zinc-500 text-xs">{format(new Date(entry.date), "MMM d")}</p>
                      </div>
                      <span className={`text-sm font-medium font-mono ${(entry.sign ?? 1) > 0 ? "text-green-400" : "text-red-400"}`}>
                        {(entry.sign ?? 1) > 0 ? "+" : "-"}{formatCurrency(entry.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
