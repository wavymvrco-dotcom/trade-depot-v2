// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Background worker process (`node dist/worker.cjs`). Runs the trading workers
// and the durable job queue so they never sleep with the web server and heavy
// jobs never slow the website. Run the web server with RUN_WORKERS=false.

import "../env"; // must stay first: loads .env.local/.env before other modules read process.env
import { startBackgroundWorkers } from "../workers";
import { stopBoss } from "../jobs";

process.env.PROCESS_ROLE ||= "worker";

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal}: finishing active jobs, then exiting`);
  // Interrupted jobs are not lost: pg-boss retries them after they expire
  await stopBoss();
  process.exit(0);
}

async function main() {
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  await startBackgroundWorkers();
  console.log("[worker] running");
}

main().catch(e => {
  console.error("[worker] failed to start:", e);
  process.exit(1);
});
