// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// License Page rendering (pure: no database). Every user-entered string is escaped.

export interface LicensePageData {
  name: string; by: string | null; grade: string; stage: string; style: string; symbols: string[];
  vault: { trades: number; totalR: number; profitFactor: number; maxDD: number; doubleCostR: number; dsr: number; trials: number; baselineR: number; equity: number[] } | null;
  shadow: { trades: number; totalR: number; since: Date | null };
  live: { trades: number; totalR: number; since: Date | null };
  events: { at: Date; from: string | null; to: string; reason: string; tripwire: boolean }[];
  publicSince: Date | null;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmtR = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}R`);
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

const GRADE: Record<string, { bg: string; fg: string; label: string }> = {
  licensed: { bg: "#E9EEF5", fg: "#1F3A5F", label: "Licensed" },
  probation: { bg: "#FBF0DF", fg: "#8A4B00", label: "Probation" },
  scrapped: { bg: "#F6E6E3", fg: "#8C2F22", label: "Scrapped" },
};

export function renderLicensePage(d: LicensePageData, origin: string, slug: string) {
  const g = GRADE[d.grade] ?? GRADE.probation;
  const stageLabel = d.stage === "live" ? "Live" : d.stage === "shadow" ? "Shadow Run" : d.stage === "retired" ? "Retired" : "Vault";
  const eq = d.vault?.equity ?? [];
  const lo = Math.min(0, ...eq), hi = Math.max(0, ...eq), span = hi - lo || 1;
  const path = eq.map((v, i) => `${i ? "L" : "M"}${(6 + (i / Math.max(1, eq.length - 1)) * 588).toFixed(1)},${(6 + (1 - (v - lo) / span) * 108).toFixed(1)}`).join("");
  const title = `${d.name} · ${g.label} · Trade Depot`;
  const desc = d.vault ? `Vault Exam on locked data: ${fmtR(d.vault.totalR)} over ${d.vault.trades} trades; luck-adjusted confidence ${Math.round(d.vault.dsr * 100)}%.` : "A Trade Depot strategy record.";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(`${origin}/l/${slug}`)}">
<meta property="og:image" content="${esc(`${origin}/l/${slug}/og.png`)}"><meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--paper:#F4EFE6;--surface:#fff;--soft:#FAF7F1;--ink:#1A1A1A;--ink2:#3D3A35;--muted:#5C5650;--rule:#D9D0C1;--border:#E2DACB;--accent:#1F3A5F;--pos:#2E6B4F;--neg:#8C2F22}
@media (prefers-color-scheme: dark){:root{--paper:#1A1916;--surface:#23211D;--soft:#2A2823;--ink:#F4EFE6;--ink2:#D6CFC2;--muted:#A79F92;--rule:#3A372F;--border:#34312A;--accent:#8FB0D6;--pos:#7CC4A0;--neg:#E08A7C}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif;line-height:1.5}
main{max-width:880px;margin:0 auto;padding:32px 16px 64px}h1,h2{font-family:Fraunces,Georgia,serif;font-weight:500;letter-spacing:-.02em;margin:0}
h1{font-size:clamp(28px,5vw,40px)}h2{font-size:22px;margin-bottom:12px}.mono{font-family:"IBM Plex Mono",monospace}.muted{color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;margin-top:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0}.tile{background:var(--soft);border-radius:10px;padding:12px}
.tile dt{font-size:12px;color:var(--muted)}.tile dd{margin:4px 0 0;font-family:"IBM Plex Mono",monospace;font-size:20px}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600}
ol{padding-left:0;list-style:none;margin:0}li{padding:8px 0;border-top:1px solid var(--border);font-size:14px}a{color:var(--accent)}
header{border-bottom:1px solid var(--rule);padding:16px}header span{font-family:Fraunces,Georgia,serif;font-size:22px;font-weight:500}
footer{font-size:12px;color:var(--muted);margin-top:32px;line-height:1.6}
</style></head>
<body><header><span>Trade Depot</span></header><main>
<p class="mono muted" style="font-size:12px;letter-spacing:.08em;margin:0 0 8px">VERIFIED STRATEGY RECORD${d.by ? ` · ${esc(d.by)}` : ""}</p>
<h1>${esc(d.name)}</h1>
<p style="margin:12px 0 0"><span class="badge" style="background:${g.bg};color:${g.fg}">${g.label}</span> <span class="mono muted">${esc(stageLabel)} · ${esc(d.style)} · ${esc(d.symbols.join(" "))}</span></p>
${d.vault ? `<section class="card" aria-labelledby="v"><h2 id="v">Vault Exam</h2>
<p class="muted" style="margin:0 0 12px;font-size:14px">One test on locked data the strategy never saw while it was built. Simulated, with trading costs.</p>
<dl class="grid"><div class="tile"><dt>Result</dt><dd>${fmtR(d.vault.totalR)}</dd></div><div class="tile"><dt>Trades</dt><dd>${d.vault.trades}</dd></div>
<div class="tile"><dt>At 2× costs</dt><dd>${fmtR(d.vault.doubleCostR)}</dd></div><div class="tile"><dt>Luck-adjusted confidence</dt><dd>${Math.round(d.vault.dsr * 100)}%</dd></div>
<div class="tile"><dt>Versions tried</dt><dd>${d.vault.trials}</dd></div><div class="tile"><dt>Default TDCI, same data</dt><dd>${fmtR(d.vault.baselineR)}</dd></div></dl>
${eq.length > 1 ? `<svg viewBox="0 0 600 120" style="width:100%;height:auto;margin-top:16px" role="img" aria-label="Vault equity in R, ending at ${fmtR(eq[eq.length - 1])}"><path d="${path}" fill="none" stroke="var(--pos)" stroke-width="2"/></svg>` : ""}
</section>` : ""}
<section class="card" aria-labelledby="s"><h2 id="s">Shadow Run</h2>
<p style="margin:0">${d.shadow.trades} closed trades on live prices without money${d.shadow.since ? `, since ${day(d.shadow.since)}` : ""}: <span class="mono">${fmtR(d.shadow.totalR)}</span>.</p></section>
<section class="card" aria-labelledby="l"><h2 id="l">Live record</h2>
<p style="margin:0">${d.live.trades ? `${d.live.trades} closed live trades${d.live.since ? ` since ${day(d.live.since)}` : ""}: <span class="mono">${fmtR(d.live.totalR)}</span>.` : "No closed live trades yet."}</p></section>
<section class="card" aria-labelledby="pv"><h2 id="pv">Verify this record</h2>
<p style="margin:0 0 12px">Every decision, result and grade change for this strategy is written to a tamper-evident chain the moment it happens, and each day is sealed with a single fingerprint. Your browser can check it here, without trusting us.</p>
<button id="td-verify" type="button" data-slug="${esc(slug)}" style="min-height:44px;padding:0 18px;border-radius:999px;border:1px solid currentColor;background:transparent;font:inherit;cursor:pointer">Verify</button>
<div id="td-verify-out" role="status" style="margin-top:12px"></div></section>
<section class="card" aria-labelledby="h"><h2 id="h">History</h2><ol>
${d.events.map(e => `<li><span class="mono muted">${day(e.at)}</span> · <span class="mono">${esc(e.from ?? "created")} → ${esc(e.to)}</span>${e.tripwire ? " · <strong>Tripwire</strong>" : ""} — ${esc(e.reason)}</li>`).join("")}
</ol></section>
<footer>Every number on this page comes from records that cannot be edited after the fact: the Vault Exam report, Shadow Run decisions written when they were made, and live trades linked to this strategy. Strategy settings, position sizes and account details are never shown.<br>
Trade Depot is a self-directed strategy testing tool, not investment advice. Simulated and historical results do not guarantee future performance. Trading involves substantial risk of loss.</footer>
</main><script src="/proof/verify.js" defer></script></body></html>`;
}

