import fs from "fs";

// Load local env files before anything reads process.env. Hosting platforms
// inject real environment variables, which always win over these files.
// `.env.local` is where `neon deploy` writes database credentials.
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch (e: any) {
      console.warn(`[env] Could not load ${file}: ${e.message}`);
    }
  }
}
