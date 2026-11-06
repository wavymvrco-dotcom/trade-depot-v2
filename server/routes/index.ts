// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Route registration. Each group lives in its own module; order matches the original single file.

import type { Express } from "express";
import type { Server } from "http";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { PUBLIC_API, authRateLimit, SERVER_START_VERSION } from "./_shared";
import { register as authRoutes } from "./auth";
import { register as billingRoutes } from "./billing";
import { register as adminRoutes } from "./admin";
import { register as marketRoutes } from "./market";
import { register as tdciRoutes } from "./tdci";
import { register as tradingRoutes } from "./trading";
import { register as settingsRoutes } from "./settings";
import { register as alertsRoutes } from "./alerts";
import { register as marketplaceRoutes } from "./marketplace";
import { register as journalRoutes } from "./journal";
import { register as aiRoutes } from "./ai";
import { register as labRoutes } from "./lab";

export { isSafeOutboundHost } from "./_shared";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password"], authRateLimit);

  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split("?")[0];
    if (PUBLIC_API.some(re => re.test(path))) return next();
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(userId).catch(() => undefined);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (user.isBanned) return res.status(403).json({ message: `Account suspended${user.banReason ? `: ${user.banReason}` : ""}` });
    next();
  });

  // Version endpoint — clients poll this to detect new deployments
  app.get("/api/version", (_req, res) => {
    res.json({ version: SERVER_START_VERSION });
  });


  authRoutes(app);
  billingRoutes(app);
  adminRoutes(app);
  marketRoutes(app);
  tdciRoutes(app);
  tradingRoutes(app);
  settingsRoutes(app);
  alertsRoutes(app);
  marketplaceRoutes(app);
  journalRoutes(app);
  aiRoutes(app);
  labRoutes(app);

  return httpServer;
}
