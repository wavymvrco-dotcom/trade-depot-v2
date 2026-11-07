// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Forge service (§11.1, §11.6): an AlphaEvolve-style loop over a MAP-Elites
// archive of layer programs. Each step samples parents from diverse niches,
// asks for ONE new program (the user's AI provider if connected, otherwise a
// mutation), validates it, tests it on training data and records it. Every
// program tested counts toward layerTrials, which raises the acceptance bar.
// Layer Kit submissions go through exactly the same test.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { forgeLayers } from "@shared/schema";
import { PROFILES, type StyleKey } from "../../tdci";
import { storage } from "../../storage";
import { callAiProviderJson } from "../../ai-engine";
import { getBoss, QUEUES } from "../../jobs";
import { rng, hashSeed } from "../engine/rng";
import { GRAMMAR, printLayer, validateLayer, type Node } from "../engine/forge/dsl";
import { randomLayer, mutateLayer } from "../engine/forge/mutate";
import { testLayer, nicheOf, layerInputFor, type AcceptanceResult } from "../engine/forge/accept";
import { evaluateLayer } from "../engine/forge/interp";
import type { EnvData } from "../engine/env";
import { getEnvData } from "./envs";

/** Pairs a layer is judged on (pooled training rows). */
export const FORGE_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"];

/** Hand-written starting programs, so the archive is never empty. */
const SEEDS: Node[] = [
  { op: "clamp", lo: -1, hi: 1, x: { op: "neg", x: { op: "zscore", n: 20, x: { op: "series", name: "close" } } } },
  { op: "clamp", lo: -1, hi: 1, x: { op: "div", a: { op: "slope", n: 10, x: { op: "ema", n: 50, x: { op: "series", name: "close" } } }, b: { op: "atr", n: 14 } } },
  { op: "clamp", lo: -1, hi: 1, x: { op: "div", a: { op: "sub", a: { op: "rsi", n: 14 }, b: { op: "const", v: 50 } }, b: { op: "const", v: 25 } } },
  { op: "clamp", lo: -1, hi: 1, x: { op: "htf", x: { op: "zscore", n: 20, x: { op: "series", name: "close" } } } },
];

export async function acceptedLayers(style: StyleKey) {
  const rows = await db.select().from(forgeLayers).where(and(eq(forgeLayers.style, style), eq(forgeLayers.status, "accepted"))).orderBy(forgeLayers.createdAt);
  return rows.map(r => ({ id: r.id, node: r.dsl as Node, text: r.text, niche: r.niche, score: r.score }));
}

async function layerTrials(style: StyleKey) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(forgeLayers).where(eq(forgeLayers.style, style));
  return r?.n ?? 0;
}

/** Best program per niche (accepted or not): the parents the next proposals start from. */
async function elites(style: StyleKey) {
  const rows = await db.select().from(forgeLayers).where(eq(forgeLayers.style, style)).orderBy(desc(forgeLayers.score));
  const best = new Map<string, typeof rows[number]>();
  for (const r of rows) if (!best.has(r.niche)) best.set(r.niche, r);
  return Array.from(best.values());
}

/** Test one program on this style's training data and record it (accepted or rejected). */
export async function judgeAndRecord(node: Node, style: StyleKey, envs: EnvData[], author: { type: "forge" | "user"; id: string | null }, seed: number) {
  const text = printLayer(node);
  const [dupe] = await db.select().from(forgeLayers).where(and(eq(forgeLayers.style, style), eq(forgeLayers.text, text)));
  if (dupe) return { duplicate: true as const, row: dupe };
  const trials = (await layerTrials(style)) + 1;
  // Novelty is judged against the TDCI layers and every layer already accepted
  const accepted = await acceptedLayers(style);
  const existing = envs.map(d => { const inp = layerInputFor(d); return accepted.map(a => { try { return evaluateLayer(a.node, inp).values; } catch { return new Float64Array(d.candles.length); } }); });
  let res: AcceptanceResult;
  try { res = testLayer(node, envs, trials, existing, seed); }
  catch (e: any) {
    res = { accepted: false, reasons: [e.message], ic: 0, tStat: 0, tNeeded: 0, maxCorrelation: 0, nodes: 0, score: -99, noLookahead: true, trainRows: 0 };
  }
  const [row] = await db.insert(forgeLayers).values({
    authorType: author.type, authorId: author.id, style, dsl: node as any, text, niche: nicheOf(node).key,
    status: res.accepted ? "accepted" : "rejected", score: res.score, stats: res as any, novelty: 1 - res.maxCorrelation,
  }).onConflictDoNothing().returning();
  return { duplicate: false as const, row, result: res };
}

