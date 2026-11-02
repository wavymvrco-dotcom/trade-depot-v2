let calendarCache: { data: any[]; fetchedAt: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

const FALLBACK_EVENTS = [
  { title: "Fed Interest Rate Decision", currency: "USD", impact: "high", date: new Date(Date.now() + 2 * 86400000).toISOString(), forecast: "5.50%", previous: "5.50%" },
  { title: "Non-Farm Payrolls", currency: "USD", impact: "high", date: new Date(Date.now() + 4 * 86400000).toISOString(), forecast: "185K", previous: "175K" },
  { title: "CPI (YoY)", currency: "USD", impact: "high", date: new Date(Date.now() + 6 * 86400000).toISOString(), forecast: "3.1%", previous: "3.2%" },
  { title: "ECB Rate Decision", currency: "EUR", impact: "high", date: new Date(Date.now() + 3 * 86400000).toISOString(), forecast: "4.00%", previous: "4.00%" },
  { title: "UK GDP (QoQ)", currency: "GBP", impact: "medium", date: new Date(Date.now() + 1 * 86400000).toISOString(), forecast: "0.1%", previous: "0.0%" },
  { title: "BoJ Policy Rate", currency: "JPY", impact: "high", date: new Date(Date.now() + 5 * 86400000).toISOString(), forecast: "-0.10%", previous: "-0.10%" },
  { title: "US Retail Sales (MoM)", currency: "USD", impact: "medium", date: new Date(Date.now() + 1.5 * 86400000).toISOString(), forecast: "0.3%", previous: "0.6%" },
  { title: "EU CPI Flash Estimate", currency: "EUR", impact: "high", date: new Date(Date.now() + 2.5 * 86400000).toISOString(), forecast: "2.4%", previous: "2.6%" },
  { title: "Australian Employment Change", currency: "AUD", impact: "medium", date: new Date(Date.now() + 0.5 * 86400000).toISOString(), forecast: "22K", previous: "15K" },
  { title: "US ISM Manufacturing PMI", currency: "USD", impact: "medium", date: new Date(Date.now() + 7 * 86400000).toISOString(), forecast: "49.8", previous: "49.2" },
  { title: "Canada Employment Change", currency: "CAD", impact: "medium", date: new Date(Date.now() + 4 * 86400000).toISOString(), forecast: "20K", previous: "16K" },
  { title: "US Initial Jobless Claims", currency: "USD", impact: "medium", date: new Date(Date.now() + 3.5 * 86400000).toISOString(), forecast: "215K", previous: "220K" },
];

export async function fetchEconomicCalendar(): Promise<any[]> {
  if (calendarCache && Date.now() - calendarCache.fetchedAt < CACHE_MS) {
    return calendarCache.data;
  }

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
    console.warn("[Calendar] Live fetch failed, using fallback:", err.message);
    calendarCache = { data: FALLBACK_EVENTS, fetchedAt: Date.now() };
    return FALLBACK_EVENTS;
  }
}
