import { test } from "node:test";
import assert from "node:assert/strict";
import { calcProfit, calcPips, getSymbolConfig, priceDecimals } from "../shared/pips";
import { ema, rsi, atr } from "../server/indicators";
import { encryptSecret, decryptSecret } from "../server/crypto";

const close = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("EURUSD: 10 pips on 1 lot = $100", () => {
  close(calcProfit("BUY", 1.1000, 1.1010, "EURUSD", 1), 100);
  close(calcProfit("SELL", 1.1000, 1.1010, "EURUSD", 1), -100);
});

test("lowercase and long/short directions are treated as BUY/SELL", () => {
  close(calcProfit("buy", 1.1000, 1.1010, "EURUSD", 1), 100);
  close(calcProfit("long", 1.1000, 1.1010, "EURUSD", 1), 100);
  close(calcProfit("sell", 1.1000, 1.0990, "EURUSD", 1), 100);
});

test("XAUUSD: $1 move on 0.1 lot (10 oz) = $10, not $10,000", () => {
  close(calcProfit("BUY", 2400, 2401, "XAUUSD", 0.1), 10);
});

test("USDJPY: P&L converts yen to USD at the exit price", () => {
  // 10 pips (0.10) on 1 lot = 1,000 JPY ≈ $6.67 at 150.00
  close(calcProfit("BUY", 150.00, 150.10, "USDJPY", 1), 100_000 * 0.10 / 150.10, 0.05);
});

test("pips and display precision per symbol", () => {
  assert.equal(calcPips("BUY", 1.1000, 1.1025, "EURUSD"), 25);
  assert.equal(calcPips("SELL", 150.50, 150.00, "USDJPY"), 50);
  assert.equal(priceDecimals("EURUSD"), 5);
  assert.equal(priceDecimals("USDJPY"), 3);
  assert.equal(priceDecimals("XAUUSD"), 2);
  assert.equal(getSymbolConfig("XAUUSD").pipSize, 0.01);
});

test("indicators are aligned to input length with no look-ahead", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 1 + i * 0.001);
  const e = ema(closes, 20);
  assert.equal(e.length, closes.length);
  assert.ok(Number.isNaN(e[18]) && Number.isFinite(e[19]));
  const r = rsi(closes, 14);
  assert.equal(r[r.length - 1], 100); // monotonic rise
  const candles = closes.map((c, i) => ({ time: String(i), open: c, high: c + 0.0005, low: c - 0.0005, close: c }));
  const a = atr(candles, 14);
  assert.equal(a.length, candles.length);
  assert.ok(Number.isFinite(a[14]) && Number.isNaN(a[13]));
});

test("secrets round-trip through encryption and are not stored in plaintext", () => {
  const enc = encryptSecret("sk-test-123")!;
  assert.ok(enc.startsWith("enc:v1:") && !enc.includes("sk-test-123"));
  assert.equal(decryptSecret(enc), "sk-test-123");
  assert.equal(decryptSecret("legacy-plain"), "legacy-plain");
  assert.equal(encryptSecret(enc), enc); // idempotent
});
