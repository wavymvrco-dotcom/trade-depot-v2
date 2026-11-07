// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Public, read-only License Pages (§10.7). No login. Cached for 5 minutes.

import type { Express, Request, Response } from "express";
import { licensePageData, renderLicensePage, renderOgPng } from "../lab/service/license-pages";

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

  app.get("/l/:slug/og.png", async (req: Request, res: Response) => {
    try {
      const d = await licensePageData(req.params.slug);
      if (!d) return res.status(404).end();
      const img = await renderOgPng(d);
      res.set("Cache-Control", "public, max-age=300").type(img.type).send(img.body);
    } catch { res.status(500).end(); }
  });
}
