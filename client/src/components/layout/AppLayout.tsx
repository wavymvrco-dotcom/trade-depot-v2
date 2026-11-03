import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Newspaper, Settings, LineChart,
  Bot, Bell, HelpCircle, Menu, X, Target, Zap,
  TrendingUp, TrendingDown, CheckCircle2, Clock,
  CalendarDays, BarChart2, BellRing, Check, GraduationCap, BookMarked, Store, Activity, Shield,
  RefreshCw, LogOut, Crown, ShoppingCart, Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { TopBar } from "./TopBar";
import { KeyboardShortcuts } from "../terminal/KeyboardShortcuts";
import { useNotifications, useMarkAllRead, useAlerts, useSettings } from "@/hooks/useApi";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AppTour, useTourReset } from "@/components/AppTour";
import { Map } from "lucide-react";
import { UpdateBanner } from "@/components/UpdateBanner";
import { WhatsNewModal } from "@/components/WhatsNewModal";

function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const u = user as any;
  if (dismissed || !u?.email || u?.emailVerified) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-xs shrink-0">
      <div className="w-4 h-4 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
        <span className="text-amber-400 text-[9px] font-bold">!</span>
      </div>
      <span className="text-amber-300/80 flex-1">
        Check your inbox — we sent a verification link to <span className="font-semibold text-amber-300">{u.email}</span>
      </span>
      <button onClick={() => setDismissed(true)} className="text-amber-400/50 hover:text-amber-400 transition-colors text-base leading-none">×</button>
    </div>
  );
}

