// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Durable job queue (pg-boss on Postgres). Jobs survive restarts: anything sent
// while no worker is running waits in the database, and a job whose worker died
// mid-run is retried after it expires.

import { PgBoss } from "pg-boss";

export const QUEUES = {
  tdciCalibrate: "tdci.calibrate",
  labTrain: "lab.train",
  labShadowTick: "lab.shadow.tick",
  labTripwireTick: "lab.tripwire.tick",
  labMirrorFit: "lab.mirror.fit",
  labForgeGenerate: "lab.forge.generate",
  labEnvBuild: "lab.env.build",
} as const;

/** Per-queue retry/expiry policy. Calibrations pull months of rate-limited data, so allow them time. */
const QUEUE_OPTIONS: Record<string, { expireInSeconds: number; retryLimit: number; retryDelay: number }> = {
  [QUEUES.tdciCalibrate]: { expireInSeconds: 45 * 60, retryLimit: 2, retryDelay: 60 },
};
const DEFAULT_OPTIONS = { expireInSeconds: 30 * 60, retryLimit: 2, retryDelay: 30 };

let bossPromise: Promise<PgBoss> | null = null;

/**
 * The shared queue client. pg-boss holds long-lived connections and uses
 * advisory locks, so it uses Neon's direct (unpooled) endpoint when available.
 */
export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    bossPromise = (async () => {
      const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is not set");
      const boss = new PgBoss({ connectionString, max: 4, instanceName: process.env.PROCESS_ROLE || "app" });
      boss.on("error", (e: any) => console.error("[jobs]", e?.message ?? e));
      await boss.start();
      for (const name of Object.values(QUEUES)) {
        await boss.createQueue(name, QUEUE_OPTIONS[name] ?? DEFAULT_OPTIONS).catch((e: any) => {
          if (!/exists/i.test(String(e?.message))) throw e;
        });
      }
      return boss;
    })().catch(e => { bossPromise = null; throw e; });
  }
  return bossPromise;
}

export async function stopBoss() {
  if (!bossPromise) return;
  const boss = await bossPromise.catch(() => null);
  bossPromise = null;
  await boss?.stop({ graceful: true, timeout: 20_000 }).catch(() => {});
}
