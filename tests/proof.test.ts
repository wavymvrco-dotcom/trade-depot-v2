// Proof of Process (§11.10): chains, Merkle seals, and the browser verifier run in Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { canonical, dayFile, merkleProof, merkleRoot, nextEntry, otsFile, verifyChain, verifyMerkle, VERIFIER_CORE, type ChainEntry, type ProofBundle } from "../server/lab/engine/proof";

const webSha = async (s: string) => Buffer.from(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex");
const verifyBundle: (b: ProofBundle, sha: (s: string) => Promise<string>) => Promise<{ label: string; ok: boolean; detail: string }[]> =
  new Function(`${VERIFIER_CORE}; return verifyBundle;`)();

function chain(subject: string, items: [string, Record<string, unknown>][], day = "2026-11-06") {
  const out: ChainEntry[] = [];
  for (const [k, p] of items) out.push(nextEntry(out[out.length - 1] ?? null, k, p, day));
  return { subject, entries: out };
}

function bundle(opts: { tamper?: boolean; outcomeFirst?: boolean; claimR?: number } = {}): ProofBundle {
  const run = chain("run:r1", [["vault_commit", { runId: "r1", genomeHash: "g1", vaultHash: "v1", at: "t" }]]);
  const vc = run.entries[0].hash;
  const items: [string, Record<string, unknown>][] = [
    ["born", { licenseId: "L", runId: "r1", genomeHash: "g1", vaultCommit: vc, to: "probation/shadow", reason: "x", at: "t" }],
    ["decision", { symbol: "EURUSD", signalTime: "2026-11-06 10:00:00", side: "LONG", incumbentAction: "FLAT", decidedAt: "t" }],
    ["outcome", { symbol: "EURUSD", signalTime: "2026-11-06 10:00:00", side: "LONG", status: "closed", exitTime: "e", r: 1.5, incumbentR: null }],
    ["decision", { symbol: "GBPUSD", signalTime: "2026-11-06 11:00:00", side: "SHORT", incumbentAction: "SHORT", decidedAt: "t" }],
    ["outcome", { symbol: "GBPUSD", signalTime: "2026-11-06 11:00:00", side: "SHORT", status: "closed", exitTime: "e", r: -1, incumbentR: -1 }],
  ];
  if (opts.outcomeFirst) [items[1], items[2]] = [items[2], items[1]];
  const lic = chain("license:L", items);
  if (opts.tamper) lic.entries[2] = { ...lic.entries[2], body: lic.entries[2].body.replace("1.5", "2.5") };
  const leaves = [...run.entries, ...lic.entries].map(e => e.hash);
  const root = merkleRoot(leaves);
  const paths: ProofBundle["paths"] = {};
  leaves.forEach((h, i) => (paths[h] = merkleProof(leaves, i)));
  return { version: 1, chains: [lic, run], roots: { "2026-11-06": { root, count: leaves.length, file: dayFile("2026-11-06", leaves.length, root), anchored: false } }, paths, claims: { shadowTrades: 2, shadowTotalR: opts.claimR ?? 0.5 } };
}

test("canonical JSON sorts keys at every level and drops undefined", () => {
  assert.equal(canonical({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } }), `{"a":{"d":[1,{"y":2,"z":1}]},"b":1}`);
  assert.throws(() => canonical({ x: NaN }));
});

test("a chain verifies, and any edit, reorder or removal breaks it", () => {
  const c = bundle().chains[0].entries;
  assert.equal(verifyChain(c).ok, true);
  const edited = c.map((e, i) => (i === 2 ? { ...e, body: e.body.replace("1.5", "2.5") } : e));
  assert.equal(verifyChain(edited).badSeq, 3);
  assert.equal(verifyChain([c[0], ...c.slice(2)]).ok, false);
  // Re-hashing the edited entry doesn't help: the next entry no longer links to it
  const { kind: _k, ...p } = JSON.parse(c[2].body);
  const rehashed = nextEntry(c[1], "outcome", { ...p, r: 2.5 }, c[2].day);
  assert.equal(verifyChain([c[0], c[1], rehashed, ...c.slice(3)]).badSeq, 4);
});

test("Merkle paths prove membership for every leaf, for odd and even counts", () => {
  for (const n of [1, 2, 3, 5, 8, 13]) {
    const leaves = Array.from({ length: n }, (_, i) => canonical(i).padStart(64, "a"));
    const root = merkleRoot(leaves);
    leaves.forEach((l, i) => assert.equal(verifyMerkle(l, merkleProof(leaves, i), root), true));
    assert.equal(verifyMerkle("f".repeat(64), merkleProof(leaves, 0), root), false);
  }
});

test("the browser verifier passes an honest record", async () => {
  const checks = await verifyBundle(bundle(), webSha);
  assert.ok(checks.every(c => c.ok), JSON.stringify(checks, null, 1));
  assert.ok(checks.some(c => /Frozen before the Vault/.test(c.label)));
});

test("the browser verifier catches tampering, outcomes before decisions and inflated numbers", async () => {
  const t = await verifyBundle(bundle({ tamper: true }), webSha);
  assert.equal(t.find(c => /Strategy record chain/.test(c.label))!.ok, false);
  const o = await verifyBundle(bundle({ outcomeFirst: true }), webSha);
  assert.equal(o.find(c => /before outcomes/.test(c.label))!.ok, false);
  const n = await verifyBundle(bundle({ claimR: 3 }), webSha);
  assert.equal(n.find(c => /numbers match/.test(c.label))!.ok, false);
});

test("an .ots file starts with the OpenTimestamps header and the SHA-256 file digest", () => {
  const d = Buffer.alloc(32, 7);
  const f = otsFile(d, Buffer.from([0xf0]));
  assert.equal(f.subarray(1, 15).toString("latin1"), "OpenTimestamps");
  assert.equal(f[31], 0x01); assert.equal(f[32], 0x08);
  assert.deepEqual(f.subarray(33, 65), d);
});
