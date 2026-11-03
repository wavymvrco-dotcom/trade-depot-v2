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
