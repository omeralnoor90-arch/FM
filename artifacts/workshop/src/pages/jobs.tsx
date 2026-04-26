import { useState, useRef } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import {
  useListJobs,
  useCreateJob,
  useDeleteJob,
  useUpdateJobExpenses,
  useListWorkers,
  useGetSettings,
  useCreateJobAttachment,
  useListJobAttachments,
  getListJobsQueryKey,
  getGetSummaryQueryKey,
  getGetBalancesQueryKey,
  getGetRecentActivityQueryKey,
  getGetByWorkerQueryKey,
  type Job,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Briefcase,
  Trash2,
  Plus,
  Loader2,
  X,
  Upload,
  CheckCircle2,
  Circle,
  FileText,
  Camera,
  Users,
  User,
  Pencil,
  Eye,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

// ── Inline upload hook ─────────────────────────────────────────────────────
function useUpload(opts: {
  onSuccess?: (r: { objectPath: string }) => void;
  onError?: (e: Error) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      const meta = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      }).then((r) => r.json());
      await fetch(meta.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      opts.onSuccess?.({ objectPath: meta.objectPath });
    } catch (e) {
      opts.onError?.(e as Error);
    } finally {
      setIsUploading(false);
    }
  };
  return { uploadFile, isUploading };
}

// ── Schemas ────────────────────────────────────────────────────────────────
const expenseLineSchema = z.object({
  description: z.string().min(1),
  amount: z.coerce.number().min(0.01),
  paidByWorkerId: z.coerce.number().nullable().optional(),
});

const workerShareEntrySchema = z.object({
  workerId: z.coerce.number(),
  amount: z.coerce.number(),
});

const jobSchema = z.object({
  jobType: z.enum(["single", "shared"]).default("single"),
  workerId: z.coerce.number().optional(),
  cashReceivedByWorkerId: z.coerce.number().optional(),
  workerShares: z.array(workerShareEntrySchema).optional(),
  source: z.string().min(1),
  plateNumber: z.string().min(1, "Required"),
  carModel: z.string().min(1, "Required"),
  paymentMethod: z.enum(["cash", "card"]),
  grossAmount: z.coerce.number().min(0.01),
  vatPaidByCustomer: z.boolean(),
  expenseLines: z.array(expenseLineSchema),
  notes: z.string().optional(),
  workerPercentOverride: z.coerce.number().min(0).max(100).optional(),
});

// ── FileUploadRow ──────────────────────────────────────────────────────────
interface FileUploadRowProps {
  label: string;
  purpose: "card_invoice" | "expense_receipt" | "other";
  jobId: number;
  onDone: () => void;
}

