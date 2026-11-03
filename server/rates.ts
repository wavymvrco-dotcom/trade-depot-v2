// ─── Interest-rate differentials (carry) ──────────────────────────────────────
// Short-term interest rates per currency from FRED (no API key). Carry —
// holding the higher-yielding currency — is one of the most documented FX
// return factors; rate *changes* drive trends.
//
// Where a current daily policy/overnight rate exists we use it (Fed funds, ECB
// deposit rate, SONIA); otherwise the OECD 3-month interbank rate (monthly).
// The OECD euro and sterling series stopped updating in early 2026, which is
// why those two use central-bank series. Each value is treated as known only
// after its publication lag — no look-ahead.

const DAY = 86400e3;
const SERIES: Record<string, { id: string; lag: number }> = {
  USD: { id: "DFF", lag: 2 * DAY },                // effective Fed funds, daily
  EUR: { id: "ECBDFR", lag: 2 * DAY },             // ECB deposit facility rate, daily
  GBP: { id: "IUDSOIA", lag: 2 * DAY },            // SONIA, daily
  JPY: { id: "IR3TIB01JPM156N", lag: 75 * DAY },   // OECD 3-month interbank, monthly
  AUD: { id: "IR3TIB01AUM156N", lag: 75 * DAY },
  CAD: { id: "IR3TIB01CAM156N", lag: 75 * DAY },
  CHF: { id: "IR3TIB01CHM156N", lag: 75 * DAY },
};

/** A rate older than this is treated as missing rather than used as "current". */
export const RATE_STALE_MS = 120 * DAY;

export interface RatePoint { month: string; availableAt: number; rate: number }

const cache = new Map<string, { at: number; data: RatePoint[] }>();

export async function getRates(ccy: string): Promise<RatePoint[]> {
  // Gold pays no interest: its "rate" is zero, so XAUUSD carry = −USD rate
  if (ccy === "XAU") return [{ month: "1990-01-01", availableAt: 0, rate: 0 }];
  const series = SERIES[ccy];
  if (!series) return [];
  const { id, lag } = series;
  const hit = cache.get(ccy);
  if (hit && Date.now() - hit.at < 24 * 3600_000) return hit.data;
  try {
    const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
    const lines = (await res.text()).trim().split(/\r?\n/).slice(1);
    const data = lines
      .map(l => { const [d, v] = l.split(","); return { month: d, rate: Number(v) }; })
      .filter(r => r.month && Number.isFinite(r.rate))
      .map(r => ({ ...r, availableAt: Date.parse(r.month + "T00:00:00Z") + lag }));
    cache.set(ccy, { at: Date.now(), data });
    return data;
  } catch (e: any) {
    console.warn(`[Rates] ${ccy} fetch failed: ${e.message}`);
    return hit?.data ?? [];
  }
}

/** Latest rate published at or before `time`. */
export function rateAt(series: RatePoint[], time: number): RatePoint | null {
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].availableAt <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? series[ans] : null;
}

export async function getPairRates(symbol: string) {
  const [base, quote] = await Promise.all([getRates(symbol.slice(0, 3)), getRates(symbol.slice(3, 6))]);
  return { base, quote };
}
