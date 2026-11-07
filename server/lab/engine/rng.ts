// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Seeded randomness. Every stochastic step in the Lab draws from one of these,
// so the same seed + data + config always gives the same result (invariant 10).

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  int(lo: number, hiExclusive: number): number;
  uniform(lo: number, hi: number): number;
  normal(mean?: number, sd?: number): number;
  choice<T>(xs: readonly T[]): T;
  shuffle<T>(xs: T[]): T[];
  /** An independent stream derived from this one (for per-episode/per-agent use). */
  fork(): Rng;
}

/** mulberry32: small, fast, good enough for simulation; fully deterministic. */
export function rng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9;
  let spare: number | null = null;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const self: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo)),
    uniform: (lo, hi) => lo + next() * (hi - lo),
    normal(mean = 0, sd = 1) {
      if (spare != null) { const z = spare; spare = null; return mean + sd * z; }
      let u = 0, v = 0, s = 0;
      do { u = next() * 2 - 1; v = next() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      spare = v * m;
      return mean + sd * u * m;
    },
    choice: xs => xs[Math.floor(next() * xs.length)],
    shuffle(xs) {
      for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
      return xs;
    },
    fork: () => rng(Math.floor(next() * 4294967296)),
  };
  return self;
}

/** Stable 32-bit hash of a string (FNV-1a), for deriving seeds from names. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
