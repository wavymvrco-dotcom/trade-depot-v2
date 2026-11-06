// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Every background worker in one place. They run either inside the web server
// (RUN_WORKERS unset or "true": local dev, single process) or in the separate
// worker process (server/lab/worker.ts) with RUN_WORKERS=false on the web server.

import { startAutoTradeWorker, startAlertWatcher, startSignalOutcomeWatcher } from "./autotrade";
import { startPushDigest } from "./push";
import { startCalibrationWorker } from "./tdci-service";

export function workersEnabledInWeb(): boolean {
  return (process.env.RUN_WORKERS ?? "true").toLowerCase() !== "false";
}

export async function startBackgroundWorkers() {
  startAutoTradeWorker();
  startAlertWatcher();
  startSignalOutcomeWatcher();
  startPushDigest();
  await startCalibrationWorker();
  console.log("[workers] background workers started (auto-trade, alerts, signal outcomes, push digest, job queue)");
}
