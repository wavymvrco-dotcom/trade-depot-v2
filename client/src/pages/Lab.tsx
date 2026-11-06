// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Lab hub. Phase 0 placeholder: the Strategy Lab (Blueprint · Arena · Report ·
// Shadow · Licenses) replaces the Strategy and TDCI pages in Phase 1.
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";

const STAGES = ["Blueprint", "Arena", "Gauntlet", "Vault Exam", "Shadow Run", "Live"];

export default function Lab() {
  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16 space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground">STRATEGY LAB · EARLY ACCESS</p>
            <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight">Describe a strategy. The Lab invents it, attacks it, and examines it before it touches your money.</h1>
            <p className="text-muted-foreground leading-relaxed">The Lab is being built. Until it opens, the strategy settings and the TDCI calibration tools are here.</p>
          </div>
          <ol className="grid grid-cols-2 md:grid-cols-3 gap-3" aria-label="Lab stages">
            {STAGES.map((s, i) => (
              <li key={s} className="rounded-xl border border-border bg-card px-4 py-3">
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <p className="font-medium">{s}</p>
              </li>
            ))}
          </ol>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link href="/strategy" className="rounded-xl border border-border bg-card p-5 hover:border-primary transition-colors block min-h-[44px]">
              <p className="font-medium">Strategy settings</p>
              <p className="text-sm text-muted-foreground mt-1">Risk per trade, R:R, style and auto-trade rules.</p>
            </Link>
            <Link href="/tdci" className="rounded-xl border border-border bg-card p-5 hover:border-primary transition-colors block min-h-[44px]">
              <p className="font-medium">TDCI calibration</p>
              <p className="text-sm text-muted-foreground mt-1">Test each confluence layer on real history, out of sample.</p>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">Simulated and historical results do not guarantee future performance. Not financial advice.</p>
        </div>
      </div>
    </AppLayout>
  );
}
