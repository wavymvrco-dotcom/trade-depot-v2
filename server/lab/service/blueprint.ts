// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Blueprint AI (§10.4, the Eureka loop). Plain English → a validated Blueprint,
// using the user's own AI provider key. Model output is data only: it is
// parsed as JSON and validated with zod; nothing it returns is executed
// (invariant 7). The user must confirm the plain-English read-back before any
// run, and after a run may pick one of up to three suggested refinements.

import { callAiProviderJson } from "../../ai-engine";
import { storage } from "../../storage";
import { BLUEPRINT_JSON_SCHEMA, blueprintSpecSchema, describeBlueprint, acceptAiSpec, type BlueprintSpecInput } from "@shared/lab-schemas";
import { LabError } from "./runs";

const SYSTEM = `You convert a trader's description of a strategy into a Trade Depot Blueprint.
Output ONLY one JSON object of the form {"spec": <Blueprint>, "notes": [<string>, ...]}.
"spec" must match this JSON Schema exactly — no extra fields, no fields with other names:
${JSON.stringify(BLUEPRINT_JSON_SCHEMA)}
Rules:
- Use only values the schema allows. If the trader asks for something the schema cannot express, do not invent a field: put a short plain sentence about it in "notes".
- If something is not stated, choose the sensible default: objective {totalR:1, drawdownPenalty:0.5, consistencyPenalty:0.5}, risk {riskPercentPerTrade:1, maxOpenPositions:3}, no constraints, style swing, symbols ["EURUSD","GBPUSD","USDJPY"].
- Include "prop" only if the trader mentions a prop-firm challenge, and copy their numbers; never assume a real firm's rules.
- Never promise results.`;

// LLM calls are capped per user (cost control) — they use the user's own key
const calls = new Map<string, number[]>();
function spendCall(userId: string, max = 12) {
  const now = Date.now(), recent = (calls.get(userId) ?? []).filter(t => now - t < 3_600_000);
  if (recent.length >= max) throw new LabError("You've reached the hourly limit for Blueprint AI requests. Try again later or use the form.", 429);
  recent.push(now); calls.set(userId, recent);
}

async function providerFor(userId: string) {
  const settings = await storage.getUserSettings(userId);
  const provider = settings?.selectedAiProvider;
  if (!provider) throw new LabError("Connect an AI provider in Settings to describe strategies in plain English, or use the form.", 409);
  return { provider, settings: settings as Record<string, any> };
}

/** Plain English → validated spec. One retry with the validation error, then the form. */
export async function parseBlueprint(userId: string, prompt: string) {
  const { provider, settings } = await providerFor(userId);
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    spendCall(userId);
    const ask = attempt === 0
      ? `Trader's description:\n"""${prompt}"""`
      : `Trader's description:\n"""${prompt}"""\n\nYour previous answer was invalid: ${lastError}\nReturn a corrected JSON object.`;
    const out = await callAiProviderJson(provider, settings, SYSTEM, ask).catch((e: any) => { lastError = e.message; return null; });
    const a = acceptAiSpec(out);
    if (a.ok) return { spec: a.spec, notes: a.notes, summary: describeBlueprint(a.spec), provider };
    lastError = out == null && lastError ? lastError : a.error;
  }
  throw new LabError(`The AI couldn't turn that into a valid Blueprint (${lastError}). Please use the form.`, 422);
}

const REFLECT_SYSTEM = `You review a trading strategy test result and suggest small changes to the trader's Blueprint.
Output ONLY {"refinements": [{"patch": <partial Blueprint>, "reason": <one sentence>}]} with at most 3 items.
Each patch may only change fields that exist in this JSON Schema, using allowed values:
${JSON.stringify(BLUEPRINT_JSON_SCHEMA)}
Base reasons only on the result summary you are given. Never promise that a change will make the strategy profitable.`;

function merge(spec: BlueprintSpecInput, patch: any): unknown {
  const out: any = { ...spec };
  for (const k of ["objective", "constraints", "risk", "prop"] as const) if (patch?.[k] && typeof patch[k] === "object") out[k] = { ...(spec as any)[k], ...patch[k] };
  for (const k of ["style", "symbols"] as const) if (patch?.[k] !== undefined) out[k] = patch[k];
  return out;
}

/** After a run: up to three validated refinements (Eureka's iterate step). Sends a summary only, never raw data. */
export async function reflectOnRun(userId: string, spec: BlueprintSpecInput, result: any) {
  const { provider, settings } = await providerFor(userId);
  spendCall(userId);
  const v = result?.vault;
  const summary = {
    grade: result?.grade, failureReasons: result?.failureReasons, trialsTried: result?.trials, curriculumLevelReached: result?.levelReached,
    validationTrades: result?.champion?.validation?.trades ?? 0,
    vault: v ? { trades: v.base.trades, totalR: v.base.totalR, profitFactor: v.base.profitFactor, maxDrawdownR: v.base.maxDD, doubleCostTotalR: v.doubleCost.totalR, luckAdjustedConfidence: v.luck.dsr, defaultTdciTotalR: v.baseline.totalR, perPair: v.perPair.map((p: any) => ({ symbol: p.symbol, trades: p.trades, totalR: p.totalR })) } : null,
  };
  const out = await callAiProviderJson(provider, settings, REFLECT_SYSTEM,
    `Blueprint:\n${JSON.stringify(spec)}\n\nResult summary:\n${JSON.stringify(summary)}`);
  const items = Array.isArray(out?.refinements) ? out.refinements.slice(0, 3) : [];
  return items.flatMap((it: any) => {
    const parsed = blueprintSpecSchema.safeParse(merge(spec, it?.patch));
    if (!parsed.success || typeof it?.reason !== "string") return [];
    return [{ spec: parsed.data, reason: it.reason.slice(0, 300), summary: describeBlueprint(parsed.data) }];
  });
}
