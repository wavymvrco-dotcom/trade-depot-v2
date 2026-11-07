// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Public landing page — Research Journal "A3 · Console + system reel"
// (reference: docs/design/landing-a3.dc.html; structure: build sheet §17.2).

import { useRef, useState } from "react";
import { Link } from "wouter";
import { landing } from "@/content/landing";
import { filmFor, type Film } from "@/content/films";
import { FilmPlayer } from "@/components/films/FilmPlayer";
import { StatusBadge, type Status } from "@/components/lab/StatusBadge";

const t = landing.en;

const EXAMPLE_ROWS: { name: string; status: Status; label: string; vault: string; shadow: string; dim?: boolean }[] = [
  { name: "London Breakout", status: "licensed", label: "Licensed", vault: "+9.1R", shadow: "31 d" },
  { name: "Asia Range Fade", status: "shadow", label: "Shadow", vault: "+4.6R", shadow: "18 d" },
  { name: "NY Open Momentum", status: "arena", label: "Arena", vault: "—", shadow: "—" },
  { name: "Gold Mean Revert", status: "rejected", label: "Rejected", vault: "−2.3R", shadow: "—", dim: true },
];

const section = "px-4 md:px-12 lg:px-24 py-12 md:py-24 border-t border-rule";
const inner = "max-w-[1248px] mx-auto";
const eyebrow = "text-[13px] tracking-[0.14em] text-muted-foreground font-semibold";
const btn = "inline-flex items-center justify-center min-h-[44px] px-5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90";