const FORGE_SYSTEM = `You invent technical-analysis layers for a trading model, written in a small JSON language.
${GRAMMAR}
Return ONLY {"layer": <tree>} — one new program. Improve on the parents you are shown: change their structure, windows or combination; do not copy them. Aim for something different from existing layers.`;

async function propose(parents: { node: Node; stats: any; niche: string }[], useAi: boolean, settings: any, r: ReturnType<typeof rng>): Promise<{ node: Node; via: "ai" | "mutation" | "random" }> {
  if (useAi && settings?.selectedAiProvider) {
    const prompt = `Parents (with their training-data results):\n${parents.map((p, i) => `${i + 1}. [${p.niche}] ${printLayer(p.node)}  |t|=${Math.abs(p.stats?.tStat ?? 0).toFixed(2)} maxCorr=${(p.stats?.maxCorrelation ?? 0).toFixed(2)} nodes=${p.stats?.nodes ?? "?"}`).join("\n")}\n\nWrite one new layer.`;
    const out = await callAiProviderJson(settings.selectedAiProvider, settings, FORGE_SYSTEM, prompt, 1200).catch(() => null);
    const v = validateLayer(out?.layer);
    if (v.ok) return { node: v.node, via: "ai" };
  }
  if (parents.length && r.next() < 0.8) return { node: mutateLayer(r.choice(parents).node, r), via: "mutation" };
  return { node: randomLayer(r), via: "random" };
}

/** One Forge job: `steps` proposals for a style. Returns what was tested and accepted. */
export async function runForge(style: StyleKey, steps: number, userId: string | null, useAi: boolean) {
  const envs: EnvData[] = [];
  for (const s of FORGE_SYMBOLS) envs.push(await getEnvData(s, style));
  const settings = userId ? await storage.getUserSettings(userId) : null;
  const r = rng(hashSeed(`${style}:${Date.now()}`));
  // Make sure the hand-written seeds have been judged once
  for (const s of SEEDS) await judgeAndRecord(s, style, envs, { type: "forge", id: null }, 1);
  const summary = { tested: 0, accepted: 0, viaAi: 0, duplicates: 0, acceptedLayers: [] as string[] };
  for (let k = 0; k < steps; k++) {
    const el = await elites(style);
    // Parents from different niches (2–4), so the search spreads instead of piling onto one idea
    const parents = r.shuffle([...el]).slice(0, Math.min(el.length, r.int(2, 5))).map(e => ({ node: e.dsl as Node, stats: e.stats, niche: e.niche }));
    const p = await propose(parents, useAi, settings, r);
    if (p.via === "ai") summary.viaAi++;
    const res = await judgeAndRecord(p.node, style, envs, { type: "forge", id: userId }, k + 2);
    if (res.duplicate) { summary.duplicates++; continue; }
    summary.tested++;
    if (res.result?.accepted) { summary.accepted++; summary.acceptedLayers.push(printLayer(p.node)); }
  }
  console.log(`[forge] ${style}: tested ${summary.tested}, accepted ${summary.accepted} (${summary.viaAi} AI proposals)`);
  return summary;
}

export async function forgeArchive(style: StyleKey) {
  const rows = await db.select().from(forgeLayers).where(eq(forgeLayers.style, style)).orderBy(desc(forgeLayers.createdAt)).limit(200);
  const trials = await layerTrials(style);
  return {
    style, layerTrials: trials,
    accepted: rows.filter(r => r.status === "accepted").map(r => ({ id: r.id, text: r.text, niche: r.niche, score: r.score, stats: r.stats, authorType: r.authorType, createdAt: r.createdAt })),
    recent: rows.slice(0, 40).map(r => ({ id: r.id, text: r.text, niche: r.niche, status: r.status, score: r.score, reasons: (r.stats as any)?.reasons ?? [], authorType: r.authorType })),
  };
}

export async function startForgeWorker() {
  const boss = await getBoss();
  await boss.work<{ style: StyleKey; steps: number; userId: string | null; useAi: boolean }>(QUEUES.labForgeGenerate, { batchSize: 1 }, async ([job]) => {
    return runForge(job.data.style, Math.min(200, job.data.steps), job.data.userId, job.data.useAi);
  });
}

export async function enqueueForge(style: StyleKey, steps: number, userId: string | null, useAi: boolean) {
  const boss = await getBoss();
  return boss.send(QUEUES.labForgeGenerate, { style, steps, userId, useAi });
}

export { PROFILES };
