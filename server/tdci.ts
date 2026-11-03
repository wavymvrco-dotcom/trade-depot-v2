// ─── Trade Depot Confluence Index (TDCI) ──────────────────────────────────────
// A library of rule-based layers, combined per trading style into one 0–100
// conviction score. Each style (scalp/day/swing/position) curates the layers
// that matter on its timeframe and has its own trade model and calibration.
//
// Directional layers return −1 (bearish) … +1 (bullish). The regime layer is a
// 0–1 quality multiplier (volatility, session, and trading costs). Every value
// at bar i uses only data available at the close of bar i, so the same code
// powers live scores and backtests.

import { ema, rsi, atr, adx, type Candle } from "./indicators";
import { cotAt, type CotPoint } from "./cot";
import { rateAt, RATE_STALE_MS, type RatePoint } from "./rates";

// ─── Styles ───────────────────────────────────────────────────────────────────

export type StyleKey = "scalp" | "day" | "swing" | "position";
export type LayerKey =
  | "trend" | "momentum" | "structure" | "liquidity" | "value" | "fibonacci"
  | "positioning" | "carry" | "adx" | "prevDay" | "pivots" | "sessionRange" | "sessionMean";
export type Weights = Partial<Record<LayerKey, number>>;

export interface Profile {
  key: StyleKey;
  label: string;
  description: string;
  interval: "5min" | "15min" | "4h" | "1day";
  htf: "1h" | "4h" | "1day" | "1week";
  layers: LayerKey[];
  defaultWeights: Weights;
  /** Trade model the calibration measures: stop in ATRs, target in R, max bars held, IC horizon. */
  model: { stopAtr: number; rr: number; maxHold: number; icHorizon: number };
  /** Primary bars for calibration and for a live score. */
  history: { calibrate: number; live: number };
  /** UTC hours [start, end) when this style trades; outside them conviction is cut. */
  sessionHours?: [number, number];
}

export const PROFILES: Record<StyleKey, Profile> = {
  scalp: {
    key: "scalp", label: "Scalp", interval: "5min", htf: "1h",
    description: "5-minute entries in the London and New York sessions, aligned with the 1-hour trend. Fast exits; costs matter most here.",
    layers: ["trend", "momentum", "structure", "liquidity", "fibonacci", "sessionRange", "sessionMean", "prevDay"],
    defaultWeights: { trend: 0.15, momentum: 0.15, structure: 0.15, liquidity: 0.15, fibonacci: 0.1, sessionRange: 0.1, sessionMean: 0.1, prevDay: 0.1 },
    model: { stopAtr: 3, rr: 1.5, maxHold: 48, icHorizon: 6 },
    history: { calibrate: 20000, live: 600 },
    sessionHours: [7, 17],
  },
  day: {
    key: "day", label: "Day", interval: "15min", htf: "4h",
    description: "15-minute entries guided by the 4-hour trend, prior-day levels and floor pivots. Flat by the end of the session.",
    layers: ["trend", "momentum", "structure", "liquidity", "fibonacci", "prevDay", "pivots", "sessionRange", "adx"],
    defaultWeights: { trend: 0.2, momentum: 0.1, structure: 0.15, liquidity: 0.1, fibonacci: 0.1, prevDay: 0.1, pivots: 0.1, sessionRange: 0.05, adx: 0.1 },
    model: { stopAtr: 2, rr: 2, maxHold: 64, icHorizon: 8 },
    history: { calibrate: 20000, live: 600 },
    sessionHours: [6, 20],
  },
  swing: {
    key: "swing", label: "Swing", interval: "4h", htf: "1day",
    description: "4-hour entries in the direction of the daily trend, with ICT structure, Fibonacci and CFTC positioning. Holds for days.",
    layers: ["trend", "momentum", "structure", "liquidity", "value", "fibonacci", "positioning", "adx"],
    defaultWeights: { trend: 0.2, momentum: 0.1, structure: 0.15, liquidity: 0.1, value: 0.1, fibonacci: 0.1, positioning: 0.15, adx: 0.1 },
    model: { stopAtr: 1.5, rr: 2, maxHold: 30, icHorizon: 6 },
    history: { calibrate: 5000, live: 400 },
  },
  position: {
    key: "position", label: "Position", interval: "1day", htf: "1week",
    description: "Daily entries aligned with the weekly trend, driven by carry (interest-rate differentials) and institutional positioning. Holds for weeks.",
    layers: ["trend", "momentum", "structure", "fibonacci", "positioning", "carry", "adx"],
    defaultWeights: { trend: 0.2, momentum: 0.1, structure: 0.1, fibonacci: 0.1, positioning: 0.2, carry: 0.2, adx: 0.1 },
    model: { stopAtr: 2, rr: 2.5, maxHold: 40, icHorizon: 10 },
    history: { calibrate: 3000, live: 600 },
  },
};