function BrokerAutoTradeBanner() {
  const { data: rawSettings } = useSettings();
  const settings = rawSettings as any;
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (!settings?.autoTrade || settings?.brokerConnected) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-orange-500/10 border-b border-orange-500/20 text-xs shrink-0">
      <div className="w-4 h-4 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
        <Zap className="w-2.5 h-2.5 text-orange-400" />
      </div>
      <span className="text-orange-300/90 flex-1">
        <span className="font-semibold text-orange-300">Auto-trade is ON but no live broker is connected</span> — trades are executing in paper mode only. <Link href="/settings" className="underline hover:text-orange-200 transition-colors">Connect a broker in Settings</Link> to trade real funds.
      </span>
      <button onClick={() => setDismissed(true)} className="text-orange-400/50 hover:text-orange-400 transition-colors text-base leading-none">×</button>
    </div>
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function NotificationsPanel() {
  const { data: notifData } = useNotifications();
  const { data: alerts = [] } = useAlerts();
  const markAllRead = useMarkAllRead();

  const notifications = (notifData as any)?.notifications ?? [];
  const unread = (notifData as any)?.unread ?? 0;
  const activeAlerts = (alerts as any[]).filter((a: any) => !a.triggered).length;
  const totalBadge = unread + activeAlerts;

  const typeIcon = (type: string) => {
    if (type === "alert") return <BellRing className="w-4 h-4 text-orange-400" />;
    if (type === "trade") return <Zap className="w-4 h-4 text-green-500" />;
    if (type === "signal") return <TrendingUp className="w-4 h-4 text-primary" />;
    return <Bell className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="w-10 h-10 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer relative group transition-colors duration-150">
          <Bell className="w-5 h-5" />
          {totalBadge > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1 right-1 w-4 h-4 bg-destructive rounded-full border-2 border-background flex items-center justify-center text-[9px] font-bold text-white"
            >
              {totalBadge > 9 ? "9+" : totalBadge}
            </motion.span>
          )}
          <span className="absolute left-14 bg-popover text-popover-foreground px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-border pointer-events-none z-50 shadow-lg">
            Notifications
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12} className="w-80 p-0 bg-card/95 backdrop-blur-xl border-border shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && (
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">{unread} new</span>
            )}
          </div>
          {unread > 0 && (
            <button onClick={() => markAllRead.mutate()} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <Check className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>

        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-xs gap-2">
              <Bell className="w-8 h-8 opacity-30" />
              <p className="font-medium">No notifications yet</p>
              <p className="text-[10px]">AI signals and alerts will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((n: any) => (
                <div key={n.id} className={cn("px-4 py-3 hover:bg-muted/30 transition-colors", !n.read && "bg-primary/5")}>
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                      {typeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-bold text-xs">{n.title}</span>
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{n.message}</p>
                      <span className="text-[10px] text-muted-foreground mt-1 block">
                        {n.createdAt ? formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }) : "just now"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {activeAlerts > 0 && (
          <div className="px-4 py-2 border-t border-border bg-orange-500/5">
            <Link href="/alerts">
              <div className="flex items-center gap-2 text-[11px] text-orange-400 hover:text-orange-300 cursor-pointer transition-colors">
                <BellRing className="w-3 h-3" />
                {activeAlerts} active price alert{activeAlerts !== 1 ? "s" : ""} — view all
              </div>
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function UserMenuPopover() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const resetTour = useTourReset();

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
    setRefreshed(true);
    setTimeout(() => { setRefreshed(false); setOpen(false); }, 1500);
    toast({ title: "Account refreshed", description: "All data reloaded.", className: "border-green-500/50" });
  };

  const initial = (user?.username ?? "?").charAt(0).toUpperCase();
  const isAdmin = (user as any)?.isAdmin;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="button-user-menu"
          className="relative w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-sm text-primary hover:bg-primary/30 transition-colors duration-150 group shrink-0"
        >
          {initial}
          {isAdmin && (
            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center border-2 border-background">
              <Crown className="w-2 h-2 text-white" />
            </span>
          )}
          <span className="absolute left-14 bg-popover text-popover-foreground px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-border pointer-events-none z-50 shadow-lg">
            Account
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent side="right" align="end" sideOffset={12} className="w-56 p-0 bg-card/95 backdrop-blur-xl border-border shadow-2xl">
        {/* User info header */}
        <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center font-bold text-sm text-primary">
              {initial}
            </div>
            {isAdmin && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center border border-background">
                <Crown className="w-2 h-2 text-white" />
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user?.username}</p>
            {isAdmin && (
              <span className="text-[10px] font-bold text-amber-400">Admin</span>
            )}
            {!isAdmin && (
              <p className="text-[11px] text-muted-foreground">Active session</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-1.5 space-y-0.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="usermenu-refresh"
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              refreshed
                ? "text-green-400 bg-green-500/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {refreshing ? (
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            ) : refreshed ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0" />
            )}
            {refreshing ? "Refreshing…" : refreshed ? "Refreshed!" : "Refresh Account"}
          </button>

          <Link href="/settings">
            <button
              onClick={() => setOpen(false)}
              data-testid="usermenu-settings"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Settings className="w-4 h-4 shrink-0" />
              Settings
            </button>
          </Link>

          <button
            onClick={() => { setOpen(false); resetTour(); }}
            data-testid="usermenu-tour"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Map className="w-4 h-4 shrink-0" />
            Replay App Tour
          </button>
        </div>

        <div className="border-t border-border/60 p-1.5">
          <button
            onClick={() => { setOpen(false); logout(); }}
            data-testid="usermenu-logout"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [hoverTip, setHoverTip] = useState<{ label: string; top: number } | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem("tradeai_install_dismissed") === "true") return;
    // Delay banner slightly so it doesn't compete with page load
    const t = setTimeout(() => setShowInstallBanner(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const navItems = [
    { icon: LayoutDashboard, label: "Terminal",    path: "/" },
    { icon: LineChart,       label: "Analysis",    path: "/analysis" },
    { icon: Gauge,           label: "TDCI",        path: "/tdci" },
    { icon: Target,          label: "Strategy",    path: "/strategy" },
    { icon: BarChart2,       label: "Analytics",   path: "/analytics" },
    { icon: CalendarDays,    label: "Calendar",    path: "/calendar" },
    { icon: Bell,            label: "Alerts",      path: "/alerts" },
    { icon: Newspaper,       label: "News",        path: "/news" },
    { icon: Bot,             label: "AI Advisor",  path: "/ai" },
    { icon: GraduationCap,   label: "Learn",       path: "/learn" },
    { icon: BookMarked,      label: "Journal",     path: "/journal" },
    { icon: Store,           label: "Marketplace", path: "/marketplace" },
    { icon: Activity,        label: "Health Score", path: "/health" },
    { icon: Settings,        label: "Settings",    path: "/settings" },
    ...((user as any)?.isAdmin ? [{ icon: Shield, label: "Admin Panel", path: "/admin" }] : []),
  ];

  // Primary nav items shown in mobile bottom bar
  const mobileNavItems = [
    { icon: LayoutDashboard, label: "Terminal",  path: "/" },
    { icon: LineChart,       label: "Analysis",  path: "/analysis" },
    { icon: ShoppingCart,    label: "Trade",     path: "/trade" },
    { icon: Bell,            label: "Alerts",    path: "/alerts" },
    { icon: Menu,            label: "More",      path: "__more__" },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground flex-col overflow-hidden">
      <AnimatePresence>
        {showInstallBanner && (
          <InstallPrompt
            mode="banner"
            onDismiss={() => setShowInstallBanner(false)}
          />
        )}
      </AnimatePresence>
      <TopBar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      {/* Main content row */}
      <div className="flex flex-1 min-h-0 overflow-x-hidden relative">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <aside
          className={cn(
            "w-16 border-r border-border flex flex-col items-center py-3 bg-card/50 backdrop-blur-sm z-50 no-scrollbar",
            "absolute md:relative h-full overflow-y-auto overflow-x-hidden",
            "transition-transform duration-200 ease-in-out",
            "md:!translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-accent text-white flex items-center justify-center mb-2 shadow-lg shadow-primary/20 shrink-0"
          >
            <LineChart className="w-5 h-5" />
          </motion.div>

          <div className="flex flex-col items-center gap-0.5 w-full px-2">
            {navItems.map((item) => (
              <div key={item.path} className="w-full">
                <Link href={item.path}>
                  <div
                    data-testid={`nav-link-${item.label.toLowerCase().replace(/ /g, "-")}`}
                    onClick={() => setSidebarOpen(false)}
                    onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverTip({ label: item.label, top: r.top + r.height / 2 }); }}
                    onMouseLeave={() => setHoverTip(null)}
                    className={cn(
                      "w-full h-10 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-150 hover:bg-muted",
                      location === item.path
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="w-4.5 h-4.5" style={{ width: "18px", height: "18px" }} />
                  </div>
                </Link>
              </div>
            ))}
          </div>

          <div className="md:hidden mt-auto" onClick={() => setSidebarOpen(false)}>
            <div className="w-10 h-10 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
              <X className="w-5 h-5" />
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-1 shrink-0 items-center">
            <NotificationsPanel />
            <button
              onClick={() => setShortcutsOpen(true)}
              onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHoverTip({ label: "Keyboard Shortcuts", top: r.top + r.height / 2 }); }}
              onMouseLeave={() => setHoverTip(null)}
              className="w-10 h-10 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer transition-colors duration-150"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <div className="mt-1 pt-1 border-t border-border/50 w-full flex justify-center">
              <UserMenuPopover />
            </div>
          </div>
        </aside>

        {hoverTip && (
          <div
            className="fixed left-[76px] bg-popover text-popover-foreground px-2 py-1 rounded text-xs whitespace-nowrap border border-border pointer-events-none z-[60] shadow-lg hidden md:block"
            style={{ top: hoverTip.top, transform: "translateY(-50%)" }}
          >
            {hoverTip.label}
          </div>
        )}

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <UpdateBanner />
          <EmailVerificationBanner />
          <BrokerAutoTradeBanner />
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Navigation Bar (not on terminal which has its own) ─── */}
      <nav className={cn("md:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-card/95 backdrop-blur-xl border-t border-border flex items-stretch", location === "/" && "hidden")}>
        {mobileNavItems.map(({ icon: Icon, label, path }) => {
          const isActive = path !== "__more__" && location === path;
          return (
            <button
              key={path}
              onClick={() => {
                if (path === "__more__") { setSidebarOpen(o => !o); }
              }}
              className={cn("flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              data-testid={`mobile-bottom-nav-${label.toLowerCase()}`}
            >
              {path === "__more__" ? (
                <>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">More</span>
                </>
              ) : (
                <Link href={path} className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </Link>
              )}
            </button>
          );
        })}
      </nav>

      <KeyboardShortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <AppTour />
      <WhatsNewModal />
    </div>
  );
}
