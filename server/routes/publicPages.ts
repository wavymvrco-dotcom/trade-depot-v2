// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Public, read-only License Pages (§10.7). No login. Cached for 5 minutes.

import type { Express, Request, Response } from "express";
import { licensePageData, renderLicensePage, renderOgPng } from "../lab/service/license-pages";
import { dayProof, proofBundleForSlug, VERIFIER_JS } from "../lab/service/proof";

const origin = (req: Request) => process.env.APP_URL?.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;

export function register(app: Express) {
  app.get("/l/:slug", async (req: Request, res: Response) => {
    try {
      const d = await licensePageData(req.params.slug);
      if (!d) return res.status(404).type("text/plain").send("This strategy page does not exist or is no longer shared.");
      res.set("Cache-Control", "public, max-age=300").type("html").send(renderLicensePage(d, origin(req), req.params.slug));
    } catch (e: any) {
      console.error("[license-page]", e.message);
      res.status(500).type("text/plain").send("This page could not be loaded.");
    }
  });

  // Proof of Process: the browser verifier, the raw record, and each day's seal (+ .ots when anchored)
  app.get("/proof/verify.js", (_req: Request, res: Response) => { res.set("Cache-Control", "public, max-age=3600").type("application/javascript").send(VERIFIER_JS); });
  app.get("/api/proof/l/:slug", async (req: Request, res: Response) => {
    try {
      const b = await proofBundleForSlug(req.params.slug);
      if (!b) return res.status(404).json({ message: "Not found" });
      res.set("Cache-Control", "public, max-age=60").json(b);
    } catch (e: any) { console.error("[proof]", e.message); res.status(500).json({ message: "Could not load the record" }); }
  });
  app.get("/api/proof/day/:day.txt", async (req: Request, res: Response) => {
    const r = await dayProof(req.params.day).catch(() => null);
    if (!r) return res.status(404).type("text/plain").send("No seal for that day.");
    res.set("Cache-Control", "public, max-age=86400").type("text/plain").send(r.file);
  });
  app.get("/api/proof/day/:day.ots", async (req: Request, res: Response) => {
    const r = await dayProof(req.params.day).catch(() => null);
    if (!r?.ots) return res.status(404).type("text/plain").send("That day is not publicly timestamped.");
    res.set("Cache-Control", "public, max-age=3600").type("application/octet-stream").attachment(`trade-depot-proof-${r.day}.txt.ots`).send(Buffer.from(r.ots, "base64"));
  });

  app.get("/l/:slug/og.png", async (req: Request, res: Response) => {
    try {
      const d = await licensePageData(req.params.slug);
      if (!d) return res.status(404).end();
      const img = await renderOgPng(d);
      res.set("Cache-Control", "public, max-age=300").type(img.type).send(img.body);
    } catch { res.status(500).end(); }
  });
}
