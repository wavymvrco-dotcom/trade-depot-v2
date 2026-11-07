import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Users, BarChart2, Zap, Store, Megaphone,
  RefreshCw, Trash2, Ban, CheckCircle2, Crown, Key,
  TrendingUp, TrendingDown, AlertTriangle, Activity,
  ChevronDown, ChevronUp, X, Send, Search, UserX,
  UserCheck, ShieldOff, Eye, Lock, Unlock, Database,
  Signal, BookOpen, Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Tab = "dashboard" | "users" | "trades" | "signals" | "marketplace" | "broadcast";

interface AdminStats {
  totalUsers: number;
  totalTrades: number;
  totalSignals: number;
  totalJournalEntries: number;
  totalAlerts: number;
  totalMarketplaceListings: number;
  admins: number;
  banned: number;
  recentUsers: number;
}

interface AdminUser {
  id: string;
  username: string;
  isAdmin: boolean;
  isBanned: boolean;
  banReason: string | null;
  createdAt: string;
  openPositions: number;
  closedTrades: number;
  totalPL: number;
  signalCount: number;
}

interface AdminPosition {
  id: string;
  userId: string;
  username: string;
  symbol: string;
  type: string;
  size: number;
  entryPrice: number;
  currentPrice: number | null;
  profit: number;
  status: string;
  openedAt: string;
  closedAt: string | null;
}

interface AdminSignal {
  id: string;
  userId: string;
  username: string;
  symbol: string;
  action: string;
  confidence: number;
  status: string;
  outcome: string | null;
  aiProvider: string | null;
  createdAt: string;
}

interface AdminMarketListing {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  style: string;
  riskPercent: number;
  upvotes: number;
  copyCount: number;
  isPublic: boolean;
  createdAt: string;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: number | string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className={`bg-card/60 border border-border rounded-xl p-4 flex items-start gap-3`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </div>
      <div>
        <p className="text-2xl font-black text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function DashboardTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <div className="text-center py-20 text-muted-foreground text-sm">Loading stats…</div>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={stats.totalUsers} sub={`${stats.recentUsers} new this week`} icon={Users} color="bg-info/10 text-info" />
        <StatCard label="Total Trades" value={stats.totalTrades} icon={BarChart2} color="bg-pos/10 text-pos" />
        <StatCard label="AI Signals" value={stats.totalSignals} icon={Zap} color="bg-info/10 text-info" />
        <StatCard label="Journal Entries" value={stats.totalJournalEntries} icon={BookOpen} color="bg-warn/10 text-warn" />
        <StatCard label="Price Alerts" value={stats.totalAlerts} icon={Bell} color="bg-warn/10 text-warn" />
        <StatCard label="Marketplace" value={stats.totalMarketplaceListings} icon={Store} color="bg-info/10 text-info" />
        <StatCard label="Admins" value={stats.admins} icon={Crown} color="bg-warn/10 text-warn" />
        <StatCard label="Banned Users" value={stats.banned} icon={Ban} color="bg-neg/10 text-neg" />
      </div>

      <div className="bg-card/40 border border-border rounded-xl p-5 space-y-3">
        <p className="font-bold text-sm flex items-center gap-2"><Shield className="w-4 h-4 text-primary" /> Admin Capabilities</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { icon: Users, text: "Manage all user accounts — ban, unban, delete, promote" },
            { icon: Key, text: "Reset any user's password" },
            { icon: Crown, text: "Grant or revoke admin status" },
            { icon: BarChart2, text: "View all trades across every account" },
            { icon: Zap, text: "Monitor all AI signals platform-wide" },
            { icon: Store, text: "Remove any marketplace listing" },
            { icon: Megaphone, text: "Broadcast announcements to all users" },
            { icon: Database, text: "View platform-wide statistics" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [banDialog, setBanDialog] = useState<{ user: AdminUser } | null>(null);
  const [banReason, setBanReason] = useState("");
  const [resetDialog, setResetDialog] = useState<{ user: AdminUser } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{ user: AdminUser } | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/admin/users");
      setUsers(await res.json());
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const action = async (url: string, method: string, body?: any, successMsg?: string) => {
    setWorking(url);
    try {
      const res = await apiRequest(method as any, url, body);
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: successMsg ?? "Done" });
      load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setWorking(null); }
  };

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…" className="pl-9" data-testid="input-user-search" />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </Button>
      </div>

      {loading && <div className="text-center py-10 text-muted-foreground text-sm">Loading users…</div>}