export const STYLES = Object.keys(PROFILES) as StyleKey[];

export const LAYER_INFO: Record<LayerKey | "regime", { label: string; about: string }> = {
  trend:        { label: "HTF Trend", about: "EMA20/50 alignment and slope on the higher timeframe, scaled by volatility." },
  momentum:     { label: "Momentum", about: "RSI, MACD histogram and 10-bar rate of change." },
  structure:    { label: "Market Structure", about: "ICT: higher highs/lows vs lower highs/lows, break of structure and change of character." },
  liquidity:    { label: "Liquidity Sweep", about: "ICT: a wick through a prior swing that closes back inside — a stop hunt." },
  value:        { label: "Premium / Discount & FVG", about: "ICT: position in the 50-bar dealing range plus nearby unfilled fair value gaps." },
  fibonacci:    { label: "Fibonacci OTE", about: "Pullback depth into the last impulse leg; the 0.618–0.786 'optimal trade entry' zone scores highest." },
  positioning:  { label: "Institutional Positioning", about: "CFTC Commitments of Traders: speculator positioning momentum and crowded extremes, base vs quote." },
  carry:        { label: "Carry (Rate Differential)", about: "3-month interest-rate gap between the two currencies and how it is changing (OECD data)." },
  adx:          { label: "ADX Trend Strength", about: "+DI vs −DI direction weighted by ADX trend strength." },
  prevDay:      { label: "Prior-Day High/Low", about: "Breaks, rejections and sweeps of yesterday's high and low." },
  pivots:       { label: "Floor Pivots", about: "Price vs the classic daily pivot, R1 and S1 from yesterday's range." },
  sessionRange: { label: "Asian Range Breakout", about: "London-session break of the 00:00–07:00 UTC range." },
  sessionMean:  { label: "Session Mean (TWAP)", about: "Distance from today's time-weighted average price, in ATRs." },
  regime:       { label: "Regime, Session & Cost", about: "Volatility regime, session liquidity and spread-to-volatility — a quality multiplier." },
};

// ─── Results ──────────────────────────────────────────────────────────────────

export interface LayerResult {
  key: LayerKey | "regime";
  label: string;
  value: number;
  weight: number;
  detail: string;
}

export interface TdciResult {
  style: StyleKey;
  time: string;
  score: number;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  composite: number;
  regime: number;
  agreement: number;
  layers: LayerResult[];
  atr: number;
  close: number;
}

