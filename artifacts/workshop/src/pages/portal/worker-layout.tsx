import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { Home, Briefcase, User, LogOut, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyLang, type Lang } from "@/i18n";

interface WorkerLayoutProps {
  children: ReactNode;
}

export function WorkerLayout({ children }: WorkerLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { t, i18n } = useTranslation();

  const navItems = [
    { href: "/portal", label: t("portal.home"), icon: Home },
    { href: "/portal/jobs", label: t("portal.myJobs"), icon: Briefcase },
    { href: "/portal/submit-job", label: t("portal.submitJob"), icon: PlusCircle },
    { href: "/portal/profile", label: t("portal.profile"), icon: User },
  ];

  function toggleLang() {
    const next: Lang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(next);
    applyLang(next);
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">W</span>
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-none">{t("app.name")}</p>
            <p className="text-zinc-400 text-xs mt-0.5">{user?.workerName ?? user?.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="text-zinc-400 hover:text-white text-xs font-medium px-2 py-1 rounded border border-zinc-700 transition-colors"
          >
            {i18n.language === "ar" ? "EN" : "ع"}
          </button>
          <button
            onClick={logout}
            className="text-zinc-400 hover:text-white flex items-center gap-1.5 text-sm transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{t("nav.signOut")}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
        {children}
      </main>

      <nav className="bg-zinc-900 border-t border-zinc-800 flex">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location === href || (href !== "/portal" && location.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors",
                active ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
