import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User, Lock } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function WorkerProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) { setError(t("portal.mismatch")); return; }
    if (newPassword.length < 6) { setError(t("portal.tooShort")); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast({ title: t("portal.passwordChanged"), description: t("portal.passwordChangedDesc") });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="pt-2">
        <h1 className="text-white text-xl font-bold">{t("portal.profileTitle")}</h1>
        <p className="text-zinc-400 text-sm mt-0.5">{t("portal.accountInfo")}</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <User size={16} /> {t("portal.accountDetails")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider">{t("workers.name")}</p>
            <p className="text-white mt-1">{user?.workerName ?? "—"}</p>
          </div>
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider">{t("portal.username")}</p>
            <p className="text-white mt-1">{user?.username}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Lock size={16} /> {t("portal.changePassword")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-zinc-400 text-xs">{t("portal.currentPassword")}</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-400 text-xs">{t("portal.newPassword")}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-zinc-400 text-xs">{t("portal.confirmPassword")}</Label>
              <Input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-blue-500"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loading}
            >
              {loading ? t("portal.saving") : t("portal.savePassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