const BAR_MS: Record<string, number> = { "5min": 300e3, "15min": 900e3, "1h": 3600e3, "4h": 14400e3, "1day": 86400e3, "1week": 7 * 86400e3 };
const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
export const parseTime = (s: string) => Date.parse(s.length <= 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`);
function round(v: number) { return Math.round(v * 1000) / 1000; }

// ─── Context (precomputed once per series) ────────────────────────────────────

interface DayInfo {
  prevHigh: number; prevLow: number; prevClose: number;
  sessMean: number;                // time-weighted mean of typical price since 00:00 UTC
  asiaHigh: number; asiaLow: number; asiaDone: boolean;
  hour: number;
}

export interface TdciContext {
  symbol: string;
  profile: Profile;
  p: Candle[];
  h: Candle[];
  pClose: number[];
  pAtr: number[];
  pAtrAvg: number[];
  pRsi: number[];
  macdHist: number[];
  adx: { adx: number[]; plusDI: number[]; minusDI: number[] };
  hEma20: number[];
  hEma50: number[];
  hAtr: number[];
  hIdx: number[];
  swingHigh: boolean[];
  swingLow: boolean[];
  day: (DayInfo | null)[];
  cotBase: CotPoint[];
  cotQuote: CotPoint[];
  rateBase: RatePoint[];
  rateQuote: RatePoint[];
  spread: number;                   // spread in price units, for the cost filter
  barMs: number;
  htfMs: number;
}

const SWING_WING = 3;

function buildDayInfo(p: Candle[], barMs: number): (DayInfo | null)[] {
  const out: (DayInfo | null)[] = [];
  if (barMs >= 86400e3) {
    return p.map((_, i) => i === 0 ? null : {
      prevHigh: p[i - 1].high, prevLow: p[i - 1].low, prevClose: p[i - 1].close,
      sessMean: NaN, asiaHigh: NaN, asiaLow: NaN, asiaDone: false, hour: 0,
    });
  }
  let curDate = "", prev: { h: number; l: number; c: number } | null = null;
  let cur = { h: -Infinity, l: Infinity, c: NaN, sum: 0, n: 0, ah: -Infinity, al: Infinity };
  for (const c of p) {
    const date = c.time.slice(0, 10);
    const hour = Number(c.time.slice(11, 13));
    if (date !== curDate) {
      if (curDate && cur.n) prev = { h: cur.h, l: cur.l, c: cur.c };
      curDate = date;
      cur = { h: -Infinity, l: Infinity, c: NaN, sum: 0, n: 0, ah: -Infinity, al: Infinity };
    }
    cur.h = Math.max(cur.h, c.high); cur.l = Math.min(cur.l, c.low); cur.c = c.close;
    cur.sum += (c.high + c.low + c.close) / 3; cur.n++;
    if (hour < 7) { cur.ah = Math.max(cur.ah, c.high); cur.al = Math.min(cur.al, c.low); }
    out.push(prev ? {
      prevHigh: prev.h, prevLow: prev.l, prevClose: prev.c,
      sessMean: cur.sum / cur.n,
      asiaHigh: cur.ah, asiaLow: cur.al,
      asiaDone: Number.isFinite(cur.ah) && hour >= 7,
      hour,
    } : null);
  }
  return out;
}

export function prepare(
  symbol: string, profile: Profile, p: Candle[], h: Candle[],
  data: { cot?: { base: CotPoint[]; quote: CotPoint[] }; rates?: { base: RatePoint[]; quote: RatePoint[] }; spread?: number } = {},
): TdciContext {
  const barMs = BAR_MS[profile.interval], htfMs = BAR_MS[profile.htf];
  const pClose = p.map(c => c.close);
  const pAtr = atr(p, 14);
  const pAtrAvg = pAtr.map((_, i) => {
    const w = pAtr.slice(Math.max(0, i - 99), i + 1).filter(Number.isFinite);
    return w.length >= 20 ? w.reduce((s, v) => s + v, 0) / w.length : NaN;
  });
  const e12 = ema(pClose, 12), e26 = ema(pClose, 26);
  const macd = pClose.map((_, i) => e12[i] - e26[i]);
  const firstMacd = macd.findIndex(Number.isFinite);
  const sig = new Array<number>(macd.length).fill(NaN);
  if (firstMacd >= 0) ema(macd.slice(firstMacd), 9).forEach((v, k) => { sig[firstMacd + k] = v; });

  const hClose = h.map(c => c.close);
  const hIdx: number[] = [];
  let j = -1;
  for (let i = 0; i < p.length; i++) {
    const pCloseTime = parseTime(p[i].time) + barMs;
    while (j + 1 < h.length && parseTime(h[j + 1].time) + htfMs <= pCloseTime) j++;
    hIdx.push(j);
  }

  return {
    symbol, profile, p, h, pClose, pAtr, pAtrAvg, pRsi: rsi(pClose, 14),
    macdHist: macd.map((m, i) => m - sig[i]),
    adx: adx(p, 14),
    hEma20: ema(hClose, 20), hEma50: ema(hClose, 50), hAtr: atr(h, 14), hIdx,
    swingHigh: p.map((c, k) => k >= SWING_WING && k + SWING_WING < p.length && p.slice(k - SWING_WING, k + SWING_WING + 1).every(x => x.high <= c.high)),
    swingLow: p.map((c, k) => k >= SWING_WING && k + SWING_WING < p.length && p.slice(k - SWING_WING, k + SWING_WING + 1).every(x => x.low >= c.low)),
    day: buildDayInfo(p, barMs),
    cotBase: data.cot?.base ?? [], cotQuote: data.cot?.quote ?? [],
    rateBase: data.rates?.base ?? [], rateQuote: data.rates?.quote ?? [],
    spread: data.spread ?? 0,
    barMs, htfMs,
  };
}

/** First bar index where every layer has enough history. */
export function warmup(ctx: TdciContext): number {
  for (let i = 0; i < ctx.p.length; i++) {
    const j = ctx.hIdx[i];
    if (j >= 55 && i >= 120 && Number.isFinite(ctx.pAtrAvg[i]) && Number.isFinite(ctx.macdHist[i]) &&
        Number.isFinite(ctx.adx.adx[i]) && Number.isFinite(ctx.hAtr[j]) && ctx.day[i]) return i;
  }
  return ctx.p.length;
}

// ─── Layer library ────────────────────────────────────────────────────────────

type LayerOut = { value: number; detail: string };

function recentSwings(ctx: TdciContext, i: number, lookback = 150) {
  const highs: { k: number; v: number }[] = [], lows: { k: number; v: number }[] = [];
  for (let k = i - SWING_WING; k >= Math.max(0, i - lookback) && (highs.length < 3 || lows.length < 3); k--) {
    if (ctx.swingHigh[k] && highs.length < 3) highs.push({ k, v: ctx.p[k].high });
    if (ctx.swingLow[k] && lows.length < 3) lows.push({ k, v: ctx.p[k].low });
  }
  return { highs, lows };
}

const fmt = (ctx: TdciContext, v: number) => v.toFixed(ctx.symbol.startsWith("XAU") ? 2 : ctx.symbol.includes("JPY") ? 3 : 5);
const htfName = (ctx: TdciContext) => ({ "1h": "1-hour", "4h": "4-hour", "1day": "Daily", "1week": "Weekly" }[ctx.profile.htf]);

const LAYERS: Record<LayerKey, (ctx: TdciContext, i: number) => LayerOut> = {
  trend(ctx, i) {
    const j = ctx.hIdx[i];
    const e20 = ctx.hEma20[j], e50 = ctx.hEma50[j], a = ctx.hAtr[j], e20prev = ctx.hEma20[j - 5];
    const sep = clamp((e20 - e50) / (0.5 * a));
    const slope = clamp((e20 - e20prev) / (0.5 * a));
    const pos = Math.tanh((ctx.pClose[i] - e50) / a);
    const value = clamp(0.45 * sep + 0.35 * slope + 0.2 * pos);
    const dir = value > 0.15 ? "up" : value < -0.15 ? "down" : "flat";
    return { value, detail: `${htfName(ctx)} trend ${dir}: EMA20 ${e20 > e50 ? "above" : "below"} EMA50 by ${((e20 - e50) / a).toFixed(2)}×ATR, 5-bar slope ${((e20 - e20prev) / a).toFixed(2)}×ATR.` };
  },

  momentum(ctx, i) {
    const a = ctx.pAtr[i], r = ctx.pRsi[i];
    const roc = ctx.pClose[i] - ctx.pClose[i - 10];
    const value = clamp(0.4 * clamp((r - 50) / 25) + 0.3 * Math.tanh(ctx.macdHist[i] / (0.2 * a)) + 0.3 * Math.tanh(roc / (2 * a)));
    return { value, detail: `RSI ${r.toFixed(1)}, MACD histogram ${ctx.macdHist[i] >= 0 ? "positive" : "negative"}, 10-bar move ${(roc / a).toFixed(2)}×ATR.` };
  },

  structure(ctx, i) {
    const { highs, lows } = recentSwings(ctx, i);
    if (highs.length < 2 || lows.length < 2) return { value: 0, detail: "Not enough confirmed swings yet." };
    const hh = highs[0].v > highs[1].v, hl = lows[0].v > lows[1].v;
    const structure = hh && hl ? 1 : !hh && !hl ? -1 : 0;
    const c = ctx.pClose[i];
    let brk = 0, label = "no break";
    if (c > highs[0].v) { brk = 1; label = structure < 0 ? "bullish CHoCH (break against the downtrend)" : "bullish BOS"; }
    else if (c < lows[0].v) { brk = -1; label = structure > 0 ? "bearish CHoCH (break against the uptrend)" : "bearish BOS"; }
    const s = structure > 0 ? "higher highs & higher lows" : structure < 0 ? "lower highs & lower lows" : "mixed swings";
    return { value: clamp(0.55 * structure + 0.45 * brk), detail: `${s}; ${label}.` };
  },

  liquidity(ctx, i) {
    const { highs, lows } = recentSwings(ctx, i, 60);
    const a = ctx.pAtr[i];
    for (let back = 0; back < 3; back++) {
      const b = ctx.p[i - back], decay = 1 - back * 0.3;
      const prevHigh = highs.find(h => h.k < i - back), prevLow = lows.find(l => l.k < i - back);
      const when = back === 0 ? "this bar" : `${back} bar(s) ago`;
      if (prevHigh && b.high > prevHigh.v + 0.1 * a && b.close < prevHigh.v)
        return { value: -clamp((b.high - prevHigh.v) / a + 0.5, 0, 1) * decay, detail: `Buy-side liquidity swept ${when}: wick above ${fmt(ctx, prevHigh.v)} closed back below — bearish.` };
      if (prevLow && b.low < prevLow.v - 0.1 * a && b.close > prevLow.v)
        return { value: clamp((prevLow.v - b.low) / a + 0.5, 0, 1) * decay, detail: `Sell-side liquidity swept ${when}: wick below ${fmt(ctx, prevLow.v)} closed back above — bullish.` };
    }
    return { value: 0, detail: "No liquidity sweep in the last 3 bars." };
  },

  value(ctx, i) {
    const win = ctx.p.slice(Math.max(0, i - 49), i + 1);
    const hi = Math.max(...win.map(c => c.high)), lo = Math.min(...win.map(c => c.low));
    const c = ctx.pClose[i], a = ctx.pAtr[i];
    const pos = hi > lo ? (c - lo) / (hi - lo) : 0.5;
    let fvg = 0, fvgText = "no nearby unfilled FVG";
    for (let k = i - 1; k >= Math.max(2, i - 20); k--) {
      const bullGap = ctx.p[k].low > ctx.p[k - 2].high, bearGap = ctx.p[k].high < ctx.p[k - 2].low;
      if (!bullGap && !bearGap) continue;
      const later = ctx.p.slice(k + 1, i + 1);
      if (bullGap) {
        const bottom = ctx.p[k - 2].high;
        if (!later.some(x => x.low <= bottom) && c - ctx.p[k].low <= 0.75 * a) { fvg = 1; fvgText = `price above an unfilled bullish FVG (${fmt(ctx, bottom)}–${fmt(ctx, ctx.p[k].low)})`; break; }
      } else {
        const top = ctx.p[k - 2].low;
        if (!later.some(x => x.high >= top) && ctx.p[k].high - c <= 0.75 * a) { fvg = -1; fvgText = `price below an unfilled bearish FVG (${fmt(ctx, ctx.p[k].high)}–${fmt(ctx, top)})`; break; }
      }
    }
    const zone = pos < 0.4 ? "discount" : pos > 0.6 ? "premium" : "equilibrium";
    return { value: clamp(0.6 * clamp((0.5 - pos) * 2) + 0.4 * fvg), detail: `In ${zone} (${Math.round(pos * 100)}% of the 50-bar range); ${fvgText}.` };
  },

  fibonacci(ctx, i) {
    const { highs, lows } = recentSwings(ctx, i, 120);
    if (!highs.length || !lows.length) return { value: 0, detail: "No confirmed impulse leg yet." };
    const c = ctx.pClose[i], a = ctx.pAtr[i];
    // The most recent swing defines the leg: low→high = up-leg, high→low = down-leg
    const up = highs[0].k > lows[0].k;
    const H = up ? highs[0].v : (highs.find(h => h.k < lows[0].k)?.v ?? NaN);
    const L = up ? (lows.find(l => l.k < highs[0].k)?.v ?? NaN) : lows[0].v;
    if (!Number.isFinite(H) || !Number.isFinite(L) || H - L < 2 * a) return { value: 0, detail: "Last swing leg too small for a Fibonacci read (< 2×ATR)." };
    const r = up ? (H - c) / (H - L) : (c - L) / (H - L); // retracement depth 0..1
    if (r < 0 || r > 1) return { value: 0, detail: `Price outside the last ${up ? "up" : "down"}-leg (${fmt(ctx, L)}–${fmt(ctx, H)}); no retracement setup.` };
    const strength = r >= 0.618 && r <= 0.786 ? 0.9 : r >= 0.5 ? 0.5 : r > 0.786 ? 0.3 : r >= 0.382 ? 0.2 : 0;
    const zone = r >= 0.618 && r <= 0.786 ? "in the OTE zone (0.618–0.786)" : `at the ${r.toFixed(3)} retracement`;
    return { value: (up ? 1 : -1) * strength, detail: `${up ? "Bullish" : "Bearish"} leg ${fmt(ctx, up ? L : H)}→${fmt(ctx, up ? H : L)}; price ${zone}.` };
  },

  positioning(ctx, i) {
    const now = parseTime(ctx.p[i].time) + ctx.barMs;
    const b = cotAt(ctx.cotBase, now), q = cotAt(ctx.cotQuote, now);
    if (!b && !q) return { value: 0, detail: "No CFTC positioning data available." };
    const [bn, qn] = [ctx.symbol.slice(0, 3), ctx.symbol.slice(3, 6)];
    const f = (n: string, x: CotPoint | null) => x ? `${n} specs ${x.netPct >= 0 ? "net long" : "net short"} ${(Math.abs(x.netPct) * 100).toFixed(0)}% of OI (z ${x.z.toFixed(1)}, 4w ${x.change4w >= 0 ? "+" : ""}${(x.change4w * 100).toFixed(1)}pp)` : `${n} n/a`;
    return { value: clamp(((b?.score ?? 0) - (q?.score ?? 0)) / 1.5), detail: `${f(bn, b)}; ${f(qn, q)}. Week of ${(b ?? q)!.reportDate}.` };
  },

  carry(ctx, i) {
    const now = parseTime(ctx.p[i].time) + ctx.barMs;
    const rb = rateAt(ctx.rateBase, now), rq = rateAt(ctx.rateQuote, now);
    if (!rb || !rq) return { value: 0, detail: "No interest-rate data available." };
    const stale = [rb, rq].some(r => r.availableAt > 0 && now - r.availableAt > RATE_STALE_MS);
    if (stale) return { value: 0, detail: `Interest-rate data is stale (latest ${[rb, rq].map(r => r.month).join(" / ")}); carry not scored.` };
    const rb6 = rateAt(ctx.rateBase, now - 182 * 86400e3), rq6 = rateAt(ctx.rateQuote, now - 182 * 86400e3);
    const diff = rb.rate - rq.rate;
    const prev = rb6 && rq6 ? rb6.rate - rq6.rate : diff;
    const value = clamp(0.6 * Math.tanh(diff / 2) + 0.4 * Math.tanh((diff - prev) / 0.75));
    const [bn, qn] = [ctx.symbol.slice(0, 3), ctx.symbol.slice(3, 6)];
    return { value, detail: `${bn} ${rb.rate.toFixed(2)}% vs ${qn} ${rq.rate.toFixed(2)}% (3-month rates): differential ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}pp, ${diff - prev >= 0 ? "widening" : "narrowing"} ${Math.abs(diff - prev).toFixed(2)}pp over 6 months.` };
  },

  adx(ctx, i) {
    const a = ctx.adx.adx[i], p = ctx.adx.plusDI[i], m = ctx.adx.minusDI[i];
    const value = clamp(((p - m) / Math.max(1e-9, p + m)) * clamp(a / 30, 0, 1));
    return { value, detail: `ADX ${a.toFixed(1)} (${a >= 25 ? "trending" : a >= 18 ? "weak trend" : "ranging"}), +DI ${p.toFixed(1)} vs −DI ${m.toFixed(1)}.` };
  },

  prevDay(ctx, i) {
    const d = ctx.day[i]!, b = ctx.p[i], c = ctx.pClose[i], a = ctx.pAtr[i];
    if (b.high > d.prevHigh && c < d.prevHigh) return { value: -0.8, detail: `Swept yesterday's high ${fmt(ctx, d.prevHigh)} and closed back below — rejection.` };
    if (b.low < d.prevLow && c > d.prevLow) return { value: 0.8, detail: `Swept yesterday's low ${fmt(ctx, d.prevLow)} and closed back above — rejection.` };
    if (c > d.prevHigh) return { value: clamp(0.4 + (c - d.prevHigh) / (2 * a), 0, 1), detail: `Holding above yesterday's high ${fmt(ctx, d.prevHigh)} — breakout.` };
    if (c < d.prevLow) return { value: -clamp(0.4 + (d.prevLow - c) / (2 * a), 0, 1), detail: `Holding below yesterday's low ${fmt(ctx, d.prevLow)} — breakdown.` };
    const mid = (d.prevHigh + d.prevLow) / 2, half = (d.prevHigh - d.prevLow) / 2 || a;
    const pos = (c - mid) / half;
    return { value: clamp(-0.3 * pos), detail: `Inside yesterday's range (${fmt(ctx, d.prevLow)}–${fmt(ctx, d.prevHigh)}), ${Math.round((pos + 1) * 50)}% of the way up.` };
  },

  pivots(ctx, i) {
    const d = ctx.day[i]!, c = ctx.pClose[i];
    const P = (d.prevHigh + d.prevLow + d.prevClose) / 3, R1 = 2 * P - d.prevLow, S1 = 2 * P - d.prevHigh;
    const value = c >= P ? clamp((c - P) / Math.max(1e-9, R1 - P)) : -clamp((P - c) / Math.max(1e-9, P - S1));
    const where = c > R1 ? "above R1" : c > P ? "between pivot and R1" : c > S1 ? "between S1 and pivot" : "below S1";
    return { value, detail: `Price ${where} (S1 ${fmt(ctx, S1)}, P ${fmt(ctx, P)}, R1 ${fmt(ctx, R1)}).` };
  },

  sessionRange(ctx, i) {
    const d = ctx.day[i]!, c = ctx.pClose[i], a = ctx.pAtr[i];
    if (!d.asiaDone) return { value: 0, detail: "Asian range still forming (before 07:00 UTC)." };
    if (d.hour >= 16) return { value: 0, detail: `Past the London window; Asian range ${fmt(ctx, d.asiaLow)}–${fmt(ctx, d.asiaHigh)} no longer scored.` };
    if (c > d.asiaHigh) return { value: clamp((c - d.asiaHigh) / a + 0.5, 0, 1), detail: `Broke above the Asian range high ${fmt(ctx, d.asiaHigh)}.` };
    if (c < d.asiaLow) return { value: -clamp((d.asiaLow - c) / a + 0.5, 0, 1), detail: `Broke below the Asian range low ${fmt(ctx, d.asiaLow)}.` };
    return { value: 0, detail: `Inside the Asian range ${fmt(ctx, d.asiaLow)}–${fmt(ctx, d.asiaHigh)}.` };
  },

  sessionMean(ctx, i) {
    const d = ctx.day[i]!, a = ctx.pAtr[i];
    const dev = (ctx.pClose[i] - d.sessMean) / a;
    return { value: clamp(Math.tanh(dev / 1.5)), detail: `${Math.abs(dev).toFixed(2)}×ATR ${dev >= 0 ? "above" : "below"} today's time-weighted mean ${fmt(ctx, d.sessMean)}.` };
  },
};

