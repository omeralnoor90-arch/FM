import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  FileText,
  Image as ImageIcon,
  TrendingUp,
  Briefcase,
  Users,
  ReceiptText,
  Wrench,
  Banknote,
  CreditCard,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetSettings } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

// ─── Types ────────────────────────────────────────────────────────────────
type PeriodType = "week" | "month" | "quarter" | "year";

interface ReportAttachment {
  id: number;
  label: string;
  purpose: string;
  originalName: string;
  mimetype: string;
  downloadPath: string;
}

interface ReportJob {
  id: number;
  source: string;
  plateNumber: string | null;
  carModel: string | null;
  paymentMethod: string;
  grossAmount: number;
  workerShare: number;
  workshopShare: number;
  netAmount: number;
  cardFeeAmount: number;
  workerName: string | null;
  occurredAt: string;
  notes: string | null;
  attachments: ReportAttachment[];
}

interface ReportExpense {
  id: number;
  description: string;
  amount: number;
  category: string | null;
  paidWith: string;
  workerId: number | null;
  workerName: string | null;
  occurredAt: string;
}

interface ReportPart {
  id: number;
  name: string;
  supplier: string | null;
  amount: number;
  quantity: number;
  total: number;
  paidWith: string;
  occurredAt: string;
}

interface ReportWorker {
  id: number;
  name: string;
  earned: number;
  cashCollected: number;
  reimbursements: number;
  adjDeductions: number;
  netBalance: number;
  totalPaid: number;
  remaining: number;
}

interface ReportSummary {
  jobCount: number;
  // Gross revenue (used in jobs table footer)
  totalGross: number;
  cashRevenue: number;
  cardRevenue: number;
  cardNetRevenue: number;
  // Net revenue = allTimeCashOnHand + allTimeCardBalance
  totalRevenue: number;
  // VAT (period-scoped)
  totalVat: number;
  // Shares
  totalWorkerShare: number;
  totalWorkshopShare: number;
  // Expenses (direct only — workerId = null)
  cashDirectExp: number;
  cardDirectExp: number;
  totalDirectExp: number;
  // Parts
  cashParts: number;
  cardParts: number;
  totalParts: number;
  // Detail (informational)
  workerExpenseReimb: number;
  totalJobExpenseReimb: number;
  adjReimb: number;
  adjDeduct: number;
  // Period profit (period-scoped simplified formula)
  cashBalance: number;
  cardBalance: number;
  workshopProfit: number;
  // All-time balances
  allTimeCashOnHand: number;
  allTimeCashBalance: number;
  allTimeCardBalance: number;
  // All-time card breakdown
  allTimeVat: number;
  allTimeCardNetRevenue: number;
  allTimeCardDirectExp: number;
  allTimeCardParts: number;
  // All-time cash breakdown
  allTimeCashDirectExp: number;
  allTimeCashParts: number;
  sumOfWorkerRemaining: number;
}

interface ReportData {
  generatedAt: string;
  period: { from: string | null; to: string | null };
  summary: ReportSummary;
  jobs: ReportJob[];
  expenses: ReportExpense[];
  parts: ReportPart[];
  workers: ReportWorker[];
}

// ─── Period helpers ───────────────────────────────────────────────────────
function getPeriodRange(type: PeriodType, offset: number): { from: Date; to: Date; label: string } {
  const now = new Date();
  let from: Date;
  let to: Date;
  let label: string;

  if (type === "week") {
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day) + offset * 7;
    from = new Date(now);
    from.setDate(now.getDate() + diffToMon);
    from.setHours(0, 0, 0, 0);
    to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    label = `${from.toLocaleDateString("en-GB", opts)} – ${to.toLocaleDateString("en-GB", opts)}, ${from.getFullYear()}`;
  } else if (type === "month") {
    from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59, 999);
    label = from.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  } else if (type === "quarter") {
    const q = Math.floor(now.getMonth() / 3) + offset;
    const year = now.getFullYear() + Math.floor(q / 4);
    const qNorm = ((q % 4) + 4) % 4;
    from = new Date(year, qNorm * 3, 1);
    to = new Date(year, qNorm * 3 + 3, 0, 23, 59, 59, 999);
    label = `Q${qNorm + 1} ${year}`;
  } else {
    const year = now.getFullYear() + offset;
    from = new Date(year, 0, 1);
    to = new Date(year, 11, 31, 23, 59, 59, 999);
    label = String(year);
  }

  return { from, to, label };
}

