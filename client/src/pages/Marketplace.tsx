import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Store, Heart, Copy, Plus, X, Search, Star,
  Zap, Trophy, Clock, TrendingUp, Trash2, ChevronRight,
  Shield, BarChart2, Users, Sparkles, Award,
} from "lucide-react";

const STYLE_COLORS: Record<string, string> = {
  scalping: "text-warn bg-warn/10 border-warn/20",
  swing: "text-info bg-info/10 border-info/20",
  position: "text-info bg-info/10 border-info/20",
  daytrading: "text-pos bg-pos/10 border-pos/20",
};

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular", icon: Heart },
  { value: "rated", label: "Highest Rated", icon: Star },
  { value: "newest", label: "Newest", icon: Clock },
  { value: "winrate", label: "Best Win Rate", icon: TrendingUp },
];

function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => !readonly && setHovered(n)}
          className={cn("transition-colors", readonly ? "cursor-default" : "cursor-pointer")}
        >
          <Star className={cn("w-3.5 h-3.5", (hovered || value) >= n ? "fill-warn text-warn" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

function StatPill({ label, value, color = "" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center text-center px-2">
      <span className={cn("text-sm font-bold font-mono tabular-nums", color || "text-foreground")}>{value}</span>
      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function ListingDetailModal({ listing, onClose, onCopy, onVote, currentUserId }: {
  listing: any; onClose: () => void; onCopy: () => void; onVote: () => void; currentUserId?: string;
}) {
  const isOwn = listing.authorId === currentUserId;
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase", STYLE_COLORS[listing.style] || "text-muted-foreground bg-muted")}>
                  {listing.style}
                </span>
                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{listing.category}</span>
              </div>
              <h2 className="font-bold text-lg leading-tight">{listing.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">by <span className="text-foreground">{listing.authorName}</span></p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-4 gap-2 bg-muted/30 rounded-xl p-3">
            <StatPill label="Risk" value={`${listing.riskPercent}%`} />
            <StatPill label="Win Rate" value={listing.winRate ? `${listing.winRate}%` : "—"} color={listing.winRate > 55 ? "text-pos" : ""} />
            <StatPill label="Return" value={listing.totalReturn ? `${listing.totalReturn > 0 ? "+" : ""}${listing.totalReturn}%` : "—"} color={listing.totalReturn > 0 ? "text-pos" : listing.totalReturn < 0 ? "text-neg" : ""} />
            <StatPill label="Copies" value={String(listing.copyCount || 0)} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Strategy Description</h3>
            <p className="text-sm text-foreground/90 leading-relaxed">{listing.description}</p>
          </div>

          {listing.pairs && listing.pairs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pairs</h3>
              <div className="flex flex-wrap gap-1.5">
                {listing.pairs.map((p: string) => (
                  <span key={p} className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">{p}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={onVote}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-primary/10 hover:text-primary transition-colors text-sm"
                data-testid={`vote-modal-${listing.id}`}
              >
                <Heart className="w-4 h-4" />
                <span className="font-mono font-bold">{listing.upvotes}</span>
              </button>
              {listing.rating && (
                <div className="flex items-center gap-1">
                  <StarRating value={Math.round(listing.rating)} readonly />
                  <span className="text-xs text-muted-foreground">({listing.ratingCount || 0})</span>
                </div>
              )}
            </div>
            <Button onClick={onCopy} data-testid={`copy-modal-${listing.id}`}>
              <Copy className="w-4 h-4 mr-2" /> Apply Strategy
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ListingCard({ listing, onVote, onCopy, onDelete, onView, currentUserId, featured = false }: {
  listing: any; onVote: () => void; onCopy: () => void; onDelete?: () => void;
  onView: () => void; currentUserId?: string; featured?: boolean;
}) {
  const isOwn = listing.authorId === currentUserId;
  const winRate = listing.winRate ?? 0;
  const totalReturn = listing.totalReturn ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group relative bg-card/50 border rounded-xl overflow-hidden hover:border-primary/40 transition-all duration-200 cursor-pointer",
        featured ? "border-warn/40 shadow-md " : "border-border"
      )}
      onClick={onView}
      data-testid={`listing-card-${listing.id}`}
    >
      {featured && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-warn/60" />
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              {featured && <Award className="w-3.5 h-3.5 text-warn shrink-0" />}
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase", STYLE_COLORS[listing.style] || "text-muted-foreground bg-muted border-border")}>
                {listing.style}
              </span>
            </div>
            <h3 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">{listing.title}</h3>
            <p className="text-[11px] text-muted-foreground">by {listing.authorName}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
            {isOwn && onDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                data-testid={`delete-${listing.id}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onVote(); }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 hover:bg-primary/10 hover:text-primary transition-colors text-xs"
              data-testid={`vote-${listing.id}`}
            >
              <Heart className="w-3 h-3" />
              <span className="font-mono font-semibold">{listing.upvotes}</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{listing.description}</p>

        <div className="grid grid-cols-4 gap-1 py-2.5 border-y border-border mb-3">
          <StatPill label="Risk" value={`${listing.riskPercent}%`} />
          <StatPill label="Win%" value={winRate ? `${winRate}%` : "—"} color={winRate > 55 ? "text-pos" : ""} />
          <StatPill label="Return" value={totalReturn ? `${totalReturn > 0 ? "+" : ""}${totalReturn}%` : "—"} color={totalReturn > 0 ? "text-pos" : totalReturn < 0 ? "text-neg" : ""} />
          <StatPill label="Copies" value={String(listing.copyCount || 0)} />
        </div>

        <div className="flex items-center justify-between">
          {listing.rating ? (
            <div className="flex items-center gap-1">
              <StarRating value={Math.round(listing.rating)} readonly />
              <span className="text-[10px] text-muted-foreground">({listing.ratingCount || 0})</span>
            </div>
          ) : <div />}
          <button
            onClick={e => { e.stopPropagation(); onCopy(); }}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition-colors"
            data-testid={`copy-${listing.id}`}
          >
            <Copy className="w-3 h-3" /> Apply
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function PublishModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "", description: "", style: "swing", category: "forex",
    riskPercent: "2", winRate: "", totalReturn: "", maxDrawdown: "",
  });

  const publish = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/marketplace", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      toast({ title: "Strategy published to marketplace" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Publish failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg">Publish Strategy</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-1">Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. EMA Trend Follower" data-testid="marketplace-title" />
          </div>
          <div>
            <Label className="text-xs mb-1">Description *</Label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Describe your approach, entry/exit criteria, and risk management..."
              data-testid="marketplace-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1">Trading Style</Label>
              <select value={form.style} onChange={e => setForm(f => ({ ...f, style: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                {["scalping","daytrading","swing","position"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1">Category</Label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                {["forex","gold","indices","multi"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs mb-1">Risk %</Label>
              <Input type="number" min="0.1" max="10" step="0.1" value={form.riskPercent} onChange={e => setForm(f => ({ ...f, riskPercent: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs mb-1">Win Rate %</Label>
              <Input type="number" min="0" max="100" value={form.winRate} onChange={e => setForm(f => ({ ...f, winRate: e.target.value }))} placeholder="optional" />
            </div>
            <div>
              <Label className="text-xs mb-1">Total Return %</Label>
              <Input type="number" value={form.totalReturn} onChange={e => setForm(f => ({ ...f, totalReturn: e.target.value }))} placeholder="optional" />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => publish.mutate({
              title: form.title, description: form.description,
              style: form.style, category: form.category,
              riskPercent: parseFloat(form.riskPercent) || 2,
              winRate: form.winRate ? parseFloat(form.winRate) : null,
              totalReturn: form.totalReturn ? parseFloat(form.totalReturn) : null,
              maxDrawdown: form.maxDrawdown ? parseFloat(form.maxDrawdown) : null,
              isPublic: true,
            })}
            disabled={!form.title || !form.description || publish.isPending}
            data-testid="publish-strategy-btn"
          >
            {publish.isPending ? "Publishing..." : "Publish to Marketplace"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

type SortKey = "popular" | "rated" | "newest" | "winrate";

export default function Marketplace() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("popular");
  const [showPublish, setShowPublish] = useState(false);
  const [detailListing, setDetailListing] = useState<any>(null);

  const { data: listings = [] } = useQuery<any[]>({ queryKey: ["/api/marketplace"] });

  const vote = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/marketplace/${id}/vote`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/marketplace"] }),
  });

  const copy = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/marketplace/${id}/copy`, {}),
    onSuccess: () => {
      toast({ title: "Strategy applied!", description: "Now active in your strategy settings" });
      qc.invalidateQueries({ queryKey: ["/api/marketplace"] });
      setDetailListing(null);
    },
    onError: (e: any) => toast({ title: "Copy failed", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/marketplace/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/marketplace"] }),
  });

  const sorted = [...(listings as any[])].sort((a, b) => {
    if (sortBy === "popular") return (b.upvotes ?? 0) - (a.upvotes ?? 0);
    if (sortBy === "rated") return (b.rating ?? 0) - (a.rating ?? 0);
    if (sortBy === "newest") return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    if (sortBy === "winrate") return (b.winRate ?? 0) - (a.winRate ?? 0);
    return 0;
  });

  const filtered = sorted.filter(l =>
    (styleFilter === "all" || l.style === styleFilter) &&
    (search === "" || l.title.toLowerCase().includes(search.toLowerCase()) || l.authorName?.toLowerCase().includes(search.toLowerCase()))
  );

  const featured = sorted.slice(0, 3);
  const styles = ["all", "scalping", "daytrading", "swing", "position"];

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-6 pb-20 md:pb-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Store className="w-5 h-5 text-primary" /> Strategy Marketplace
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(listings as any[]).length} strategies · vote, adopt, and share
              </p>
            </div>
            <Button size="sm" onClick={() => setShowPublish(true)} data-testid="open-publish-btn">
              <Plus className="w-4 h-4 mr-1.5" /> Publish
            </Button>
          </div>

          {/* Featured section */}
          {featured.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-warn" />
                <h2 className="text-sm font-semibold">Featured Strategies</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {featured.map((l, i) => (
                  <ListingCard
                    key={l.id} listing={l} featured currentUserId={(user as any)?.id}
                    onVote={() => vote.mutate(l.id)}
                    onCopy={() => copy.mutate(l.id)}
                    onDelete={() => del.mutate(l.id)}
                    onView={() => setDetailListing(l)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Filters and sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search strategies..." value={search} onChange={e => setSearch(e.target.value)} data-testid="search-marketplace" />
            </div>
            <div className="flex flex-wrap gap-1">
              {styles.map(s => (
                <button
                  key={s}
                  onClick={() => setStyleFilter(s)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                    styleFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}
                  data-testid={`filter-${s}`}
                >{s}</button>
              ))}
            </div>
          </div>

          {/* Sort bar */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Sort by:</span>
            <div className="flex gap-1 flex-wrap">
              {SORT_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value as SortKey)}
                    className={cn("flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors",
                      sortBy === opt.value ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground")}
                    data-testid={`sort-${opt.value}`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {filtered.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">{filtered.length} results</span>
            )}
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            search || styleFilter !== "all" ? (
              <div className="text-center py-20 text-muted-foreground">
                <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No strategies match your filters</p>
                <p className="text-xs mt-1 opacity-60">Try a different style or clear the search</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center py-10">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Store className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-bold text-lg">No strategies yet</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                    Be the first to publish your trading strategy and start building your reputation.
                  </p>
                  <Button className="mt-4 gap-2" onClick={() => setShowPublish(true)} data-testid="empty-publish-btn">
                    <Plus className="w-4 h-4" /> Publish First Strategy
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { icon: Users, title: "Share your edge", desc: "Publish your proven strategy and help other traders benefit from your experience." },
                    { icon: Heart, title: "Vote & discover", desc: "Vote on strategies you find valuable. The best ones rise to the top naturally." },
                    { icon: Copy, title: "Apply in one click", desc: "Copy any strategy directly into your trading settings with a single click." },
                  ].map(item => (
                    <div key={item.title} className="bg-card/40 border border-border rounded-xl p-4 text-center">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                        <item.icon className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-semibold mb-1">{item.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(listing => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  currentUserId={(user as any)?.id}
                  onVote={() => vote.mutate(listing.id)}
                  onCopy={() => copy.mutate(listing.id)}
                  onDelete={() => del.mutate(listing.id)}
                  onView={() => setDetailListing(listing)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showPublish && <PublishModal onClose={() => setShowPublish(false)} />}

      <AnimatePresence>
        {detailListing && (
          <ListingDetailModal
            listing={detailListing}
            onClose={() => setDetailListing(null)}
            onCopy={() => copy.mutate(detailListing.id)}
            onVote={() => vote.mutate(detailListing.id)}
            currentUserId={(user as any)?.id}
          />
        )}
      </AnimatePresence>
    </AppLayout>
  );
}
