// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Proof of Process (§11.10), pure part. Records are written as canonical JSON
// and hash-chained per subject (a run, or a strategy): each entry's hash covers
// the previous hash, so changing or removing any past entry breaks every hash
// after it. Each UTC day's entry hashes are folded into one Merkle root, which
// can be timestamped publicly (OpenTimestamps). VERIFIER_JS is the same check,
// written to run in a visitor's browser with nothing but Web Crypto.

import { createHash } from "node:crypto";

export const GENESIS = "0".repeat(64);
export const PROOF_VERSION = 1;

/** JSON with keys sorted at every level and no whitespace; undefined keys dropped. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") {
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error("Proof records cannot hold NaN or Infinity");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Hash of one entry: covers the previous entry's hash and this entry's canonical body. */
export const entryHash = (prevHash: string, body: string) => sha256(`${prevHash}\n${body}`);

export interface ChainEntry { seq: number; kind: string; body: string; prevHash: string; hash: string; day: string }

/** Next entry for a chain whose last entry is `last` (or none). */
export function nextEntry(last: { seq: number; hash: string } | null, kind: string, payload: unknown, day: string): Omit<ChainEntry, never> {
  const body = canonical({ kind, ...(payload as object) });
  const prevHash = last?.hash ?? GENESIS;
  return { seq: (last?.seq ?? 0) + 1, kind, body, prevHash, hash: entryHash(prevHash, body), day };
}

/** Whole-chain check: sequence, links and hashes. Returns the first broken seq, if any. */
export function verifyChain(entries: ChainEntry[]): { ok: boolean; badSeq: number | null; reason: string | null } {
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i + 1) return { ok: false, badSeq: e.seq, reason: "an entry is missing" };
    if (e.prevHash !== prev) return { ok: false, badSeq: e.seq, reason: "does not link to the entry before it" };
    if (canonical(JSON.parse(e.body)) !== e.body) return { ok: false, badSeq: e.seq, reason: "is not in canonical form" };
    if (entryHash(e.prevHash, e.body) !== e.hash) return { ok: false, badSeq: e.seq, reason: "hash does not match its contents" };
    prev = e.hash;
  }
  return { ok: true, badSeq: null, reason: null };
}

// ─── Merkle tree over one day's entry hashes ──────────────────────────────────

const node = (l: string, r: string) => sha256(`N${l}${r}`);
const EMPTY_ROOT = sha256("");

/** Root of a list of hex leaves (an odd last node is paired with itself). */
export function merkleRoot(leaves: string[]): string {
  if (!leaves.length) return EMPTY_ROOT;
  let level = leaves.slice();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(node(level[i], level[i + 1] ?? level[i]));
    level = next;
  }
  return level[0];
}

export type MerkleStep = { h: string; left: boolean };

/** Path from leaf `index` to the root: each sibling, and whether it sits on the left. */
export function merkleProof(leaves: string[], index: number): MerkleStep[] {
  const path: MerkleStep[] = [];
  let level = leaves.slice(), i = index;
  while (level.length > 1) {
    const sib = i % 2 === 0 ? (level[i + 1] ?? level[i]) : level[i - 1];
    path.push({ h: sib, left: i % 2 === 1 });
    const next: string[] = [];
    for (let k = 0; k < level.length; k += 2) next.push(node(level[k], level[k + 1] ?? level[k]));
    level = next; i = Math.floor(i / 2);
  }
  return path;
}

export function verifyMerkle(leaf: string, path: MerkleStep[], root: string) {
  let h = leaf;
  for (const s of path) h = s.left ? node(s.h, h) : node(h, s.h);
  return h === root;
}

/** The small text file whose SHA-256 is timestamped for a day. */
export function dayFile(day: string, count: number, root: string) {
  return `trade-depot-proof v${PROOF_VERSION}\nday: ${day}\nentries: ${count}\nroot: ${root}\n`;
}

/** Detached OpenTimestamps file: header, version 1, SHA-256 op, the file digest, then the calendar's timestamp. */
export function otsFile(fileDigest: Buffer, calendarTimestamp: Buffer) {
  const magic = Buffer.from("004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294", "hex");
  return Buffer.concat([magic, Buffer.from([0x01, 0x08]), fileDigest, calendarTimestamp]);
}

// ─── What a visitor's browser checks ──────────────────────────────────────────

export interface ProofBundle {
  version: number;
  chains: { subject: string; entries: ChainEntry[] }[];
  roots: Record<string, { root: string; count: number; file: string; anchored: boolean }>;
  paths: Record<string, MerkleStep[]>;   // entry hash → Merkle path to its day's root
  claims: { shadowTrades: number; shadowTotalR: number };
}

