// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderLicensePage, renderOgPng, type LicensePageData } from "../server/lab/service/license-page-render";

const data = (o: Partial<LicensePageData> = {}): LicensePageData => ({
  name: `<script>alert("x")</script> London Breakout`, by: `Marco"><img src=x onerror=alert(1)>`,
  grade: "licensed", stage: "live", style: "swing", symbols: ["EURUSD", "GBPUSD"],
  vault: { trades: 120, totalR: 18.4, profitFactor: 1.4, maxDD: 6.2, doubleCostR: 9.1, dsr: 0.97, trials: 240, baselineR: 2.2, equity: [0, 1, 3, 2, 5] },
  shadow: { trades: 22, totalR: 4.1, since: new Date("2026-10-01") },
  live: { trades: 5, totalR: -0.5, since: new Date("2026-11-01") },
  events: [{ at: new Date("2026-09-01"), from: null, to: "probation/vault", reason: "Passed the Vault Exam", tripwire: false }],
  publicSince: new Date(), ...o,
});

test("user-entered text is escaped (no script or attribute injection)", () => {
  const html = renderLicensePage(data(), "https://example.test", "abcDEF123_");
  assert.ok(!html.includes("<script>alert"), "script tag escaped");
  assert.ok(!html.includes(`"><img`), "attribute breakout escaped");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("the page shows the verified record and nothing private", () => {
  const html = renderLicensePage(data(), "https://example.test", "abcDEF123_");
  for (const s of ["Vault Exam", "+18.4R", "120", "97%", "240", "Shadow Run", "22 closed trades", "Live record", "History", "not investment advice"]) assert.ok(html.includes(s), s);
  // Strategy internals and account details never appear (CSS words like "font-weight" are not data)
  for (const s of ["threshold", "stopIdx", "rrIdx", "genome", "layer weight", "\"w\":", "accountSize", "balance", "userId"]) {
    assert.ok(!html.toLowerCase().includes(s.toLowerCase()), `leaks ${s}`);
  }
});

test("share image renders (PNG when the renderer is available)", async () => {
  const img = await renderOgPng(data());
  assert.ok(img.body.length > 1000);
  if (img.type === "image/png") assert.equal(img.body.subarray(1, 4).toString(), "PNG");
});
