// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Terminal hub: the trading dashboard, with News and the economic Calendar in a
// collapsible side panel, and links to chart analysis, the order ticket and alerts.
import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Newspaper } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Dashboard = lazy(() => import("./Dashboard"));
const News = lazy(() => import("./News"));
const Calendar = lazy(() => import("./Calendar"));

type Panel = "news" | "calendar";

export default function Terminal() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const fromUrl = new URLSearchParams(search).get("panel");
  const [panel, setPanel] = useState<Panel | null>(fromUrl === "news" || fromUrl === "calendar" ? fromUrl : null);

  useEffect(() => {
    if (fromUrl === "news" || fromUrl === "calendar") setPanel(fromUrl);
  }, [fromUrl]);

  const close = () => { setPanel(null); if (fromUrl) setLocation(location, { replace: true }); };

  return (
    <AppLayout>
      <Suspense fallback={null}><Dashboard /></Suspense>

      <button
        type="button"
        onClick={() => setPanel("news")}
        className="fixed z-40 right-4 bottom-44 md:bottom-6 min-h-[44px] px-4 rounded-full border border-border bg-card text-sm font-medium shadow-sm flex items-center gap-2 hover:border-primary"
        aria-haspopup="dialog"
      >
        <Newspaper className="w-4 h-4" aria-hidden="true" /> News &amp; calendar
      </button>

      <Sheet open={panel !== null} onOpenChange={open => (open ? setPanel(panel ?? "news") : close())}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Market news &amp; calendar</SheetTitle>
            <SheetDescription>
              Also on the Terminal: <Link href="/analysis" className="underline">chart analysis</Link> ·{" "}
              <Link href="/trade" className="underline">order ticket</Link> ·{" "}
              <Link href="/alerts" className="underline">price alerts</Link>
            </SheetDescription>
          </SheetHeader>
          <HiveLine />
          <Tabs value={panel ?? "news"} onValueChange={v => setPanel(v as Panel)} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="mx-4 mt-2 self-start">
              <TabsTrigger value="news">News</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
            </TabsList>
            <TabsContent value="news" className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              <Suspense fallback={null}><News /></Suspense>
            </TabsContent>
            <TabsContent value="calendar" className="flex-1 min-h-0 overflow-y-auto flex flex-col">
              <Suspense fallback={null}><Calendar /></Suspense>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

/** Hive (§11.3): the skill-weighted view of Licensed strategies — shown only with at least 5 contributors. */
function HiveLine() {
  const [symbol, setSymbol] = useState("EURUSD");
  const q = useQuery<{ pUp: number | null; contributors: number }>({ queryKey: ["/api/hive", symbol], queryFn: () => fetch(`/api/hive/${symbol}`, { credentials: "include" }).then(r => r.json()), staleTime: 60_000 });
  return (
    <div className="mx-4 mt-2 text-sm bg-secondary rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
      <span className="font-medium">Hive</span>
      <select aria-label="Hive symbol" value={symbol} onChange={e => setSymbol(e.target.value)} className="bg-card border border-border rounded px-2 py-1 font-mono text-xs">
        {["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "GBPJPY", "XAUUSD"].map(s => <option key={s}>{s}</option>)}
      </select>
      {q.data?.pUp != null
        ? <span><span className="font-mono">{Math.round(q.data.pUp * 100)}%</span> chance of higher prices ahead, from {q.data.contributors} Licensed strategies weighted by their track record. Context, not a signal.</span>
        : <span className="text-muted-foreground">Not enough Licensed strategies yet (needs 5).</span>}
    </div>
  );
}
