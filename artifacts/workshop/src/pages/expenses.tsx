import { useRef, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { 
  useListExpenses, 
  useCreateExpense, 
  useDeleteExpense, 
  useListWorkers,
  useGetSettings,
  getListExpensesQueryKey,
  getGetSummaryQueryKey,
  getGetBalancesQueryKey,
  getGetRecentActivityQueryKey,
  type Expense,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Trash2, Plus, Loader2, Banknote, Pencil, Paperclip, FileText, X } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const WORKSHOP_CASH = "__workshop_cash";
const WORKSHOP_CARD = "__workshop_card";

const CATEGORIES = ["rent", "utilities", "supplies", "advance", "other"];

const expenseSchema = z.object({
  description: z.string().min(1),
  amount: z.coerce.number().min(0.01),
  category: z.string().min(1),
  paidBy: z.string().min(1),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

function parsePaidBy(paidBy: string): { workerId: number | null; paidWith: "cash" | "card" } {
  if (paidBy === WORKSHOP_CASH) return { workerId: null, paidWith: "cash" };
  if (paidBy === WORKSHOP_CARD) return { workerId: null, paidWith: "card" };
  return { workerId: Number(paidBy), paidWith: "cash" };
}

function paidByValue(expense: Expense): string {
  if (expense.workerId !== null && expense.workerId !== undefined) return String(expense.workerId);
  return expense.paidWith === "card" ? WORKSHOP_CARD : WORKSHOP_CASH;
}

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
        credentials: "include",
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

async function updateExpense(id: number, body: Record<string, unknown>) {
  const res = await fetch(`/api/expenses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update expense");
  return res.json();
}

function InvoiceUploader({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useUpload({
    onSuccess: ({ objectPath }) => onChange(objectPath),
    onError: () => toast({ title: t("jobs.uploadError", "Upload failed"), variant: "destructive" }),
  });

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{t("common.invoice")}</span>
      <div className="flex items-center gap-2">
        {value ? (
          <>
            <a
              href={`/api/storage${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-[200px]"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              {t("common.viewInvoice")}
            </a>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <X className="w-3 h-3" />
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-8"
            disabled={isUploading}
            onClick={() => fileRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Paperclip className="w-3.5 h-3.5" />
            )}
            {isUploading ? t("jobs.uploading") : t("common.uploadInvoice")}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export default function Expenses() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [createInvoicePath, setCreateInvoicePath] = useState<string | null>(null);
  const [editInvoicePath, setEditInvoicePath] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: settings } = useGetSettings();
  const { data: workers } = useListWorkers();
  const { data: expenses, isLoading } = useListExpenses({}, {
    query: { queryKey: getListExpensesQueryKey({}) }
  });

  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      updateExpense(id, body),
    onSuccess: () => {
      toast({ title: t("expenses.expenseUpdated") });
      setEditingExpense(null);
      setEditInvoicePath(null);
      invalidate();
    },
    onError: () => {
      toast({ title: t("expenses.error"), variant: "destructive" });
    },
  });

  const createForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { description: "", amount: 0, category: "supplies", paidBy: WORKSHOP_CASH },
  });

  const editForm = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { description: "", amount: 0, category: "supplies", paidBy: WORKSHOP_CASH },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  };

  const onCreateSubmit = (data: ExpenseFormData) => {
    const { workerId, paidWith } = parsePaidBy(data.paidBy);
    createExpense.mutate(
      { data: { description: data.description, amount: data.amount, category: data.category, workerId, paidWith, invoiceObjectPath: createInvoicePath ?? undefined } },
      {
        onSuccess: () => {
          toast({ title: t("expenses.expenseCreated") });
          setCreateOpen(false);
          setCreateInvoicePath(null);
          createForm.reset();
          invalidate();
        },
        onError: () => {
          toast({ title: t("expenses.error"), variant: "destructive" });
        }
      }
    );
  };

  const onEditSubmit = (data: ExpenseFormData) => {
    if (!editingExpense) return;
    const { workerId, paidWith } = parsePaidBy(data.paidBy);
    updateMutation.mutate({
      id: editingExpense.id,
      body: { description: data.description, amount: data.amount, category: data.category, workerId, paidWith, invoiceObjectPath: editInvoicePath },
    });
  };

  const openEdit = (expense: Expense) => {
    editForm.reset({
      description: expense.description,
      amount: expense.amount,
      category: expense.category ?? "supplies",
      paidBy: paidByValue(expense),
    });
    setEditInvoicePath((expense as any).invoiceObjectPath ?? null);
    setEditingExpense(expense);
  };

  const handleDelete = (id: number) => {
    if (confirm(t("jobs.confirmDelete"))) {
      deleteExpense.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("expenses.expenseDeleted") });
          invalidate();
        }
      });
    }
  };

  const currency = settings?.currency || "USD";

  const PaidByBadge = ({ workerId, paidWith, workerName }: { workerId: number | null; paidWith: string; workerName?: string | null }) => {
    if (workerId !== null) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-700 border border-blue-500/20">
          {workerName ?? t("expenses.workerPaidLabel")}
        </span>
      );
    }
    if (paidWith === "cash") {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
          <Banknote className="w-2.5 h-2.5" />
          {t("expenses.workshopCash")}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/10 text-secondary border border-secondary/20">
        <CreditCard className="w-2.5 h-2.5" />
        {t("expenses.workshopCard")}
      </span>
    );
  };

  const ExpenseFormFields = ({ form, isPending, submitLabel, onSubmit, invoicePath, onInvoiceChange }: {
    form: ReturnType<typeof useForm<ExpenseFormData>>;
    isPending: boolean;
    submitLabel: string;
    onSubmit: (data: ExpenseFormData) => void;
    invoicePath: string | null;
    onInvoiceChange: (v: string | null) => void;
  }) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("expenses.description")}</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("expenses.amount")}</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("expenses.category")}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="paidBy"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("expenses.paidBy")}</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger><SelectValue /></SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={WORKSHOP_CASH}>
                  <span className="flex items-center gap-2">
                    <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                    {t("expenses.workshopCash")}
                  </span>
                </SelectItem>
                <SelectItem value={WORKSHOP_CARD}>
                  <span className="flex items-center gap-2">
                    <CreditCard className="w-3.5 h-3.5 text-secondary" />
                    {t("expenses.workshopCard")}
                  </span>
                </SelectItem>
                {workers && workers.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium mt-1 border-t border-border">
                      {t("expenses.workerPaidLabel")}
                    </div>
                    {workers.map(w => (
                      <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <InvoiceUploader value={invoicePath} onChange={onInvoiceChange} />

      <Button type="submit" className="w-full mt-4" disabled={isPending}>
        {isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
        {submitLabel}
      </Button>
    </form>
  );

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{t("expenses.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("expenses.subtitle")}</p>
        </div>

        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { createForm.reset(); setCreateInvoicePath(null); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              {t("expenses.newExpense")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("expenses.addExpense")}</DialogTitle>
              <DialogDescription className="sr-only">Add a new expense record</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <ExpenseFormFields
                form={createForm}
                isPending={createExpense.isPending}
                submitLabel={t("expenses.addExpense")}
                onSubmit={onCreateSubmit}
                invoicePath={createInvoicePath}
                onInvoiceChange={setCreateInvoicePath}
              />
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(o) => { if (!o) { setEditingExpense(null); setEditInvoicePath(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("expenses.editExpense")}</DialogTitle>
            <DialogDescription className="sr-only">Edit expense record</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <ExpenseFormFields
              form={editForm}
              isPending={updateMutation.isPending}
              submitLabel={t("common.save")}
              onSubmit={onEditSubmit}
              invoicePath={editInvoicePath}
              onInvoiceChange={setEditInvoicePath}
            />
          </Form>
        </DialogContent>
      </Dialog>

      {/* Content */}
      <div className="bg-card rounded-md border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : expenses && expenses.length > 0 ? (
          <>
            {/* ── Desktop table (sm+) ── */}
            <div className="hidden sm:block divide-y divide-border">
              <div className="grid grid-cols-12 gap-4 p-4 bg-muted/30 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">{t("expenses.date")}</div>
                <div className="col-span-3">{t("expenses.description")}</div>
                <div className="col-span-2">{t("expenses.category")}</div>
                <div className="col-span-2">{t("expenses.paidBy")}</div>
                <div className="col-span-1 text-center">{t("common.invoice")}</div>
                <div className="col-span-1 text-end">{t("expenses.amount")}</div>
                <div className="col-span-1" />
              </div>
              {expenses.map((expense) => {
                const invoicePath = (expense as any).invoiceObjectPath as string | null;
                return (
                  <div key={expense.id} className="grid grid-cols-12 gap-4 p-4 items-center text-sm hover:bg-muted/10 transition-colors">
                    <div className="col-span-2 text-muted-foreground">
                      {format(new Date(expense.occurredAt), "MMM d, yyyy")}
                    </div>
                    <div className="col-span-3 font-medium">{expense.description}</div>
                    <div className="col-span-2">
                      <Badge variant="outline" className="capitalize text-xs font-normal">{expense.category}</Badge>
                    </div>
                    <div className="col-span-2">
                      <PaidByBadge workerId={expense.workerId ?? null} paidWith={expense.paidWith ?? "cash"} workerName={expense.workerName} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {invoicePath ? (
                        <a
                          href={`/api/storage${invoicePath}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("common.viewInvoice")}
                          className="text-primary hover:text-primary/80"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </div>
                    <div className="col-span-1 text-end font-mono text-destructive font-medium">
                      {formatCurrency(expense.amount, currency)}
                    </div>
                    <div className="col-span-1 text-end flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => openEdit(expense)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(expense.id)}
                        disabled={deleteExpense.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Mobile cards (< sm) ── */}
            <div className="sm:hidden divide-y divide-border">
              {expenses.map((expense) => {
                const invoicePath = (expense as any).invoiceObjectPath as string | null;
                return (
                  <div key={expense.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(expense.occurredAt), "MMM d, yyyy")}
                      </span>
                      <span className="font-mono font-semibold text-destructive text-sm">
                        {formatCurrency(expense.amount, currency)}
                      </span>
                    </div>
                    <div className="font-medium text-sm leading-snug">{expense.description}</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize text-xs font-normal">{expense.category}</Badge>
                        <PaidByBadge workerId={expense.workerId ?? null} paidWith={expense.paidWith ?? "cash"} workerName={expense.workerName} />
                        {invoicePath && (
                          <a
                            href={`/api/storage${invoicePath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20"
                          >
                            <FileText className="w-2.5 h-2.5" />
                            {t("common.invoice")}
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          onClick={() => openEdit(expense)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(expense.id)}
                          disabled={deleteExpense.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <CreditCard className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium">{t("expenses.noExpenses")}</h3>
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>{t("expenses.addExpense")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
