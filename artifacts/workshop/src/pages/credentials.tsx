import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useListWorkers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, KeyRound, Trash2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Credential {
  id: number;
  username: string;
  role: string;
  workerId: number | null;
  workerName: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

async function fetchCredentials(): Promise<Credential[]> {
  const res = await fetch(`${API_BASE}/api/admin/credentials`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function createCredential(data: { workerId: number; username: string; password: string }) {
  const res = await fetch(`${API_BASE}/api/admin/credentials`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to create");
  }
  return res.json();
}

async function resetPassword(id: number, password: string) {
  const res = await fetch(`${API_BASE}/api/admin/credentials/${id}/reset-password`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed");
  }
  return res.json();
}

async function deleteCredential(id: number) {
  const res = await fetch(`${API_BASE}/api/admin/credentials/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to delete");
}

async function changeRole(id: number, role: "worker" | "manager") {
  const res = await fetch(`${API_BASE}/api/admin/credentials/${id}/role`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to change role");
  }
  return res.json();
}

export default function CredentialsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: credentials, isLoading } = useQuery({
    queryKey: ["/api/admin/credentials"],
    queryFn: fetchCredentials,
  });

  const { data: workers } = useListWorkers();

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ workerId: "", username: "", password: "" });

  const [resetTarget, setResetTarget] = useState<Credential | null>(null);
  const [resetPassword_, setResetPassword] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createCredential({ workerId: Number(createForm.workerId), username: createForm.username, password: createForm.password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credentials"] });
      setShowCreate(false);
      setCreateForm({ workerId: "", username: "", password: "" });
      toast({ title: t("credentials.created") });
    },
    onError: (err: Error) => toast({ title: t("credentials.error"), description: err.message, variant: "destructive" }),
  });

  const resetMut = useMutation({
    mutationFn: () => resetPassword(resetTarget!.id, resetPassword_),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credentials"] });
      setResetTarget(null);
      setResetPassword("");
      toast({ title: t("credentials.passwordReset") });
    },
    onError: (err: Error) => toast({ title: t("credentials.error"), description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCredential(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credentials"] });
      toast({ title: t("credentials.deleted") });
    },
    onError: (err: Error) => toast({ title: t("credentials.error"), description: err.message, variant: "destructive" }),
  });

  const changeRoleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: "worker" | "manager" }) => changeRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/credentials"] });
      toast({ title: t("credentials.roleUpdated") });
    },
    onError: (err: Error) => toast({ title: t("credentials.error"), description: err.message, variant: "destructive" }),
  });

  const workersWithoutAccess = workers?.filter(
    (w) => !credentials?.some((c) => c.workerId === w.id)
  ) ?? [];

  function getRoleBadge(role: string) {
    if (role === "admin") {
      return <Badge variant="default" className="text-xs">{t("credentials.admin")}</Badge>;
    }
    if (role === "manager") {
      return <Badge variant="secondary" className="text-xs bg-blue-500/15 text-blue-600 border-blue-500/30">{t("credentials.manager")}</Badge>;
    }
    return <Badge variant="secondary" className="text-xs">{t("credentials.worker")}</Badge>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="w-6 h-6" /> {t("credentials.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("credentials.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> {t("credentials.newCredential")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="space-y-3">
          {credentials?.map((cred) => (
            <Card key={cred.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{cred.username}</span>
                    {getRoleBadge(cred.role)}
                    {cred.mustChangePassword && (
                      <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-600 gap-1">
                        <ShieldAlert className="w-3 h-3" /> {t("credentials.mustChangePassword")}
                      </Badge>
                    )}
                  </div>
                  {cred.workerName && (
                    <p className="text-sm text-muted-foreground mt-0.5">{cred.workerName}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("credentials.createdAt")} {format(new Date(cred.createdAt), "MMM d, yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {cred.role !== "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        changeRoleMut.mutate({
                          id: cred.id,
                          role: cred.role === "manager" ? "worker" : "manager",
                        })
                      }
                      disabled={changeRoleMut.isPending}
                      title={t("credentials.changeRole")}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {cred.role === "manager"
                        ? t("credentials.demoteToWorker")
                        : t("credentials.promoteToManager")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => { setResetTarget(cred); setResetPassword(""); }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {t("credentials.resetPassword")}
                  </Button>
                  {cred.role !== "admin" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMut.mutate(cred.id)}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {credentials?.length === 0 && (
            <Card>
              <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
                {t("common.noData")}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("credentials.newCredential")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("credentials.linkedWorker")}</Label>
              <Select value={createForm.workerId} onValueChange={v => {
                const w = workers?.find(x => x.id === Number(v));
                const suggested = w ? w.name.split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "") : "";
                setCreateForm(f => ({ ...f, workerId: v, username: suggested }));
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={t("credentials.selectWorker")} />
                </SelectTrigger>
                <SelectContent>
                  {workersWithoutAccess.map(w => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("credentials.username")}</Label>
              <Input
                value={createForm.username}
                onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("credentials.password")}</Label>
              <Input
                value={createForm.password}
                onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{t("credentials.cancel")}</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !createForm.workerId || !createForm.username || !createForm.password}
            >
              {t("credentials.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={open => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("credentials.resetPassword")} — {resetTarget?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("credentials.newPassword")}</Label>
              <Input
                value={resetPassword_}
                onChange={e => setResetPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>{t("credentials.cancel")}</Button>
            <Button
              onClick={() => resetMut.mutate()}
              disabled={resetMut.isPending || resetPassword_.length < 4}
            >
              {t("credentials.resetPassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