// ─── Utility ──────────────────────────────────────────────────────────────
function fmt(val: number, currency: string) {
  return formatCurrency(val, currency);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function AttachmentIcon({ mimetype }: { mimetype: string }) {
  if (mimetype.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

// ─── Sub-components ───────────────────────────────────────────────────────
function SummaryCard({
  icon,
  label,
  value,
  subLabel,
  color = "default",
  highlighted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subLabel?: string;
  color?: string;
  highlighted?: boolean;
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
    blue: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800",
    amber: "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800",
    rose: "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800",
    purple: "bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800",
    teal: "bg-teal-50 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800",
    default: "bg-card border-border",
  };
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color] ?? colorMap.default} ${highlighted ? "ring-2 ring-primary/30" : ""}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {subLabel && <div className="text-[11px] text-muted-foreground mt-1">{subLabel}</div>}
    </div>
  );
}

function AnalysisRow({
  label,
  value,
  currency,
  deduct = false,
  bold = false,
  sub = false,
  highlight,
}: {
  label: string;
  value: number;
  currency: string;
  deduct?: boolean;
  bold?: boolean;
  sub?: boolean;
  highlight?: "emerald" | "blue" | "rose";
}) {
  const colorClass = highlight === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : highlight === "blue"
    ? "text-blue-700 dark:text-blue-400"
    : highlight === "rose"
    ? "text-rose-600 dark:text-rose-400"
    : deduct
    ? "text-destructive"
    : sub
    ? "text-muted-foreground"
    : "";

  return (
    <div className={`flex justify-between items-center text-sm py-0.5 ${bold ? "font-semibold" : ""} ${colorClass}`}>
      <span className={sub ? "text-xs" : ""}>{label}</span>
      <span className="font-mono tabular-nums">
        {deduct ? `-${fmt(Math.abs(value), currency)}` : fmt(value, currency)}
      </span>
    </div>
  );
}

function ReportSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden mb-6">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border">
        {icon}
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-b border-border ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <td className={`px-3 py-2 text-sm border-b border-border ${right ? "text-right font-mono" : ""}`}>
      {children}
    </td>
  );
}

function AttachmentLinks({ attachments }: { attachments: ReportAttachment[] }) {
  if (!attachments || attachments.length === 0) return <span className="text-muted-foreground/40 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={a.downloadPath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
          title={a.originalName}
        >
          <AttachmentIcon mimetype={a.mimetype} />
          {a.label || a.originalName}
        </a>
      ))}
    </div>
  );
}

