// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// /api/lab/* — the Strategy Lab (§9.12). Every route requires login (the /api
// auth middleware) and checks that the record belongs to the caller.

import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "../db";
import { blueprints, labRuns, positions, shadowTrades, strategyLicenses } from "@shared/schema";
import { blueprintBodySchema, blueprintSpecSchema, describeBlueprint, runBodySchema, propRulesSchema } from "@shared/lab-schemas";
import { challengeOdds, PROP_TEMPLATES, PROP_FAILURE_TEXT, type PropRules } from "../lab/engine/prop";
import { rng, hashSeed } from "../lab/engine/rng";
import { storage } from "../storage";
import { closeTrade } from "../execution";
import { uid } from "./_shared";
import { createRun, getRun, listRuns, cancelRun, LabError } from "../lab/service/runs";
import { feasibility } from "../lab/service/feasibility";
import { getLicense, listLicenses, licenseHistory, transition } from "../lab/service/licenses";
import { shadowEvidence } from "../lab/service/shadow";
import { userRewind } from "../lab/service/rewind";
import { parseBlueprint, reflectOnRun } from "../lab/service/blueprint";
import { publishLicense, unpublishLicense } from "../lab/service/license-pages";
import { forgeArchive, enqueueForge, judgeAndRecord, FORGE_SYMBOLS } from "../lab/service/forge";
import { getEnvData } from "../lab/service/envs";
import { enqueueStorm } from "../lab/service/storm";
import { addToPlaybook } from "../lab/service/playbook";
import { validateLayer } from "../lab/engine/forge/dsl";
const isLabStyle = (s: string): s is "scalp" | "day" | "swing" | "position" => ["scalp", "day", "swing", "position"].includes(s);
import { TIERS, tierOf, monthKey } from "../lab/service/tiers";
import { FAILURE_TEXT } from "../lab/engine/types";
import type { BlueprintSpec } from "../lab/engine/types";

function fail(res: Response, e: any) {
  if (e instanceof ZodError) return res.status(400).json({ message: e.issues[0]?.message ?? "Invalid request", issues: e.issues });
  if (e instanceof LabError) return res.status(e.status).json({ message: e.message });
  if (e?.name === "IllegalTransition") return res.status(409).json({ message: e.message });
  console.error("[lab] route error:", e?.message);
  return res.status(500).json({ message: "Something went wrong in the Lab." });
}

async function tierFor(userId: string) {
  const s = await storage.getUserSettings(userId);
  const tier = tierOf(s?.labTier);
  const used = s?.labCreditsMonth === monthKey() ? s?.labCreditsUsed ?? 0 : 0;
  return { tier, limits: TIERS[tier], creditsUsed: used };
}

// Feasibility checks build environments; keep them from being hammered
const feasHits = new Map<string, number[]>();
function feasLimited(userId: string) {
  const now = Date.now(), hits = (feasHits.get(userId) ?? []).filter(t => now - t < 60_000);
  hits.push(now); feasHits.set(userId, hits);
  return hits.length > 10;
}

