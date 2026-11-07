let calendarCache: { data: any[]; fetchedAt: number } | null = null;
let lastFailureAt = 0;
const CACHE_MS = 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;

/**
 * This week's high/medium-impact events. If the feed is down we serve the last
 * real data we had, or an empty list — never invented events.
 */
export async function fetchEconomicCalendar(): Promise<any[]> {
  if (calendarCache && Date.now() - calendarCache.fetchedAt < CACHE_MS) return calendarCache.data;
  if (Date.now() - lastFailureAt < RETRY_MS) return calendarCache?.data ?? [];

  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "User-Agent": "TradeAI-Terminal/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json() as any[];

    const events = raw
      .filter(e => e.impact === "High" || e.impact === "Medium")
      .map(e => ({
        title: e.title,
        currency: e.country,
        impact: (e.impact || "").toLowerCase(),
        date: e.date,
        forecast: e.forecast || null,
        previous: e.previous || null,
        actual: e.actual || null,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    calendarCache = { data: events, fetchedAt: Date.now() };
    return events;
  } catch (err: any) {
    console.warn("[Calendar] Live fetch failed:", err.message);
    lastFailureAt = Date.now();
    return calendarCache?.data ?? [];
  }
}

/** True if a high-impact event for either currency of `symbol` is within `minutes`. */
export async function highImpactEventNear(symbol: string, minutes = 15): Promise<string | null> {
  const events = await fetchEconomicCalendar().catch(() => []);
  const ccys = symbol === "XAUUSD" ? ["USD"] : [symbol.slice(0, 3), symbol.slice(3, 6)];
  const now = Date.now();
  const hit = events.find(e =>
    e.impact === "high" && ccys.includes(e.currency) &&
    Math.abs(new Date(e.date).getTime() - now) <= minutes * 60_000);
  return hit ? `${hit.currency} ${hit.title}` : null;
}

/** Minutes to the nearest high-impact event for either currency of `symbol` if within `window`, else null. */
export async function minutesToHighImpact(symbol: string, window = 30): Promise<number | null> {
  const events = await fetchEconomicCalendar().catch(() => []);
  const ccys = symbol === "XAUUSD" ? ["USD"] : [symbol.slice(0, 3), symbol.slice(3, 6)];
  const now = Date.now();
  let best: number | null = null;
  for (const e of events) {
    if (e.impact !== "high" || !ccys.includes(e.currency)) continue;
    const m = Math.abs(new Date(e.date).getTime() - now) / 60_000;
    if (m <= window && (best == null || m < best)) best = Math.round(m);
  }
  return best;
}
