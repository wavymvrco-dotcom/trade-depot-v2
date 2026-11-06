// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Routes moved unchanged from server/routes.ts (Phase 0 split).

import type { Express } from "express";
import type { Request, Response } from "express";
import { getLiveTdci, latestCalibration, listCalibrations, enqueueCalibrations, jobStatus, isStyle, TDCI_SYMBOLS, type CalibrationResult } from "../tdci-service";
import { PROFILES, STYLES, LAYER_INFO, type StyleKey } from "../tdci";
import { z } from "zod";

export function register(app: Express) {
  // ── Trade Depot Confluence Index ──────────────────────────────────────────
  const tdciParams = z.object({
    symbol: z.string().transform(s => s.toUpperCase()).refine(s => TDCI_SYMBOLS.includes(s), "Unsupported symbol"),
    style: z.enum(STYLES as [StyleKey, ...StyleKey[]]).default("swing"),
  });
  const tdciError = (e: any) => e.issues?.[0]?.message ?? e.message;

  app.get("/api/tdci/profiles", (_req: Request, res: Response) => {
    res.json({
      symbols: TDCI_SYMBOLS,
      profiles: STYLES.map(k => {
        const p = PROFILES[k];
        return {
          key: p.key, label: p.label, description: p.description, interval: p.interval, htf: p.htf,
          model: p.model, sessionHours: p.sessionHours ?? null,
          layers: [...p.layers, "regime"].map(l => ({ key: l, ...LAYER_INFO[l as keyof typeof LAYER_INFO], weight: (p.defaultWeights as any)[l] ?? null })),
        };
      }),
    });
  });

  app.get("/api/tdci/calibrations", async (_req: Request, res: Response) => {
    const rows = await listCalibrations();
    res.json(rows.map(r => {
      const x = r.result as CalibrationResult;
      return {
        symbol: r.symbol, style: r.interval, createdAt: r.createdAt,
        recommendedMin: x.recommendedMin, verdict: x.verdict, weightsLearned: x.weightsLearned,
        oosAnySignalAvgR: x.outOfSample.anySignal.avgR, oosMonotonic: x.outOfSample.monotonic,
        costShareOfRisk: x.costShareOfRisk,
      };
    }));
  });

  app.get("/api/tdci/calibration/:symbol/:style", async (req: Request, res: Response) => {
    try {
      const p = tdciParams.parse(req.params);
      const row = await latestCalibration(p.symbol, p.style);
      if (!row) return res.status(404).json({ message: "Not calibrated yet" });
      res.json({ ...(row.result as object), createdAt: row.createdAt });
    } catch (e: any) {
      res.status(400).json({ message: tdciError(e) });
    }
  });

  // Calibrations run in a background queue; the UI polls /api/tdci/job
  app.get("/api/tdci/job", async (_req: Request, res: Response) => {
    try { res.json(await jobStatus()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tdci/calibrate", async (req: Request, res: Response) => {
    try {
      const p = tdciParams.parse(req.body ?? {});
      res.status(202).json(await enqueueCalibrations([{ symbol: p.symbol, style: p.style }]));
    } catch (e: any) {
      res.status(400).json({ message: tdciError(e) });
    }
  });

  app.post("/api/tdci/calibrate-all", async (req: Request, res: Response) => {
    const styles = (Array.isArray(req.body?.styles) ? req.body.styles : STYLES).filter(isStyle);
    const symbols = (Array.isArray(req.body?.symbols) ? req.body.symbols : TDCI_SYMBOLS).map((s: string) => String(s).toUpperCase()).filter((s: string) => TDCI_SYMBOLS.includes(s));
    const pairs = styles.flatMap((style: StyleKey) => symbols.map((symbol: string) => ({ symbol, style })));
    try { res.status(202).json(await enqueueCalibrations(pairs)); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tdci/:symbol", async (req: Request, res: Response) => {
    try {
      const p = tdciParams.parse({ symbol: req.params.symbol, style: req.query.style ?? "swing" });
      res.json(await getLiveTdci(p.symbol, p.style));
    } catch (e: any) {
      res.status(400).json({ message: tdciError(e) });
    }
  });

}
