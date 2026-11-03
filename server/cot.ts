// ─── CFTC Commitments of Traders — institutional positioning ─────────────────
// Weekly net positioning of non-commercial traders (funds/speculators) in CME
// currency futures, from the CFTC's public API. Each report reflects Tuesday's
// positions and is published the following Friday, so a value is only treated
// as known from report date + 4 days. That keeps backtests free of look-ahead.

const CFTC = "https://publicreporting.cftc.gov/resource/6dca-aqww.json";

/** CFTC contract codes. USD uses the ICE US Dollar Index. */
const CONTRACTS: Record<string, string> = {
  EUR: "099741", GBP: "096742", JPY: "097741", AUD: "232741",
  CAD: "090741", CHF: "092741", XAU: "088691", USD: "098662",
};

const AVAILABLE_LAG_MS = 4 * 24 * 3600_000;
const WINDOW = 156; // ~3 years of weekly reports for "how unusual is this?"

export interface CotPoint {
  reportDate: string;
  availableAt: number;
  netPct: number;   // (long - short) / open interest
  z: number;        // vs trailing window
  change4w: number; // netPct change over 4 reports
  score: number;    // -1..1 bullish/bearish for the currency
}

const cache = new Map<string, { at: number; data: CotPoint[] }>();

function mean(a: number[]) { return a.reduce((s, v) => s + v, 0) / a.length; }
function std(a: number[]) { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); }

/**
 * Per-currency positioning score, computed only from reports up to each point:
 * - momentum: speculators adding to longs is bullish (positioning trends persist)
 * - extremes: beyond ±1.5σ of the 3-year range, crowded trades tend to unwind,
 *   so the score leans contrarian
 */
function scoreSeries(rows: { reportDate: string; netPct: number }[]): CotPoint[] {
  const out: CotPoint[] = [];
  for (let i = 0; i < rows.length; i++) {
    const hist = rows.slice(Math.max(0, i - WINDOW + 1), i + 1).map(r => r.netPct);
    const r = rows[i];
    const availableAt = new Date(r.reportDate).getTime() + AVAILABLE_LAG_MS;
    if (hist.length < 26 || i < 4) {
      out.push({ reportDate: r.reportDate, availableAt, netPct: r.netPct, z: 0, change4w: 0, score: 0 });
      continue;
    }
    const sd = std(hist) || 1e-9;
    const z = (r.netPct - mean(hist)) / sd;
    const change4w = r.netPct - rows[i - 4].netPct;
    const changes = [];
    for (let j = Math.max(4, i - WINDOW + 1); j <= i; j++) changes.push(rows[j].netPct - rows[j - 4].netPct);
    const momentum = Math.tanh(change4w / (std(changes) || 1e-9));
    const extreme = -Math.sign(z) * Math.min(1, Math.max(0, Math.abs(z) - 1.5));
    const score = Math.max(-1, Math.min(1, 0.7 * momentum + 0.3 * extreme));
    out.push({ reportDate: r.reportDate, availableAt, netPct: r.netPct, z, change4w, score });
  }
  return out;
}

export async function getCot(ccy: string): Promise<CotPoint[]> {
  const code = CONTRACTS[ccy];
  if (!code) return [];
  const hit = cache.get(ccy);
  if (hit && Date.now() - hit.at < 12 * 3600_000) return hit.data;

  const since = new Date(Date.now() - 6 * 365 * 24 * 3600_000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    cftc_contract_market_code: code,
    $where: `report_date_as_yyyy_mm_dd >= '${since}'`,
    $order: "report_date_as_yyyy_mm_dd ASC",
    $limit: "1000",
    $select: "report_date_as_yyyy_mm_dd,noncomm_positions_long_all,noncomm_positions_short_all,open_interest_all",
  });
  try {
    const res = await fetch(`${CFTC}?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
    const raw = await res.json() as any[];
    const rows = raw
      .map(r => {
        const oi = Number(r.open_interest_all);
        return {
          reportDate: String(r.report_date_as_yyyy_mm_dd).slice(0, 10),
          netPct: oi > 0 ? (Number(r.noncomm_positions_long_all) - Number(r.noncomm_positions_short_all)) / oi : NaN,
        };
      })
      .filter(r => Number.isFinite(r.netPct));
    const data = scoreSeries(rows);
    cache.set(ccy, { at: Date.now(), data });
    return data;
  } catch (e: any) {
    console.warn(`[COT] ${ccy} fetch failed: ${e.message}`);
    return hit?.data ?? [];
  }
}

/** Latest point published at or before `time`, or null. */
export function cotAt(series: CotPoint[], time: number): CotPoint | null {
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].availableAt <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? series[ans] : null;
}

/** The two currencies a symbol is made of, e.g. EURUSD → [EUR, USD], XAUUSD → [XAU, USD]. */
export function legs(symbol: string): [string, string] {
  return [symbol.slice(0, 3), symbol.slice(3, 6)];
}

/** Both legs' series, fetched in parallel. */
export async function getPairCot(symbol: string): Promise<{ base: CotPoint[]; quote: CotPoint[] }> {
  const [b, q] = legs(symbol);
  const [base, quote] = await Promise.all([getCot(b), getCot(q)]);
  return { base, quote };
}