function regimeLayer(ctx: TdciContext, i: number): LayerOut {
  const ratio = ctx.pAtr[i] / ctx.pAtrAvg[i];
  const vol = ratio < 0.5 ? 0.4 : ratio < 0.7 ? 0.4 + (ratio - 0.5) * 3 : ratio <= 1.6 ? 1 : ratio <= 2.2 ? 1 - (ratio - 1.6) * (0.5 / 0.6) : 0.5;
  const hour = new Date(parseTime(ctx.p[i].time) + ctx.barMs).getUTCHours();
  const sh = ctx.profile.sessionHours;
  const inSession = !sh || (hour >= sh[0] && hour < sh[1]);
  const session = inSession ? 1 : 0.3;
  // Costs: a spread that is a large share of a typical bar's range kills short-term edges
  const costRatio = ctx.spread > 0 ? ctx.spread / ctx.pAtr[i] : 0;
  const cost = clamp(1 - Math.max(0, costRatio - 0.1) / 0.4, 0.2, 1);
  const value = clamp(vol * session * cost, 0, 1);
  const label = ratio < 0.7 ? "quiet" : ratio > 1.6 ? "volatile" : "normal";
  return {
    value,
    detail: `Volatility ${label} (ATR ${ratio.toFixed(2)}× average)${sh ? `, ${inSession ? "in" : "outside"} ${String(sh[0]).padStart(2, "0")}–${sh[1]}:00 UTC session` : ""}; spread ${(costRatio * 100).toFixed(0)}% of ATR.`,
  };
}