/**
 * The browser verifier. `verifyBundle(bundle, sha)` takes a SHA-256 function
 * returning hex (Web Crypto in the browser) and returns a list of checks.
 * Kept as plain JavaScript so it can be served as-is and tested in Node.
 */
export const VERIFIER_CORE = String.raw`
function tdCanonical(v){if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return "["+v.map(tdCanonical).join(",")+"]";return "{"+Object.keys(v).sort().filter(function(k){return v[k]!==undefined}).map(function(k){return JSON.stringify(k)+":"+tdCanonical(v[k])}).join(",")+"}"}
async function verifyBundle(b,sha){
  var checks=[];var GEN="0000000000000000000000000000000000000000000000000000000000000000";
  var node=function(l,r){return sha("N"+l+r)};
  var all=[];var chainsOk=true;
  for(var c of b.chains){var prev=GEN;var bad=null;
    for(var i=0;i<c.entries.length;i++){var e=c.entries[i];
      if(e.seq!==i+1){bad="entry "+(i+1)+" is missing";break}
      if(e.prevHash!==prev){bad="entry "+e.seq+" does not link to the one before it";break}
      if(tdCanonical(JSON.parse(e.body))!==e.body){bad="entry "+e.seq+" is not in canonical form";break}
      if(await sha(e.prevHash+"\n"+e.body)!==e.hash){bad="entry "+e.seq+" does not match its hash";break}
      prev=e.hash;all.push({subject:c.subject,e:e,p:JSON.parse(e.body)})}
    if(bad)chainsOk=false;
    checks.push({label:(c.subject.indexOf("run:")===0?"Vault commitment chain":"Strategy record chain")+" ("+c.entries.length+" entries)",ok:!bad,detail:bad||"every entry links to the one before it and matches its hash"})}
  var lic=all.filter(function(x){return x.subject.indexOf("license:")===0});
  var runHashes={};all.filter(function(x){return x.subject.indexOf("run:")===0&&x.p.kind==="vault_commit"}).forEach(function(x){runHashes[x.e.hash]=x.p});
  var born=lic.find(function(x){return x.p.kind==="born"});
  if(born){var vc=runHashes[born.p.vaultCommit];checks.push({label:"Frozen before the Vault opened",ok:!!vc&&vc.genomeHash===born.p.genomeHash,detail:vc&&vc.genomeHash===born.p.genomeHash?"the strategy's fingerprint was committed before its Vault Exam ran":"no matching commitment was found"})}
  var seen={};var order=true;var dec=0;
  for(var x of lic){var k=x.p.symbol+"|"+x.p.signalTime;
    if(x.p.kind==="decision"){seen[k]=true;dec++}
    if(x.p.kind==="outcome"&&!seen[k])order=false}
  checks.push({label:"Decisions recorded before outcomes",ok:order,detail:order?dec+" Shadow Run decisions, each written before its result was known":"an outcome has no earlier decision"});
  var outs=lic.filter(function(x){return x.p.kind==="outcome"&&x.p.status==="closed"});
  var tot=outs.reduce(function(s,x){return s+(x.p.r||0)},0);
  var match=outs.length===b.claims.shadowTrades&&Math.abs(tot-b.claims.shadowTotalR)<1e-6;
  checks.push({label:"Shadow Run numbers match the record",ok:match,detail:outs.length+" closed trades, "+(tot>=0?"+":"")+tot.toFixed(2)+"R in the record; the page shows "+b.claims.shadowTrades+" and "+(b.claims.shadowTotalR>=0?"+":"")+b.claims.shadowTotalR.toFixed(2)+"R"});
  var sealed=0,pending=0,badRoot=0;
  for(var y of all){var r=b.roots[y.e.day];if(!r){pending++;continue}
    var h=y.e.hash;for(var s of (b.paths[y.e.hash]||[]))h=s.left?await node(s.h,h):await node(h,s.h);
    if(h===r.root&&r.file.indexOf("root: "+r.root)>=0)sealed++;else badRoot++}
  checks.push({label:"Included in the daily seals",ok:badRoot===0,detail:sealed+" entries are in a sealed daily root"+(pending?", "+pending+" from today are waiting for tonight's seal":"")+(badRoot?", "+badRoot+" are NOT in their day's root":"")});
  var anchored=Object.keys(b.roots).filter(function(d){return b.roots[d].anchored});
  checks.push({label:"Public timestamps",ok:true,detail:anchored.length?anchored.length+" daily seals are timestamped with OpenTimestamps (download the .ots files to check them independently)":"daily seals are not publicly timestamped yet"});
  return checks}
`;
