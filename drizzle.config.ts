import fs from "fs";
import { defineConfig } from "drizzle-kit";

// Same env files the server loads (`neon deploy` writes .env.local)
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — add it to .env.local / .env");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // Schema changes should use the direct (non-pooled) endpoint when available
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  },
  tablesFilter: ["!session"],
});