/** Share image (1200×630): grade seal and key numbers, rendered to PNG. */
export async function renderOgPng(d: LicensePageData) {
  const g = GRADE[d.grade] ?? GRADE.probation;
  const v = d.vault;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#F4EFE6"/>
<text x="80" y="110" font-family="Georgia, serif" font-size="40" fill="#1A1A1A">Trade Depot</text>
<text x="80" y="200" font-family="Georgia, serif" font-size="64" fill="#1A1A1A">${esc(d.name.slice(0, 32))}</text>
<rect x="80" y="235" width="${g.label.length * 22 + 40}" height="52" rx="26" fill="${g.bg}"/>
<text x="100" y="270" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="${g.fg}">${g.label}</text>
<text x="80" y="370" font-family="Arial, sans-serif" font-size="28" fill="#5C5650">Vault Exam on locked data</text>
<text x="80" y="440" font-family="Courier New, monospace" font-size="56" fill="#1A1A1A">${v ? `${fmtR(v.totalR)}  ·  ${v.trades} trades` : "—"}</text>
<text x="80" y="510" font-family="Arial, sans-serif" font-size="28" fill="#5C5650">${v ? `Luck-adjusted confidence ${Math.round(v.dsr * 100)}% · ${v.trials} versions tried` : ""}</text>
<text x="80" y="580" font-family="Arial, sans-serif" font-size="22" fill="#5C5650">Simulated results · not investment advice</text>
</svg>`;
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    return { type: "image/png", body: new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng() };
  } catch {
    return { type: "image/svg+xml", body: Buffer.from(svg) };
  }
}

