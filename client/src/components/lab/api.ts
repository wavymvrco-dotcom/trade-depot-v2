// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Client-side Strategy Lab API: types and react-query hooks.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import type { BlueprintSpecInput } from "@shared/lab-schemas";

export type Grade = "licensed" | "probation" | "scrapped";
export type Stage = "vault" | "shadow" | "live" | "retired";

export interface PeriodStats { trades: number; totalR: number; winRate: number; profitFactor: number; maxDD: number; avgR: number; equity: number[] }
export interface VaultReport {
  base: PeriodStats; doubleCost: PeriodStats; baseline: PeriodStats;
  perPair: { symbol: string; trades: number; totalR: number; profitFactor: number; maxDD: number }[];
  luck: { dsr: number; sr0: number; sharpe: number; trials: number; observations: number };
  envelope: { ddP50: number; ddP95: number; ddP99: number; meanR: number; meanP05: number; meanP95: number };
  grade: Grade; failureReasons: string[]; vaultHashes: Record<string, string>;
}
export interface LabResult {
  config: { population: number; generations: number; episodes: number; seed: number };
  splits: Record<string, { trainFrom: string; trainTo: string; validationFrom: string; validationTo: string; vaultFrom: string; vaultTo: string; embargoBars: number }>;
  trials: number; generationsRun: number; levelReached: number; cancelled: boolean; evaluations: number;
  champion: { genome: { w: number[]; threshold: number; stopIdx: number; rrIdx: number }; belt: number; validation: { trades: number; totalR: number; maxDD: number } } | null;
  vault: VaultReport | null; grade: Grade; failureReasons: string[];
  costModel?: { source: "mirror" | "assumed"; fills: number };
}
export interface Progress { phase?: string; generation: number; generations: number; level?: number; fitness?: number[]; elites?: number[]; best?: number; median?: number; deaths?: number; trials?: number; championCurve?: number[] }
export interface Run {
  id: string; blueprintId: string; style: string; symbols: string[]; status: "queued" | "running" | "done" | "failed" | "cancelled";
  config: { population: number; generations: number }; progress: Progress | null; result: LabResult | null; trials: number;
  error: string | null; createdAt: string; finishedAt: string | null; licenseId?: string | null; grade?: string | null;
}
export interface Blueprint { id: string; name: string; spec: BlueprintSpecInput; summary: string; createdAt: string; specVersion: number }
export interface ShadowCheck { key: string; label: string; ok: boolean; detail: string }
export interface License {
  id: string; name: string; style: string; symbols: string[]; grade: Grade; stage: Stage; runId: string | null; kind: string;
  layers: string[]; genome: { w: number[]; threshold: number; stopIdx: number; rrIdx: number };
  vault: VaultReport | null;
  evidence: (Record<string, any> & { kind?: "shadow" | "live"; checks?: ShadowCheck[]; verdict?: string; reasons?: string[] }) | null;
  createdAt: string; updatedAt: string; shadowStartedAt: string | null; liveSince: string | null;
  events?: { id: string; fromGrade: string | null; fromStage: string | null; toGrade: string; toStage: string; reason: string; at: string }[];
}
export interface ShadowTrade {
  id: string; symbol: string; side: "LONG" | "SHORT" | null; signalTime: string; score: number | null;
  entry: number | null; exit: number | null; exitTime: string | null; r: number | null; status: string;
  incumbentAction: "LONG" | "SHORT" | "FLAT"; incumbentR: number | null; attribution: { key: string; share: number }[] | null;
}
export interface Feasibility { ok: boolean; expectedVaultTrades: number; minimum: number; perPair: { symbol: string; expectedVaultTrades: number }[]; sigmaR: number; mde: number | null; message: string; advice: string[] }
export interface LabMe { tier: "free" | "pro"; limits: { maxPopulation: number; maxGenerations: number; runsPerMonth: number; shadowSlots: number; live: boolean }; creditsUsed: number; failureText: Record<string, string> }

/** fetch + readable error messages from the server's { message }. */
export async function lab<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data as T;
}

export const useLabMe = () => useQuery<LabMe>({ queryKey: ["/api/lab/me"], queryFn: () => lab("GET", "/api/lab/me"), staleTime: 30_000 });
export const useBlueprints = () => useQuery<Blueprint[]>({ queryKey: ["/api/lab/blueprints"], queryFn: () => lab("GET", "/api/lab/blueprints"), staleTime: 10_000 });
export const useRuns = () => useQuery<Run[]>({ queryKey: ["/api/lab/runs"], queryFn: () => lab("GET", "/api/lab/runs"), staleTime: 5_000, refetchInterval: 10_000 });
export const useRun = (id: string | null) => useQuery<Run>({
  queryKey: ["/api/lab/runs", id], enabled: !!id, queryFn: () => lab("GET", `/api/lab/runs/${id}`),
  // Poll every 2 s while it trains (§9.11)
  refetchInterval: q => (q.state.data && ["queued", "running"].includes(q.state.data.status) ? 2000 : false), staleTime: 0,
});
export const useLicenses = () => useQuery<License[]>({ queryKey: ["/api/lab/licenses"], queryFn: () => lab("GET", "/api/lab/licenses"), refetchInterval: 30_000, staleTime: 5_000 });
export const useLicense = (id: string | null) => useQuery<License>({ queryKey: ["/api/lab/licenses", id], enabled: !!id, queryFn: () => lab("GET", `/api/lab/licenses/${id}`), refetchInterval: 30_000, staleTime: 5_000 });
export const useShadowTrades = (id: string | null) => useQuery<ShadowTrade[]>({ queryKey: ["/api/lab/licenses", id, "shadow-trades"], enabled: !!id, queryFn: () => lab("GET", `/api/lab/licenses/${id}/shadow-trades`), refetchInterval: 60_000, staleTime: 10_000 });

export function useLicenseAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "shadow" | "license" | "live" | "pause" | "retire" | "close-all" }) => lab("POST", `/api/lab/licenses/${id}/${action}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/lab/licenses"] }); qc.invalidateQueries({ queryKey: ["/api/lab/me"] }); },
  });
}

/** The Lab's URL state: ?tab=…&run=…&license=… */
export function useLabNav() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const q = new URLSearchParams(search);
  const go = (tab: string, extra: Record<string, string | null> = {}) => {
    const n = new URLSearchParams(search);
    n.set("tab", tab);
    for (const [k, v] of Object.entries(extra)) (v == null ? n.delete(k) : n.set(k, v));
    setLocation(`${location}?${n.toString()}`);
  };
  return { runId: q.get("run"), licenseId: q.get("license"), go };
}

export const STOP_GRID = [1, 1.5, 2, 3];
export const RR_GRID = [1, 1.5, 2, 2.5, 3];
export const LAYER_LABELS: Record<string, string> = {
  trend: "HTF trend", momentum: "momentum", structure: "market structure", liquidity: "liquidity sweep", value: "premium/discount",
  fibonacci: "Fibonacci OTE", positioning: "COT positioning", carry: "carry", adx: "ADX", prevDay: "prior-day levels",
  pivots: "floor pivots", sessionRange: "Asian range", sessionMean: "session mean",
};
export const BELTS = ["None", "Level 1 · calm markets", "Level 2 · trending markets", "Level 3 · all markets"];
export const fmtR = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}R`);
