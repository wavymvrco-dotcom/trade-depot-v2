// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Shelf Life (§11.8): how long Licensed strategies stay effective, from the
// license history. Kaplan–Meier (1958) survival from Licensed to the first
// Tripwire trip or retirement; strategies still Licensed are censored. Until
// there is enough history the answer is "not enough history yet" — never an
// invented number. (Cox regression comes once ≥ 30 licenses exist per style.)

export interface Lifetime { days: number; ended: boolean } // ended = tripped or retired; false = still going (censored)

export function kaplanMeier(xs: Lifetime[]) {
  const times = Array.from(new Set(xs.filter(x => x.ended).map(x => x.days))).sort((a, b) => a - b);
  let s = 1;
  const curve: { day: number; survival: number }[] = [{ day: 0, survival: 1 }];
  for (const t of times) {
    const atRisk = xs.filter(x => x.days >= t).length;
    const events = xs.filter(x => x.ended && x.days === t).length;
    if (atRisk > 0) s *= 1 - events / atRisk;
    curve.push({ day: t, survival: s });
  }
  return curve;
}

/** Day at which survival first drops to or below q (null if it never does within the data). */
export function survivalQuantile(curve: { day: number; survival: number }[], q: number) {
  return curve.find(c => c.survival <= q)?.day ?? null;
}

export const SHELF_MIN = { licenses: 30, endings: 10 } as const;

/** "Strategies like this usually stay effective for X–Y months" — the interquartile range — or null with a reason. */
export function shelfLife(xs: Lifetime[]) {
  const endings = xs.filter(x => x.ended).length;
  if (xs.length < SHELF_MIN.licenses || endings < SHELF_MIN.endings) {
    return { enough: false as const, licenses: xs.length, endings };
  }
  const curve = kaplanMeier(xs);
  const q75 = survivalQuantile(curve, 0.75), q25 = survivalQuantile(curve, 0.25), median = survivalQuantile(curve, 0.5);
  return { enough: true as const, licenses: xs.length, endings, curve, lowDays: q75, highDays: q25, medianDays: median };
}