function Console() {
  return (
    <div className="bg-card border border-border rounded-[14px] shadow-[0_16px_40px_rgba(26,26,26,0.07)] overflow-hidden w-full">
      <div className="flex justify-between items-center px-5 py-4 border-b border-border">
        <span className="font-semibold text-[15px]">{t.hero.console.title}</span>
        <span className="font-mono text-xs text-muted-foreground">{t.hero.console.label}</span>
      </div>
      {/* Table on wider screens, stacked cards on phones */}
      <table className="hidden sm:table w-full text-sm">
        <caption className="sr-only">{t.hero.console.title} ({t.hero.console.label})</caption>
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border">
            {t.hero.console.cols.map((c, i) => (
              <th key={c} scope="col" className={`font-normal text-left py-2.5 ${i === 0 ? "pl-5 w-[40%]" : ""}`}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_ROWS.map((r, i) => (
            <tr key={r.name} className={i < EXAMPLE_ROWS.length - 1 ? "border-b border-border/60" : ""}>
              <th scope="row" className={`text-left font-semibold pl-5 py-3.5 ${r.dim ? "text-muted-foreground" : ""}`}>{r.name}</th>
              <td><StatusBadge status={r.status} label={r.label} /></td>
              <td className={`font-mono ${r.dim ? "text-muted-foreground" : ""}`}>{r.vault}</td>
              <td className={`font-mono ${r.dim ? "text-muted-foreground" : ""}`}>{r.shadow}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="sm:hidden divide-y divide-border/60">
        {EXAMPLE_ROWS.map(r => (
          <li key={r.name} className="px-5 py-3.5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center gap-2">
              <span className={`font-semibold ${r.dim ? "text-muted-foreground" : ""}`}>{r.name}</span>
              <StatusBadge status={r.status} label={r.label} />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Vault <span className="font-mono text-foreground">{r.vault}</span></span>
              <span>Shadow <span className="font-mono text-foreground">{r.shadow}</span></span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Reel() {
  const [sel, setSel] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const systems = t.reel.systems;
  const active = systems[sel];
  const pick = (i: number) => { setSel(i); tabs.current[i]?.focus(); };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = systems.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next >= 0) { e.preventDefault(); pick(next); }
  };

  return (
    <section id="reel" aria-labelledby="reel-title" className="px-4 md:px-12 lg:px-24 pb-12 md:pb-24">
      <div className={`${inner} bg-card border border-border rounded-2xl p-5 md:p-7 flex flex-col gap-6`}>
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <h2 id="reel-title" className="text-[28px] md:text-[34px] m-0">{t.reel.title}</h2>
          <div role="tablist" aria-label="Systems" className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {systems.map((s, i) => (
              <button key={s.id} ref={el => { tabs.current[i] = el; }}
                type="button" role="tab" id={`reel-tab-${s.id}`}
                aria-selected={i === sel} aria-controls="reel-panel" tabIndex={i === sel ? 0 : -1}
                onClick={() => setSel(i)} onKeyDown={e => onKey(e, i)}
                className={`min-h-[44px] px-4 rounded-full border text-sm whitespace-nowrap transition-colors ${i === sel
                  ? "bg-primary border-primary text-primary-foreground font-semibold"
                  : "bg-card border-rule text-foreground font-medium hover:border-primary"}`}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div id="reel-panel" role="tabpanel" aria-labelledby={`reel-tab-${active.id}`} className="flex flex-col xl:flex-row gap-6 xl:gap-8 xl:items-stretch">
          <FilmPlayer film={filmFor(active.id as Film["system"])} code={active.code} className="w-full xl:basis-[760px] xl:shrink-0 aspect-video xl:aspect-auto xl:h-[428px]" />
          <div className="flex-1 flex flex-col gap-3.5 justify-center">
            <p className={`${eyebrow} m-0`}>{active.step}</p>
            <h3 className="text-[26px] md:text-[32px] leading-[1.12] m-0">{active.headline}</h3>
            <p className="text-base leading-relaxed text-ink-2 m-0">{active.body}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="h-screen overflow-y-auto bg-background text-foreground font-sans">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-card px-3 py-2 rounded-md z-50">Skip to content</a>

      {/* 1. Top bar */}
      <header className="border-b border-rule px-4 md:px-12 lg:px-24 py-4 md:py-6">
        <nav aria-label="Main" className={`${inner} flex justify-between items-center gap-4`}>
          <span className="font-display text-[22px] md:text-[26px] font-semibold">Trade Depot</span>
          <div className="flex gap-5 lg:gap-8 text-[15px] items-center">
            <a href="#reel" className="hidden md:inline text-ink-2 hover:text-primary">{t.nav.systems}</a>
            <a href="#prop" className="hidden md:inline text-ink-2 hover:text-primary">{t.nav.prop}</a>
            <a href="#pricing" className="hidden md:inline text-ink-2 hover:text-primary">{t.nav.pricing}</a>
            <Link href="/auth" className="text-ink-2 hover:text-primary min-h-[44px] inline-flex items-center">{t.nav.signIn}</Link>
            <Link href="/auth?mode=register" className={btn}>{t.nav.start}</Link>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* 2. Hero */}
        <section className="px-4 md:px-12 lg:px-24 pt-10 md:pt-14 pb-10 md:pb-12">
          <div className={`${inner} flex flex-col xl:flex-row gap-10 xl:gap-16 xl:items-center`}>
            <div className="flex-1 flex flex-col gap-5">
              <p className={`${eyebrow} m-0`}>{t.hero.eyebrow}</p>
              <h1 className="m-0 text-[40px] md:text-[56px] lg:text-[64px] leading-[1.03]">{t.hero.title}</h1>
              <p className="m-0 text-[17px] md:text-[19px] leading-[1.55] text-ink-2 max-w-[540px]">{t.hero.body}</p>
              <Link href="/auth?mode=register" className={`${btn} self-start px-[22px]`}>{t.hero.cta}</Link>
            </div>
            <div className="w-full max-w-[640px] xl:basis-[600px] xl:shrink-0"><Console /></div>
          </div>
        </section>

        {/* 3. System reel */}
        <Reel />

        {/* 4. The problem */}
        <section className={section} aria-labelledby="problem-title">
          <div className={inner}>
            <h2 id="problem-title" className="text-[32px] md:text-[40px] m-0 mb-8 md:mb-12">{t.problem.title}</h2>
            <div className="grid md:grid-cols-3 gap-4 md:gap-6">
              {t.problem.cards.map(c => (
                <article key={c.title} className="bg-card border border-border rounded-xl p-6">
                  <h3 className="text-[22px] m-0 mb-2">{c.title}</h3>
                  <p className="m-0 text-ink-2 leading-relaxed">{c.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 5. The loop */}
        <section className={section} aria-labelledby="loop-title">
          <div className={inner}>
            <h2 id="loop-title" className="text-[32px] md:text-[40px] m-0 mb-8 md:mb-12">{t.loop.title}</h2>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 list-none p-0 m-0">
              {t.loop.stages.map((s, i) => (
                <li key={s.name} className="border-t border-rule pt-4">
                  <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-xl m-0 mt-1 mb-1.5">{s.name}</h3>
                  <p className="m-0 text-ink-2 text-[15px] leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 6. Prop traders */}
        <section id="prop" className={section} aria-labelledby="prop-title">
          <div className={`${inner} flex flex-col lg:flex-row gap-10 lg:gap-16 lg:items-center`}>
            <div className="flex-1 flex flex-col gap-4">
              <p className={`${eyebrow} m-0`}>{t.prop.eyebrow}</p>
              <h2 id="prop-title" className="text-[32px] md:text-[40px] m-0">{t.prop.title}</h2>
              <p className="m-0 text-ink-2 text-[17px] leading-relaxed max-w-[560px]">{t.prop.body}</p>
              <figure className="m-0 mt-2 flex items-baseline gap-3">
                <span className="font-mono text-4xl">{t.prop.stat}</span>
                <figcaption className="text-ink-2">{t.prop.statLabel}<br /><cite className="text-xs text-muted-foreground not-italic">{t.prop.statSource}</cite></figcaption>
              </figure>
            </div>
            <div className="lg:basis-[440px] lg:shrink-0 bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold">{t.prop.card.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{t.prop.card.label}</span>
              </div>
              <div className="bg-secondary rounded-xl p-5">
                <span className="font-mono text-4xl">{t.prop.card.range}</span>
                <p className="m-0 text-sm text-muted-foreground mt-1">{t.prop.card.rangeLabel}</p>
              </div>
              <dl className="m-0 text-sm divide-y divide-border">
                {t.prop.card.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2"><dt className="text-muted-foreground">{k}</dt><dd className="m-0 font-mono">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* 7. License / Proof of Process */}
        <section className={section} aria-labelledby="license-title">
          <div className={`${inner} flex flex-col lg:flex-row-reverse gap-10 lg:gap-16 lg:items-center`}>
            <div className="flex-1 flex flex-col gap-4">
              <p className={`${eyebrow} m-0`}>{t.license.eyebrow}</p>
              <h2 id="license-title" className="text-[32px] md:text-[40px] m-0">{t.license.title}</h2>
              <p className="m-0 text-ink-2 text-[17px] leading-relaxed max-w-[560px]">{t.license.body}</p>
            </div>
            <div className="lg:basis-[440px] lg:shrink-0 bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex justify-between items-center gap-3">
                <span className="font-display text-2xl">{t.license.card.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{t.license.card.label}</span>
              </div>
              <StatusBadge status="licensed" />
              <dl className="m-0 text-sm divide-y divide-border">
                {t.license.card.rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="m-0 font-mono text-right">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* 8. Markets */}
        <section className={section} aria-labelledby="markets-title">
          <div className={inner}>
            <h2 id="markets-title" className="text-[32px] md:text-[40px] m-0 mb-8">{t.markets.title}</h2>
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-4 list-none p-0 m-0">
              {t.markets.items.map(m => (
                <li key={m.name} className="bg-card border border-border rounded-xl p-5 flex justify-between items-center gap-2">
                  <span className="font-medium">{m.name}</span>
                  <StatusBadge status={m.status === "Live" ? "passed" : "arena"} label={m.status} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 9. Learn */}
        <section className={section} aria-labelledby="learn-title">
          <div className={inner}>
            <h2 id="learn-title" className="text-[32px] md:text-[40px] m-0 mb-8">{t.learn.title}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {t.learn.guides.map(g => (
                <article key={g.title} lang={g.lang === "ES" ? "es" : "en"} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{g.lang}</span>
                  <h3 className="text-lg m-0">{g.title}</h3>
                  <p className="m-0 text-sm text-ink-2 leading-relaxed">{g.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 10. Pricing */}
        <section id="pricing" className={section} aria-labelledby="pricing-title">
          <div className={inner}>
            <h2 id="pricing-title" className="text-[32px] md:text-[40px] m-0 mb-8">{t.pricing.title}</h2>
            <div className="grid md:grid-cols-2 gap-4 md:gap-6 max-w-[880px]">
              {t.pricing.plans.map(p => (
                <article key={p.name} className="bg-card border border-border rounded-2xl p-6 md:p-8 flex flex-col gap-4">
                  <h3 className="text-2xl m-0">{p.name}</h3>
                  <span className="font-mono text-3xl">{p.price}</span>
                  <ul className="m-0 pl-5 text-ink-2 space-y-1.5">
                    {p.features.map(f => <li key={f}>{f}</li>)}
                  </ul>
                  <Link href="/auth?mode=register" className={`${btn} self-start mt-auto`}>{t.nav.start}</Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 11. Final CTA */}
        <section className={`${section} text-center`} aria-labelledby="final-title">
          <div className={`${inner} flex flex-col items-center gap-6`}>
            <h2 id="final-title" className="text-[34px] md:text-[48px] m-0">{t.final.title}</h2>
            <Link href="/auth?mode=register" className={btn}>{t.final.cta}</Link>
          </div>
        </section>
      </main>

      {/* 12. Footer */}
      <footer className="border-t border-rule px-4 md:px-12 lg:px-24 py-10 pb-16">
        <div className={`${inner} flex flex-col gap-4 text-sm text-muted-foreground`}>
          <div className="flex gap-6">
            <Link href="/terms" className="hover:text-primary min-h-[44px] inline-flex items-center">{t.footer.links.terms}</Link>
            <Link href="/privacy" className="hover:text-primary min-h-[44px] inline-flex items-center">{t.footer.links.privacy}</Link>
            <Link href="/auth" className="hover:text-primary min-h-[44px] inline-flex items-center">{t.footer.links.signIn}</Link>
          </div>
          <p className="m-0 max-w-[760px] leading-relaxed">{t.footer.disclaimer}</p>
          <p className="m-0">{t.footer.copyright}</p>
        </div>
      </footer>
    </div>
  );
}
