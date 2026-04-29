import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, addDays, addWeeks, addMonths } from "date-fns";
import {
  useGetWorker,
  useGetWorkerLedger,
  useGetSettings,
  useListWorkers,
  getGetWorkerQueryKey,
  getGetWorkerLedgerQueryKey,
  getGetByWorkerQueryKey,
  getGetBalancesQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  User,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Banknote,
  Receipt,
  MinusCircle,
  Wallet,
  ArrowLeft,
  Clock,
  Loader2,
  BanknoteIcon,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PeriodMode = "day" | "week" | "month" | "all";

function getPeriodBounds(mode: PeriodMode, anchor: Date): { from: string | undefined; to: string | undefined; label: string } {
  if (mode === "all") {
    return { from: undefined, to: undefined, label: "all" };
  }
  if (mode === "day") {
    const s = startOfDay(anchor);
    const e = endOfDay(anchor);
    return {
      from: format(s, "yyyy-MM-dd"),
      to: format(e, "yyyy-MM-dd"),
      label: format(anchor, "EEEE, MMMM d, yyyy"),
    };
  }
  if (mode === "week") {
    const s = startOfWeek(anchor, { weekStartsOn: 1 });
    const e = endOfWeek(anchor, { weekStartsOn: 1 });
    return {
      from: format(s, "yyyy-MM-dd"),
      to: format(e, "yyyy-MM-dd"),
      label: `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`,
    };
  }
  const s = startOfMonth(anchor);
  const e = endOfMonth(anchor);
  return {
    from: format(s, "yyyy-MM-dd"),
    to: format(e, "yyyy-MM-dd"),
    label: format(anchor, "MMMM yyyy"),
  };
}

function navigatePeriod(mode: PeriodMode, anchor: Date, dir: -1 | 1): Date {
  if (mode === "day") return addDays(anchor, dir);
  if (mode === "week") return addWeeks(anchor, dir);
  if (mode === "month") return addMonths(anchor, dir);
  return anchor;
}

const TYPE_BADGE: Record<string, string> = {
  job_earned: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  cash_collected: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  expense_reimbursement: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  advance_deduction: "bg-red-500/10 text-red-700 border-red-500/30",
  worker_payment: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  transfer_sent: "bg-teal-500/10 text-teal-700 border-teal-500/30",
  transfer_received: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  worker_debt: "bg-rose-500/10 text-rose-700 border-rose-500/30",
  worker_owes: "bg-orange-500/10 text-orange-700 border-orange-500/30",
};

const TYPE_SIGN: Record<string, number> = {
  job_earned: 1,
  cash_collected: -1,
  expense_reimbursement: 1,
  advance_deduction: -1,
  worker_payment: -1,
  transfer_sent: 1,
  transfer_received: -1,
  worker_debt: -1,
  worker_owes: -1,
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function WorkerDetail() {
  const [, params] = useRoute("/workers/:id");
  const workerId = Number(params?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());

  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payNote, setPayNote] = useState("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [paySource, setPaySource] = useState<"cash" | "worker">("cash");
  const [payByWorkerId, setPayByWorkerId] = useState<string>("");

  const { data: settings } = useGetSettings();
  const currency = settings?.currency || "SAR";

  const invalidateLedger = () => {
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === "string" && key.startsWith(`/api/workers/${workerId}`);
      },
    });
  };

  const checkboxMutation = useMutation({
    mutationFn: async ({ entryId, paid }: { entryId: string; paid: boolean }) => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/ledger-payment`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, paid }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: invalidateLedger,
    onError: () => {
      toast({ title: t("common.error"), description: t("jobs.error"), variant: "destructive" });
    },
  });

  const payWorkerMutation = useMutation({
    mutationFn: async ({ amount, note, paidByWorkerId }: { amount: number; note: string; paidByWorkerId?: number }) => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: note || t("workerDetail.paymentNote"), paidByWorkerId }),
      });
      if (!res.ok) throw new Error("Failed to record payment");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("workerDetail.paymentRecorded") });
      setPayDialogOpen(false);
      setPayNote("");
      setPayAmount("");
      setPaySource("cash");
      setPayByWorkerId("");
      invalidateLedger();
      // Invalidate adjustments in case a reimbursement was created for another worker
      queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].includes("/adjustments") });
      // Invalidate the Workers page summary and dashboard cash balance
      queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  // ── Delete payment (undo payout) ──────────────────────────────────────────
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/payments/${paymentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete payment");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("workerDetail.paymentDeleted") });
      setDeletePaymentId(null);
      invalidateLedger();
      queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  // ── Adjustments state ──────────────────────────────────────────────────────
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [editingAdj, setEditingAdj] = useState<{ id?: number; type: string; amount: string; description: string; occurredAt: string } | null>(null);
  const [deleteAdjId, setDeleteAdjId] = useState<number | null>(null);

  const { data: adjustments, refetch: refetchAdj } = useQuery({
    queryKey: [`/api/workers/${workerId}/adjustments`],
    enabled: !!workerId,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/adjustments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load adjustments");
      return res.json() as Promise<Array<{ id: number; workerId: number; type: string; amount: number; description: string; occurredAt: string }>>;
    },
    staleTime: 0,
  });

  const invalidateAll = () => {
    invalidateLedger();
    refetchAdj();
    queryClient.invalidateQueries({ queryKey: [`/api/workers/${workerId}/adjustments`] });
  };

  const saveAdjMutation = useMutation({
    mutationFn: async (data: { id?: number; type: string; amount: number; description: string; occurredAt: string }) => {
      const url = data.id
        ? `${BASE}/api/workers/${workerId}/adjustments/${data.id}`
        : `${BASE}/api/workers/${workerId}/adjustments`;
      const res = await fetch(url, {
        method: data.id ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: data.type, amount: data.amount, description: data.description, occurredAt: data.occurredAt }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_r, vars) => {
      toast({ title: vars.id ? t("workerDetail.adjustments.updated") : t("workerDetail.adjustments.created") });
      setAdjDialogOpen(false);
      setEditingAdj(null);
      invalidateAll();
    },
    onError: () => {
      toast({ title: t("workerDetail.adjustments.error"), variant: "destructive" });
    },
  });

  const deleteAdjMutation = useMutation({
    mutationFn: async (adjId: number) => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/adjustments/${adjId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("workerDetail.adjustments.deleted") });
      setDeleteAdjId(null);
      invalidateAll();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const openAddAdj = () => {
    setEditingAdj({ type: "reimbursement", amount: "", description: "", occurredAt: format(new Date(), "yyyy-MM-dd") });
    setAdjDialogOpen(true);
  };

  const openEditAdj = (adj: { id: number; type: string; amount: number; description: string; occurredAt: string }) => {
    setEditingAdj({ id: adj.id, type: adj.type, amount: String(adj.amount), description: adj.description, occurredAt: format(new Date(adj.occurredAt), "yyyy-MM-dd") });
    setAdjDialogOpen(true);
  };

  // ── Debts state ────────────────────────────────────────────────────────────
  type DebtItem = { id: number; workerId: number; amount: number; description: string; collected: boolean; collectedAt: string | null; occurredAt: string };
  const [debtDialogOpen, setDebtDialogOpen] = useState(false);
  const [editingDebt, setEditingDebt] = useState<{ id?: number; amount: string; description: string; occurredAt: string } | null>(null);
  const [deleteDebtId, setDeleteDebtId] = useState<number | null>(null);

  const { data: debts, refetch: refetchDebts } = useQuery({
    queryKey: [`/api/workers/${workerId}/debts`],
    enabled: !!workerId,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/debts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load debts");
      return res.json() as Promise<DebtItem[]>;
    },
    staleTime: 0,
  });

  const invalidateAllWithDebts = () => {
    invalidateLedger();
    refetchAdj();
    refetchDebts();
    queryClient.invalidateQueries({ queryKey: [`/api/workers/${workerId}/adjustments`] });
    queryClient.invalidateQueries({ queryKey: [`/api/workers/${workerId}/debts`] });
  };

  const saveDebtMutation = useMutation({
    mutationFn: async (data: { id?: number; amount: number; description: string; occurredAt: string }) => {
      const url = data.id
        ? `${BASE}/api/workers/${workerId}/debts/${data.id}`
        : `${BASE}/api/workers/${workerId}/debts`;
      const res = await fetch(url, {
        method: data.id ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: data.amount, description: data.description, occurredAt: data.occurredAt }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (_r, vars) => {
      toast({ title: vars.id ? t("workerDetail.debts.updated") : t("workerDetail.debts.created") });
      setDebtDialogOpen(false);
      setEditingDebt(null);
      invalidateAllWithDebts();
    },
    onError: () => {
      toast({ title: t("workerDetail.debts.error"), variant: "destructive" });
    },
  });

  const toggleDebtCollectedMutation = useMutation({
    mutationFn: async ({ debtId, collected }: { debtId: number; collected: boolean }) => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/debts/${debtId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collected }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      invalidateAllWithDebts();
    },
    onError: () => {
      toast({ title: t("workerDetail.debts.error"), variant: "destructive" });
    },
  });

  const deleteDebtMutation = useMutation({
    mutationFn: async (debtId: number) => {
      const res = await fetch(`${BASE}/api/workers/${workerId}/debts/${debtId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: t("workerDetail.debts.deleted") });
      setDeleteDebtId(null);
      invalidateAllWithDebts();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const openAddDebt = () => {
    setEditingDebt({ amount: "", description: "", occurredAt: format(new Date(), "yyyy-MM-dd") });
    setDebtDialogOpen(true);
  };

  const openEditDebt = (d: DebtItem) => {
    setEditingDebt({ id: d.id, amount: String(d.amount), description: d.description, occurredAt: format(new Date(d.occurredAt), "yyyy-MM-dd") });
    setDebtDialogOpen(true);
  };

  const { data: worker, isLoading: loadingWorker } = useGetWorker(workerId, {
    query: { enabled: !!workerId, queryKey: getGetWorkerQueryKey(workerId), staleTime: 0 },
  });

  // All active workers (for the "another worker pays" picker — excludes the current worker)
  const { data: allWorkers } = useListWorkers({ query: { staleTime: 60_000 } });
  const otherWorkers = (allWorkers ?? []).filter((w) => w.id !== workerId && w.active);

  const { from, to, label } = getPeriodBounds(periodMode, anchor);

  const { data: ledger, isLoading: loadingLedger } = useGetWorkerLedger(
    workerId,
    { from, to },
    {
      query: {
        enabled: !!workerId,
        queryKey: getGetWorkerLedgerQueryKey(workerId, { from, to }),
        staleTime: 0,
        refetchOnMount: "always",
      },
    },
  );

  const goToday = () => setAnchor(new Date());
  const goPrev = () => setAnchor((a) => navigatePeriod(periodMode, a, -1));
  const goNext = () => setAnchor((a) => navigatePeriod(periodMode, a, 1));

  if (loadingWorker) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!worker) {
    return <div className="p-8 text-center text-muted-foreground">{t("common.noData")}</div>;
  }

  // Compute net from ALL visible entries (including payments) so "Paid Out" reduces the displayed net
  const net = (ledger?.entries ?? []).reduce((s, e) => s + e.amount * (TYPE_SIGN[e.type] ?? 1), 0);
  const remaining = ledger?.remainingBalance ?? 0;
  const isOwed = net >= 0;
  const hasRemaining = remaining > 0.005;

  const periodLabels: Record<PeriodMode, string> = {
    day: t("workerDetail.period.day"),
    week: t("workerDetail.period.week"),
    month: t("workerDetail.period.month"),
    all: t("workerDetail.period.all"),
  };

  const displayLabel = periodMode === "all" ? t("workerDetail.period.all") : label;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <Link href="/workers">
          <a className="mt-1 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          </a>
        </Link>
        <div className="flex-1 flex flex-col md:flex-row justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <User className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{worker.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="font-mono text-xs">
                  {worker.workerPercent}% / {worker.workshopPercent}%
                </Badge>
                {!worker.active && (
                  <Badge variant="destructive" className="bg-destructive/10 text-destructive border-transparent text-xs">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Period Selector ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex rounded-md border border-border overflow-hidden">
          {(["day", "week", "month", "all"] as PeriodMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setPeriodMode(m); setAnchor(new Date()); }}
              className={`px-3 py-1.5 text-sm font-medium capitalize transition-colors
                ${periodMode === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-muted"
                }`}
            >
              {periodLabels[m]}
            </button>
          ))}
        </div>

        {periodMode !== "all" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goPrev}>
              <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">{displayLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goNext}>
              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={goToday}>
              {t("workerDetail.today") || "Today"}
            </Button>
          </div>
        )}
        {periodMode === "all" && (
          <span className="text-sm text-muted-foreground">{t("workerDetail.period.all")}</span>
        )}
      </div>

      {/* ── Summary Cards ── */}
      {loadingLedger ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="bg-card">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> {t("workerDetail.stats.totalEarned")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-500 font-mono">
                +{formatCurrency(ledger?.totalEarned ?? 0, currency)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-orange-600" /> {t("workerDetail.stats.cashCollected")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-bold text-orange-600 font-mono">
                -{formatCurrency(ledger?.totalCashCollected ?? 0, currency)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-blue-600" /> {t("workerDetail.stats.reimbursements")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-bold text-blue-600 font-mono">
                +{formatCurrency(ledger?.totalReimbursements ?? 0, currency)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <MinusCircle className="w-3.5 h-3.5 text-red-500" /> {t("workerDetail.stats.deductions")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className="text-xl font-bold text-red-500 font-mono">
                -{formatCurrency(ledger?.totalDeductions ?? 0, currency)}
              </div>
            </CardContent>
          </Card>

          <Card className={`border-2 ${isOwed ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Wallet className={`w-3.5 h-3.5 ${isOwed ? "text-emerald-600" : "text-red-600"}`} />
                {isOwed ? t("workerDetail.payWorker") : t("workerDetail.collectFromWorker")}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 px-4">
              <div className={`text-xl font-bold font-mono ${isOwed ? "text-emerald-600 dark:text-emerald-500" : "text-red-600"}`}>
                {formatCurrency(Math.abs(net), currency)}
              </div>
            </CardContent>
          </Card>

          {/* Remaining to Pay card — now independent of checkbox state */}
          {(() => {
            const isRemainingPositive = remaining >= 0;
            return (
              <Card className="border-2 border-amber-500/40 bg-amber-500/5">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    {t("workerDetail.remainingBalance")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-4">
                  <div className={`text-xl font-bold font-mono mb-2 ${isRemainingPositive ? "text-amber-700 dark:text-amber-400" : "text-red-600"}`}>
                    {isRemainingPositive ? "+" : ""}{formatCurrency(remaining, currency)}
                  </div>
                  {hasRemaining && (
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                      onClick={() => { setPayAmount(remaining.toFixed(2)); setPayDialogOpen(true); }}
                    >
                      <BanknoteIcon className="w-3.5 h-3.5" />
                      {t("workerDetail.payRemainingBtn")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* ── Ledger Table ── */}
      <Card>
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base font-semibold">{t("workerDetail.ledger")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingLedger ? (
            <div className="p-8 space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !ledger || ledger.entries.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">{t("workerDetail.noTransactions")}</p>
              <p className="text-sm mt-1">{t("workerDetail.noTransactionsHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* ── Desktop table header (sm+) ── */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 bg-muted/30 text-xs font-medium text-muted-foreground">
                <div className="col-span-1 text-center">{t("workerDetail.columns.paid")}</div>
                <div className="col-span-2">{t("workerDetail.columns.date")}</div>
                <div className="col-span-2">{t("workerDetail.columns.type")}</div>
                <div className="col-span-4">{t("workerDetail.columns.description")}</div>
                <div className="col-span-3 text-end">{t("workerDetail.columns.amount")}</div>
              </div>

              {/* Rows */}
              {ledger.entries.map((entry) => {
                const badgeCls = TYPE_BADGE[entry.type] ?? "";
                const sign = TYPE_SIGN[entry.type] ?? 1;
                const isCredit = sign === 1;
                const isEarned = entry.type === "job_earned";
                const isPayment = entry.type === "worker_payment";
                const isPaid = entry.paid ?? false;
                const entryLabel = t(`workerDetail.entryTypes.${entry.type}`, { defaultValue: entry.type });
                const isWorkerOwes = entry.type === "worker_owes";
                const amountColor = isPayment
                  ? "text-violet-700 dark:text-violet-400"
                  : isWorkerOwes
                  ? (isPaid ? "text-muted-foreground line-through" : "text-orange-600 dark:text-orange-400")
                  : isCredit ? "text-emerald-600 dark:text-emerald-500" : "text-red-600";
                return (
                  <div key={entry.id}>
                    {/* ── Desktop row (sm+) ── */}
                    <div
                      className={`hidden sm:grid grid-cols-12 gap-3 px-4 py-3 items-center text-sm transition-colors ${
                        isPayment ? "bg-violet-500/5"
                        : isWorkerOwes ? (isPaid ? "bg-orange-500/5" : "bg-orange-500/5")
                        : isPaid && isEarned ? "bg-emerald-500/5" : "hover:bg-muted/10"
                      }`}
                    >
                      <div className="col-span-1 flex justify-center">
                        {isEarned ? (
                          <Checkbox
                            checked={isPaid}
                            onCheckedChange={(checked) => checkboxMutation.mutate({ entryId: entry.id, paid: !!checked })}
                            disabled={checkboxMutation.isPending}
                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                          />
                        ) : isWorkerOwes ? (
                          <Checkbox
                            checked={isPaid}
                            onCheckedChange={(checked) => checkboxMutation.mutate({ entryId: entry.id, paid: !!checked })}
                            disabled={checkboxMutation.isPending}
                            className="data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                          />
                        ) : isPayment ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-violet-400 hover:text-destructive hover:bg-destructive/10"
                            title={t("workerDetail.undoPayment")}
                            onClick={() => setDeletePaymentId(Number(entry.id.replace("payment-", "")))}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </div>
                      <div className="col-span-2 text-muted-foreground text-xs">
                        {format(new Date(entry.date), "MMM d, yyyy")}
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeCls}`}>
                          {entryLabel}
                        </span>
                      </div>
                      <div className={`col-span-4 font-medium text-sm leading-snug ${(isPaid && isEarned) || (isPaid && isWorkerOwes) ? "line-through text-muted-foreground" : ""}`}>
                        {entry.label}
                        {isPaid && isEarned && <span className="ms-2 text-[10px] font-normal text-emerald-600 no-underline">{t("workerDetail.paidLabel")}</span>}
                        {isPaid && isWorkerOwes && <span className="ms-2 text-[10px] font-normal text-orange-600 no-underline">{t("workerDetail.receivedLabel")}</span>}
                      </div>
                      <div className={`col-span-3 text-end font-mono font-semibold text-sm ${amountColor}`}>
                        {isCredit ? "+" : "–"}{formatCurrency(entry.amount, currency)}
                      </div>
                    </div>

                    {/* ── Mobile card (< sm) ── */}
                    <div
                      className={`sm:hidden px-4 py-3 space-y-1.5 ${
                        isPayment ? "bg-violet-500/5"
                        : isWorkerOwes ? "bg-orange-500/5"
                        : isPaid && isEarned ? "bg-emerald-500/5" : ""
                      }`}
                    >
                      {/* Row 1: type badge + amount */}
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${badgeCls}`}>
                          {entryLabel}
                        </span>
                        <span className={`font-mono font-semibold text-sm ${amountColor}`}>
                          {isCredit ? "+" : "–"}{formatCurrency(entry.amount, currency)}
                        </span>
                      </div>
                      {/* Row 2: description */}
                      <div className={`text-sm font-medium leading-snug ${(isPaid && isEarned) || (isPaid && isWorkerOwes) ? "line-through text-muted-foreground" : ""}`}>
                        {entry.label}
                        {isPaid && isEarned && <span className="ms-2 text-[10px] font-normal text-emerald-600 no-underline not-italic">{t("workerDetail.paidLabel")}</span>}
                        {isPaid && isWorkerOwes && <span className="ms-2 text-[10px] font-normal text-orange-600 no-underline not-italic">{t("workerDetail.receivedLabel")}</span>}
                      </div>
                      {/* Row 3: date + action */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.date), "MMM d, yyyy")}
                        </span>
                        {isEarned ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t("workerDetail.columns.paid")}</span>
                            <Checkbox
                              checked={isPaid}
                              onCheckedChange={(checked) => checkboxMutation.mutate({ entryId: entry.id, paid: !!checked })}
                              disabled={checkboxMutation.isPending}
                              className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 h-4 w-4"
                            />
                          </div>
                        ) : isWorkerOwes ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t("workerDetail.columns.received")}</span>
                            <Checkbox
                              checked={isPaid}
                              onCheckedChange={(checked) => checkboxMutation.mutate({ entryId: entry.id, paid: !!checked })}
                              disabled={checkboxMutation.isPending}
                              className="data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600 h-4 w-4"
                            />
                          </div>
                        ) : isPayment ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-violet-500 hover:text-destructive hover:bg-destructive/10 gap-1"
                            onClick={() => setDeletePaymentId(Number(entry.id.replace("payment-", "")))}
                          >
                            <Trash2 className="w-3 h-3" />
                            {t("workerDetail.undoPayment")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Footer: totals */}
              <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-muted/20 text-sm font-semibold">
                <div className="col-span-1" />
                <div className="col-span-8 text-muted-foreground">
                  {t("workerDetail.netBalance")} ({ledger.entries.length} {ledger.entries.length !== 1 ? t("workerDetail.transactions_plural") : t("workerDetail.transactions")})
                </div>
                <div className={`col-span-3 text-end font-mono text-base font-bold ${isOwed ? "text-emerald-600 dark:text-emerald-500" : "text-red-600"}`}>
                  {isOwed ? "+" : "–"}{formatCurrency(Math.abs(net), currency)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Adjustments Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">{t("workerDetail.adjustments.title")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{t("workerDetail.adjustments.subtitle")}</p>
            </div>
            <Button size="sm" onClick={openAddAdj} className="h-8 gap-1.5">
              <Plus className="w-4 h-4" />
              {t("workerDetail.adjustments.add")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!adjustments || adjustments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">{t("workerDetail.adjustments.noAdjustments")}</p>
          ) : (
            <div className="divide-y divide-border rounded-md border overflow-hidden">
              {adjustments.map((adj) => {
                const isReimb = adj.type === "reimbursement";
                return (
                  <div key={adj.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={isReimb ? "bg-blue-500/10 text-blue-700 border-blue-500/30" : "bg-red-500/10 text-red-700 border-red-500/30"}>
                          {isReimb ? t("workerDetail.adjustments.reimbursement") : t("workerDetail.adjustments.deduction")}
                        </Badge>
                        <span className="text-sm font-medium truncate">{adj.description}</span>
                      </div>
                      <span className="text-xs text-muted-foreground mt-0.5">{format(new Date(adj.occurredAt), "MMM d, yyyy")}</span>
                    </div>
                    <span className={`font-mono font-semibold text-sm ${isReimb ? "text-emerald-600" : "text-red-600"}`}>
                      {isReimb ? "+" : "–"}{formatCurrency(adj.amount, currency)}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEditAdj(adj)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteAdjId(adj.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Debts Card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">{t("workerDetail.debts.title")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{t("workerDetail.debts.subtitle")}</p>
            </div>
            <Button size="sm" onClick={openAddDebt} className="h-8 gap-1.5">
              <Plus className="w-4 h-4" />
              {t("workerDetail.debts.add")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!debts || debts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">{t("workerDetail.debts.noDebts")}</p>
          ) : (
            <div className="divide-y divide-border rounded-md border overflow-hidden">
              {debts.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={d.collected
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                          : "bg-rose-500/10 text-rose-700 border-rose-500/30"
                        }
                      >
                        {d.collected ? t("workerDetail.debts.collected") : t("workerDetail.debts.pending")}
                      </Badge>
                      <span className="text-sm font-medium truncate">{d.description}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{format(new Date(d.occurredAt), "MMM d, yyyy")}</span>
                      {d.collected && d.collectedAt && (
                        <span className="text-xs text-emerald-600">· {t("workerDetail.debts.collectedOn")} {format(new Date(d.collectedAt), "MMM d")}</span>
                      )}
                    </div>
                  </div>
                  <span className={`font-mono font-semibold text-sm ${d.collected ? "text-muted-foreground line-through" : "text-rose-600"}`}>
                    –{formatCurrency(d.amount, currency)}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-2 text-xs gap-1 ${d.collected ? "text-rose-500 hover:text-rose-700 hover:bg-rose-50" : "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"}`}
                      disabled={toggleDebtCollectedMutation.isPending}
                      onClick={() => toggleDebtCollectedMutation.mutate({ debtId: d.id, collected: !d.collected })}
                    >
                      {d.collected ? t("workerDetail.debts.markPending") : t("workerDetail.debts.markCollected")}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEditDebt(d)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteDebtId(d.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add/Edit Debt Dialog ── */}
      <Dialog open={debtDialogOpen} onOpenChange={(o) => { if (!o) { setDebtDialogOpen(false); setEditingDebt(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingDebt?.id ? t("workerDetail.debts.editTitle") : t("workerDetail.debts.add")}</DialogTitle>
            <DialogDescription className="sr-only">Manage worker debt</DialogDescription>
          </DialogHeader>
          {editingDebt && (
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-sm">{t("workerDetail.debts.description")}</Label>
                <Input
                  placeholder={t("workerDetail.debts.description")}
                  value={editingDebt.description}
                  onChange={(e) => setEditingDebt((d) => d ? { ...d, description: e.target.value } : d)}
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">{t("workerDetail.debts.amount")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={editingDebt.amount}
                    onChange={(e) => setEditingDebt((d) => d ? { ...d, amount: e.target.value } : d)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t("workerDetail.debts.date")}</Label>
                  <Input
                    type="date"
                    value={editingDebt.occurredAt}
                    onChange={(e) => setEditingDebt((d) => d ? { ...d, occurredAt: e.target.value } : d)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => { setDebtDialogOpen(false); setEditingDebt(null); }}>
                  {t("common.cancel")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={saveDebtMutation.isPending || !editingDebt.description || !editingDebt.amount}
                  onClick={() => {
                    if (!editingDebt.description || !editingDebt.amount) return;
                    saveDebtMutation.mutate({
                      id: editingDebt.id,
                      amount: Number(editingDebt.amount),
                      description: editingDebt.description,
                      occurredAt: editingDebt.occurredAt,
                    });
                  }}
                >
                  {saveDebtMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Debt Confirm Dialog ── */}
      <Dialog open={deleteDebtId !== null} onOpenChange={(o) => { if (!o) setDeleteDebtId(null); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{t("workerDetail.debts.confirmDelete")}</DialogTitle>
            <DialogDescription className="sr-only">Confirm debt deletion</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteDebtId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteDebtMutation.isPending}
              onClick={() => { if (deleteDebtId !== null) deleteDebtMutation.mutate(deleteDebtId); }}
            >
              {deleteDebtMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Adjustment Dialog ── */}
      <Dialog open={adjDialogOpen} onOpenChange={(o) => { if (!o) { setAdjDialogOpen(false); setEditingAdj(null); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingAdj?.id ? t("workerDetail.adjustments.editTitle") : t("workerDetail.adjustments.add")}</DialogTitle>
            <DialogDescription className="sr-only">Manage worker adjustment</DialogDescription>
          </DialogHeader>
          {editingAdj && (
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label className="text-sm">{t("workerDetail.adjustments.type")}</Label>
                <Select
                  value={editingAdj.type}
                  onValueChange={(v) => setEditingAdj((a) => a ? { ...a, type: v } : a)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reimbursement">{t("workerDetail.adjustments.reimbursement")}</SelectItem>
                    <SelectItem value="deduction">{t("workerDetail.adjustments.deduction")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{t("workerDetail.adjustments.description")}</Label>
                <Input
                  placeholder={t("workerDetail.adjustments.description")}
                  value={editingAdj.description}
                  onChange={(e) => setEditingAdj((a) => a ? { ...a, description: e.target.value } : a)}
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">{t("workerDetail.adjustments.amount")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={editingAdj.amount}
                    onChange={(e) => setEditingAdj((a) => a ? { ...a, amount: e.target.value } : a)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t("workerDetail.adjustments.date")}</Label>
                  <Input
                    type="date"
                    value={editingAdj.occurredAt}
                    onChange={(e) => setEditingAdj((a) => a ? { ...a, occurredAt: e.target.value } : a)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => { setAdjDialogOpen(false); setEditingAdj(null); }}>
                  {t("common.cancel")}
                </Button>
                <Button
                  className="flex-1"
                  disabled={saveAdjMutation.isPending || !editingAdj.description || !editingAdj.amount}
                  onClick={() => {
                    if (!editingAdj.description || !editingAdj.amount) return;
                    saveAdjMutation.mutate({
                      id: editingAdj.id,
                      type: editingAdj.type,
                      amount: Number(editingAdj.amount),
                      description: editingAdj.description,
                      occurredAt: editingAdj.occurredAt,
                    });
                  }}
                >
                  {saveAdjMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                  {t("common.save")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Adjustment Confirm Dialog ── */}
      <Dialog open={deleteAdjId !== null} onOpenChange={(o) => { if (!o) setDeleteAdjId(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{t("workerDetail.adjustments.confirmDelete")}</DialogTitle>
            <DialogDescription className="sr-only">Confirm deletion</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteAdjId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteAdjMutation.isPending}
              onClick={() => { if (deleteAdjId !== null) deleteAdjMutation.mutate(deleteAdjId); }}
            >
              {deleteAdjMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Undo Payment Confirm Dialog ── */}
      <Dialog open={deletePaymentId !== null} onOpenChange={(o) => { if (!o) setDeletePaymentId(null); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{t("workerDetail.undoPayment")}</DialogTitle>
            <DialogDescription>{t("workerDetail.undoPaymentConfirm")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeletePaymentId(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deletePaymentMutation.isPending}
              onClick={() => { if (deletePaymentId !== null) deletePaymentMutation.mutate(deletePaymentId); }}
            >
              {deletePaymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("common.delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Pay Worker Dialog ── */}
      <Dialog open={payDialogOpen} onOpenChange={(o) => { if (!o) { setPayDialogOpen(false); setPayNote(""); setPayAmount(""); setPaySource("cash"); setPayByWorkerId(""); } }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{t("workerDetail.payRemainingBtn")}</DialogTitle>
            <DialogDescription className="sr-only">
              Record a cash payment to or from this worker.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Remaining balance reference */}
            <div className="rounded-md bg-muted/50 border border-border px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("workerDetail.remainingBalance")}</span>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-400 text-lg">
                {formatCurrency(remaining, currency)}
              </span>
            </div>

            {/* ── Payment source ── */}
            {Number(payAmount) >= 0 && (
              <div className="space-y-2">
                <Label className="text-sm">{t("workerDetail.paySource.label")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setPaySource("cash"); setPayByWorkerId(""); }}
                    className={`rounded-md border px-3 py-2.5 text-sm text-start transition-all ${
                      paySource === "cash"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="font-medium">{t("workerDetail.paySource.cash")}</div>
                    <div className="text-xs opacity-70 mt-0.5">{t("workerDetail.paySource.cashHint")}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaySource("worker")}
                    disabled={otherWorkers.length === 0}
                    className={`rounded-md border px-3 py-2.5 text-sm text-start transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      paySource === "worker"
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <div className="font-medium">{t("workerDetail.paySource.worker")}</div>
                    <div className="text-xs opacity-70 mt-0.5">{t("workerDetail.paySource.workerHint")}</div>
                  </button>
                </div>

                {/* Worker picker */}
                {paySource === "worker" && (
                  <Select value={payByWorkerId} onValueChange={setPayByWorkerId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={t("workerDetail.paySource.selectWorker")} />
                    </SelectTrigger>
                    <SelectContent>
                      {otherWorkers.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {paySource === "worker" && payByWorkerId && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2.5 py-2">
                    {t("workerDetail.paySource.reimbursementNote", {
                      name: otherWorkers.find((w) => String(w.id) === payByWorkerId)?.name ?? "",
                    })}
                  </p>
                )}
              </div>
            )}

            {/* Amount to pay */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("workerDetail.payAmount")}</Label>
                {remaining > 0 && (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => setPayAmount(remaining.toFixed(2))}
                  >
                    {t("workerDetail.payFull")}
                  </button>
                )}
              </div>
              <Input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="h-9 font-mono"
                autoFocus
                placeholder="0.00"
              />
              {payAmount && Number(payAmount) < 0 && (
                <p className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                  <span>⚠</span>
                  {t("workerDetail.workerOwesHint")}
                </p>
              )}
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label className="text-sm">{t("jobs.notes")} <span className="text-muted-foreground text-xs">({t("workerDetail.optional")})</span></Label>
              <Input
                placeholder={t("workerDetail.paymentNote")}
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setPayDialogOpen(false); setPayNote(""); setPayAmount(""); setPaySource("cash"); setPayByWorkerId(""); }}>
                {t("common.cancel")}
              </Button>
              <Button
                className={`flex-1 text-white ${Number(payAmount) < 0 ? "bg-orange-600 hover:bg-orange-700" : "bg-amber-600 hover:bg-amber-700"}`}
                disabled={
                  payWorkerMutation.isPending ||
                  !payAmount ||
                  Number(payAmount) === 0 ||
                  isNaN(Number(payAmount)) ||
                  (paySource === "worker" && Number(payAmount) > 0 && !payByWorkerId)
                }
                onClick={() => payWorkerMutation.mutate({
                  amount: Number(payAmount),
                  note: payNote,
                  paidByWorkerId: paySource === "worker" && payByWorkerId ? Number(payByWorkerId) : undefined,
                })}
              >
                {payWorkerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                {Number(payAmount) < 0
                  ? t("workerDetail.recordOwedBtn")
                  : paySource === "worker" && payByWorkerId
                  ? t("workerDetail.paySource.recordBtn")
                  : t("workerDetail.payRemainingBtn")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
