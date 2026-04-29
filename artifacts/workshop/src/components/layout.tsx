import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  Wrench,
  CreditCard,
  Settings as SettingsIcon,
  BarChart3,
  Briefcase,
  KeyRound,
  LogOut,
  FileBarChart,
  Languages,
  Menu,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { applyLang, type Lang } from "@/i18n";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { t, i18n } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isManager = user?.role === "manager";

  const allNavItems = [
    { name: t("nav.dashboard"), href: "/", icon: LayoutDashboard, adminOnly: true },
    { name: t("nav.jobs"), href: "/jobs", icon: Briefcase, adminOnly: false },
    { name: t("nav.workers"), href: "/workers", icon: Users, adminOnly: false },
    { name: t("nav.attendance"), href: "/attendance", icon: ClipboardCheck, adminOnly: false },
    { name: t("nav.expenses"), href: "/expenses", icon: CreditCard, adminOnly: false },
    { name: t("nav.parts"), href: "/parts", icon: Wrench, adminOnly: false },
    { name: t("nav.analytics"), href: "/analytics", icon: BarChart3, adminOnly: true },
    { name: t("nav.reports"), href: "/reports", icon: FileBarChart, adminOnly: true },
  ];

  const allBottomItems = [
    { name: t("nav.credentials"), href: "/credentials", icon: KeyRound, adminOnly: true },
    { name: t("nav.settings"), href: "/settings", icon: SettingsIcon, adminOnly: true },
  ];

  const navigation = isManager ? allNavItems.filter(i => !i.adminOnly) : allNavItems;
  const bottomNav = isManager ? [] : allBottomItems;

  function toggleLang() {
    const next: Lang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(next);
    applyLang(next);
  }

  const NavLink = ({ href, icon: Icon, name, onClick }: { href: string; icon: React.ElementType; name: string; onClick?: () => void }) => {
    const isActive = location === href || (href !== "/" && location.startsWith(href));
    return (
      <Link href={href}>
        <a
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {name}
        </a>
      </Link>
    );
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Desktop Sidebar ── */}
      <div className="w-64 border-e border-sidebar-border bg-sidebar flex-col hidden md:flex shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-sidebar-primary flex items-center justify-center">
              <Wrench className="w-4 h-4 text-sidebar-primary-foreground" />
            </div>
            <span className="font-semibold text-sidebar-foreground tracking-tight">{t("app.name")}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>
        <div className="p-4 border-t border-sidebar-border space-y-1">
          {bottomNav.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
          <div className={cn("pt-2 space-y-1", bottomNav.length > 0 && "border-t border-sidebar-border mt-2")}>
            <div className="px-3 py-1.5 text-xs text-sidebar-foreground/50">{user?.username}</div>
            <button
              onClick={toggleLang}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              <Languages className="w-4 h-4 shrink-0" />
              {i18n.language === "ar" ? "English" : "العربية"}
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {t("nav.signOut")}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Nav Sheet ── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side={i18n.language === "ar" ? "right" : "left"} className="w-72 p-0 bg-sidebar border-sidebar-border flex flex-col">
          <SheetHeader className="h-16 flex flex-row items-center px-6 border-b border-sidebar-border shrink-0">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-6 h-6 rounded bg-sidebar-primary flex items-center justify-center">
                <Wrench className="w-4 h-4 text-sidebar-primary-foreground" />
              </div>
              <SheetTitle className="font-semibold text-sidebar-foreground tracking-tight text-base">
                {t("app.name")}
              </SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {navigation.map((item) => (
              <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />
            ))}
          </div>

          <div className="p-4 border-t border-sidebar-border space-y-1 shrink-0">
            {bottomNav.map((item) => (
              <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />
            ))}
            <div className={cn("pt-2 space-y-1", bottomNav.length > 0 && "border-t border-sidebar-border mt-2")}>
              <div className="px-3 py-1.5 text-xs text-sidebar-foreground/50">{user?.username}</div>
              <button
                onClick={() => { toggleLang(); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                <Languages className="w-4 h-4 shrink-0" />
                {i18n.language === "ar" ? "English" : "العربية"}
              </button>
              <button
                onClick={() => { logout(); setMobileOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {t("nav.signOut")}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 md:hidden shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-foreground p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-foreground text-sm">{t("app.name")}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="text-muted-foreground hover:text-foreground text-xs font-medium px-2 py-1 rounded border border-border transition-colors"
            >
              {i18n.language === "ar" ? "EN" : "ع"}
            </button>
            <button onClick={logout} className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/20">
          {children}
        </main>
      </div>
    </div>
  );
}