function FileUploadRow({ label, purpose, jobId, onDone }: FileUploadRowProps) {
  const { t } = useTranslation();
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const createAttachment = useCreateJobAttachment();

  const { uploadFile, isUploading } = useUpload({
    onSuccess: async (response) => {
      await createAttachment.mutateAsync({
        id: jobId,
        data: {
          purpose,
          label,
          objectPath: response.objectPath,
          originalName: fileName ?? "file",
          mimetype: "application/octet-stream",
        },
      });
      setUploaded(response.objectPath);
      onDone();
    },
  });

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      await uploadFile(file);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {uploaded ? (
          <div className="flex items-center gap-1.5 text-emerald-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>{fileName}</span>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={handleChange} />
            <input ref={cameraRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleChange} />
            <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => cameraRef.current?.click()} className="gap-1.5 h-8">
              <Camera className="w-3.5 h-3.5" />
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isUploading} onClick={() => fileRef.current?.click()} className="gap-1.5 h-8">
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {isUploading ? t("jobs.uploading") : t("jobs.uploadFile")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDone} className="h-8 text-muted-foreground">{t("common.cancel")}</Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Edit Expenses Dialog ────────────────────────────────────────────────────
interface EditExpense { description: string; amount: number; paidByWorkerId: number | null }

function EditExpensesDialog({
  job,
  workers,
  currency,
  onClose,
  onSaved,
}: {
  job: Job;
  workers: Array<{ id: number; name: string }> | undefined;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [source, setSource] = useState(job.source ?? "");
  const [plateNumber, setPlateNumber] = useState(job.plateNumber ?? "");
  const [carModel, setCarModel] = useState(job.carModel ?? "");
  const [grossAmount, setGrossAmount] = useState(String(job.grossAmount ?? ""));
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">(job.paymentMethod as "cash" | "card");
  const [vatPaidByCustomer, setVatPaidByCustomer] = useState(job.vatPaidByCustomer ?? false);
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = job.occurredAt ? new Date(job.occurredAt) : new Date();
    return d.toISOString().slice(0, 10);
  });

  const [lines, setLines] = useState<EditExpense[]>(() =>
    (job.expenseLines ?? []).map((l) => ({
      description: l.description,
      amount: l.amount,
      paidByWorkerId: l.paidByWorkerId ?? null,
    })),
  );

  const updateExpenses = useUpdateJobExpenses();

  const addLine = () => setLines((prev) => [...prev, { description: "", amount: 0, paidByWorkerId: null }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = <K extends keyof EditExpense>(idx: number, key: K, value: EditExpense[K]) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));

  const handleSave = () => {
    const gross = Number(grossAmount);
    if (!gross || gross <= 0) {
      toast({ title: t("jobs.error"), description: t("jobs.amount") + " > 0", variant: "destructive" });
      return;
    }
    const valid = lines.filter((l) => l.description.trim() && l.amount > 0);
    updateExpenses.mutate(
      {
        id: job.id,
        data: {
          expenseLines: valid,
          source: source.trim() || undefined,
          plateNumber: plateNumber.trim() || null,
          carModel: carModel.trim() || null,
          grossAmount: gross,
          paymentMethod,
          vatPaidByCustomer: paymentMethod === "card" ? vatPaidByCustomer : false,
          occurredAt,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("jobs.expensesUpdated") });
          onSaved();
          onClose();
        },
        onError: () => toast({ title: t("jobs.error"), variant: "destructive" }),
      },
    );
  };

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("jobs.editJob")} — {job.source}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-4">
          {/* ── Job details section ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("jobs.jobDetails")}</p>

            {/* Source & Date */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs">{t("jobs.source")}</Label>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder={t("jobs.source")}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("jobs.date")}</Label>
                <Input
                  type="date"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {/* Amount & Payment method */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs">{t("jobs.amount")} ({currency})</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={grossAmount}
                  onChange={(e) => setGrossAmount(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("jobs.paymentMethod") || "Payment Method"}</Label>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`flex-1 h-8 rounded-md text-xs font-medium border transition-colors ${
                      paymentMethod === "cash"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t("jobs.cash")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={`flex-1 h-8 rounded-md text-xs font-medium border transition-colors ${
                      paymentMethod === "card"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t("jobs.card")}
                  </button>
                </div>
              </div>
            </div>

            {/* VAT toggle — only for card */}
            {paymentMethod === "card" && (
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label className="text-xs cursor-pointer">{t("jobs.vatIncluded")}</Label>
                <Switch
                  checked={vatPaidByCustomer}
                  onCheckedChange={setVatPaidByCustomer}
                />
              </div>
            )}

            {/* Plate & Car */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs">{t("jobs.plateNumber")}</Label>
                <Input
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  placeholder={t("jobs.plateNumberPlaceholder")}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t("jobs.carModel")}</Label>
                <Input
                  value={carModel}
                  onChange={(e) => setCarModel(e.target.value)}
                  placeholder={t("jobs.carModelPlaceholder")}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* ── Expenses section ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("jobs.expenses")}</p>
            {lines.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("common.noData")}</p>
            )}
            {lines.map((line, idx) => (
              <div key={idx} className="space-y-1.5 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={t("jobs.expenseDescription")}
                    className="h-9 flex-1"
                    value={line.description}
                    onChange={(e) => updateLine(idx, "description", e.target.value)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="h-9 w-28"
                    value={line.amount || ""}
                    onChange={(e) => updateLine(idx, "amount", Number(e.target.value))}
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeLine(idx)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{t("jobs.paidBy")}:</span>
                  <Select
                    value={line.paidByWorkerId != null ? String(line.paidByWorkerId) : "workshop"}
                    onValueChange={(v) => updateLine(idx, "paidByWorkerId", v === "workshop" ? null : Number(v))}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="workshop">{t("jobs.paidByWorkshop")}</SelectItem>
                      {workers?.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1">
            <Plus className="w-3 h-3" /> {t("jobs.addExpense")}
          </Button>

          {total > 0 && (
            <div className="rounded-md bg-muted/50 px-4 py-3 flex justify-between text-sm font-medium">
              <span>{t("jobs.expenses")}</span>
              <span className="font-mono text-destructive">-{formatCurrency(total, currency)}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>{t("common.cancel")}</Button>
            <Button className="flex-1" onClick={handleSave} disabled={updateExpenses.isPending}>
              {updateExpenses.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("jobs.saveChanges")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Job Detail Dialog ───────────────────────────────────────────────────────
function JobDetailDialog({
  job,
  currency,
  onClose,
  onApprove,
  onReject,
  approvingId,
}: {
  job: Job;
  currency: string;
  onClose: () => void;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  approvingId?: number | null;
}) {
  const { t } = useTranslation();
  const isCard = job.paymentMethod === "card";
  const cardFeeAmount = (job as any).cardFeeAmount ?? 0;
  const expensesTotal = job.expensesTotal ?? 0;
  const isPending = job.status === "pending";

  const { data: attachments } = useListJobAttachments(job.id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("jobs.jobDetails")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Source + plate */}
          <div>
            <p className="text-lg font-semibold leading-snug">{job.source}</p>
            {(job.plateNumber || job.carModel) && (
              <p className="text-sm font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                {[job.plateNumber, job.carModel].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
              {format(new Date(job.occurredAt), "MMM d, yyyy")}
            </span>
            {isCard ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">{t("common.card")}</span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">{t("common.cash")}</span>
            )}
            {isPending && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20">{t("portal.statusPending")}</span>
            )}
            {job.jobType === "shared" && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-700 border border-purple-500/20">{t("jobs.shared")}</span>
            )}
          </div>

          {/* Worker / Cash receiver */}
          <div className="space-y-1 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground min-w-[90px]">{t("jobs.worker")}:</span>
              <span className="font-medium">
                {job.jobType === "shared"
                  ? (job.workerShares ?? []).map((s) => s.workerName).join(", ") || t("jobs.shared")
                  : job.workerName}
              </span>
            </div>
            {!isCard && job.cashReceivedByName && (
              <div className="flex gap-2">
                <span className="text-muted-foreground min-w-[90px]">{t("jobs.cashReceiver")}:</span>
                <span className="font-medium">{job.cashReceivedByName}</span>
              </div>
            )}
          </div>

          {/* Financial breakdown */}
          <div className="rounded-md border border-border overflow-hidden divide-y divide-border text-sm">
            <div className="flex justify-between items-center px-3 py-2.5">
              <span className="text-muted-foreground">{t("jobs.amount")}</span>
              <span className="font-mono font-semibold">{formatCurrency(job.grossAmount, currency)}</span>
            </div>
            {cardFeeAmount > 0 && (
              <div className="flex justify-between items-center px-3 py-2.5">
                <span className="text-muted-foreground">{t("jobs.cardFee")} (15%)</span>
                <span className="font-mono text-destructive">-{formatCurrency(cardFeeAmount, currency)}</span>
              </div>
            )}
            {expensesTotal > 0 && (
              <div className="flex justify-between items-center px-3 py-2.5">
                <span className="text-muted-foreground">{t("jobs.expenses")}</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">-{formatCurrency(expensesTotal, currency)}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-3 py-2.5 bg-muted/30">
              <span className="font-medium">{t("jobs.netAfterFee")}</span>
              <span className="font-mono font-semibold">{formatCurrency(job.netAmount, currency)}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2.5">
              <span className="text-muted-foreground">{t("jobs.workerShare")}</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-500 font-semibold">{formatCurrency(job.workerShare, currency)}</span>
            </div>
            <div className="flex justify-between items-center px-3 py-2.5">
              <span className="text-muted-foreground">{t("jobs.workshopShare")}</span>
              <span className="font-mono text-primary font-semibold">{formatCurrency(job.workshopShare, currency)}</span>
            </div>
          </div>

          {/* Shared worker breakdown */}
          {job.jobType === "shared" && (job.workerShares ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("jobs.sharedWith")}</p>
              {(job.workerShares ?? []).map((ws, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span>{ws.workerName}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-500">{formatCurrency((ws as any).amount ?? 0, currency)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {(job as any).notes && (
            <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm">
              <p className="font-medium mb-1">{t("jobs.notes")}</p>
              <p className="text-muted-foreground">{(job as any).notes}</p>
            </div>
          )}

          {/* Attachments */}
          {attachments && attachments.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                {t("jobs.attachments")}
              </p>
              <div className="flex flex-col gap-1.5">
                {attachments.map((a) => {
                  const path = a.objectPath.replace(/^\/objects\//, "").replace(/^\//, "");
                  const href = `/api/storage/objects/${path}`;
                  const isImage = a.mimetype.startsWith("image/");
                  return (
                    <a
                      key={a.id}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={a.originalName}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border hover:bg-muted/60 transition-colors group"
                    >
                      <span className="shrink-0 text-muted-foreground group-hover:text-primary">
                        {isImage ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{a.label || a.originalName}</span>
                        <span className="block text-xs text-muted-foreground truncate">{a.originalName}</span>
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {isPending && onApprove && onReject ? (
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                variant="outline"
                disabled={approvingId === job.id}
                onClick={() => { onApprove(job.id); onClose(); }}
              >
                {approvingId === job.id ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : null}
                {t("jobs.approve")}
              </Button>
              <Button
                className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                variant="outline"
                disabled={approvingId === job.id}
                onClick={() => { onReject(job.id); onClose(); }}
              >
                {t("jobs.reject")}
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={onClose}>{t("common.close")}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Jobs() {
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<"form" | "upload">("form");
  const [savedJob, setSavedJob] = useState<Job | null>(null);
  const [activeWorkerTab, setActiveWorkerTab] = useState<string>("0");
  const [editExpensesJob, setEditExpensesJob] = useState<Job | null>(null);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);
  const [lockedWorkerIndices, setLockedWorkerIndices] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: settings } = useGetSettings();
  const { data: workers } = useListWorkers();

  const queryParams = workerFilter !== "all" ? { workerId: Number(workerFilter) } : {};
  const { data: jobs, isLoading } = useListJobs(queryParams, {
    query: { queryKey: getListJobsQueryKey(queryParams) },
  });

  const createJob = useCreateJob();
  const deleteJob = useDeleteJob();

  const { data: pendingJobs, isLoading: loadingPending } = useListJobs(
    { status: "pending" },
    { query: { staleTime: 0, refetchOnMount: "always" as const } },
  );

  const [approvingId, setApprovingId] = useState<number | null>(null);
  const handleJobStatus = async (jobId: number, status: "approved" | "rejected") => {
    setApprovingId(jobId);
    try {
      await fetch(`/api/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast({ title: status === "approved" ? t("jobs.jobApproved") : t("jobs.jobRejected") });
      queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListJobsQueryKey({ status: "pending" }) });
      queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey() });
    } catch {
      toast({ title: t("jobs.error"), variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  };

  const form = useForm<z.infer<typeof jobSchema>>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      jobType: "single",
      workerId: undefined,
      cashReceivedByWorkerId: undefined,
      workerShares: [{ workerId: 0, amount: 0 }],
      source: "",
      plateNumber: "",
      carModel: "",
      paymentMethod: "card",
      grossAmount: 0,
      vatPaidByCustomer: true,
      expenseLines: [],
      notes: "",
      workerPercentOverride: undefined,
    },
  });

  // ── Watched values for live preview ──
  const watchJobType = form.watch("jobType");
  const watchWorkerId = form.watch("workerId");
  const watchGrossAmount = form.watch("grossAmount");
  const watchPaymentMethod = form.watch("paymentMethod");
  const watchVatPaid = form.watch("vatPaidByCustomer");
  const watchExpenseLines = form.watch("expenseLines");
  const watchWorkerShares = form.watch("workerShares") ?? [];
  const watchWorkerPercentOverride = form.watch("workerPercentOverride");

  const selectedWorker = workers?.find((w) => w.id === Number(watchWorkerId));
  const gross = Number(watchGrossAmount) || 0;
  const cardFeePercent = settings?.cardFeePercent || 15;
  const isCard = watchPaymentMethod === "card";
  const vatRemoved = isCard && !watchVatPaid ? gross * (Number(cardFeePercent) / 100) : 0;
  const expensesTotal = (watchExpenseLines ?? []).reduce((s, l) => s + (Number(l?.amount) || 0), 0);
  const net = Math.max(0, gross - vatRemoved - expensesTotal);
  const totalReceived = isCard && watchVatPaid ? gross + gross * (Number(cardFeePercent) / 100) : gross;

  // Auto-fill workerPercentOverride when worker changes (single jobs)
  const prevWorkerIdRef = useRef<number | undefined>(undefined);
  const defaultWorkerPct = selectedWorker?.workerPercent ?? settings?.defaultWorkerPercent ?? 50;
  if (watchJobType === "single" && Number(watchWorkerId) !== prevWorkerIdRef.current) {
    prevWorkerIdRef.current = Number(watchWorkerId);
    if (watchWorkerId) {
      form.setValue("workerPercentOverride", defaultWorkerPct);
    }
  }

  const effectiveWorkerPercent = watchWorkerPercentOverride !== undefined ? watchWorkerPercentOverride : (watchJobType === "single" ? Number(defaultWorkerPct) : 50);
  const workerReimbursement = (watchExpenseLines ?? []).reduce(
    (s, l) => s + (Number(l?.paidByWorkerId) > 0 && Number(l?.paidByWorkerId) === Number(watchWorkerId) ? Number(l.amount) || 0 : 0),
    0,
  );
  const workerShare = net * (effectiveWorkerPercent / 100) + workerReimbursement;
  const workshopShare = net - workerShare;

  const sharedWorkerPool = net * (effectiveWorkerPercent / 100);
  const sharedWorkshopShare = net * (1 - effectiveWorkerPercent / 100);
  const sharedWorkersTotal = (watchWorkerShares ?? []).reduce((s, e) => s + (Number(e?.amount) || 0), 0);
  const sharedOverflow = sharedWorkersTotal > sharedWorkerPool + 0.001;
  const sharedRemaining = sharedWorkerPool - sharedWorkersTotal;

  const currency = settings?.currency || "USD";

  // ── Shared worker auto-distribute (respects locks) ──
  const handleWorkerAmountChange = (changedIdx: number, newValue: number) => {
    const pool = net * (effectiveWorkerPercent / 100);
    const lockedTotal = watchWorkerShares.reduce((sum, ws, i) => {
      if (i === changedIdx) return sum;
      return lockedWorkerIndices.has(i) ? sum + (Number(ws.amount) || 0) : sum;
    }, 0);
    const remaining = Math.max(0, pool - newValue - lockedTotal);
    const unlockedOthers = watchWorkerShares.map((_, i) => i).filter(
      (i) => i !== changedIdx && !lockedWorkerIndices.has(i),
    );
    if (unlockedOthers.length === 0) return;
    const perUnlocked = Number((remaining / unlockedOthers.length).toFixed(2));
    unlockedOthers.forEach((i) => {
      form.setValue(`workerShares.${i}.amount` as const, perUnlocked, { shouldDirty: true });
    });
  };

  // ── Expense lines helpers ──
  const addExpenseLine = () => {
    const current = form.getValues("expenseLines") ?? [];
    form.setValue("expenseLines", [...current, { description: "", amount: 0, paidByWorkerId: null }]);
  };
  const removeExpenseLine = (idx: number) => {
    const current = form.getValues("expenseLines") ?? [];
    form.setValue("expenseLines", current.filter((_, i) => i !== idx));
  };

  // ── Shared worker helpers ──
  const addWorkerShare = () => {
    const current = form.getValues("workerShares") ?? [];
    const newIdx = current.length;
    form.setValue("workerShares", [...current, { workerId: 0, amount: 0 }]);
    setActiveWorkerTab(String(newIdx));
  };
  const removeWorkerShare = (idx: number) => {
    const current = form.getValues("workerShares") ?? [];
    const updated = current.filter((_, i) => i !== idx);
    form.setValue("workerShares", updated.length > 0 ? updated : [{ workerId: 0, amount: 0 }]);
    setActiveWorkerTab(String(Math.max(0, idx - 1)));
    setLockedWorkerIndices((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  };

  const toggleWorkerLock = (idx: number, currentShares: { workerId: number; amount: number }[]) => {
    setLockedWorkerIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      const pool = net * (effectiveWorkerPercent / 100);
      const lockedTotal = currentShares.reduce((sum, ws, i) => next.has(i) ? sum + (Number(ws.amount) || 0) : sum, 0);
      const remaining = Math.max(0, pool - lockedTotal);
      const unlockedIndices = currentShares.map((_, i) => i).filter((i) => !next.has(i));
      if (unlockedIndices.length > 0) {
        const perUnlocked = Number((remaining / unlockedIndices.length).toFixed(2));
        unlockedIndices.forEach((i) => {
          form.setValue(`workerShares.${i}.amount` as const, perUnlocked, { shouldDirty: true });
        });
      }
      return next;
    });
  };

  // ── Submit ──
  const onSubmit = (data: z.infer<typeof jobSchema>) => {
    if (data.jobType === "single" && (!data.workerId || data.workerId < 1)) {
      form.setError("workerId", { message: t("common.required") });
      return;
    }
    if (data.jobType === "shared") {
      const shares = (data.workerShares ?? []).filter((s) => s.workerId > 0 && s.amount > 0);
      if (shares.length === 0) {
        toast({ title: t("jobs.error"), variant: "destructive" });
        return;
      }
    }

    createJob.mutate(
      { data },
      {
        onSuccess: (job) => {
          toast({ title: t("jobs.jobCreated") });
          queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey() });
          queryClient.invalidateQueries({
            predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/workers/"),
          });
          setSavedJob(job);
          const uploads =
            (data.paymentMethod === "card" ? 1 : 0) + (data.expenseLines?.length ?? 0);
          if (uploads > 0) {
            setStep("upload");
          } else {
            closeDialog();
          }
        },
        onError: () => {
          toast({ title: t("jobs.error"), variant: "destructive" });
        },
      },
    );
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setStep("form");
    setSavedJob(null);
    setActiveWorkerTab("0");
    setLockedWorkerIndices(new Set());
    prevWorkerIdRef.current = undefined;
    form.reset();
  };

  const handleDelete = (id: number) => {
    if (confirm(t("jobs.confirmDelete"))) {
      deleteJob.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: t("jobs.jobDeleted") });
            queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey() });
            queryClient.invalidateQueries({
              predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/workers/"),
            });
          },
        },
      );
    }
  };

  const savedData = form.getValues();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("jobs.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("jobs.subtitle")}</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else setDialogOpen(true); }}>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" /> {t("jobs.newJob")}
          </Button>

          <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
            {step === "form" ? (
              <>
                <DialogHeader>
                  <DialogTitle>{t("jobs.addJob")}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                  {/* ── Left: Form ── */}
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                      <FormField control={form.control} name="source" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("jobs.customer")}</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={form.control} name="plateNumber" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("jobs.plateNumber")}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t("jobs.plateNumberPlaceholder")} className="font-mono uppercase" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="carModel" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("jobs.carModel")}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder={t("jobs.carModelPlaceholder")} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField control={form.control} name="grossAmount" render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>{t("jobs.amount")}</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" min="0" placeholder="0.00" className="h-10" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />

                        <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>{t("jobs.payment")}</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger className="h-10"><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="card">{t("common.card")}</SelectItem>
                                <SelectItem value="cash">{t("common.cash")}</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>

                      {isCard && (
                        <FormField control={form.control} name="vatPaidByCustomer" render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-md border border-border p-3">
                            <div className="space-y-0.5 pe-4">
                              <FormLabel className="text-sm">{t("jobs.vatIncluded")} ({cardFeePercent}%)</FormLabel>
                              <p className="text-xs text-muted-foreground">
                                {field.value
                                  ? t("jobs.vatAmount")
                                  : t("jobs.vatInGross")}
                              </p>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )} />
                      )}

                      {!isCard && (
                        <FormField control={form.control} name="cashReceivedByWorkerId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("jobs.cashReceiver")}</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                              value={field.value !== undefined ? String(field.value) : "none"}
                            >
                              <FormControl>
                                <SelectTrigger className="h-10">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                {(workers ?? []).map((w) => (
                                  <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}

                      {/* ── Expense Lines ── */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">{t("jobs.expenses")}</Label>
                          <Button type="button" variant="outline" size="sm" onClick={addExpenseLine} className="h-7 gap-1">
                            <Plus className="w-3 h-3" /> {t("common.add")}
                          </Button>
                        </div>
                        {(watchExpenseLines ?? []).length > 0 && (
                          <div className="space-y-2">
                            {(watchExpenseLines ?? []).map((_, idx) => (
                              <div key={idx} className="space-y-1.5">
                                <div className="flex items-start gap-2">
                                  <FormField control={form.control} name={`expenseLines.${idx}.description` as const} render={({ field }) => (
                                    <FormItem className="flex-1">
                                      <FormControl>
                                        <Input placeholder={t("jobs.expenseDescription")} className="h-9" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )} />
                                  <FormField control={form.control} name={`expenseLines.${idx}.amount` as const} render={({ field }) => (
                                    <FormItem className="w-28">
                                      <FormControl>
                                        <Input type="number" step="0.01" min="0" placeholder="0.00" className="h-9" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )} />
                                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeExpenseLine(idx)}>
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                                <FormField control={form.control} name={`expenseLines.${idx}.paidByWorkerId` as const} render={({ field }) => (
                                  <FormItem>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">{t("jobs.paidBy")}:</span>
                                      <Select
                                        onValueChange={(v) => field.onChange(v === "workshop" ? null : Number(v))}
                                        value={field.value != null ? String(field.value) : "workshop"}
                                      >
                                        <FormControl>
                                          <SelectTrigger className="h-7 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="workshop">{t("jobs.paidByWorkshop")}</SelectItem>
                                          {workers?.map((w) => (
                                            <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </FormItem>
                                )} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ── Worker Assignment ── */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">{t("jobs.worker")}</Label>
                        <FormField control={form.control} name="jobType" render={({ field }) => (
                          <Tabs value={field.value} onValueChange={(v) => { field.onChange(v); setActiveWorkerTab("0"); }}>
                            <TabsList className="w-full">
                              <TabsTrigger value="single" className="flex-1 gap-1.5">
                                <User className="w-3.5 h-3.5" /> {t("jobs.single")}
                              </TabsTrigger>
                              <TabsTrigger value="shared" className="flex-1 gap-1.5">
                                <Users className="w-3.5 h-3.5" /> {t("jobs.shared")}
                              </TabsTrigger>
                            </TabsList>

                            {/* ── Single worker tab ── */}
                            <TabsContent value="single" className="mt-3 space-y-2">
                              <FormField control={form.control} name="workerId" render={({ field }) => (
                                <FormItem>
                                  <Select onValueChange={field.onChange} value={field.value ? String(field.value) : ""}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {workers?.map((w) => (
                                        <SelectItem key={w.id} value={String(w.id)}>
                                          {w.name} ({w.workerPercent}%)
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="workerPercentOverride" render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("jobs.workerShare")} %:</Label>
                                    <div className="flex items-center gap-1 flex-1">
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="1"
                                          className="h-8 w-20 text-sm text-end"
                                          value={field.value ?? ""}
                                          onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                                        />
                                      </FormControl>
                                      <span className="text-xs text-muted-foreground">%</span>
                                      {selectedWorker && field.value !== selectedWorker.workerPercent && (
                                        <button
                                          type="button"
                                          onClick={() => field.onChange(selectedWorker.workerPercent)}
                                          className="text-xs text-primary hover:underline ms-1"
                                        >
                                          {t("common.reset")} ({selectedWorker.workerPercent}%)
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            </TabsContent>

                            {/* ── Shared job tab ── */}
                            <TabsContent value="shared" className="mt-3 space-y-3">
                              <div className="rounded-md bg-muted/60 border border-border px-3 py-2 text-xs space-y-1">
                                <div className="flex justify-between items-center gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-medium text-foreground shrink-0">{t("jobs.workers")}</span>
                                    <FormField control={form.control} name="workerPercentOverride" render={({ field }) => (
                                      <div className="flex items-center gap-0.5">
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="1"
                                          className="h-6 w-14 text-xs text-end px-1.5 font-semibold"
                                          value={field.value ?? 50}
                                          onChange={(e) => {
                                            const v = Number(e.target.value);
                                            field.onChange(isNaN(v) ? 50 : Math.min(100, Math.max(0, v)));
                                          }}
                                        />
                                        <span className="text-muted-foreground">%</span>
                                      </div>
                                    )} />
                                  </div>
                                  <span className="font-mono font-semibold">{formatCurrency(sharedWorkerPool, currency)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className={sharedOverflow ? "text-destructive font-medium" : "text-muted-foreground"}>
                                    {sharedOverflow ? "↑" : t("jobs.totalPercent")}
                                  </span>
                                  <span className={`font-mono ${sharedOverflow ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                                    {formatCurrency(Math.abs(sharedRemaining), currency)}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                {watchWorkerShares.map((ws, idx) => {
                                  const isLocked = lockedWorkerIndices.has(idx);
                                  const showLock = watchWorkerShares.length >= 2;
                                  return (
                                    <div key={idx} className="flex items-center gap-1.5">
                                      <FormField control={form.control} name={`workerShares.${idx}.workerId` as const} render={({ field }) => (
                                        <FormItem className="flex-1 m-0">
                                          <Select onValueChange={field.onChange} value={field.value ? String(field.value) : ""}>
                                            <FormControl>
                                              <SelectTrigger className="h-9">
                                                <SelectValue />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              {workers?.map((w) => (
                                                <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <FormMessage />
                                        </FormItem>
                                      )} />
                                      <FormField control={form.control} name={`workerShares.${idx}.amount` as const} render={({ field }) => (
                                        <FormItem className="m-0 w-24 shrink-0">
                                          <FormControl>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              placeholder="0.00"
                                              className={`h-9 text-end ${isLocked ? "bg-muted/60 font-semibold" : ""}`}
                                              value={field.value || ""}
                                              onChange={(e) => {
                                                const val = Number(e.target.value);
                                                field.onChange(val);
                                                handleWorkerAmountChange(idx, val);
                                              }}
                                              onBlur={field.onBlur}
                                              name={field.name}
                                              ref={field.ref}
                                            />
                                          </FormControl>
                                        </FormItem>
                                      )} />
                                      {showLock && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className={`h-9 w-9 shrink-0 ${isLocked ? "text-emerald-600 dark:text-emerald-500" : "text-muted-foreground"}`}
                                          onClick={() => toggleWorkerLock(idx, watchWorkerShares as { workerId: number; amount: number }[])}
                                        >
                                          {isLocked
                                            ? <CheckCircle2 className="w-4 h-4" />
                                            : <Circle className="w-4 h-4" />
                                          }
                                        </Button>
                                      )}
                                      {watchWorkerShares.length > 1 && (
                                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => removeWorkerShare(idx)}>
                                          <X className="w-3.5 h-3.5" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              <Button type="button" variant="outline" size="sm" onClick={addWorkerShare} className="gap-1 h-8">
                                <Plus className="w-3 h-3" /> {t("workers.addWorker")}
                              </Button>
                            </TabsContent>
                          </Tabs>
                        )} />
                      </div>

                      <FormField control={form.control} name="notes" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("jobs.description")}</FormLabel>
                          <FormControl>
                            <Textarea className="resize-none" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <Button type="submit" className="w-full" disabled={createJob.isPending}>
                        {createJob.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                        {t("jobs.addJob")}
                      </Button>
                    </form>
                  </Form>

                  {/* ── Right: Live Preview ── */}
                  <div className="bg-muted/50 p-6 rounded-lg border border-border flex flex-col justify-center space-y-6">
                    <div>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">
                        {t("jobs.workerShare")} / {t("jobs.workshopShare")}
                      </h3>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-foreground font-medium">{t("jobs.amount")}</span>
                          <span className="font-mono">{formatCurrency(gross, currency)}</span>
                        </div>

                        {isCard && watchVatPaid && (
                          <div className="flex justify-between items-center rounded-md bg-primary/8 px-3 py-2 border border-primary/20">
                            <span className="text-sm font-semibold text-foreground">
                              {t("jobs.vatIncluded")} ({cardFeePercent}%)
                            </span>
                            <span className="font-mono font-bold text-primary">
                              {formatCurrency(totalReceived, currency)}
                            </span>
                          </div>
                        )}

                        {vatRemoved > 0 && (
                          <div className="flex justify-between items-center text-destructive">
                            <span className="text-sm">{t("jobs.cardFee")} ({cardFeePercent}%)</span>
                            <span className="font-mono">-{formatCurrency(vatRemoved, currency)}</span>
                          </div>
                        )}

                        {expensesTotal > 0 && (
                          <div className="flex justify-between items-center text-destructive">
                            <span className="text-sm">{t("jobs.expenses")}</span>
                            <span className="font-mono">-{formatCurrency(expensesTotal, currency)}</span>
                          </div>
                        )}

                        <div className="h-px bg-border my-2" />

                        <div className="flex justify-between items-center">
                          <span className="text-foreground font-medium">{t("jobs.netAfterFee")}</span>
                          <span className="font-mono font-semibold">{formatCurrency(net, currency)}</span>
                        </div>
                      </div>
                    </div>

                    {/* ── Single mode split ── */}
                    {watchJobType === "single" && (
                      <div className="space-y-3 pt-4 border-t border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            {t("jobs.workerShare")} ({effectiveWorkerPercent}%)
                          </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-500 font-semibold">
                            {formatCurrency(net * (effectiveWorkerPercent / 100), currency)}
                          </span>
                        </div>
                        {workerReimbursement > 0 && (
                          <div className="flex justify-between items-center text-amber-600 dark:text-amber-400">
                            <span className="text-xs">+ {t("workerDetail.stats.reimbursements")}</span>
                            <span className="font-mono text-xs">+{formatCurrency(workerReimbursement, currency)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center font-medium">
                          <span className="text-sm text-emerald-600 dark:text-emerald-500">
                            {selectedWorker?.name ?? t("jobs.worker")}
                          </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-500 font-semibold">
                            {formatCurrency(workerShare, currency)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">
                            {t("jobs.workshopShare")}
                          </span>
                          <span className="font-mono text-primary font-semibold">
                            {formatCurrency(workshopShare, currency)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* ── Shared mode split ── */}
                    {watchJobType === "shared" && (
                      <div className="space-y-2 pt-4 border-t border-border">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">{t("jobs.workshopShare")} ({100 - effectiveWorkerPercent}%)</span>
                          <span className="font-mono font-semibold text-primary">
                            {formatCurrency(sharedWorkshopShare, currency)}
                          </span>
                        </div>
                        <div className="h-px bg-border" />
                        {watchWorkerShares.map((ws, idx) => {
                          const w = workers?.find((x) => x.id === Number(ws.workerId));
                          const baseAmt = Number(ws.amount) || 0;
                          const reimb = (watchExpenseLines ?? []).reduce(
                            (s, l) => s + (Number(l?.paidByWorkerId) > 0 && Number(l?.paidByWorkerId) === Number(ws.workerId) ? Number(l.amount) || 0 : 0),
                            0,
                          );
                          const total = baseAmt + reimb;
                          return (
                            <div key={idx} className="space-y-0.5 ps-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">{w ? w.name : `${t("jobs.worker")} ${idx + 1}`}</span>
                                <span className={`font-mono font-semibold ${sharedOverflow ? "text-destructive" : "text-emerald-600 dark:text-emerald-500"}`}>
                                  {formatCurrency(total, currency)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {sharedOverflow && (
                          <p className="text-xs text-destructive font-medium pt-1">
                            {formatCurrency(Math.abs(sharedRemaining), currency)} over
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* ── Step 2: Upload Attachments ── */
              <>
                <DialogHeader>
                  <DialogTitle>{t("jobs.attachments")}</DialogTitle>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <div className="rounded-md border border-border divide-y divide-border overflow-hidden">
                    {savedJob?.paymentMethod === "card" && savedJob && (
                      <div className="px-4 py-1">
                        <FileUploadRow label={t("jobs.payment")} purpose="card_invoice" jobId={savedJob.id} onDone={() => {}} />
                      </div>
                    )}
                    {savedJob && (savedData.expenseLines ?? []).length > 0 && (
                      <div className="px-4 py-1">
                        {(savedData.expenseLines ?? []).map((line, idx) => (
                          <FileUploadRow
                            key={idx}
                            label={line.description || `${t("jobs.expenses")} ${idx + 1}`}
                            purpose="expense_receipt"
                            jobId={savedJob.id}
                            onDone={() => {}}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <Button className="w-full" onClick={closeDialog}>{t("common.confirm")}</Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Edit Expenses Dialog ── */}
      {editExpensesJob && (
        <EditExpensesDialog
          job={editExpensesJob}
          workers={workers}
          currency={currency}
          onClose={() => setEditExpensesJob(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: getListJobsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey() });
          }}
        />
      )}

      {/* ── Job Preview Dialog ── */}
      {previewJob && (
        <JobDetailDialog
          job={previewJob}
          currency={currency}
          onClose={() => setPreviewJob(null)}
          onApprove={previewJob.status === "pending" ? (id) => handleJobStatus(id, "approved") : undefined}
          onReject={previewJob.status === "pending" ? (id) => handleJobStatus(id, "rejected") : undefined}
          approvingId={approvingId}
        />
      )}

      {/* ── Pending Approvals ── */}
      {(loadingPending || (pendingJobs && pendingJobs.length > 0)) && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
              {t("jobs.pendingApprovals")} {pendingJobs && pendingJobs.length > 0 && `(${pendingJobs.length})`}
            </h3>
            <p className="text-amber-700 dark:text-amber-400 text-xs ms-1">{t("jobs.pendingDesc")}</p>
          </div>
          {pendingJobs && pendingJobs.length > 0 && (
            <div className="space-y-2">
              {pendingJobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white dark:bg-zinc-900 border border-amber-200 dark:border-amber-800/40 rounded-md p-3 space-y-2"
                >
                  {/* Top row: info */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-snug">{job.source}</p>
                      {job.plateNumber && (
                        <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                          {job.plateNumber}{job.carModel ? ` · ${job.carModel}` : ""}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {job.workerName} · {format(new Date(job.occurredAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="font-mono text-sm font-semibold">{formatCurrency(job.grossAmount, currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.paymentMethod === "cash" ? t("common.cash") : t("common.card")}
                      </p>
                    </div>
                  </div>
                  {/* Bottom row: action buttons full-width on mobile */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
                      onClick={() => setPreviewJob(job)}
                      title={t("jobs.viewDetails")}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 border-emerald-500 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-xs"
                      disabled={approvingId === job.id}
                      onClick={() => handleJobStatus(job.id, "approved")}
                    >
                      {approvingId === job.id ? <Loader2 className="w-3 h-3 animate-spin me-1" /> : null}
                      {t("jobs.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 border-destructive text-destructive hover:bg-destructive/10 text-xs"
                      disabled={approvingId === job.id}
                      onClick={() => handleJobStatus(job.id, "rejected")}
                    >
                      {t("jobs.reject")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Filter ── */}
      <div className="flex gap-4 items-center mb-4">
        <div className="w-64">
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("nav.workers")}</SelectItem>
              {workers?.map((w) => (
                <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Jobs Table ── */}
      <div className="bg-card rounded-md border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : jobs && jobs.length > 0 ? (
          <div className="divide-y divide-border">
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-[120px_1fr_140px_105px_90px_105px_115px_96px] gap-x-3 px-4 py-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <div>{t("jobs.date")}</div>
              <div>{t("jobs.customer")}</div>
              <div>{t("jobs.worker")}</div>
              <div className="text-end">{t("jobs.amount")}</div>
              <div className="text-end">{t("jobs.cardFee")}</div>
              <div className="text-end">{t("jobs.netAfterFee")}</div>
              <div className="text-end">{t("jobs.workerShare")}</div>
              <div></div>
            </div>
            {jobs.map((job) => {
              const jobBadges = (
                <>
                  {job.plateNumber && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20" title={job.carModel ?? ""}>
                      {job.plateNumber}
                    </span>
                  )}
                  {job.paymentMethod === "card" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/10 text-secondary border border-secondary/20">{t("common.card")}</span>
                  )}
                  {job.paymentMethod === "cash" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">{t("common.cash")}</span>
                  )}
                  {(job.expensesTotal ?? 0) > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20">{t("jobs.expenses").slice(0, 3)}</span>
                  )}
                  {job.jobType === "shared" && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-700 border border-purple-500/20">{t("jobs.shared")}</span>
                  )}
                  {job.paymentMethod === "cash" && job.cashReceivedByName && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-700 border border-orange-500/20" title={job.cashReceivedByName}>
                      💵 {job.cashReceivedByName}
                    </span>
                  )}
                </>
              );
              const actionBtns = (
                <>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => setPreviewJob(job)} title={t("jobs.viewDetails")}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => setEditExpensesJob(job)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(job.id)} disabled={deleteJob.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              );
              return (
                <div key={job.id}>
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-[120px_1fr_140px_105px_90px_105px_115px_96px] gap-x-3 px-4 py-3 items-start text-sm hover:bg-muted/10 transition-colors">
                    <div className="text-muted-foreground text-xs pt-0.5 whitespace-nowrap">
                      {format(new Date(job.occurredAt), "MMM d, yyyy")}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{job.source}</div>
                      <div className="flex flex-wrap gap-1 mt-1">{jobBadges}</div>
                    </div>
                    <div className="text-muted-foreground text-xs pt-0.5 truncate">
                      {job.jobType === "shared" ? (
                        <span className="italic">{(job.workerShares ?? []).map((s) => s.workerName).join(", ") || t("jobs.shared")}</span>
                      ) : (
                        <Link href={`/workers/${job.workerId}`}>
                          <a className="hover:underline hover:text-primary transition-colors">{job.workerName}</a>
                        </Link>
                      )}
                    </div>
                    <div className="text-end font-mono text-sm">{formatCurrency(job.grossAmount, currency)}</div>
                    <div className="text-end font-mono text-sm">
                      {(job as any).cardFeeAmount > 0
                        ? <span className="text-destructive">{formatCurrency((job as any).cardFeeAmount, currency)}</span>
                        : <span className="text-muted-foreground/40">—</span>
                      }
                    </div>
                    <div className="text-end font-mono text-sm text-muted-foreground">{formatCurrency(job.netAmount, currency)}</div>
                    <div className="text-end font-mono text-sm text-emerald-600 dark:text-emerald-500 font-medium">{formatCurrency(job.workerShare, currency)}</div>
                    <div className="flex items-center justify-end gap-0.5">{actionBtns}</div>
                  </div>

                  {/* Mobile card row */}
                  <div className="md:hidden px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{job.source}</div>
                        <div className="flex flex-wrap gap-1 mt-1">{jobBadges}</div>
                        <div className="text-xs text-muted-foreground mt-1.5">
                          {format(new Date(job.occurredAt), "MMM d, yyyy")}
                          {" · "}
                          {job.jobType === "shared"
                            ? ((job.workerShares ?? []).map((s) => s.workerName).join(", ") || t("jobs.shared"))
                            : job.workerName}
                        </div>
                      </div>
                      <div className="shrink-0 text-end">
                        <div className="font-mono text-sm font-semibold">{formatCurrency(job.grossAmount, currency)}</div>
                        <div className="font-mono text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">{formatCurrency(job.workerShare, currency)}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-0.5 mt-1.5">{actionBtns}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Briefcase className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium">{t("jobs.noJobs")}</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mt-1 mb-6">
              {t("jobs.noJobsHint")}
            </p>
            <Button onClick={() => setDialogOpen(true)}>{t("jobs.addJob")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
