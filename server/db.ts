import "./env";
import pg from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local / .env (e.g. from `neon deploy`) or the host's environment.");
}

// Transport:
// - "tcp" (default): node-postgres over port 5432. Best for a long-running server.
// - "websocket": Neon's serverless driver over port 443, for networks that block
//   5432 (some ISPs, hotspots, office firewalls). Same pool API, so sessions and
//   Drizzle work unchanged.
const transport = process.env.DATABASE_TRANSPORT === "websocket" ? "websocket" : "tcp";

const poolOptions = {
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

let pool: pg.Pool;
let db: ReturnType<typeof drizzlePg<typeof schema>>;

if (transport === "websocket") {
  neonConfig.webSocketConstructor = ws;
  const neonPool = new NeonPool(poolOptions);
  pool = neonPool as unknown as pg.Pool;
  db = drizzleNeon(neonPool, { schema }) as unknown as typeof db;
  console.log("[db] Using Neon WebSocket transport (port 443)");
} else {
  // SSL comes from the URL (`sslmode=require` on Neon), certificate verification on
  pool = new pg.Pool(poolOptions);
  db = drizzlePg(pool, { schema });
}

pool.on("error", (err: Error) => console.error("[db] Idle client error:", err.message));

export { pool, db };
