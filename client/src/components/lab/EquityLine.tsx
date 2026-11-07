// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Minimal equity curve in R (inline SVG; follows the theme tokens).

export function EquityLine({ values, label, height = 140 }: { values: number[]; label: string; height?: number }) {
  if (values.length < 2) return <p className="text-muted-foreground m-0 text-sm">Not enough trades to draw.</p>;
  const w = 600, h = height, pad = 6;
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values), span = hi - lo || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (h - 2 * pad);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values[values.length - 1];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label={`${label}: ends at ${last.toFixed(1)}R`}>
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="var(--rj-rule)" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke={last >= 0 ? "var(--rj-pos)" : "var(--rj-neg)"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="font-mono text-xs text-muted-foreground flex justify-between"><span>0R</span><span>{last >= 0 ? "+" : "−"}{Math.abs(last).toFixed(1)}R</span></figcaption>
    </figure>
  );
}
