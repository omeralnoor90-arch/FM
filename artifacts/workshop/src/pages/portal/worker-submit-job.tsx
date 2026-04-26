import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "react-i18next";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Plus,
  Trash2,
  Send,
  CreditCard,
  Banknote,
  Upload,
  Camera,
  CheckCircle2,
  FileText,
  Users,
  User,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────
interface WorkerInfo {
  id: number;
  name: string;
  workerPercent: number;
}

// ── Inline File Picker ──────────────────────────────────────────────────────
function InlineFilePicker({
  label,
  fileKey,
  selectedName,
  onFileSelected,
}: {
  label: string;
  fileKey: string;
  selectedName: string | null;
  onFileSelected: (key: string, file: File) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(fileKey, file);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-zinc-700 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="text-sm text-zinc-300 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {selectedName ? (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="truncate max-w-[100px]">{selectedName}</span>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleChange} />
            <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleChange} />
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()}
              className="h-8 px-2 bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700">
              <Camera className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}
              className="h-8 gap-1.5 bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700">
              <Upload className="w-3.5 h-3.5" />
              {t("portal.chooseFile")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Schema ──────────────────────────────────────────────────────────────────
const submitSchema = z.object({
  source: z.string().min(1),
  plateNumber: z.string().min(1, "Required"),
  carModel: z.string().min(1, "Required"),
  grossAmount: z.coerce.number().positive(),
  paymentMethod: z.enum(["cash", "card"]),
  vatPaidByCustomer: z.boolean().default(true),
  cashReceivedByWorker: z.boolean().default(true),
  occurredAt: z.string().min(1),
  notes: z.string().optional(),
  jobType: z.enum(["single", "shared"]).default("single"),
  workerShares: z
    .array(
      z.object({
        workerId: z.number(),
        workerName: z.string(),
        amount: z.coerce.number().min(0),
      }),
    )
    .optional()
    .default([]),
  expenseLines: z
    .array(
      z.object({
        description: z.string().min(1),
        amount: z.coerce.number().min(0),
        paidBy: z.enum(["worker", "workshop"]).default("workshop"),
      }),
    )
    .optional()
    .default([]),
});

type SubmitForm = z.infer<typeof submitSchema>;

// ── Upload helper ────────────────────────────────────────────────────────────
async function uploadFileToJob(jobId: number, file: File, purpose: string, label: string) {
  const meta = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  }).then((r) => r.json());
  await fetch(meta.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  await fetch(`/api/jobs/${jobId}/attachments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose, label, objectPath: meta.objectPath, originalName: file.name, mimetype: file.type }),
  });
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function WorkerSubmitJob() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isPending, setIsPending] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [allWorkers, setAllWorkers] = useState<WorkerInfo[]>([]);

  // File storage: key → File object (not state to avoid re-renders)
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  // File names for UI display
  const [fileNames, setFileNames] = useState<Map<string, string>>(new Map());

  const todayStr = new Date().toISOString().slice(0, 10);

  const form = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      source: "",
      plateNumber: "",
      carModel: "",
      grossAmount: 0,
      paymentMethod: "cash",
      vatPaidByCustomer: true,
      cashReceivedByWorker: true,
      occurredAt: todayStr,
      notes: "",
      jobType: "single",
      workerShares: [],
      expenseLines: [],
    },
  });

  const { fields: expenseFields, append: appendExpense, remove: removeExpense } = useFieldArray({
    control: form.control,
    name: "expenseLines",
  });

  const { fields: shareFields, append: appendShare, remove: removeShare } = useFieldArray({
    control: form.control,
    name: "workerShares",
  });

  // Fetch workers list for shared job selection
  useEffect(() => {
    fetch("/api/workers", { credentials: "include" })
      .then((r) => r.json())
      .then((data: WorkerInfo[]) => setAllWorkers(data))
      .catch(() => {});
  }, []);

  const paymentMethod = form.watch("paymentMethod");
  const jobType = form.watch("jobType");
  const grossAmount = Number(form.watch("grossAmount")) || 0;
  const expenseLines = form.watch("expenseLines") || [];
  const workerShares = form.watch("workerShares") || [];
  const expensesTotal = expenseLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const vatPaidByCustomer = form.watch("vatPaidByCustomer");

  // Live preview calculations
  const isCard = paymentMethod === "card";
  const vatDeducted = isCard && !vatPaidByCustomer ? grossAmount * 0.15 : 0;
  const net = Math.max(0, grossAmount - vatDeducted - expensesTotal);
  const workerPool = net * 0.5;
  const allocatedShares = workerShares.reduce((s, w) => s + (Number(w.amount) || 0), 0);
  const poolRemaining = workerPool - allocatedShares;

  // File handlers
  const handleFileSelected = (key: string, file: File) => {
    pendingFilesRef.current.set(key, file);
    setFileNames((prev) => new Map(prev).set(key, file.name));
  };

  const getFileName = (key: string) => fileNames.get(key) ?? null;

  // Workers not yet added to the share list
  const usedWorkerIds = new Set(shareFields.map((f) => f.workerId));
  const availableWorkers = allWorkers.filter((w) => !usedWorkerIds.has(w.id));

  const addWorker = (worker: WorkerInfo) => {
    appendShare({ workerId: worker.id, workerName: worker.name, amount: 0 });
  };

  const onSubmit = async (data: SubmitForm) => {
    setIsPending(true);
    try {
      const res = await fetch("/api/portal/jobs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: data.source,
          plateNumber: data.plateNumber,
          carModel: data.carModel,
          grossAmount: data.grossAmount,
          paymentMethod: data.paymentMethod,
          vatPaidByCustomer: data.paymentMethod === "card" ? data.vatPaidByCustomer : true,
          cashReceivedByWorker: data.paymentMethod === "cash" ? data.cashReceivedByWorker : false,
          occurredAt: data.occurredAt,
          notes: data.notes || undefined,
          jobType: data.jobType,
          workerShares: data.jobType === "shared"
            ? (data.workerShares ?? []).filter((s) => s.amount > 0)
            : [],
          expenseLines: (data.expenseLines ?? [])
            .filter((l) => l.description && l.amount > 0)
            .map((l) => ({ description: l.description, amount: l.amount, paidBy: l.paidBy })),
        }),
      });

      if (!res.ok) throw new Error("Failed");
      const job = await res.json();

      // Upload any selected files
      const filesToUpload = Array.from(pendingFilesRef.current.entries());
      if (filesToUpload.length > 0) {
        setIsUploadingFiles(true);
        await Promise.all(
          filesToUpload.map(([key, file]) => {
            if (key === "card_invoice") {
              return uploadFileToJob(job.id, file, "card_invoice", t("portal.cardInvoiceLabel"));
            } else if (key.startsWith("expense_")) {
              const idx = Number(key.replace("expense_", ""));
              const exp = (data.expenseLines ?? [])[idx];
              return uploadFileToJob(job.id, file, "expense_receipt", `${t("portal.expenseReceiptLabel")}: ${exp?.description ?? ""}`);
            }
            return Promise.resolve();
          }),
        );
      }

      toast({ title: t("portal.jobSubmitted"), description: t("portal.jobSubmittedDesc") });
      navigate("/portal/jobs");
    } catch {
      toast({ title: t("jobs.error"), variant: "destructive" });
    } finally {
      setIsPending(false);
      setIsUploadingFiles(false);
    }
  };

  const submitting = isPending || isUploadingFiles;

  return (
    <div className="space-y-4 pb-6">
      <div className="pt-2">
        <h1 className="text-white text-xl font-bold">{t("portal.submitJobTitle")}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">{t("portal.submitJobHint")}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          {/* Source */}
          <FormField control={form.control} name="source" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-300">{t("portal.source")}</FormLabel>
              <FormControl>
                <Input {...field}
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
                  placeholder={t("portal.source")} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Plate Number + Car Model */}
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="plateNumber" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-zinc-300">{t("jobs.plateNumber")}</FormLabel>
                <FormControl>
                  <Input {...field}
                    placeholder={t("jobs.plateNumberPlaceholder")}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 font-mono uppercase" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="carModel" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-zinc-300">{t("jobs.carModel")}</FormLabel>
                <FormControl>
                  <Input {...field}
                    placeholder={t("jobs.carModelPlaceholder")}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {/* Gross Amount */}
          <FormField control={form.control} name="grossAmount" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-300">{t("jobs.amount")}</FormLabel>
              <FormControl>
                <Input {...field} type="number" step="0.01" min="0"
                  className="bg-zinc-800 border-zinc-700 text-white" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* Payment Method */}
          <FormField control={form.control} name="paymentMethod" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-300">{t("jobs.payment")}</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => field.onChange("cash")}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                    field.value === "cash"
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                  }`}>
                  <Banknote size={16} /> {t("common.cash")}
                </button>
                <button type="button" onClick={() => field.onChange("card")}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                    field.value === "card"
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                  }`}>
                  <CreditCard size={16} /> {t("common.card")}
                </button>
              </div>
            </FormItem>
          )} />

          {/* VAT toggle (card only) */}
          {paymentMethod === "card" && (
            <FormField control={form.control} name="vatPaidByCustomer" render={({ field }) => (
              <FormItem className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md p-3">
                <div className="space-y-0.5 pe-4">
                  <FormLabel className="text-zinc-300 text-sm cursor-pointer mb-0">
                    {t("jobs.vatIncluded")}
                  </FormLabel>
                  <p className="text-xs text-zinc-400">
                    {field.value ? t("jobs.vatAmount") : t("jobs.vatInGross")}
                  </p>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )} />
          )}

          {/* Cash receiver toggle (cash only) */}
          {paymentMethod === "cash" && (
            <FormField control={form.control} name="cashReceivedByWorker" render={({ field }) => (
              <FormItem className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-md p-3">
                <FormLabel className="text-zinc-300 text-sm cursor-pointer mb-0">
                  {t("portal.iReceivedCash")}
                </FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )} />
          )}

          {/* Date */}
          <FormField control={form.control} name="occurredAt" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-300">{t("jobs.date")}</FormLabel>
              <FormControl>
                <Input {...field} type="date" className="bg-zinc-800 border-zinc-700 text-white" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          {/* ── Job Type (Single / Shared) ── */}
          <FormField control={form.control} name="jobType" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-300">{t("portal.jobType")}</FormLabel>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { field.onChange("single"); form.setValue("workerShares", []); }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                    field.value === "single"
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                  }`}>
                  <User size={15} /> {t("portal.onlyMe")}
                </button>
                <button type="button" onClick={() => {
                  field.onChange("shared");
                  const me = allWorkers.find((w) => w.id === user?.workerId);
                  if (me && !shareFields.some((f) => f.workerId === me.id)) {
                    appendShare({ workerId: me.id, workerName: me.name, amount: 0 });
                  }
                }}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                    field.value === "shared"
                      ? "bg-violet-600 border-violet-600 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                  }`}>
                  <Users size={15} /> {t("portal.sharedWithOthers")}
                </button>
              </div>
            </FormItem>
          )} />

          {/* ── Worker Shares (shared jobs only) ── */}
          {jobType === "shared" && (
            <Card className="bg-zinc-900 border-zinc-700">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm text-zinc-300">{t("portal.workerSplit")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3 px-4 space-y-3">
                {/* Pool summary */}
                {grossAmount > 0 && (
                  <div className="rounded-md bg-zinc-800 px-3 py-2 text-xs flex justify-between">
                    <span className="text-zinc-400">{t("portal.workerPoolHint")}</span>
                    <span className="text-white font-mono font-semibold">{workerPool.toFixed(2)}</span>
                  </div>
                )}

                {shareFields.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-2">{t("common.noData")}</p>
                )}

                {shareFields.map((sf, idx) => (
                  <div key={sf.id} className="flex items-center gap-2 rounded-md border border-zinc-700 p-2.5">
                    <span className="text-sm text-zinc-300 flex-1 truncate">{sf.workerName}</span>
                    <FormField control={form.control} name={`workerShares.${idx}.amount`}
                      render={({ field: f }) => (
                        <Input {...f} type="number" step="0.01" min="0"
                          placeholder="0.00"
                          className="bg-zinc-800 border-zinc-700 text-white text-sm w-28 h-8" />
                      )} />
                    <Button type="button" variant="ghost" size="icon"
                      className="h-8 w-8 text-zinc-500 hover:text-destructive shrink-0"
                      onClick={() => removeShare(idx)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}

                {/* Add worker dropdown — key resets it after each pick */}
                {availableWorkers.length > 0 && (
                  <Select key={shareFields.length} onValueChange={(val) => {
                    const w = allWorkers.find((w) => String(w.id) === val);
                    if (w) addWorker(w);
                  }}>
                    <SelectTrigger className="h-8 text-xs bg-zinc-800 border-zinc-700 text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <Plus size={13} />
                        <span>{t("portal.addWorker")}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {availableWorkers.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Remaining pool */}
                {grossAmount > 0 && shareFields.length > 0 && (
                  <div className={`rounded-md px-3 py-2 text-xs flex justify-between ${
                    poolRemaining < 0 ? "bg-red-900/30 border border-red-800/50" : "bg-zinc-800"
                  }`}>
                    <span className="text-zinc-400">{t("portal.poolRemaining")}</span>
                    <span className={`font-mono font-semibold ${poolRemaining < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {poolRemaining.toFixed(2)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-zinc-300">{t("portal.submitNotes")}</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2}
                  className="bg-zinc-800 border-zinc-700 text-white resize-none placeholder:text-zinc-500" />
              </FormControl>
            </FormItem>
          )} />

          {/* ── Expense Lines ── */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-zinc-300">{t("jobs.expenses")}</CardTitle>
                <Button type="button" variant="ghost" size="sm"
                  className="h-7 text-xs text-zinc-400 hover:text-white"
                  onClick={() => appendExpense({ description: "", amount: 0, paidBy: "workshop" })}>
                  <Plus size={14} className="me-1" /> {t("jobs.addExpense")}
                </Button>
              </div>
            </CardHeader>
            {expenseFields.length > 0 && (
              <CardContent className="pt-0 pb-3 px-4 space-y-3">
                {expenseFields.map((field, idx) => (
                  <div key={field.id} className="rounded-md border border-zinc-700 p-2.5 space-y-2">
                    <div className="flex gap-2 items-center">
                      <FormField control={form.control} name={`expenseLines.${idx}.description`}
                        render={({ field: f }) => (
                          <Input {...f}
                            placeholder={t("jobs.expenseDescription")}
                            className="bg-zinc-800 border-zinc-700 text-white text-sm flex-1 h-8 placeholder:text-zinc-500" />
                        )} />
                      <FormField control={form.control} name={`expenseLines.${idx}.amount`}
                        render={({ field: f }) => (
                          <Input {...f} type="number" step="0.01" min="0" placeholder="0"
                            className="bg-zinc-800 border-zinc-700 text-white text-sm w-24 h-8" />
                        )} />
                      <Button type="button" variant="ghost" size="icon"
                        className="h-8 w-8 text-zinc-500 hover:text-destructive shrink-0"
                        onClick={() => removeExpense(idx)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    {/* Paid By */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400 whitespace-nowrap">{t("jobs.paidBy")}:</span>
                      <FormField control={form.control} name={`expenseLines.${idx}.paidBy`}
                        render={({ field: f }) => (
                          <Select value={f.value} onValueChange={f.onChange}>
                            <SelectTrigger className="h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-300">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="workshop">{t("jobs.paidByWorkshop")}</SelectItem>
                              <SelectItem value="worker">{t("portal.paidByMe")}</SelectItem>
                            </SelectContent>
                          </Select>
                        )} />
                    </div>
                    {/* Inline receipt attachment for this expense */}
                    <InlineFilePicker
                      label={`${t("portal.expenseReceiptLabel")}: ${form.watch(`expenseLines.${idx}.description`) || "..."}`}
                      fileKey={`expense_${idx}`}
                      selectedName={getFileName(`expense_${idx}`)}
                      onFileSelected={handleFileSelected}
                    />
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {/* ── Invoices & Receipts ── */}
          {paymentMethod === "card" && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm text-zinc-300">{t("portal.invoicesReceipts")}</CardTitle>
                <p className="text-xs text-zinc-500 mt-0.5">{t("portal.invoicesReceiptsHint")}</p>
              </CardHeader>
              <CardContent className="pt-0 pb-2 px-4">
                <InlineFilePicker
                  label={t("portal.cardInvoiceLabel")}
                  fileKey="card_invoice"
                  selectedName={getFileName("card_invoice")}
                  onFileSelected={handleFileSelected}
                />
              </CardContent>
            </Card>
          )}

          {/* ── Live Preview ── */}
          {grossAmount > 0 && (
            <Card className="bg-zinc-900 border-zinc-700">
              <CardContent className="py-3 px-4 space-y-1">
                <p className="text-zinc-400 text-xs mb-2">{t("jobs.workerShare")}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">{t("jobs.amount")}</span>
                  <span className="text-white font-mono">{grossAmount.toFixed(2)}</span>
                </div>
                {vatDeducted > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">{t("jobs.cardFee")} (15%)</span>
                    <span className="text-amber-400 font-mono">-{vatDeducted.toFixed(2)}</span>
                  </div>
                )}
                {expensesTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">{t("jobs.expenses")}</span>
                    <span className="text-amber-400 font-mono">-{expensesTotal.toFixed(2)}</span>
                  </div>
                )}
                {jobType === "shared" ? (
                  <div className="flex justify-between text-sm border-t border-zinc-700 pt-1 mt-1">
                    <span className="text-zinc-400">{t("portal.workerPoolHint")}</span>
                    <span className="text-violet-400 font-mono font-semibold">{workerPool.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm border-t border-zinc-700 pt-1 mt-1">
                    <span className="text-zinc-400">{t("jobs.netAfterFee")}</span>
                    <span className="text-emerald-400 font-mono font-semibold">{net.toFixed(2)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Button type="submit" disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {submitting
              ? <><Loader2 size={16} className="animate-spin me-2" />
                  {isUploadingFiles ? t("portal.uploadingFiles") : t("login.submitting")}</>
              : <><Send size={16} className="me-2" />{t("portal.submitJob")}</>}
          </Button>
        </form>
      </Form>
    </div>
  );
}
