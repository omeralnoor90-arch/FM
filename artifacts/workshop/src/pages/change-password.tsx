import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const forced = user?.mustChangePassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError(t("changePassword.mismatch"));
      return;
    }
    if (newPassword.length < 6) {
      setError(t("changePassword.tooShort"));
      return;
    }
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
        throw new Error(body.error ?? t("changePassword.failed"));
      }
      await refresh();
      if (user?.role === "admin") {
        navigate("/");
      } else {
        navigate("/portal");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("changePassword.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <CardTitle className="text-white text-xl">
            {forced ? t("changePassword.forcedTitle") : t("changePassword.title")}
          </CardTitle>
          {forced && (
            <CardDescription className="text-yellow-400">
              {t("changePassword.forcedNote")}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!forced && (
              <div className="space-y-2">
                <Label className="text-zinc-300">{t("changePassword.currentPassword")}</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required={!forced}
                  className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-blue-500"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-zinc-300">{t("changePassword.newPassword")}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="bg-zinc-800 border-zinc-700 text-white focus-visible:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">{t("changePassword.confirmPassword")}</Label>
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
              {loading ? t("changePassword.submitting") : forced ? t("changePassword.forcedSubmit") : t("changePassword.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
