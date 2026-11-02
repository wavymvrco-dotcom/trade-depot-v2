import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { motion } from "framer-motion";
import { CalendarDays, AlertTriangle, Clock, RefreshCw, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from "date-fns";

const IMPACT_COLORS: Record<string, string> = {
  high:   "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  low:    "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿",
};

function EventCard({ event }: { event: any }) {
  const date = new Date(event.date);
  const past = isPast(date);
  const today = isToday(date);
  const tomorrow = isTomorrow(date);

  return (
    <div className={`border rounded-lg p-4 transition-colors hover:bg-muted/10 ${
      today ? "border-primary/40 bg-primary/5" :
      tomorrow ? "border-orange-500/30 bg-orange-500/5" :
      past ? "border-border/30 opacity-50" : "border-border"
    }`}>
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-center">
          <div className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded mb-1 ${today ? "bg-primary/20 text-primary" : tomorrow ? "bg-orange-500/20 text-orange-400" : "bg-muted text-muted-foreground"}`}>
            {today ? "TODAY" : tomorrow ? "TOMORROW" : format(date, "EEE")}
          </div>
          <div className="text-sm font-bold font-mono">{format(date, "HH:mm")}</div>
          <div className="text-[10px] text-muted-foreground">UTC</div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-bold">{event.title}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${IMPACT_COLORS[event.impact] || IMPACT_COLORS.low}`}>
              {(event.impact || "low").toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{CURRENCY_FLAGS[event.currency] || "🌐"} {event.currency}</span>
            {event.forecast && <span>Forecast: <strong className="text-foreground">{event.forecast}</strong></span>}
            {event.previous && <span>Previous: {event.previous}</span>}
            {event.actual && <span>Actual: <strong className={parseFloat(event.actual) > parseFloat(event.forecast || "0") ? "text-green-400" : "text-red-400"}>{event.actual}</strong></span>}
          </div>
        </div>

        <div className="shrink-0 text-right">
          {!past ? (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{formatDistanceToNow(date, { addSuffix: true })}</span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground">Released</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Calendar() {
  const { data: events = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/calendar"],
    queryFn: () => apiRequest("GET", "/api/calendar").then(r => r.json()),
    refetchInterval: 15 * 60 * 1000,
  });

  const [filter, setFilter] = useState<"all" | "high" | "medium">("all");
  const filtered = (events as any[]).filter(e => filter === "all" || e.impact === filter);
  const upcoming = filtered.filter(e => !isPast(new Date(e.date)));
  const past = filtered.filter(e => isPast(new Date(e.date)));

  const highCount = (events as any[]).filter(e => e.impact === "high" && !isPast(new Date(e.date))).length;

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden flex flex-col h-full bg-background">
        <div className="h-16 border-b border-border px-6 py-4 bg-card/40 shrink-0 flex items-center justify-between">
          <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="text-xl md:text-2xl font-bold flex items-center gap-3">
            <CalendarDays className="w-6 h-6 text-primary" />
            Economic Calendar
          </motion.h1>
          <div className="flex items-center gap-3">
            {highCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {highCount} high impact upcoming
              </div>
            )}
            <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-6 pb-20">

            {/* Filter tabs */}
            <div className="flex gap-2">
              {(["all", "high", "medium"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}>
                  {f === "all" ? "All Events" : f === "high" ? "🔴 High Impact" : "🟠 Medium Impact"}
                </button>
              ))}
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Loading economic calendar…
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p>No events found for this filter.</p>
              </div>
            )}

            {upcoming.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" /> Upcoming ({upcoming.length})
                </h2>
                {upcoming.map((event, i) => <EventCard key={i} event={event} />)}
              </div>
            )}

            {past.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" /> Released ({past.length})
                </h2>
                {past.map((event, i) => <EventCard key={i} event={event} />)}
              </div>
            )}

            <div className="text-center text-[11px] text-muted-foreground pb-4">
              Economic calendar data sourced live. Refresh for latest events.
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