      {!loading && (
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} data-testid={`admin-user-row-${u.id}`} className={cn(
              "bg-card/50 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3",
              u.isBanned ? "border-neg/30 bg-neg/5" : "border-border"
            )}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  u.isAdmin ? "bg-warn/20 text-warn" : "bg-muted text-muted-foreground"
                )}>
                  {u.username[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{u.username}</span>
                    {u.isAdmin && <span className="text-[10px] bg-warn/20 text-warn px-1.5 py-0.5 rounded font-bold">ADMIN</span>}
                    {u.isBanned && <span className="text-[10px] bg-neg/20 text-neg px-1.5 py-0.5 rounded font-bold">BANNED</span>}
                    {u.id === currentUserId && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">YOU</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{u.closedTrades} trades · {u.openPositions} open</span>
                    <span className={cn("text-[10px] font-mono", u.totalPL >= 0 ? "text-pos" : "text-neg")}>
                      {u.totalPL >= 0 ? "+" : ""}${u.totalPL.toFixed(2)} P&L
                    </span>
                    <span className="text-[10px] text-muted-foreground">{u.signalCount} signals</span>
                    {u.createdAt && <span className="text-[10px] text-muted-foreground">Joined {format(new Date(u.createdAt), "MMM d, yyyy")}</span>}
                  </div>
                  {u.isBanned && u.banReason && <p className="text-[10px] text-neg mt-0.5">Reason: {u.banReason}</p>}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {u.isBanned ? (
                  <Button size="sm" variant="outline" className="text-pos border-pos/30 hover:bg-pos/10 text-xs h-7"
                    disabled={!!working} onClick={() => action(`/api/admin/users/${u.id}/unban`, "PATCH", undefined, `${u.username} unbanned`)}
                    data-testid={`button-unban-${u.id}`}>
                    <Unlock className="w-3 h-3 mr-1" /> Unban
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="text-neg border-neg/30 hover:bg-neg/10 text-xs h-7"
                    disabled={!!working} onClick={() => { setBanDialog({ user: u }); setBanReason(""); }}
                    data-testid={`button-ban-${u.id}`}>
                    <Ban className="w-3 h-3 mr-1" /> Ban
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-xs h-7"
                  disabled={!!working} onClick={() => { setResetDialog({ user: u }); setNewPassword(""); }}
                  data-testid={`button-reset-pwd-${u.id}`}>
                  <Key className="w-3 h-3 mr-1" /> Reset PW
                </Button>
                {!u.isAdmin ? (
                  <Button size="sm" variant="outline" className="text-warn border-warn/30 hover:bg-warn/10 text-xs h-7"
                    disabled={!!working || u.id === currentUserId}
                    onClick={() => action(`/api/admin/users/${u.id}/make-admin`, "PATCH", undefined, `${u.username} is now admin`)}
                    data-testid={`button-make-admin-${u.id}`}>
                    <Crown className="w-3 h-3 mr-1" /> Make Admin
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="text-muted-foreground text-xs h-7"
                    disabled={!!working || u.id === currentUserId}
                    onClick={() => action(`/api/admin/users/${u.id}/revoke-admin`, "PATCH", undefined, `${u.username} admin revoked`)}
                    data-testid={`button-revoke-admin-${u.id}`}>
                    <ShieldOff className="w-3 h-3 mr-1" /> Revoke Admin
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-neg border-neg/30 hover:bg-neg/10 text-xs h-7"
                  disabled={!!working || u.id === currentUserId}
                  onClick={() => setDeleteDialog({ user: u })}
                  data-testid={`button-delete-user-${u.id}`}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center py-10 text-muted-foreground text-sm">No users found</div>}
        </div>
      )}

      {/* Ban Dialog */}
      <Dialog open={!!banDialog} onOpenChange={() => setBanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-neg"><Ban className="w-4 h-4" /> Ban {banDialog?.user.username}?</DialogTitle>
            <DialogDescription>This will prevent the user from accessing the platform.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Reason for ban (required)" data-testid="input-ban-reason" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setBanDialog(null)}>Cancel</Button>
              <Button variant="destructive" disabled={!banReason.trim()} onClick={async () => {
                if (!banDialog) return;
                await action(`/api/admin/users/${banDialog.user.id}/ban`, "PATCH", { reason: banReason }, `${banDialog.user.username} banned`);
                setBanDialog(null);
              }}>Ban User</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetDialog} onOpenChange={() => setResetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Key className="w-4 h-4" /> Reset Password — {resetDialog?.user.username}</DialogTitle>
            <DialogDescription>Set a new password for this user. They will need to use it to log in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 4 chars)" data-testid="input-new-password" />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setResetDialog(null)}>Cancel</Button>
              <Button disabled={newPassword.length < 4} onClick={async () => {
                if (!resetDialog) return;
                await action(`/api/admin/users/${resetDialog.user.id}/reset-password`, "POST", { newPassword }, "Password reset");
                setResetDialog(null);
              }}>Reset Password</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-neg"><Trash2 className="w-4 h-4" /> Delete {deleteDialog?.user.username}?</DialogTitle>
            <DialogDescription>This is permanent and cannot be undone. All of this user's data will remain in the database but their account will be removed.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!deleteDialog) return;
              await action(`/api/admin/users/${deleteDialog.user.id}`, "DELETE", undefined, `${deleteDialog.user.username} deleted`);
              setDeleteDialog(null);
            }}>Delete Permanently</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TradesTab() {
  const { toast } = useToast();
  const [positions, setPositions] = useState<AdminPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/admin/positions");
      setPositions(await res.json());
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = positions
    .filter(p => filter === "all" || p.status === filter)
    .filter(p => p.symbol.includes(search.toUpperCase()) || p.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol or user…" className="pl-9" />
        </div>
        <div className="flex gap-1">
          {(["all", "open", "closed"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="text-xs h-8 capitalize" onClick={() => setFilter(f)}>{f}</Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /></Button>
      </div>

      {loading && <div className="text-center py-10 text-muted-foreground text-sm">Loading trades…</div>}

      {!loading && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground font-mono uppercase">{filtered.length} trades</p>
          {filtered.map(p => (
            <div key={p.id} className="bg-card/50 border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", p.type === "buy" ? "bg-pos/10" : "bg-neg/10")}>
                {p.type === "buy" ? <TrendingUp className="w-4 h-4 text-pos" /> : <TrendingDown className="w-4 h-4 text-neg" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{p.symbol}</span>
                  <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded", p.type === "buy" ? "bg-pos/20 text-pos" : "bg-neg/20 text-neg")}>{p.type}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono", p.status === "open" ? "bg-info/20 text-info" : "bg-muted text-muted-foreground")}>{p.status}</span>
                </div>
                <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                  <span>@{p.username}</span>
                  <span>{p.size} lots · Entry {p.entryPrice?.toFixed(5)}</span>
                  {p.openedAt && <span>{format(new Date(p.openedAt), "MMM d HH:mm")}</span>}
                </div>
              </div>
              <span className={cn("font-bold text-sm font-mono shrink-0", p.profit >= 0 ? "text-pos" : "text-neg")}>
                {p.profit >= 0 ? "+" : ""}${p.profit?.toFixed(2)}
              </span>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center py-10 text-muted-foreground text-sm">No trades found</div>}
        </div>
      )}
    </div>
  );
}

function SignalsTab() {
  const { toast } = useToast();
  const [signals, setSignals] = useState<AdminSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/admin/signals");
      setSignals(await res.json());
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const filtered = signals.filter(s =>
    s.symbol.includes(search.toUpperCase()) || s.username.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) =>
    s === "executed" ? "text-pos bg-pos/20" :
    s === "pending"  ? "text-info bg-info/20" :
    s === "dismissed"? "text-muted-foreground bg-muted" :
    "text-warn bg-warn/20";

  const outcomeColor = (o: string | null) =>
    o === "TP_HIT" ? "text-pos" : o === "SL_HIT" ? "text-neg" : "text-muted-foreground";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol or user…" className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /></Button>
      </div>

      {loading && <div className="text-center py-10 text-muted-foreground text-sm">Loading signals…</div>}

      {!loading && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground font-mono uppercase">{filtered.length} signals</p>
          {filtered.map(s => (
            <div key={s.id} className="bg-card/50 border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", s.action === "BUY" ? "bg-pos/10" : "bg-neg/10")}>
                <Zap className={cn("w-4 h-4", s.action === "BUY" ? "text-pos" : "text-neg")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{s.symbol}</span>
                  <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded", s.action === "BUY" ? "bg-pos/20 text-pos" : "bg-neg/20 text-neg")}>{s.action}</span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono", statusColor(s.status))}>{s.status}</span>
                  {s.outcome && <span className={cn("text-[10px] font-mono", outcomeColor(s.outcome))}>{s.outcome}</span>}
                </div>
                <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                  <span>@{s.username}</span>
                  <span>{s.confidence}% confidence</span>
                  {s.aiProvider && <span>{s.aiProvider}</span>}
                  {s.createdAt && <span>{format(new Date(s.createdAt), "MMM d HH:mm")}</span>}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center py-10 text-muted-foreground text-sm">No signals found</div>}
        </div>
      )}
    </div>
  );
}

function MarketplaceTab() {
  const { toast } = useToast();
  const [listings, setListings] = useState<AdminMarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/admin/marketplace");
      setListings(await res.json());
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const deleteListing = async (id: string) => {
    setWorking(true);
    try {
      const res = await apiRequest("DELETE", `/api/admin/marketplace/${id}`);
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: "Listing removed" });
      load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setWorking(false); setDeleteId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{listings.length} listings</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /></Button>
      </div>

      {loading && <div className="text-center py-10 text-muted-foreground text-sm">Loading marketplace…</div>}

      {!loading && (
        <div className="space-y-2">
          {listings.map(l => (
            <div key={l.id} className="bg-card/50 border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{l.title}</p>
                <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                  <span>by {l.authorName}</span>
                  <span>{l.style} · {l.riskPercent}% risk</span>
                  <span>↑{l.upvotes} · {l.copyCount} copies</span>
                  {l.createdAt && <span>{format(new Date(l.createdAt), "MMM d, yyyy")}</span>}
                </div>
              </div>
              <Button size="sm" variant="outline" className="text-neg border-neg/30 hover:bg-neg/10 text-xs h-7 shrink-0"
                onClick={() => setDeleteId(l.id)} data-testid={`button-delete-listing-${l.id}`}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
          {listings.length === 0 && <div className="text-center py-10 text-muted-foreground text-sm">No marketplace listings</div>}
        </div>
      )}

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-neg">Remove Listing?</DialogTitle>
            <DialogDescription>This will permanently remove the strategy from the marketplace.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={working} onClick={() => deleteId && deleteListing(deleteId)}>
              {working ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Remove"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BroadcastTab() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<{ sent: number; title: string } | null>(null);

  const send = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/admin/broadcast", { title, message, type });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setLastSent({ sent: data.sent, title });
      toast({ title: `Broadcast sent to ${data.sent} users` });
      setTitle(""); setMessage("");
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  const TYPE_OPTIONS = [
    { value: "info",   label: "Info",    color: "text-info" },
    { value: "signal", label: "Signal",  color: "text-info" },
    { value: "alert",  label: "Alert",   color: "text-warn" },
    { value: "trade",  label: "Trade",   color: "text-pos" },
  ];

  return (
    <div className="max-w-lg space-y-5">
      <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
        <p className="text-xs text-warn">This sends an in-app notification to <strong>every registered user</strong>. Use for important announcements, maintenance notices, or platform updates.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notification Type</label>
          <div className="flex gap-2 flex-wrap">
            {TYPE_OPTIONS.map(t => (
              <button key={t.value} onClick={() => setType(t.value)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  type === t.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/30"
                )}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title…" maxLength={80} data-testid="input-broadcast-title" />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Write your message here…"
            maxLength={500}
            rows={4}
            data-testid="input-broadcast-message"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p className="text-[10px] text-muted-foreground text-right mt-0.5">{message.length}/500</p>
        </div>

        <Button
          onClick={send}
          disabled={!title.trim() || !message.trim() || sending}
          className="w-full"
          data-testid="button-send-broadcast"
        >
          {sending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
          {sending ? "Sending…" : "Send to All Users"}
        </Button>
      </div>

      {lastSent && (
        <div className="flex items-center gap-2 text-pos text-sm p-3 bg-pos/10 border border-pos/30 rounded-xl">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Sent "{lastSent.title}" to {lastSent.sent} users
        </div>
      )}
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard",   label: "Dashboard",   icon: Activity },
  { id: "users",       label: "Users",       icon: Users },
  { id: "trades",      label: "All Trades",  icon: BarChart2 },
  { id: "signals",     label: "Signals",     icon: Zap },
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "broadcast",   label: "Broadcast",   icon: Megaphone },
];

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (user && !user.isAdmin) {
      setLocation("/");
      return;
    }
    fetch("/api/admin/stats", { credentials: "include" })
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, [user, setLocation]);

  if (!user?.isAdmin) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="font-bold text-lg">Access Denied</p>
            <p className="text-muted-foreground text-sm">This page requires admin privileges.</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warn/20 border border-warn/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-warn" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">Logged in as <strong className="text-warn">{user.username}</strong> · Full platform access</p>
            </div>
            <Link href="/health" className="ml-auto text-sm underline min-h-[44px] flex items-center">App Health Score</Link>
          </div>

          {/* Tab Bar */}
          <div className="flex gap-1 bg-card/50 border border-border rounded-xl p-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                data-testid={`admin-tab-${id}`}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              {tab === "dashboard"   && <DashboardTab stats={stats} />}
              {tab === "users"       && <UsersTab currentUserId={user.id} />}
              {tab === "trades"      && <TradesTab />}
              {tab === "signals"     && <SignalsTab />}
              {tab === "marketplace" && <MarketplaceTab />}
              {tab === "broadcast"   && <BroadcastTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </AppLayout>
  );
}