/** Raw values for the style's layers plus regime. */
export function layerValues(ctx: TdciContext, i: number) {
  const out = {} as Record<LayerKey, LayerOut>;
  for (const k of ctx.profile.layers) out[k] = LAYERS[k](ctx, i);
  return { layers: out, regime: regimeLayer(ctx, i) };
}

/**
 * Combine layer values into a score. A negative weight means calibration found
 * the layer works contrarian on that market and style.
 */
export function combine(x: Partial<Record<LayerKey, number>>, regime: number, weights: Weights) {
  const keys = Object.keys(weights) as LayerKey[];
  const totalW = keys.reduce((s, k) => s + Math.abs(weights[k] ?? 0), 0) || 1;
  const contrib = keys.map(k => (weights[k] ?? 0) * (x[k] ?? 0));
  const composite = contrib.reduce((s, v) => s + v, 0) / totalW;
  const dirSign = Math.sign(composite);
  const active = keys.map((k, idx) => ({ w: weights[k] ?? 0, v: x[k] ?? 0, c: contrib[idx] })).filter(z => z.w !== 0 && Math.abs(z.v) > 0.1);
  const agreement = active.length ? active.filter(z => Math.sign(z.c) === dirSign).length / active.length : 0;
  const score = Math.round(100 * clamp(Math.abs(composite) / 0.6, 0, 1) * regime);
  const direction: TdciResult["direction"] = score < 10 ? "NEUTRAL" : dirSign > 0 ? "LONG" : "SHORT";
  return { composite, score, direction, agreement };
}

