// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Tabs for a hub page. The active tab lives in the URL (?tab=…) so old links
// can redirect straight to it and the browser back button works.

import { Suspense, useRef, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { cn } from "@/lib/utils";
import { AppLayout } from "./AppLayout";

export interface HubTab { id: string; label: string; render: () => ReactNode }

export function HubTabs({ title, tabs }: { title: string; tabs: HubTab[] }) {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const requested = new URLSearchParams(search).get("tab");
  const active = tabs.find(t => t.id === requested) ?? tabs[0];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (id: string) => setLocation(`${location}?tab=${id}`, { replace: true });
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    select(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <AppLayout>
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center gap-4 border-b border-border px-4 md:px-6 pt-3 overflow-x-auto no-scrollbar shrink-0">
          <h1 className="font-display text-lg md:text-xl font-medium mr-2 whitespace-nowrap">{title}</h1>
          <div role="tablist" aria-label={title} className="flex gap-1">
            {tabs.map((t, i) => (
              <button
                key={t.id}
                ref={el => { refs.current[i] = el; }}
                role="tab"
                id={`hub-tab-${t.id}`}
                aria-selected={t.id === active.id}
                aria-controls={`hub-panel-${t.id}`}
                tabIndex={t.id === active.id ? 0 : -1}
                onClick={() => select(t.id)}
                onKeyDown={e => onKey(e, i)}
                className={cn(
                  "min-h-[44px] px-3 md:px-4 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
                  t.id === active.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div role="tabpanel" id={`hub-panel-${active.id}`} aria-labelledby={`hub-tab-${active.id}`} className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
            {active.render()}
          </Suspense>
        </div>
      </div>
    </AppLayout>
  );
}
