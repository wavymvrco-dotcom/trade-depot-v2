import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local / .env (e.g. from `neon deploy`) or the host's environment.");
}

// node-postgres suits this long-running server: it keeps a pool of TCP
// connections. Use Neon's pooled connection string (host contains "-pooler").
// SSL comes from the URL (`sslmode=require` on Neon), with certificate
// verification left on.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => console.error("[db] Idle client error:", err.message));

export const db = drizzle(pool, { schema });
