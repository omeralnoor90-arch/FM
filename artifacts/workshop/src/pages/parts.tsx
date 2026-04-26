import { useRef, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import { 
  useListParts, 
  useCreatePart, 
  useDeletePart, 
  useListJobs,
  useGetSettings,
  getListPartsQueryKey,
  getGetSummaryQueryKey,
  getGetBalancesQueryKey,
  getGetRecentActivityQueryKey,
  type Part,
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
import { Wrench, Trash2, Plus, Loader2, Pencil, Paperclip, FileText, X } from "lucide-react";
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

const partSchema = z.object({
  name: z.string().min(1),
  supplier: z.string().optional(),
  amount: z.coerce.number().min(0.01),
  quantity: z.coerce.number().min(1).default(1),
  jobId: z.coerce.number().optional().nullable().transform(v => v === 0 ? null : v),
  paidWith: z.enum(["cash", "card"]),
});

type PartForm = z.infer<typeof partSchema>;

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

async function updatePart(id: number, body: Record<string, unknown>) {
  const res = await fetch(`/api/parts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update part");
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

const DEFAULT_PART: PartForm = { name: "", supplier: "", amount: 0, quantity: 1, jobId: null, paidWith: "card" };

export default function Parts() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [createInvoicePath, setCreateInvoicePath] = useState<string | null>(null);
  const [editInvoicePath, setEditInvoicePath] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: settings } = useGetSettings();
  const { data: jobs } = useListJobs();
  const { data: parts, isLoading } = useListParts({}, {
    query: { queryKey: getListPartsQueryKey({}) }
  });

  const createPart = useCreatePart();
  const deletePart = useDeletePart();

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      updatePart(id, body),
    onSuccess: () => {
      toast({ title: t("parts.partUpdated") });
      setEditingPart(null);
      setEditInvoicePath(null);
      invalidate();
    },
    onError: () => {
      toast({ title: t("parts.error"), variant: "destructive" });
    },
  });

  const createForm = useForm<PartForm>({
    resolver: zodResolver(partSchema),
    defaultValues: DEFAULT_PART,
  });

  const editForm = useForm<PartForm>({
    resolver: zodResolver(partSchema),
    defaultValues: DEFAULT_PART,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPartsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBalancesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
  };

  const onCreateSubmit = (data: PartForm) => {
    createPart.mutate({ data: { ...data, invoiceObjectPath: createInvoicePath ?? undefined } }, {
      onSuccess: () => {
        toast({ title: t("parts.partCreated") });
        setCreateOpen(false);
        setCreateInvoicePath(null);
        createForm.reset(DEFAULT_PART);
        invalidate();
      },
      onError: () => {
        toast({ title: t("parts.error"), variant: "destructive" });
      }
    });
  };

  const onEditSubmit = (data: PartForm) => {
    if (!editingPart) return;
    updateMutation.mutate({ id: editingPart.id, body: { ...data, invoiceObjectPath: editInvoicePath } });
  };

  const openEdit = (part: Part) => {
    editForm.reset({
      name: part.name,
      supplier: part.supplier ?? "",
      amount: part.amount,
      quantity: part.quantity ?? 1,
      jobId: part.jobId ?? null,
      paidWith: part.paidWith as "cash" | "card",
    });
    setEditInvoicePath((part as any).invoiceObjectPath ?? null);
    setEditingPart(part);
  };

  const handleDelete = (id: number) => {
    if (confirm(t("jobs.confirmDelete"))) {
      deletePart.mutate({ id }, {
        onSuccess: () => {
          toast({ title: t("parts.partDeleted") });
          invalidate();
        }
      });
    }
  };

  const currency = settings?.currency || "USD";

  const PaidWithBadge = ({ paidWith }: { paidWith: string }) =>
    paidWith === "card" ? (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/10 text-secondary border border-secondary/20">{t("common.card")}</span>
    ) : (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">{t("common.cash")}</span>
    );

  const PartFormFields = ({ form, isPending, submitLabel, onSubmit, invoicePath, onInvoiceChange }: {
    form: ReturnType<typeof useForm<PartForm>>;
    isPending: boolean;
    submitLabel: string;
    onSubmit: (data: PartForm) => void;
    invoicePath: string | null;
    onInvoiceChange: (v: string | null) => void;
  }) => (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("parts.description")}</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="supplier"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("parts.supplier")}</FormLabel>
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
              <FormLabel>{t("parts.cost")}</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Qty</FormLabel>
              <FormControl>
                <Input type="number" min="1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="paidWith"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("jobs.paidBy")}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="card">{t("common.card")}</SelectItem>
                  <SelectItem value="cash">{t("common.cash")}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="jobId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nav.jobs")}</FormLabel>
              <Select
                onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                value={field.value ? field.value.toString() : "none"}
              >
                <FormControl>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {jobs?.map(j => (
                    <SelectItem key={j.id} value={j.id.toString()}>
                      {j.source} ({format(new Date(j.occurredAt), 'MMM d')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{t("parts.title")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("parts.subtitle")}</p>
        </div>

        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { createForm.reset(DEFAULT_PART); setCreateInvoicePath(null); } }}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              {t("parts.newPart")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("parts.addPart")}</DialogTitle>
              <DialogDescription className="sr-only">Add a new part or material cost</DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <PartFormFields
                form={createForm}
                isPending={createPart.isPending}
                submitLabel={t("parts.addPart")}
                onSubmit={onCreateSubmit}
                invoicePath={createInvoicePath}
                onInvoiceChange={setCreateInvoicePath}
              />
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editingPart} onOpenChange={(o) => { if (!o) { setEditingPart(null); setEditInvoicePath(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("parts.editPart")}</DialogTitle>
            <DialogDescription className="sr-only">Edit part record</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <PartFormFields
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
        ) : parts && parts.length > 0 ? (
          <>
            {/* ── Desktop table (sm+) ── */}
            <div className="hidden sm:block divide-y divide-border">
              <div className="grid grid-cols-12 gap-4 p-4 bg-muted/30 text-sm font-medium text-muted-foreground">
                <div className="col-span-2">{t("parts.date")}</div>
                <div className="col-span-3">{t("parts.description")}</div>
                <div className="col-span-2">{t("parts.supplier")}</div>
                <div className="col-span-2">{t("nav.jobs")}</div>
                <div className="col-span-1 text-center">{t("common.invoice")}</div>
                <div className="col-span-1 text-end">{t("parts.cost")}</div>
                <div className="col-span-1" />
              </div>
              {parts.map((part) => {
                const invoicePath = (part as any).invoiceObjectPath as string | null;
                return (
                  <div key={part.id} className="grid grid-cols-12 gap-4 p-4 items-center text-sm hover:bg-muted/10 transition-colors">
                    <div className="col-span-2 text-muted-foreground">
                      {format(new Date(part.occurredAt), "MMM d, yyyy")}
                    </div>
                    <div className="col-span-3 font-medium">
                      {part.name}
                      {part.quantity && part.quantity > 1 && (
                        <span className="ms-2 text-xs text-muted-foreground font-normal">×{part.quantity}</span>
                      )}
                      <span className="ms-2"><PaidWithBadge paidWith={part.paidWith} /></span>
                    </div>
                    <div className="col-span-2 text-muted-foreground">{part.supplier || "-"}</div>
                    <div className="col-span-2 text-xs">
                      {part.jobId ? (
                        <Badge variant="outline" className="font-normal text-muted-foreground">#{part.jobId}</Badge>
                      ) : "-"}
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
                      {formatCurrency(part.amount, currency)}
                    </div>
                    <div className="col-span-1 text-end flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => openEdit(part)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(part.id)}
                        disabled={deletePart.isPending}
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
              {parts.map((part) => {
                const invoicePath = (part as any).invoiceObjectPath as string | null;
                return (
                  <div key={part.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(part.occurredAt), "MMM d, yyyy")}
                      </span>
                      <span className="font-mono font-semibold text-destructive text-sm">
                        {formatCurrency(part.amount, currency)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm leading-snug">{part.name}</span>
                      {part.quantity && part.quantity > 1 && (
                        <span className="text-xs text-muted-foreground">×{part.quantity}</span>
                      )}
                      <PaidWithBadge paidWith={part.paidWith} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {part.supplier && (
                          <span className="text-xs text-muted-foreground">{part.supplier}</span>
                        )}
                        {part.jobId && (
                          <Badge variant="outline" className="font-normal text-muted-foreground text-xs">
                            #{part.jobId}
                          </Badge>
                        )}
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
                          onClick={() => openEdit(part)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(part.id)}
                          disabled={deletePart.isPending}
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
              <Wrench className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium">{t("parts.noParts")}</h3>
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>{t("parts.addPart")}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
