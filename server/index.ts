import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startAutoTradeWorker, startAlertWatcher, startSignalOutcomeWatcher } from "./autotrade";
import { setupWebSocket } from "./ws";
import { seedExpertKnowledge, seedInstitutionalKnowledge } from "./ai-knowledge";
import { startPushDigest } from "./push";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const PgSession = connectPgSimple(session);
const isProduction = process.env.NODE_ENV === "production";
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production — refusing to start with a default secret.");
}

// Behind a hosting proxy (Railway/Render/Fly) so secure cookies work over HTTPS
if (isProduction) app.set("trust proxy", 1);

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || "dev-only-insecure-secret",
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    pool: pgPool,
    tableName: "session",
    createTableIfMissing: true,
  }),
  cookie: { secure: isProduction, httpOnly: true, sameSite: "lax", maxAge: 86400000 * 30 },
}));

app.use(
  express.json({
    limit: "200kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// Request log: method, path, status, timing only — response bodies can contain
// account data and must never be written to logs
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    if (path.startsWith("/api")) log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
  });
  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  setupWebSocket(httpServer);
  seedExpertKnowledge().catch(() => {});
  seedInstitutionalKnowledge().catch(() => {});
  startAutoTradeWorker();
  startAlertWatcher();
  startSignalOutcomeWatcher();
  startPushDigest();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status < 500 ? (err.message || "Bad request") : "Internal Server Error";
    console.error("[Error]", err);
    if (!res.headersSent) res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    { port, host: "0.0.0.0", reusePort: true },
    () => { log(`serving on port ${port}`); },
  );
})();
