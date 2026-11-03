// ─── Technical indicators ─────────────────────────────────────────────────────
// Every function returns an array aligned 1:1 with its input: result[i] uses
// only data up to and including bar i (no look-ahead). Warm-up bars are NaN.

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA seed
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Wilder's ATR. */
export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) => i === 0
    ? c.high - c.low
    : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Most recent confirmed swing highs/lows (fractal with `wing` bars each side). */
export function swingPoints(candles: Candle[], wing = 2, max = 3) {
  const highs: number[] = [], lows: number[] = [];
  for (let i = candles.length - 1 - wing; i >= wing && (highs.length < max || lows.length < max); i--) {
    const c = candles[i];
    const window = candles.slice(i - wing, i + wing + 1);
    if (highs.length < max && window.every(x => x.high <= c.high)) highs.push(c.high);
    if (lows.length < max && window.every(x => x.low >= c.low)) lows.push(c.low);
  }
  return { highs, lows };
}

export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

/**
 * Wilder's ADX with +DI/−DI. Returns arrays aligned with the input; values are
 * NaN until enough bars exist (about 2× period).
 */
export function adx(candles: Candle[], period = 14) {
  const n = candles.length;
  const plusDI = new Array<number>(n).fill(NaN), minusDI = new Array<number>(n).fill(NaN), adxOut = new Array<number>(n).fill(NaN);
  if (n <= period * 2) return { adx: adxOut, plusDI, minusDI };
  let trS = 0, pS = 0, mS = 0;
  const dx: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const up = c.high - p.high, down = p.low - c.low;
    const pdm = up > down && up > 0 ? up : 0, mdm = down > up && down > 0 ? down : 0;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    if (i <= period) {
      trS += tr; pS += pdm; mS += mdm;
      if (i < period) continue;
    } else {
      trS = trS - trS / period + tr; pS = pS - pS / period + pdm; mS = mS - mS / period + mdm;
    }
    const pdi = trS ? (100 * pS) / trS : 0, mdi = trS ? (100 * mS) / trS : 0;
    plusDI[i] = pdi; minusDI[i] = mdi;
    dx[i] = pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
  }
  const first = period * 2 - 1;
  let a = dx.slice(period, first + 1).reduce((s, v) => s + v, 0) / period;
  adxOut[first] = a;
  for (let i = first + 1; i < n; i++) { a = (a * (period - 1) + dx[i]) / period; adxOut[i] = a; }
  return { adx: adxOut, plusDI, minusDI };
}

/** Aggregate daily candles into weeks starting Monday (UTC). */
export function toWeekly(daily: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of daily) {
    const d = new Date(c.time.slice(0, 10) + "T00:00:00Z");
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
    const w = out[out.length - 1];
    if (w && w.time === monday) {
      w.high = Math.max(w.high, c.high); w.low = Math.min(w.low, c.low); w.close = c.close;
    } else {
      out.push({ time: monday, open: c.open, high: c.high, low: c.low, close: c.close });
    }
  }
  return out;
}