export function register(app: Express) {
  app.get("/api/lab/me", async (req: Request, res: Response) => {
    try { res.json({ ...(await tierFor(uid(req))), failureText: FAILURE_TEXT }); } catch (e) { fail(res, e); }
  });

  // ── Blueprints ──
  app.get("/api/lab/blueprints", async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(blueprints).where(eq(blueprints.userId, uid(req))).orderBy(desc(blueprints.createdAt));
      res.json(rows.map(r => ({ ...r, summary: describeBlueprint(blueprintSpecSchema.parse(r.spec)) })));
    } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/blueprints", async (req: Request, res: Response) => {
    try {
      const body = blueprintBodySchema.parse(req.body);
      const userId = uid(req);
      if (body.id) {
        const [existing] = await db.select().from(blueprints).where(and(eq(blueprints.id, body.id), eq(blueprints.userId, userId)));
        if (!existing) return res.status(404).json({ message: "Blueprint not found" });
        // A changed spec is a new version: earlier runs keep pointing at the spec they used
        const [row] = await db.insert(blueprints).values({ userId, name: body.name, prompt: body.prompt, spec: body.spec, specVersion: existing.specVersion + 1 }).returning();
        return res.json({ ...row, summary: describeBlueprint(body.spec) });
      }
      const [row] = await db.insert(blueprints).values({ userId, name: body.name, prompt: body.prompt, spec: body.spec }).returning();
      res.json({ ...row, summary: describeBlueprint(body.spec) });
    } catch (e) { fail(res, e); }
  });

  /** Blueprint AI: plain English → a validated Blueprint (the user confirms before anything runs). */
  app.post("/api/lab/blueprint-ai/parse", async (req: Request, res: Response) => {
    try {
      const prompt = String(req.body?.prompt ?? "").trim();
      if (prompt.length < 10 || prompt.length > 4000) throw new LabError("Describe the strategy in 10 to 4,000 characters.");
      res.json(await parseBlueprint(uid(req), prompt));
    } catch (e) { fail(res, e); }
  });

  /** Blueprint AI reflection: up to three validated refinements after a run (the user picks one or none). */
  app.post("/api/lab/runs/:id/refine", async (req: Request, res: Response) => {
    try {
      const run = await getRun(uid(req), req.params.id);
      if (!run || !run.result) throw new LabError("Finished run not found", 404);
      const [bp] = await db.select({ spec: blueprints.spec }).from(blueprints).where(and(eq(blueprints.id, run.blueprintId), eq(blueprints.userId, uid(req))));
      res.json({ refinements: await reflectOnRun(uid(req), blueprintSpecSchema.parse(bp?.spec), run.result) });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/describe", (req: Request, res: Response) => {
    try { res.json({ summary: describeBlueprint(blueprintSpecSchema.parse(req.body?.spec)) }); } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/feasibility", async (req: Request, res: Response) => {
    try {
      if (feasLimited(uid(req))) return res.status(429).json({ message: "Too many checks — wait a minute." });
      const spec = blueprintSpecSchema.parse(req.body?.spec) as BlueprintSpec;
      res.json(await feasibility(spec));
    } catch (e) { fail(res, e); }
  });

  // ── Runs ──
  app.post("/api/lab/runs", async (req: Request, res: Response) => {
    try {
      const body = runBodySchema.parse(req.body);
      const run = await createRun(uid(req), body);
      res.status(202).json({ runId: run.id });
    } catch (e) { fail(res, e); }
  });

  app.get("/api/lab/runs", async (req: Request, res: Response) => {
    try { res.json(await listRuns(uid(req))); } catch (e) { fail(res, e); }
  });

  app.get("/api/lab/runs/:id", async (req: Request, res: Response) => {
    try {
      const run = await getRun(uid(req), req.params.id);
      if (!run) return res.status(404).json({ message: "Run not found" });
      const [lic] = await db.select({ id: strategyLicenses.id }).from(strategyLicenses).where(eq(strategyLicenses.runId, run.id));
      res.json({ ...run, licenseId: lic?.id ?? null });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/runs/:id/cancel", async (req: Request, res: Response) => {
    try { res.json(await cancelRun(uid(req), req.params.id)); } catch (e) { fail(res, e); }
  });

  // ── Licenses ──
  app.get("/api/lab/licenses", async (req: Request, res: Response) => {
    try { res.json(await listLicenses(uid(req))); } catch (e) { fail(res, e); }
  });

  app.get("/api/lab/licenses/:id", async (req: Request, res: Response) => {
    try {
      const lic = await getLicense(uid(req), req.params.id);
      if (!lic) return res.status(404).json({ message: "Strategy not found" });
      res.json({ ...lic, events: await licenseHistory(lic.id) });
    } catch (e) { fail(res, e); }
  });

  app.get("/api/lab/licenses/:id/shadow-trades", async (req: Request, res: Response) => {
    try {
      const lic = await getLicense(uid(req), req.params.id);
      if (!lic) return res.status(404).json({ message: "Strategy not found" });
      res.json(await db.select().from(shadowTrades).where(eq(shadowTrades.licenseId, lic.id)).orderBy(desc(shadowTrades.signalTime)).limit(500));
    } catch (e) { fail(res, e); }
  });

  const specOf = async (lic: { runId: string | null }) => {
    if (!lic.runId) return null;
    const [run] = await db.select({ b: labRuns.blueprintId }).from(labRuns).where(eq(labRuns.id, lic.runId));
    if (!run) return null;
    const [bp] = await db.select({ spec: blueprints.spec }).from(blueprints).where(eq(blueprints.id, run.b));
    const p = blueprintSpecSchema.safeParse(bp?.spec);
    return p.success ? p.data : null;
  };

  const owned = async (req: Request) => {
    const lic = await getLicense(uid(req), req.params.id);
    if (!lic) throw new LabError("Strategy not found", 404);
    return lic;
  };

  app.post("/api/lab/licenses/:id/shadow", async (req: Request, res: Response) => {
    try {
      const lic = await owned(req);
      const { limits } = await tierFor(lic.userId);
      const inShadow = await db.select({ id: strategyLicenses.id }).from(strategyLicenses)
        .where(and(eq(strategyLicenses.userId, lic.userId), eq(strategyLicenses.stage, "shadow"), eq(strategyLicenses.grade, "probation")));
      if (inShadow.length >= limits.shadowSlots) {
        throw new LabError(limits.shadowSlots === 0 ? "Shadow Run is part of the Pro plan." : `Your plan allows ${limits.shadowSlots} strategies in Shadow Run at once.`, 402);
      }
      res.json(await transition(lic.id, "start_shadow", "Shadow Run started by the user", null, { shadowStartedAt: new Date(), evidence: null }));
    } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/licenses/:id/license", async (req: Request, res: Response) => {
    try {
      const lic = await owned(req);
      // The server re-checks every graduation criterion; the button is not trusted
      const ev = await shadowEvidence(lic);
      if (!ev || ev.verdict !== "graduate") {
        const missing = ev?.checks.filter(c => !c.ok).map(c => c.label) ?? ["Shadow Run evidence"];
        throw new LabError(`Not ready to license yet: ${missing.join("; ")}.`, 409);
      }
      const licensed = await transition(lic.id, "graduate", "Licensed by the user after passing Shadow Run", ev);
      await addToPlaybook(licensed).catch(e => console.warn("[playbook]", e.message)); // becomes a reusable skill (§11.2)
      res.json(licensed);
    } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/licenses/:id/live", async (req: Request, res: Response) => {
    try {
      const lic = await owned(req);
      const { limits } = await tierFor(lic.userId);
      if (!limits.live) throw new LabError("Going Live is part of the Pro plan.", 402);
      res.json(await transition(lic.id, "go_live", "Set Live by the user", null, { liveSince: new Date() }));
    } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/licenses/:id/pause", async (req: Request, res: Response) => {
    try { const lic = await owned(req); res.json(await transition(lic.id, "pause", "Paused by the user (back to Shadow, no real orders)", null, { liveSince: null })); } catch (e) { fail(res, e); }
  });

  app.post("/api/lab/licenses/:id/retire", async (req: Request, res: Response) => {
    try { const lic = await owned(req); res.json(await transition(lic.id, "retire", "Retired by the user", null, { liveSince: null })); } catch (e) { fail(res, e); }
  });

  /** Rewind (§10.3): the user's own trades replayed with one change at a time (Pro). */
  app.get("/api/performance/rewind", async (req: Request, res: Response) => {
    try {
      const { tier } = await tierFor(uid(req));
      if (tier !== "pro") throw new LabError("Rewind is part of the Pro plan.", 402);
      res.json(await userRewind(uid(req)));
    } catch (e) { fail(res, e); }
  });

  // ── Forge (§11.1) and Layer Kit submissions (§11.6) ──
  app.get("/api/lab/forge", async (req: Request, res: Response) => {
    try { const style = String(req.query.style ?? "swing"); if (!isLabStyle(style)) throw new LabError("Unknown style"); res.json(await forgeArchive(style)); } catch (e) { fail(res, e); }
  });
  app.post("/api/lab/forge", async (req: Request, res: Response) => {
    try {
      const { tier } = await tierFor(uid(req));
      if (tier !== "pro") throw new LabError("The Forge is part of the Pro plan.", 402);
      const style = String(req.body?.style ?? "swing"); if (!isLabStyle(style)) throw new LabError("Unknown style");
      const steps = Math.max(1, Math.min(50, Number(req.body?.steps ?? 20)));
      res.status(202).json({ jobId: await enqueueForge(style, steps, uid(req), !!req.body?.useAi) });
    } catch (e) { fail(res, e); }
  });
  app.post("/api/lab/forge/submit", async (req: Request, res: Response) => {
    try {
      const style = String(req.body?.style ?? "swing"); if (!isLabStyle(style)) throw new LabError("Unknown style");
      const v = validateLayer(req.body?.layer);
      if (!v.ok) throw new LabError(`Not a valid layer: ${v.errors.join("; ")}`);
      if (feasLimited(uid(req))) return res.status(429).json({ message: "Too many submissions — wait a minute." });
      const envs = [];
      for (const s of FORGE_SYMBOLS) envs.push(await getEnvData(s, style));
      const out = await judgeAndRecord(v.node, style, envs, { type: "user", id: uid(req) }, 1);
      res.json(out.duplicate ? { duplicate: true, status: out.row.status } : { duplicate: false, status: out.row?.status, result: out.result });
    } catch (e) { fail(res, e); }
  });

  app.get("/api/lab/prop-templates", (_req: Request, res: Response) => res.json(PROP_TEMPLATES));

  /** Challenge Odds (§10.6): recomputed from every real trade the strategy has so far (vault + shadow + live). */
  app.post("/api/lab/licenses/:id/challenge-odds", async (req: Request, res: Response) => {
    try {
      const lic = await owned(req);
      const { tier } = await tierFor(lic.userId);
      if (tier !== "pro") throw new LabError("Prop-firm tools are part of the Pro plan.", 402);
      if (lic.grade === "scrapped") throw new LabError("Challenge Odds are only computed for strategies that passed the Vault Exam.", 409);
      const vault = lic.vault as any;
      if (!vault?.sequence?.rs?.length) throw new LabError("This strategy's Vault report predates Challenge Odds. Re-run it in the Lab.", 409);
      const spec = await specOf(lic);
      const rules = req.body?.rules ? propRulesSchema.parse(req.body.rules) : spec?.prop;
      if (!rules) throw new LabError("Enter your firm's rules first.");
      const risk = Number(req.body?.riskPct ?? spec?.risk.riskPercentPerTrade ?? 1);
      const shadow = await db.select({ r: shadowTrades.r }).from(shadowTrades).where(and(eq(shadowTrades.licenseId, lic.id), eq(shadowTrades.status, "closed")));
      const live = await db.select().from(positions).where(and(eq(positions.licenseId, lic.id), eq(positions.status, "closed")));
      const rs = [...vault.sequence.rs, ...shadow.map(s => s.r ?? 0), ...live.filter(p => p.riskAmount).map(p => p.profit / p.riskAmount!)];
      const odds = challengeOdds(rs, vault.sequence.tradesPerDay || 1, rules as PropRules, risk, rng(hashSeed(lic.id + JSON.stringify(rules) + rs.length)), 10_000);
      if (!odds) throw new LabError("Not enough real trades yet to estimate the odds (needs at least 10).", 409);
      res.json({ ...odds, rules, riskPct: risk, sources: { vault: vault.sequence.rs.length, shadow: shadow.length, live: live.length }, failureText: PROP_FAILURE_TEXT });
    } catch (e) { fail(res, e); }
  });

  /** Storm Mode on demand (it also runs automatically after a Vault pass). */
  app.post("/api/lab/licenses/:id/storm", async (req: Request, res: Response) => {
    try {
      const lic = await owned(req);
      if (lic.grade === "scrapped") throw new LabError("Storm Mode runs on strategies that passed the Vault Exam.", 409);
      res.status(202).json({ jobId: await enqueueStorm(lic.id) });
    } catch (e) { fail(res, e); }
  });

  /** License Page (opt-in): publish or rename, and unpublish. */
  app.post("/api/lab/licenses/:id/publish", async (req: Request, res: Response) => {
    try {
      const name = typeof req.body?.publicName === "string" ? req.body.publicName : null;
      const slug = await publishLicense(uid(req), req.params.id, name).catch((e: any) => { throw new LabError(e.message, 409); });
      if (!slug) throw new LabError("Strategy not found", 404);
      res.json({ slug, path: `/l/${slug}` });
    } catch (e) { fail(res, e); }
  });
  app.post("/api/lab/licenses/:id/unpublish", async (req: Request, res: Response) => {
    try { if (!(await unpublishLicense(uid(req), req.params.id))) throw new LabError("Strategy not found", 404); res.json({ ok: true }); } catch (e) { fail(res, e); }
  });

  /** One tap: close every open position this strategy opened (Tripwire never does this on its own). */
  app.post("/api/lab/licenses/:id/close-all", async (req: Request, res: Response) => {
    try {
      const lic = await owned(req);
      const open = await db.select().from(positions).where(and(eq(positions.licenseId, lic.id), eq(positions.userId, lic.userId), inArray(positions.status, ["open"])));
      const results = [];
      for (const p of open) results.push(await closeTrade(p, { reason: "Closed from the Lab (strategy close-all)" }).then(r => ({ id: p.id, ok: !!r })).catch((e: any) => ({ id: p.id, ok: false, reason: e.message })));
      res.json({ closed: results.filter(r => r.ok).length, results });
    } catch (e) { fail(res, e); }
  });
}
