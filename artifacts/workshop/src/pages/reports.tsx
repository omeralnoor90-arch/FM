import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Download,
  FileText,
  Image as ImageIcon,
  TrendingUp,
  Briefcase,
  Users,
  ReceiptText,
  Wrench,
  ArrowDownCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetSettings } from "@workspace/api-client-react";

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
  adjReimbursements: number;
  adjDeductions: number;
  netBalance: number;
  totalPaid: number;
  remaining: number;
}

interface CashAnalysis {
  revenue: number;
  workerShare: number;
  workshopShare: number;
  directExpenses: number;
  parts: number;
  adjDeductions: number;
  adjReimbursements: number;
  workerExpenseReimb: number;
  jobLineReimb: number;
  cashNetProfit: number;
  jobCount: number;
}

interface CardAnalysis {
  revenue: number;
  vat: number;
  netRevenue: number;
  workerShare: number;
  workshopShare: number;
  directExpenses: number;
  parts: number;
  cardNet: number;
  jobCount: number;
}

interface ReportSummary {
  jobCount: number;
  totalRevenue: number;
  totalCashRevenue: number;
  totalCardRevenue: number;
  totalWorkerShare: number;
  totalWorkshopShare: number;
  totalWorkshopExpenses: number;
  totalWorkerReimbursements: number;
  totalJobExpenseReimb: number;
  totalParts: number;
  totalVat: number;
  totalAdjReimbursements: number;
  totalAdjDeductions: number;
  workshopNet: number;
  workshopNetWithVat: number;
  // Cash vs card split
  cashAnalysis: CashAnalysis;
  cardAnalysis: CardAnalysis;
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
    // Week starts Monday
    const day = now.getDay(); // 0=Sun
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
  return `${currency} ${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function AttachmentIcon({ mimetype }: { mimetype: string }) {
  if (mimetype.startsWith("image/")) return <ImageIcon className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
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

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const s = data?.summary;

  return (
    <div>
      {/* Print-only global styles */}
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

        {/* ── Loading / Error ── */}
        {isLoading && (
          <div className="flex items-center justify-center h-48 text-muted-foreground">
            {t("common.loading")}
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-destructive">
            {t("common.error")}
          </div>
        )}

        {/* ── Printable Report ── */}
        {data && (
          <div id="report-printable" ref={printRef} dir={isRtl ? "rtl" : "ltr"}>
            {/* Print header */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold">{t("app.name")} — {t("reports.title")}</h1>
              <p className="text-sm text-muted-foreground">{period.label}</p>
              <p className="text-xs text-muted-foreground">{t("reports.generatedAt")}: {new Date(data.generatedAt).toLocaleString()}</p>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <SummaryCard icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} label={t("reports.totalRevenue")} value={fmt(s!.totalRevenue, currency)} color="emerald"
                formula={t("reports.formulaRevenue")} />
              <SummaryCard icon={<Briefcase className="h-4 w-4 text-blue-600" />} label={t("reports.workshopShare")} value={fmt(s!.totalWorkshopShare, currency)} color="blue"
                formula={t("reports.formulaWorkshopShare")} />
              <SummaryCard icon={<Users className="h-4 w-4 text-amber-600" />} label={t("reports.workerShare")} value={fmt(s!.totalWorkerShare, currency)} color="amber"
                formula={t("reports.formulaWorkerShare")} />
              <SummaryCard icon={<ReceiptText className="h-4 w-4 text-rose-600" />} label={t("reports.expenses")} value={fmt(s!.totalWorkshopExpenses, currency)} color="rose"
                formula={t("reports.formulaExpenses")} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <SummaryCard icon={<Wrench className="h-4 w-4 text-purple-600" />} label={t("reports.parts")} value={fmt(s!.totalParts, currency)} color="purple"
                formula={t("reports.formulaParts")} />
              <SummaryCard icon={<ArrowDownCircle className="h-4 w-4 text-orange-500" />} label={t("reports.totalVatReport")} value={fmt(s!.totalVat, currency)} color="amber"
                formula={t("reports.formulaVat")} />
              <SummaryCard icon={<ArrowDownCircle className="h-4 w-4 text-teal-600" />} label={t("reports.netProfit")} value={fmt(s!.workshopNet, currency)} color={s!.workshopNet >= 0 ? "teal" : "rose"}
                formula={t("reports.formulaNetProfit")} />
              <SummaryCard icon={<ArrowDownCircle className="h-4 w-4 text-emerald-600" />} label={t("reports.netProfitWithVat")} value={fmt(s!.workshopNetWithVat, currency)} color={s!.workshopNetWithVat >= 0 ? "teal" : "rose"} highlighted
                formula={t("reports.formulaNetProfitVat")} />
            </div>

            {/* Sub-summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-6 p-3 rounded-lg bg-muted/50 border border-border">
              <div>
                <span className="text-muted-foreground">{t("reports.jobs")}: </span>
                <span className="font-semibold">{s!.jobCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("reports.cash")}: </span>
                <span className="font-semibold">{fmt(s!.totalCashRevenue, currency)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("reports.card")}: </span>
                <span className="font-semibold">{fmt(s!.totalCardRevenue, currency)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("reports.reimbursements")}: </span>
                <span className="font-semibold">{fmt(s!.totalWorkerReimbursements, currency)}</span>
              </div>
              {(s!.totalJobExpenseReimb ?? 0) > 0 && (
                <div>
                  <span className="text-muted-foreground">{t("reports.jobExpenseReimb")}: </span>
                  <span className="font-semibold text-orange-600">{fmt(s!.totalJobExpenseReimb, currency)}</span>
                </div>
              )}
              {s!.totalAdjReimbursements > 0 && (
                <div>
                  <span className="text-muted-foreground">{t("reports.adjReimbursements")}: </span>
                  <span className="font-semibold text-blue-700">{fmt(s!.totalAdjReimbursements, currency)}</span>
                </div>
              )}
              {s!.totalAdjDeductions > 0 && (
                <div>
                  <span className="text-muted-foreground">{t("reports.adjDeductions")}: </span>
                  <span className="font-semibold text-red-600">{fmt(s!.totalAdjDeductions, currency)}</span>
                </div>
              )}
            </div>

            {/* ── Cash vs Card Analysis ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* CASH */}
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-emerald-100 dark:bg-emerald-900/40 border-b border-emerald-200 dark:border-emerald-800">
                  <span className="text-lg">💵</span>
                  <h3 className="font-bold text-emerald-800 dark:text-emerald-300">{t("reports.cashAnalysis")}</h3>
                  <span className="ms-auto text-xs text-emerald-600 dark:text-emerald-400">{s!.cashAnalysis.jobCount} {t("reports.jobs")}</span>
                </div>
                <div className="p-4 space-y-1 text-sm">
                  <AnalysisRow label={t("reports.grossRevenue")} value={s!.cashAnalysis.revenue} currency={currency} />
                  <AnalysisRow label={t("reports.workerShareCol")} value={-s!.cashAnalysis.workerShare} currency={currency} deduct />
                  <AnalysisRow label={t("reports.workshopShareCol")} value={s!.cashAnalysis.workshopShare} currency={currency} bold />
                  {s!.cashAnalysis.adjDeductions > 0 && (
                    <AnalysisRow label={t("reports.adjDeductions")} value={s!.cashAnalysis.adjDeductions} currency={currency} />
                  )}
                  {s!.cashAnalysis.adjReimbursements > 0 && (
                    <AnalysisRow label={t("reports.adjReimbursements")} value={-s!.cashAnalysis.adjReimbursements} currency={currency} deduct />
                  )}
                  {s!.cashAnalysis.workerExpenseReimb > 0 && (
                    <AnalysisRow label={t("reports.workerReimb")} value={-s!.cashAnalysis.workerExpenseReimb} currency={currency} deduct />
                  )}
                  {s!.cashAnalysis.jobLineReimb > 0 && (
                    <AnalysisRow label={t("reports.jobExpenseReimb")} value={-s!.cashAnalysis.jobLineReimb} currency={currency} deduct />
                  )}
                  {s!.cashAnalysis.directExpenses > 0 && (
                    <AnalysisRow label={t("reports.directExpenses")} value={-s!.cashAnalysis.directExpenses} currency={currency} deduct />
                  )}
                  {s!.cashAnalysis.parts > 0 && (
                    <AnalysisRow label={t("reports.parts")} value={-s!.cashAnalysis.parts} currency={currency} deduct />
                  )}
                  <div className="border-t border-emerald-200 dark:border-emerald-800 mt-2 pt-2">
                    <AnalysisRow
                      label={t("reports.cashNetProfit")}
                      value={s!.cashAnalysis.cashNetProfit}
                      currency={currency}
                      bold
                      highlight={s!.cashAnalysis.cashNetProfit >= 0 ? "emerald" : "rose"}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      {t("reports.formulaCashNet")}
                    </p>
                  </div>
                </div>
              </div>

              {/* CARD */}
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-blue-100 dark:bg-blue-900/40 border-b border-blue-200 dark:border-blue-800">
                  <span className="text-lg">💳</span>
                  <h3 className="font-bold text-blue-800 dark:text-blue-300">{t("reports.cardAnalysis")}</h3>
                  <span className="ms-auto text-xs text-blue-600 dark:text-blue-400">{s!.cardAnalysis.jobCount} {t("reports.jobs")}</span>
                </div>
                <div className="p-4 space-y-1 text-sm">
                  <AnalysisRow label={t("reports.grossRevenue")} value={s!.cardAnalysis.revenue} currency={currency} />
                  <AnalysisRow label={t("reports.vatCollected")} value={s!.cardAnalysis.vat} currency={currency} sub />
                  <AnalysisRow label={t("reports.netAfterVat")} value={s!.cardAnalysis.netRevenue} currency={currency} bold />
                  <AnalysisRow label={t("reports.workerShareCol")} value={-s!.cardAnalysis.workerShare} currency={currency} deduct />
                  <AnalysisRow label={t("reports.workshopShareCol")} value={s!.cardAnalysis.workshopShare} currency={currency} bold />
                  {s!.cardAnalysis.directExpenses > 0 && (
                    <AnalysisRow label={t("reports.directExpenses")} value={-s!.cardAnalysis.directExpenses} currency={currency} deduct />
                  )}
                  {s!.cardAnalysis.parts > 0 && (
                    <AnalysisRow label={t("reports.parts")} value={-s!.cardAnalysis.parts} currency={currency} deduct />
                  )}
                  <div className="border-t border-blue-200 dark:border-blue-800 mt-2 pt-2">
                    <AnalysisRow
                      label={t("reports.cardNet")}
                      value={s!.cardAnalysis.cardNet}
                      currency={currency}
                      bold
                      highlight="blue"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      {t("reports.formulaCardNet")}
                    </p>
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
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <Th>{t("reports.date")}</Th>
                          <Th>{t("reports.source")}</Th>
                          <Th>{t("reports.plate")}</Th>
                          <Th>{t("reports.car")}</Th>
                          <Th>{t("reports.worker")}</Th>
                          <Th>{t("reports.payment")}</Th>
                          <Th right>{t("reports.gross")}</Th>
                          <Th right>{t("reports.workshopShareCol")}</Th>
                          <Th right>{t("reports.workerShareCol")}</Th>
                          <Th>{t("reports.attachmentsCol")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.jobs.map((job) => (
                          <tr key={job.id} className="border-b border-border hover:bg-muted/20">
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
                            <Td right>{fmt(job.workshopShare, currency)}</Td>
                            <Td right>{fmt(job.workerShare, currency)}</Td>
                            <Td>
                              <AttachmentLinks attachments={job.attachments} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold bg-muted/30">
                          <td colSpan={6} className="px-3 py-2 text-sm">{t("reports.total")}</td>
                          <td className="px-3 py-2 text-sm text-right">{fmt(s!.totalRevenue, currency)}</td>
                          <td className="px-3 py-2 text-sm text-right">{fmt(s!.totalWorkshopShare, currency)}</td>
                          <td className="px-3 py-2 text-sm text-right">{fmt(s!.totalWorkerShare, currency)}</td>
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
                            <p className="text-xs text-muted-foreground">{fmtDate(job.occurredAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-sm">{fmt(job.grossAmount, currency)}</p>
                            <Badge variant={job.paymentMethod === "cash" ? "default" : "secondary"} className="text-xs">
                              {t(`jobs.${job.paymentMethod}` as any) || job.paymentMethod}
                            </Badge>
                          </div>
                        </div>
                        {(job.plateNumber || job.carModel) && (
                          <p className="text-xs text-muted-foreground">{[job.plateNumber, job.carModel].filter(Boolean).join(" · ")}</p>
                        )}
                        {job.workerName && (
                          <p className="text-xs">{t("reports.worker")}: <span className="font-medium">{job.workerName}</span></p>
                        )}
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>{t("reports.workshopShareCol")}: <span className="font-medium text-foreground">{fmt(job.workshopShare, currency)}</span></span>
                          <span>{t("reports.workerShareCol")}: <span className="font-medium text-foreground">{fmt(job.workerShare, currency)}</span></span>
                        </div>
                        {job.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
                            <AttachmentLinks attachments={job.attachments} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </ReportSection>

            {/* ── Worker Breakdown ── */}
            {data.workers.length > 0 && (
              <div className="print-break">
                <ReportSection title={t("reports.workersSection")} icon={<Users className="h-4 w-4" />}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          <Th>{t("reports.worker")}</Th>
                          <Th right>{t("reports.earned")}</Th>
                          <Th right>{t("reports.cashCollected")}</Th>
                          <Th right>{t("reports.reimbursements")}</Th>
                          <Th right>{t("reports.adjReimbursements")}</Th>
                          <Th right>{t("reports.adjDeductions")}</Th>
                          <Th right>{t("reports.netBalance")}</Th>
                          <Th right>{t("reports.paidOut")}</Th>
                          <Th right>{t("reports.remaining")}</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.workers.map((w) => (
                          <tr key={w.id} className="border-b border-border hover:bg-muted/20">
                            <Td className="font-medium">{w.name}</Td>
                            <Td right>{fmt(w.earned, currency)}</Td>
                            <Td right className="text-rose-600">−{fmt(w.cashCollected, currency)}</Td>
                            <Td right className="text-blue-600">+{fmt(w.reimbursements, currency)}</Td>
                            <Td right className={w.adjReimbursements > 0 ? "text-blue-600" : "text-muted-foreground"}>
                              {w.adjReimbursements > 0 ? `+${fmt(w.adjReimbursements, currency)}` : "—"}
                            </Td>
                            <Td right className={w.adjDeductions > 0 ? "text-rose-600" : "text-muted-foreground"}>
                              {w.adjDeductions > 0 ? `−${fmt(w.adjDeductions, currency)}` : "—"}
                            </Td>
                            <Td right>{fmt(w.netBalance, currency)}</Td>
                            <Td right className="text-violet-600">−{fmt(w.totalPaid, currency)}</Td>
                            <Td right className={w.remaining > 0 ? "text-emerald-600 font-semibold" : w.remaining < 0 ? "text-rose-600 font-semibold" : ""}>
                              {w.remaining >= 0 ? fmt(w.remaining, currency) : `−${fmt(w.remaining, currency)}`}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ReportSection>
              </div>
            )}

            {/* ── Expenses ── */}
            {data.expenses.length > 0 && (
              <ReportSection title={t("reports.expensesSection")} icon={<ReceiptText className="h-4 w-4" />}>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <Th>{t("reports.date")}</Th>
                        <Th>{t("reports.description")}</Th>
                        <Th>{t("reports.category")}</Th>
                        <Th>{t("reports.paidBy")}</Th>
                        <Th right>{t("reports.amount")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expenses.map((e) => (
                        <tr key={e.id} className="border-b border-border hover:bg-muted/20">
                          <Td>{fmtDate(e.occurredAt)}</Td>
                          <Td>{e.description}</Td>
                          <Td>{e.category ?? "—"}</Td>
                          <Td>{e.workerName ?? (e.paidWith === "cash" ? t("expenses.workshopCash") : t("expenses.workshopCard"))}</Td>
                          <Td right className="text-rose-600">{fmt(e.amount, currency)}</Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold bg-muted/30">
                        <td colSpan={4} className="px-3 py-2 text-sm">{t("reports.total")}</td>
                        <td className="px-3 py-2 text-sm text-right text-rose-600">{fmt(s!.totalWorkshopExpenses + s!.totalWorkerReimbursements, currency)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="sm:hidden space-y-2 p-3">
                  {data.expenses.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-md border border-border p-2.5">
                      <div>
                        <p className="text-sm font-medium">{e.description}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(e.occurredAt)} · {e.workerName ?? (e.paidWith === "cash" ? t("expenses.workshopCash") : t("expenses.workshopCard"))}</p>
                      </div>
                      <p className="text-sm font-semibold text-rose-600">{fmt(e.amount, currency)}</p>
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* ── Parts ── */}
            {data.parts.length > 0 && (
              <ReportSection title={t("reports.partsSection")} icon={<Wrench className="h-4 w-4" />}>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <Th>{t("reports.date")}</Th>
                        <Th>{t("reports.name")}</Th>
                        <Th>{t("reports.supplier")}</Th>
                        <Th right>{t("reports.qty")}</Th>
                        <Th right>{t("reports.unitPrice")}</Th>
                        <Th right>{t("reports.total")}</Th>
                        <Th>{t("reports.paidWith")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.parts.map((p) => (
                        <tr key={p.id} className="border-b border-border hover:bg-muted/20">
                          <Td>{fmtDate(p.occurredAt)}</Td>
                          <Td>{p.name}</Td>
                          <Td>{p.supplier ?? "—"}</Td>
                          <Td right>{p.quantity}</Td>
                          <Td right>{fmt(p.amount, currency)}</Td>
                          <Td right className="text-rose-600">{fmt(p.total, currency)}</Td>
                          <Td>
                            <Badge variant="outline" className="text-xs">{p.paidWith}</Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold bg-muted/30">
                        <td colSpan={5} className="px-3 py-2 text-sm">{t("reports.total")}</td>
                        <td className="px-3 py-2 text-sm text-right text-rose-600">{fmt(s!.totalParts, currency)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="sm:hidden space-y-2 p-3">
                  {data.parts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md border border-border p-2.5">
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(p.occurredAt)} · qty {p.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-rose-600">{fmt(p.total, currency)}</p>
                    </div>
                  ))}
                </div>
              </ReportSection>
            )}

            {/* Print footer */}
            <div className="hidden print:block mt-8 pt-4 border-t border-border text-xs text-muted-foreground">
              <p>{t("app.name")} · {t("reports.generatedAt")}: {new Date(data.generatedAt).toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, color, highlighted, formula }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  highlighted?: boolean;
  formula?: string;
}) {
  return (
    <div className={`rounded-xl border border-border p-3 flex flex-col gap-1 ${highlighted ? "bg-primary/5 border-primary/30" : "bg-card"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={`text-base font-bold tabular-nums ${highlighted ? "text-primary" : ""}`}>{value}</p>
      {formula && <p className="text-[10px] text-muted-foreground leading-tight">{formula}</p>}
    </div>
  );
}

function ReportSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden mb-5">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap ${right ? "text-right" : "text-left"} ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <td className={`px-3 py-2 text-sm whitespace-nowrap ${right ? "text-right" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}

function AnalysisRow({ label, value, currency, deduct, bold, highlight, sub }: {
  label: string;
  value: number;
  currency: string;
  deduct?: boolean;
  bold?: boolean;
  highlight?: "emerald" | "blue" | "rose";
  sub?: boolean;
}) {
  const absVal = Math.abs(value);
  const formatted = `${value < 0 ? "−" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(absVal)}`;
  const colorClass = highlight === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : highlight === "blue"
    ? "text-blue-700 dark:text-blue-400"
    : highlight === "rose"
    ? "text-rose-600 dark:text-rose-400"
    : deduct
    ? "text-rose-600 dark:text-rose-400"
    : sub
    ? "text-amber-600 dark:text-amber-400"
    : "text-foreground";
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${sub ? "ms-3 text-xs" : ""}`}>
      <span className={`${bold ? "font-semibold" : "text-muted-foreground"} truncate`}>{label}</span>
      <span className={`tabular-nums font-mono ${bold ? "font-bold" : ""} ${colorClass} shrink-0`}>{formatted}</span>
    </div>
  );
}

function AttachmentLinks({ attachments }: { attachments: ReportAttachment[] }) {
  if (attachments.length === 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={a.downloadPath}
          target="_blank"
          rel="noopener noreferrer"
          download={a.originalName}
          title={a.originalName}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
        >
          <AttachmentIcon mimetype={a.mimetype} />
          <span className="max-w-[100px] truncate">{a.label || a.originalName}</span>
          <Download className="h-2.5 w-2.5 shrink-0" />
        </a>
      ))}
    </div>
  );
}
