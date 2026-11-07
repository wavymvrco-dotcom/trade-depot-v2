// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Proof of Process (§11.10). Appends hash-chained entries (one chain per run and
// per strategy), seals each UTC day into a Merkle root, optionally timestamps
// that root with OpenTimestamps (PROOF_ANCHOR=1; off by default), and builds the
// bundle a visitor's browser checks on a License Page. proof_entries is
// append-only at the database level (a trigger rejects UPDATE and DELETE).

import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../db";
import { proofEntries, proofRoots, strategyLicenses, shadowTrades } from "@shared/schema";
import { dayFile, merkleProof, merkleRoot, nextEntry, otsFile, PROOF_VERSION, VERIFIER_CORE, type ChainEntry, type ProofBundle } from "../engine/proof";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Append one entry to a subject's chain. A per-subject advisory lock keeps the
 * chain linear when two workers write at once. Pass `tx` to write inside an
 * existing transaction (the entry then commits or rolls back with it).
 */
export async function appendProof(subject: string, kind: string, payload: Record<string, unknown>, tx?: Tx): Promise<string> {
  const go = async (t: Tx) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext(${subject}))`);
    const [last] = await t.select({ seq: proofEntries.seq, hash: proofEntries.hash }).from(proofEntries).where(eq(proofEntries.subject, subject)).orderBy(desc(proofEntries.seq)).limit(1);
    const e = nextEntry(last ?? null, kind, payload, utcDay());
    await t.insert(proofEntries).values({ subject, ...e });
    return e.hash;
  };
  return tx ? go(tx) : db.transaction(go);
}

/** Proof writes never block trading or the Lab: failures are logged, not thrown. */
export function appendProofSoft(subject: string, kind: string, payload: Record<string, unknown>) {
  return appendProof(subject, kind, payload).catch(e => { console.warn(`[proof] ${subject} ${kind}: ${e.message}`); return null; });
}

/** The latest vault commitment for a run and genome (what a new strategy points to). */
export async function vaultCommitFor(runId: string, genomeHash: string) {
  const rows = await db.select().from(proofEntries).where(and(eq(proofEntries.subject, `run:${runId}`), eq(proofEntries.kind, "vault_commit"))).orderBy(desc(proofEntries.seq));
  return rows.find(r => JSON.parse(r.body).genomeHash === genomeHash)?.hash ?? null;
}

// ─── Daily seals ──────────────────────────────────────────────────────────────

/** Seal one finished day: Merkle root of all its entries in global order, then (optionally) timestamp it. */
export async function sealDay(day: string) {
  const [done] = await db.select().from(proofRoots).where(eq(proofRoots.day, day));
  if (done) return done;
  const leaves = (await db.select({ hash: proofEntries.hash }).from(proofEntries).where(eq(proofEntries.day, day)).orderBy(asc(proofEntries.id))).map(r => r.hash);
  if (!leaves.length) return null;
  const root = merkleRoot(leaves);
  const file = dayFile(day, leaves.length, root);
  const [row] = await db.insert(proofRoots).values({ day, count: leaves.length, root, file }).onConflictDoNothing().returning();
  if (row && process.env.PROOF_ANCHOR === "1") await anchorDay(row.day, file).catch(e => console.warn(`[proof] anchor ${day}: ${e.message}`));
  console.log(`[proof] sealed ${day}: ${leaves.length} entries, root ${root.slice(0, 12)}…`);
  return row;
}

/** Submit the day file's SHA-256 to an OpenTimestamps calendar and keep the (pending) .ots proof. */
async function anchorDay(day: string, file: string) {
  const digest = createHash("sha256").update(file, "utf8").digest();
  const calendar = process.env.PROOF_OTS_CALENDAR || "https://a.pool.opentimestamps.org";
  const res = await fetch(`${calendar}/digest`, {
    method: "POST", body: digest,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/vnd.opentimestamps.v1", "User-Agent": "TradeDepot-Proof/1" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`calendar answered ${res.status}`);
  const ts = Buffer.from(await res.arrayBuffer());
  await db.update(proofRoots).set({ ots: otsFile(digest, ts).toString("base64"), anchoredAt: new Date() }).where(eq(proofRoots.day, day));
}

/** Seal every unsealed day before today (10 minutes after midnight UTC, so late writes land first). */
export async function sealPendingDays() {
  const cutoff = utcDay(new Date(Date.now() - 10 * 60_000));
  const days = await db.selectDistinct({ day: proofEntries.day }).from(proofEntries).where(lt(proofEntries.day, cutoff));
  const sealed = new Set((await db.select({ day: proofRoots.day }).from(proofRoots)).map(r => r.day));
  for (const { day } of days.sort((a, b) => (a.day < b.day ? -1 : 1))) if (!sealed.has(day)) await sealDay(day);
}

export function startProofWorker() {
  const run = () => sealPendingDays().catch(e => console.warn("[proof] seal:", e.message));
  run();
  setInterval(run, 60 * 60_000);
}

// ─── What a License Page's Verify button downloads ────────────────────────────

export async function proofBundleForSlug(slug: string): Promise<ProofBundle | null> {
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(slug)) return null;
  const [lic] = await db.select().from(strategyLicenses).where(eq(strategyLicenses.publicSlug, slug));
  if (!lic) return null;
  const subjects = [`license:${lic.id}`, ...(lic.runId ? [`run:${lic.runId}`] : [])];
  const rows = await db.select().from(proofEntries).where(inArray(proofEntries.subject, subjects)).orderBy(asc(proofEntries.subject), asc(proofEntries.seq));
  const chains = subjects.map(subject => ({
    subject,
    entries: rows.filter(r => r.subject === subject).map((r): ChainEntry => ({ seq: r.seq, kind: r.kind, body: r.body, prevHash: r.prevHash, hash: r.hash, day: r.day })),
  })).filter(c => c.entries.length);
  const days = Array.from(new Set(rows.map(r => r.day)));
  const roots: ProofBundle["roots"] = {};
  const paths: ProofBundle["paths"] = {};
  if (days.length) {
    const rr = await db.select().from(proofRoots).where(inArray(proofRoots.day, days));
    for (const r of rr) {
      roots[r.day] = { root: r.root, count: r.count, file: r.file, anchored: !!r.ots };
      const leaves = (await db.select({ hash: proofEntries.hash }).from(proofEntries).where(eq(proofEntries.day, r.day)).orderBy(asc(proofEntries.id))).map(x => x.hash);
      const at = new Map(leaves.map((h, i) => [h, i]));
      for (const e of rows.filter(x => x.day === r.day)) { const i = at.get(e.hash); if (i != null) paths[e.hash] = merkleProof(leaves, i); }
    }
  }
  const closed = await db.select({ r: shadowTrades.r }).from(shadowTrades).where(and(eq(shadowTrades.licenseId, lic.id), eq(shadowTrades.status, "closed")));
  return { version: PROOF_VERSION, chains, roots, paths, claims: { shadowTrades: closed.length, shadowTotalR: closed.reduce((s, x) => s + (x.r ?? 0), 0) } };
}

export async function dayProof(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [r] = await db.select().from(proofRoots).where(eq(proofRoots.day, day));
  return r ?? null;
}

/** The script served at /proof/verify.js: wires VERIFIER_CORE to the Verify button on a License Page. */
export const VERIFIER_JS = `${VERIFIER_CORE}
(function(){var btn=document.getElementById("td-verify");if(!btn)return;var out=document.getElementById("td-verify-out");
var hex=function(b){return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,"0")}).join("")};
var sha=async function(s){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))};
btn.addEventListener("click",async function(){btn.disabled=true;out.textContent="Checking in your browser…";
try{var r=await fetch("/api/proof/l/"+encodeURIComponent(btn.dataset.slug));if(!r.ok)throw new Error("could not load the record");var b=await r.json();
var checks=await verifyBundle(b,sha);out.textContent="";var ul=document.createElement("ul");
checks.forEach(function(c){var li=document.createElement("li");li.textContent=(c.ok?"✓ ":"✗ ")+c.label+" — "+c.detail;li.style.color=c.ok?"":"#8C2F22";ul.appendChild(li)});
out.appendChild(ul);var a=document.createElement("a");a.href="/api/proof/l/"+encodeURIComponent(btn.dataset.slug);a.textContent="Download the raw record (JSON)";a.download="proof.json";out.appendChild(a)}
catch(e){out.textContent="Verification could not run: "+e.message}finally{btn.disabled=false}})})();
`;
