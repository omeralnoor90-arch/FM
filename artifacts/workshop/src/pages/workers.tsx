import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTranslation } from "react-i18next";
import {
  useListWorkers,
  useCreateWorker,
  useUpdateWorker,
  useDeleteWorker,
  useGetByWorker,
  useGetSettings,
  getListWorkersQueryKey,
  getGetByWorkerQueryKey,
  type Worker,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, ArrowRight, ArrowLeftRight, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const workerSchema = z.object({
  name: z.string().min(1),
  workerPercent: z.coerce.number().min(0).max(100).optional(),
  workshopPercent: z.coerce.number().min(0).max(100).optional(),
  equityPercent: z.coerce.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

// ── Add Worker Dialog ──────────────────────────────────────────────────────
function AddWorkerDialog({
  open,
  onOpenChange,
  defaultWorkerPercent,
  defaultWorkshopPercent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultWorkerPercent: number;
  defaultWorkshopPercent: number;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createWorker = useCreateWorker();

  const form = useForm<z.infer<typeof workerSchema>>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      name: "",
      workerPercent: defaultWorkerPercent,
      workshopPercent: defaultWorkshopPercent,
      equityPercent: 0,
      active: true,
    },
  });

  const onSubmit = (data: z.infer<typeof workerSchema>) => {
    createWorker.mutate(
      { data },
      {
        onSuccess: () => {
          toast({ title: t("workers.workerCreated") });
          onOpenChange(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListWorkersQueryKey(), refetchType: "all" });
          queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey(), refetchType: "all" });
        },
        onError: () => {
          toast({ title: t("workers.error"), variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workers.addWorker")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="workerPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("workers.workerPercent")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workshopPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("workers.workshopPercent")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="equityPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.equityPercent")}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" min="0" max="100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={createWorker.isPending}>
              {createWorker.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("workers.addWorker")}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Worker Dialog ─────────────────────────────────────────────────────
function EditWorkerDialog({
  worker,
  onClose,
}: {
  worker: Worker;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateWorker = useUpdateWorker();

  const form = useForm<z.infer<typeof workerSchema>>({
    resolver: zodResolver(workerSchema),
    defaultValues: {
      name: worker.name,
      workerPercent: worker.workerPercent,
      workshopPercent: worker.workshopPercent,
      equityPercent: worker.equityPercent,
      active: worker.active,
    },
  });

  const onSubmit = (data: z.infer<typeof workerSchema>) => {
    updateWorker.mutate(
      { id: worker.id, data },
      {
        onSuccess: () => {
          toast({ title: t("workers.workerUpdated") });
          queryClient.invalidateQueries({ queryKey: getListWorkersQueryKey(), refetchType: "all" });
          queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey(), refetchType: "all" });
          onClose();
        },
        onError: () => {
          toast({ title: t("workers.error"), variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workers.editWorker")} — {worker.name}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="workerPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("workers.workerPercent")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workshopPercent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("workers.workshopPercent")}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="equityPercent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.equityPercent")}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" min="0" max="100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-border p-3">
                  <FormLabel className="text-sm cursor-pointer">
                    {field.value ? t("workers.active") : t("workers.inactive")}
                  </FormLabel>
                  <FormControl>
                    <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" className="flex-1" disabled={updateWorker.isPending}>
                {updateWorker.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
                {t("common.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Transfer Balance Dialog ────────────────────────────────────────────────
const transferSchema = z.object({
  fromWorkerId: z.coerce.number().int().positive(),
  toWorkerId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  note: z.string().optional(),
});
type TransferForm = z.infer<typeof transferSchema>;

function TransferBalanceDialog({
  open,
  onOpenChange,
  workers,
  currency,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workers: Worker[];
  currency: string;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const form = useForm<TransferForm>({
    resolver: zodResolver(transferSchema),
    defaultValues: { fromWorkerId: 0, toWorkerId: 0, amount: 0, note: "" },
  });

  const fromId = form.watch("fromWorkerId");
  const toId = form.watch("toWorkerId");
  const amount = form.watch("amount");
  const fromName = workers.find((w) => w.id === Number(fromId))?.name ?? "—";
  const toName = workers.find((w) => w.id === Number(toId))?.name ?? "—";

  const mutation = useMutation({
    mutationFn: async (data: TransferForm) => {
      if (data.fromWorkerId === data.toWorkerId)
        throw new Error("same_worker");
      const res = await fetch("/api/workers/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("workers.transferDialog.success") });
      form.reset({ fromWorkerId: 0, toWorkerId: 0, amount: 0, note: "" });
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: Error) => {
      if (e.message === "same_worker") {
        toast({ title: t("workers.transferDialog.sameWorkerError"), variant: "destructive" });
      } else {
        toast({ title: t("workers.transferDialog.error"), variant: "destructive" });
      }
    },
  });

  const onSubmit = (data: TransferForm) => mutation.mutate(data);

  const showPreview = Number(fromId) > 0 && Number(toId) > 0 && Number(fromId) !== Number(toId) && amount > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) form.reset({ fromWorkerId: 0, toWorkerId: 0, amount: 0, note: "" }); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            {t("workers.transferDialog.title")}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("workers.transferDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="fromWorkerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.transferDialog.fromWorker")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ? String(field.value) : ""}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {workers.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="toWorkerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.transferDialog.toWorker")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ? String(field.value) : ""}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {workers.map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.transferDialog.amount")}</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("workers.transferDialog.note")}</FormLabel>
                  <FormControl>
                    <Input placeholder="…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showPreview && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <span className="font-medium">{fromName}</span>
                  <span className="text-muted-foreground text-xs">+{amount.toLocaleString()} {currency}</span>
                  <span className="text-muted-foreground text-xs">{t("workers.inactive") === "غير نشط" ? "يتحسّن رصيده" : "balance improves"}</span>
                </div>
                <div className="flex items-center gap-2 text-destructive">
                  <span className="font-medium">{toName}</span>
                  <span className="text-destructive/70 text-xs">−{amount.toLocaleString()} {currency}</span>
                  <span className="text-muted-foreground text-xs">{t("workers.inactive") === "غير نشط" ? "يتراكم عليه" : "takes on debt"}</span>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full gap-2" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowLeftRight className="w-4 h-4" />}
              {t("workers.transferDialog.submit")}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Workers() {
  const [addOpen, setAddOpen] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [deleteWorker, setDeleteWorker] = useState<Worker | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: settings } = useGetSettings();
  const { data: workers, isLoading: loadingWorkers } = useListWorkers({
    query: { queryKey: getListWorkersQueryKey() },
  });

  const { data: workerStats, isLoading: loadingStats } = useGetByWorker(
    { period: "all" },
    { query: { queryKey: getGetByWorkerQueryKey({ period: "all" }) } },
  );

  const deleteWorkerMutation = useDeleteWorker();

  const handleDelete = () => {
    if (!deleteWorker) return;
    deleteWorkerMutation.mutate(
      { id: deleteWorker.id },
      {
        onSuccess: () => {
          toast({ title: t("workers.workerDeleted") });
          queryClient.invalidateQueries({ queryKey: getListWorkersQueryKey(), refetchType: "all" });
          queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey(), refetchType: "all" });
          setDeleteWorker(null);
        },
        onError: () => {
          toast({ title: t("workers.error"), variant: "destructive" });
        },
      },
    );
  };

  const currency = settings?.currency || "SAR";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("workers.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("workers.subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight className="w-4 h-4" />
            {t("workers.transferBalance")}
          </Button>
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            {t("workers.newWorker")}
          </Button>
        </div>
      </div>

      {/* ── Transfer Dialog ── */}
      {workers && (
        <TransferBalanceDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          workers={workers}
          currency={currency}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: getListWorkersQueryKey(), refetchType: "all" });
            queryClient.invalidateQueries({ queryKey: getGetByWorkerQueryKey(), refetchType: "all" });
          }}
        />
      )}

      {/* ── Add Dialog ── */}
      <AddWorkerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultWorkerPercent={settings?.defaultWorkerPercent ?? 50}
        defaultWorkshopPercent={settings?.defaultWorkshopPercent ?? 50}
      />

      {/* ── Edit Dialog ── */}
      {editWorker && (
        <EditWorkerDialog
          worker={editWorker}
          onClose={() => setEditWorker(null)}
        />
      )}

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteWorker} onOpenChange={(o) => { if (!o) setDeleteWorker(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workers.deleteWorker")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workers.confirmDeleteWorker")}
              {deleteWorker && (
                <span className="block mt-2 font-semibold text-foreground">"{deleteWorker.name}"</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteWorkerMutation.isPending}
            >
              {deleteWorkerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Worker Cards ── */}
      {loadingWorkers || loadingStats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full" />)}
        </div>
      ) : workers && workers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers.map((worker) => {
            const stats = workerStats?.find((s) => s.workerId === worker.id);

            return (
              <Card
                key={worker.id}
                className={`flex flex-col hover:shadow-md transition-shadow ${!worker.active ? "opacity-60" : ""}`}
              >
                <CardHeader className="pb-3 border-b border-border/50">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-xl truncate">{worker.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs">
                          {worker.workerPercent}% / {worker.workshopPercent}%
                        </Badge>
                        {worker.equityPercent > 0 && (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {worker.equityPercent}% {t("workers.equityPercent")}
                          </Badge>
                        )}
                        {!worker.active && (
                          <Badge variant="destructive" className="bg-destructive/10 text-destructive border-transparent text-xs">
                            {t("workers.inactive")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {/* Action buttons */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => setEditWorker(worker)}
                        title={t("workers.editWorker")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteWorker(worker)}
                        title={t("workers.deleteWorker")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 pt-4 pb-0">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{t("workers.totalEarned")}</p>
                      <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-500">
                        {formatCurrency(stats?.workerEarned || 0, currency)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted/30 p-2 rounded">
                        <p className="text-muted-foreground text-xs">{t("workerDetail.stats.totalEarned")}</p>
                        <p className="font-medium font-mono mt-1">{formatCurrency(stats?.workerEarned || 0, currency)}</p>
                      </div>
                      <div className="bg-muted/30 p-2 rounded">
                        <p className="text-muted-foreground text-xs">{t("workers.remainingToPay")}</p>
                        <p className={`font-medium font-mono mt-1 ${((stats as any)?.remaining ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"}`}>
                          {formatCurrency((stats as any)?.remaining ?? 0, currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>

                <div className="p-4 mt-auto">
                  <Link href={`/workers/${worker.id}`}>
                    <a className="flex items-center justify-center w-full py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors border border-primary/20 rounded-md bg-primary/5 hover:bg-primary/10">
                      {t("workers.viewLedger")}
                      <ArrowRight className="w-4 h-4 ms-2 rtl:rotate-180" />
                    </a>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="bg-card rounded-md border border-border p-12 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-muted-foreground opacity-50" />
          </div>
          <h3 className="text-lg font-medium">{t("workers.noWorkers")}</h3>
          <Button className="mt-6" onClick={() => setAddOpen(true)}>
            {t("workers.addWorker")}
          </Button>
        </div>
      )}
    </div>
  );
}
