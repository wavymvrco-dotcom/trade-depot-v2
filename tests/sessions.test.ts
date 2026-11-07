// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fxClosedAt, fxBarClosed, dropClosedBars } from "../shared/sessions";

const at = (iso: string) => Date.parse(iso);

test("FX is closed from Friday 21:00 to Sunday 21:00 UTC", () => {
  assert.equal(fxClosedAt(at("2026-11-06T20:59:00Z")), false); // Fri
  assert.equal(fxClosedAt(at("2026-11-06T21:00:00Z")), true);
  assert.equal(fxClosedAt(at("2026-11-07T12:00:00Z")), true);  // Sat
  assert.equal(fxClosedAt(at("2026-11-08T20:59:00Z")), true);  // Sun
  assert.equal(fxClosedAt(at("2026-11-08T21:00:00Z")), false);
  assert.equal(fxClosedAt(at("2026-11-09T03:00:00Z")), false); // Mon
});

test("bars are dropped only when the market is closed for all of them", () => {
  const M15 = 900_000, H4 = 4 * 3_600_000, D = 86_400_000;
  assert.equal(fxBarClosed(at("2026-11-06T20:45:00Z"), M15), false); // last bar before the close
  assert.equal(fxBarClosed(at("2026-11-06T21:00:00Z"), M15), true);
  assert.equal(fxBarClosed(at("2026-11-08T20:45:00Z"), M15), true);
  assert.equal(fxBarClosed(at("2026-11-08T21:00:00Z"), M15), false); // Sunday open
  assert.equal(fxBarClosed(at("2026-11-06T20:00:00Z"), H4), false);  // Fri 20–24 includes an open hour
  assert.equal(fxBarClosed(at("2026-11-07T00:00:00Z"), H4), true);
  assert.equal(fxBarClosed(at("2026-11-08T20:00:00Z"), H4), false);  // Sun 20–24 includes the open
  assert.equal(fxBarClosed(at("2026-11-07T00:00:00Z"), D), true);    // Saturday daily
  assert.equal(fxBarClosed(at("2026-11-08T00:00:00Z"), D), true);    // Sunday daily
  assert.equal(fxBarClosed(at("2026-11-06T00:00:00Z"), D), false);
});

test("a week of 24/7 15-minute bars keeps exactly the 120 trading hours", () => {
  const start = at("2026-11-02T00:00:00Z"); // Monday
  const bars = Array.from({ length: 7 * 96 }, (_, k) => ({ time: new Date(start + k * 900_000).toISOString().slice(0, 19).replace("T", " ") }));
  const kept = dropClosedBars("EURUSD", "15min", bars);
  assert.equal(kept.length, 120 * 4);
  assert.ok(!kept.some(b => fxClosedAt(Date.parse(b.time.replace(" ", "T") + "Z"))));
});