export function computeAt(ctx: TdciContext, i: number, weights: Weights = ctx.profile.defaultWeights): TdciResult {
  const lv = layerValues(ctx, i);
  const x = Object.fromEntries(ctx.profile.layers.map(k => [k, lv.layers[k].value])) as Record<LayerKey, number>;
  const c = combine(x, lv.regime.value, weights);
  return {
    style: ctx.profile.key,
    time: ctx.p[i].time, score: c.score, direction: c.direction, composite: round(c.composite),
    regime: round(lv.regime.value), agreement: round(c.agreement),
    layers: [
      ...ctx.profile.layers.map(k => ({ key: k, label: LAYER_INFO[k].label, value: round(lv.layers[k].value), weight: round(weights[k] ?? 0), detail: lv.layers[k].detail })),
      { key: "regime" as const, label: LAYER_INFO.regime.label, value: round(lv.regime.value), weight: 0, detail: lv.regime.detail },
    ],
    atr: ctx.pAtr[i], close: ctx.pClose[i],
  };
}

/** Index of the last fully closed bar (the newest candle is usually still forming). */
export function lastClosedIndex(ctx: TdciContext, now = Date.now()): number {
  const n = ctx.p.length - 1;
  return parseTime(ctx.p[n].time) + ctx.barMs <= now ? n : n - 1;
}
