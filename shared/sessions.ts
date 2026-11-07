// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Session calendars (build sheet §11A.3). FX (and spot gold) trade from Sunday
// 21:00 UTC to Friday 21:00 UTC. Some data feeds also publish quotes during the
// weekend; no forex broker fills orders then, so those bars must never be
// scored, simulated or traded. Holidays are not modelled yet.

export type SessionCalendarId = "fx";

const HOUR = 3_600_000, DAY = 24 * HOUR;

/** True when the FX market is closed at this instant (Fri 21:00 → Sun 21:00 UTC). */
export function fxClosedAt(ms: number): boolean {
  const d = new Date(ms);
  const dow = d.getUTCDay(), h = d.getUTCHours();
  return (dow === 5 && h >= 21) || dow === 6 || (dow === 0 && h < 21);
}

/**
 * Should a bar starting at `openMs` and lasting `barMs` be dropped from an FX
 * series? Intraday bars are dropped when the market is closed for the whole
 * bar. Daily and weekly bars are dropped on Saturday and Sunday.
 */
export function fxBarClosed(openMs: number, barMs: number): boolean {
  if (barMs >= DAY) {
    const dow = new Date(openMs).getUTCDay();
    return barMs < 7 * DAY && (dow === 6 || dow === 0);
  }
  // Closed for the whole bar: both its first and last minute fall in the closed window
  return fxClosedAt(openMs) && fxClosedAt(openMs + barMs - 60_000);
}

/** Which calendar a symbol trades on. All current symbols are FX pairs or spot gold/silver. */
export function calendarFor(_symbol: string): SessionCalendarId {
  return "fx";
}

export const INTERVAL_MS: Record<string, number> = {
  "1min": 60_000, "5min": 300_000, "15min": 900_000, "30min": 1_800_000, "45min": 2_700_000,
  "1h": HOUR, "2h": 2 * HOUR, "4h": 4 * HOUR, "1day": DAY, "1week": 7 * DAY,
};

const parse = (s: string) => Date.parse(s.length <= 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`);

/** Remove bars from periods when the instrument's market is closed. */
export function dropClosedBars<T extends { time: string }>(symbol: string, interval: string, bars: T[]): T[] {
  if (calendarFor(symbol) !== "fx") return bars;
  const barMs = INTERVAL_MS[interval];
  if (!barMs) return bars;
  return bars.filter(b => !fxBarClosed(parse(b.time), barMs));
}