// ─── Reports Page ─────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { data: settings } = useGetSettings();
  const currency = settings?.currency ?? "SAR";
  const isRtl = i18n.language === "ar";

  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [offset, setOffset] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);

  const period = getPeriodRange(periodType, offset);

  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: ["reports", period.from.toISOString(), period.to.toISOString()],
    queryFn: async () => {
      const url = `/api/reports?from=${encodeURIComponent(period.from.toISOString())}&to=${encodeURIComponent(period.to.toISOString())}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
    staleTime: 60_000,
  });

  const handlePrint = useCallback(() => window.print(), []);

  const s = data?.summary;

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-printable, #report-printable * { visibility: visible; }
          #report-printable { position: absolute; inset: 0; padding: 24px; }
          .no-print { display: none !important; }
          .print-break { page-break-before: always; }
          a { color: #1d4ed8 !important; text-decoration: underline !important; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 11px; }
          th { background: #f3f4f6; font-weight: 600; }
        }
      `}</style>

      <div className="min-h-screen p-4 md:p-6 space-y-6">
        {/* ── Header ── */}
        <div className="no-print flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("reports.subtitle")}</p>
          </div>
          <Button onClick={handlePrint} className="gap-2 shrink-0">
            <Printer className="h-4 w-4" />
            {t("reports.print")}
          </Button>
        </div>

        {/* ── Period Selector ── */}
        <div className="no-print flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Tabs value={periodType} onValueChange={(v) => { setPeriodType(v as PeriodType); setOffset(0); }}>
            <TabsList>
              <TabsTrigger value="week">{t("reports.week")}</TabsTrigger>
              <TabsTrigger value="month">{t("reports.month")}</TabsTrigger>
              <TabsTrigger value="quarter">{t("reports.quarter")}</TabsTrigger>
              <TabsTrigger value="year">{t("reports.year")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2 ms-auto">
            <Button variant="outline" size="icon" onClick={() => setOffset(o => o - 1)}>
              {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">{period.label}</span>
            <Button variant="outline" size="icon" onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}>
              {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48 text-muted-foreground">{t("common.loading")}</div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-destructive">{t("common.error")}</div>
        )}

        {data && s && (
          <div id="report-printable" ref={printRef} dir={isRtl ? "rtl" : "ltr"}>
            {/* Print header */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold">{t("app.name")} — {t("reports.title")}</h1>
              <p className="text-sm text-muted-foreground">{period.label}</p>
              <p className="text-xs text-muted-foreground">{t("reports.generatedAt")}: {new Date(data.generatedAt).toLocaleString()}</p>
            </div>

            {/* ── Top summary cards — same metrics as dashboard ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <SummaryCard
                icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                label={t("reports.totalRevenue")}
                value={fmt(s.totalRevenue, currency)}
                subLabel={`${t("dashboard.cashOnHand")}: ${fmt(s.allTimeCashOnHand, currency)}  |  ${t("dashboard.cardBalance")}: ${fmt(s.allTimeCardBalance, currency)}`}
                color="emerald"
              />
              <SummaryCard
                icon={<CreditCard className="h-4 w-4 text-blue-600" />}
                label={t("reports.cardBalancePlusVat")}
                value={fmt(s.allTimeCardBalance + s.allTimeVat, currency)}
                subLabel={`${t("dashboard.cardBalance")}: ${fmt(s.allTimeCardBalance, currency)}  +  ${t("reports.totalVatReport")}: ${fmt(s.allTimeVat, currency)}`}
                color="blue"
              />
              <SummaryCard
                icon={<Receipt className="h-4 w-4 text-orange-500" />}
                label={t("reports.totalVatReport")}
                value={fmt(s.totalVat, currency)}
                subLabel={t("reports.formulaVat")}
                color="amber"
              />
              <SummaryCard
                icon={<Briefcase className="h-4 w-4 text-teal-600" />}
                label={t("dashboard.monthlyProfit")}
                value={fmt(s.workshopProfit, currency)}
                color={s.workshopProfit >= 0 ? "teal" : "rose"}
                highlighted
              />
            </div>

            {/* Expenses + Parts row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <SummaryCard
                icon={<ReceiptText className="h-4 w-4 text-rose-600" />}
                label={t("reports.expenses")}
                value={fmt(s.totalDirectExp, currency)}
                subLabel={`${t("reports.cash")}: ${fmt(s.cashDirectExp, currency)}  |  ${t("reports.card")}: ${fmt(s.cardDirectExp, currency)}`}
                color="rose"
              />
              <SummaryCard
                icon={<Wrench className="h-4 w-4 text-purple-600" />}
                label={t("reports.parts")}
                value={fmt(s.totalParts, currency)}
                subLabel={`${t("reports.cash")}: ${fmt(s.cashParts, currency)}  |  ${t("reports.card")}: ${fmt(s.cardParts, currency)}`}
                color="purple"
              />
              <SummaryCard
                icon={<Banknote className="h-4 w-4 text-primary" />}
                label={t("dashboard.cashOnHand")}
                value={fmt(s.allTimeCashOnHand, currency)}
                color={s.allTimeCashOnHand >= 0 ? "emerald" : "rose"}
              />
              <SummaryCard
                icon={<CreditCard className="h-4 w-4 text-secondary" />}
                label={t("dashboard.cardBalance")}
                value={fmt(s.allTimeCardBalance, currency)}
                color={s.allTimeCardBalance >= 0 ? "blue" : "rose"}
              />
            </div>

            {/* ── Cash vs Card Breakdown — same formula as dashboard ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* CASH */}
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-100 dark:bg-emerald-900/40 border-b border-emerald-200 dark:border-emerald-800">
                  <span className="text-lg">💵</span>
                  <h3 className="font-bold text-emerald-800 dark:text-emerald-300">{t("reports.cashAnalysis")}</h3>
                  <span className="ms-auto text-xs text-emerald-600 dark:text-emerald-400">{s.jobCount > 0 ? `${data.jobs.filter(j => j.paymentMethod === "cash").length} ${t("reports.jobs")}` : ""}</span>
                </div>
                <div className="p-4 space-y-1 text-sm">
                  <AnalysisRow label={t("reports.workerBalancesLbl")} value={-s.sumOfWorkerRemaining} currency={currency} />
                  <AnalysisRow label={t("reports.directExpenses")} value={s.allTimeCashDirectExp} currency={currency} deduct />
                  <AnalysisRow label={t("reports.parts")} value={s.allTimeCashParts} currency={currency} deduct />
                  <div className="border-t border-emerald-200 dark:border-emerald-800 mt-2 pt-2">
                    <AnalysisRow
                      label={t("dashboard.cashOnHand")}
                      value={s.allTimeCashOnHand}
                      currency={currency}
                      bold
                      highlight={s.allTimeCashOnHand >= 0 ? "emerald" : "rose"}
                    />
                  </div>
                </div>
              </div>

              {/* CARD */}
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-blue-100 dark:bg-blue-900/40 border-b border-blue-200 dark:border-blue-800">
                  <span className="text-lg">💳</span>
                  <h3 className="font-bold text-blue-800 dark:text-blue-300">{t("reports.cardAnalysis")}</h3>
                  <span className="ms-auto text-xs text-blue-600 dark:text-blue-400">{s.jobCount > 0 ? `${data.jobs.filter(j => j.paymentMethod !== "cash").length} ${t("reports.jobs")}` : ""}</span>
                </div>
                <div className="p-4 space-y-1 text-sm">
                  <AnalysisRow label={t("dashboard.cardBalance")} value={s.allTimeCardBalance} currency={currency} />
                  {s.allTimeCardDirectExp > 0 && (
                    <AnalysisRow label={t("reports.directExpenses")} value={s.allTimeCardDirectExp} currency={currency} deduct />
                  )}
                  {s.allTimeCardParts > 0 && (
                    <AnalysisRow label={t("reports.parts")} value={s.allTimeCardParts} currency={currency} deduct />
                  )}
                  {s.allTimeVat > 0 && (
                    <AnalysisRow label={t("reports.vatCollected")} value={s.allTimeVat} currency={currency} deduct />
                  )}
                  <div className="border-t border-blue-200 dark:border-blue-800 mt-2 pt-2">
                    <AnalysisRow
                      label={t("reports.netAfterVat")}
                      value={s.allTimeCardNetRevenue}
                      currency={currency}
                      bold
                      highlight={s.allTimeCardNetRevenue >= 0 ? "blue" : "rose"}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Jobs Table ── */}
            <ReportSection title={t("reports.jobsSection")} icon={<Briefcase className="h-4 w-4" />}>
              {data.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">{t("reports.noData")}</p>
              ) : (
                <>
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <Th>{t("reports.date")}</Th>
                          <Th>{t("reports.source")}</Th>
                          <Th>{t("reports.plate")}</Th>
                          <Th>{t("reports.car")}</Th>
                          <Th>{t("reports.worker")}</Th>
                          <Th>{t("reports.payment")}</Th>
                          <Th right>{t("reports.gross")}</Th>
                          <Th right>{t("jobs.cardFee")}</Th>
                          <Th right>{t("reports.workshopShareCol")}</Th>
                          <Th right>{t("reports.workerShareCol")}</Th>
                          <Th>{t("reports.attachmentsCol")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.jobs.map((job) => (
                          <tr key={job.id} className="hover:bg-muted/20">
                            <Td>{fmtDate(job.occurredAt)}</Td>
                            <Td>{job.source}</Td>
                            <Td>{job.plateNumber ?? "—"}</Td>
                            <Td>{job.carModel ?? "—"}</Td>
                            <Td>{job.workerName ?? "—"}</Td>
                            <Td>
                              <Badge variant={job.paymentMethod === "cash" ? "default" : "secondary"} className="text-xs">
                                {t(`jobs.${job.paymentMethod}` as any) || job.paymentMethod}
                              </Badge>
                            </Td>
                            <Td right>{fmt(job.grossAmount, currency)}</Td>
                            <Td right>
                              {job.cardFeeAmount > 0
                                ? <span className="text-destructive">{fmt(job.cardFeeAmount, currency)}</span>
                                : <span className="text-muted-foreground/40">—</span>}
                            </Td>
                            <Td right>{fmt(job.workshopShare, currency)}</Td>
                            <Td right>
                              <span className="text-emerald-600 dark:text-emerald-500">{fmt(job.workerShare, currency)}</span>
                            </Td>
                            <Td><AttachmentLinks attachments={job.attachments} /></Td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold bg-muted/30">
                          <td colSpan={6} className="px-3 py-2 text-sm">{t("reports.total")}</td>
                          <td className="px-3 py-2 text-sm text-right font-mono">{fmt(s.totalGross, currency)}</td>
                          <td className="px-3 py-2 text-sm text-right font-mono text-destructive">{s.totalVat > 0 ? fmt(s.totalVat, currency) : "—"}</td>
                          <td className="px-3 py-2 text-sm text-right font-mono">{fmt(s.totalWorkshopShare, currency)}</td>
                          <td className="px-3 py-2 text-sm text-right font-mono text-emerald-600 dark:text-emerald-500">{fmt(s.totalWorkerShare, currency)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-3 p-3">
                    {data.jobs.map((job) => (
                      <div key={job.id} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{job.source}</p>
                            {job.plateNumber && (
                              <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{job.plateNumber}{job.carModel ? ` · ${job.carModel}` : ""}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">{job.workerName ?? "—"} · {fmtDate(job.occurredAt)}</p>
                          </div>
                          <div className="text-end shrink-0">
                            <div className="font-mono font-semibold text-sm">{fmt(job.grossAmount, currency)}</div>
                            <Badge variant={job.paymentMethod === "cash" ? "default" : "secondary"} className="text-xs mt-0.5">
                              {t(`jobs.${job.paymentMethod}` as any) || job.paymentMethod}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-4 text-xs">
                          <span className="text-muted-foreground">{t("reports.workerShareCol")}: <span className="font-mono text-emerald-600 dark:text-emerald-500">{fmt(job.workerShare, currency)}</span></span>
                          {job.cardFeeAmount > 0 && (
                            <span className="text-muted-foreground">{t("jobs.cardFee")}: <span className="font-mono text-destructive">{fmt(job.cardFeeAmount, currency)}</span></span>
                          )}
                        </div>
                        {job.attachments.length > 0 && <AttachmentLinks attachments={job.attachments} />}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ReportSection>

            {/* ── Expenses Table ── */}
            {data.expenses.length > 0 && (
              <ReportSection title={t("reports.expensesSection")} icon={<ReceiptText className="h-4 w-4" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <Th>{t("reports.date")}</Th>
                        <Th>{t("jobs.expenseDescription")}</Th>
                        <Th>{t("jobs.category")}</Th>
                        <Th>{t("reports.payment")}</Th>
                        <Th>{t("jobs.paidBy")}</Th>
                        <Th right>{t("reports.total")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expenses.map((e) => (
                        <tr key={e.id} className="hover:bg-muted/20">
                          <Td>{fmtDate(e.occurredAt)}</Td>
                          <Td>{e.description}</Td>
                          <Td>{e.category ?? "—"}</Td>
                          <Td>
                            <Badge variant={e.paidWith === "cash" ? "default" : "secondary"} className="text-xs">
                              {t(`jobs.${e.paidWith}` as any) || e.paidWith}
                            </Badge>
                          </Td>
                          <Td>{e.workerName ?? t("jobs.paidByWorkshop")}</Td>
                          <Td right><span className="text-destructive">{fmt(e.amount, currency)}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold bg-muted/30">
                        <td colSpan={5} className="px-3 py-2 text-sm">{t("reports.total")}</td>
                        <td className="px-3 py-2 text-sm text-right font-mono text-destructive">
                          {fmt(data.expenses.reduce((s, e) => s + e.amount, 0), currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </ReportSection>
            )}

            {/* ── Parts Table ── */}
            {data.parts.length > 0 && (
              <ReportSection title={t("reports.partsSection")} icon={<Wrench className="h-4 w-4" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <Th>{t("reports.date")}</Th>
                        <Th>{t("parts.description")}</Th>
                        <Th>{t("parts.supplier")}</Th>
                        <Th>{t("reports.payment")}</Th>
                        <Th right>{t("reports.qty")}</Th>
                        <Th right>{t("reports.unitPrice")}</Th>
                        <Th right>{t("reports.total")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.parts.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <Td>{fmtDate(p.occurredAt)}</Td>
                          <Td>{p.name}</Td>
                          <Td>{p.supplier ?? "—"}</Td>
                          <Td>
                            <Badge variant={p.paidWith === "cash" ? "default" : "secondary"} className="text-xs">
                              {t(`jobs.${p.paidWith}` as any) || p.paidWith}
                            </Badge>
                          </Td>
                          <Td right>{p.quantity}</Td>
                          <Td right>{fmt(p.amount, currency)}</Td>
                          <Td right><span className="text-destructive">{fmt(p.total, currency)}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold bg-muted/30">
                        <td colSpan={6} className="px-3 py-2 text-sm">{t("reports.total")}</td>
                        <td className="px-3 py-2 text-sm text-right font-mono text-destructive">
                          {fmt(data.parts.reduce((s, p) => s + p.total, 0), currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </ReportSection>
            )}

            {/* ── Worker Breakdown ── */}
            {data.workers.length > 0 && (
              <ReportSection title={t("reports.workersSection")} icon={<Users className="h-4 w-4" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <Th>{t("workers.name")}</Th>
                        <Th right>{t("workerDetail.stats.totalEarned")}</Th>
                        <Th right>{t("workerDetail.stats.cashCollected")}</Th>
                        <Th right>{t("workerDetail.stats.reimbursements")}</Th>
                        <Th right>{t("reports.paidOut")}</Th>
                        <Th right>{t("reports.netBalance")}</Th>
                        <Th right>{t("workers.remainingToPay")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.workers.map((w) => (
                        <tr key={w.id} className="hover:bg-muted/20">
                          <Td><span className="font-medium">{w.name}</span></Td>
                          <Td right>{fmt(w.earned, currency)}</Td>
                          <Td right>{fmt(w.cashCollected, currency)}</Td>
                          <Td right>{w.reimbursements > 0 ? fmt(w.reimbursements, currency) : "—"}</Td>
                          <Td right>{w.totalPaid > 0 ? fmt(w.totalPaid, currency) : "—"}</Td>
                          <Td right>
                            <span className={w.netBalance >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"}>
                              {fmt(w.netBalance, currency)}
                            </span>
                          </Td>
                          <Td right>
                            <span className={`font-semibold ${w.remaining >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"}`}>
                              {fmt(w.remaining, currency)}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ReportSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
