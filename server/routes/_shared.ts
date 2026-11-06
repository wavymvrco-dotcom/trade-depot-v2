// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
// Helpers shared by the route modules (moved unchanged from server/routes.ts).

import type { Request, Response, NextFunction } from "express";
import { SECRET_SETTING_FIELDS } from "../crypto";
import { z } from "zod";

/** Settings as sent to the browser: credentials replaced with has* flags. */
export function redactSettings(s: Record<string, any>) {
  const out: Record<string, any> = { ...s };
  for (const f of SECRET_SETTING_FIELDS) {
    out[`has${f[0].toUpperCase()}${f.slice(1)}`] = !!out[f];
    delete out[f];
  }
  delete out.webhookToken;
  return out;
}

/**
 * Blocks server-side requests to loopback, private and cloud-metadata
 * addresses (SSRF). Hostnames are checked as written; DNS rebinding is out of
 * scope for user-supplied SMTP/bridge hosts.
 */
export function isSafeOutboundHost(hostOrUrl: unknown): boolean {
  if (typeof hostOrUrl !== "string" || !hostOrUrl.trim()) return false;
  let host = hostOrUrl.trim();
  try { if (/^[a-z]+:\/\//i.test(host)) host = new URL(host).hostname; } catch { return false; }
  host = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata.google.internal") return false;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
  return true;
}

/** New session id on login/register to prevent session fixation. */
export function startSession(req: Request, userId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      (req.session as any).userId = userId;
      req.session.save(e => (e ? reject(e) : resolve()));
    });
  });
}

/** Authenticated user id — only valid on routes behind requireAuth. */
export function uid(req: Request): string {
  return (req.session as any).userId as string;
}

// Endpoints reachable without a session. Everything else under /api requires login.
export const PUBLIC_API = [
  /^\/api\/version$/,
  /^\/api\/auth\/(login|register|logout|forgot-password|reset-password|verify-email|me)$/,
  /^\/api\/webhook\/tradingview$/,
  /^\/api\/profile\/[^/]+$/,
  /^\/api\/market\/(prices|status)$/,
  /^\/api\/push\/vapid-public-key$/,
  /^\/api\/billing\/publishable-key$/,
];

// Simple fixed-window limiter for auth endpoints (per IP)
const authHits = new Map<string, { count: number; resetAt: number }>();
export function authRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const hit = authHits.get(key);
  if (!hit || hit.resetAt < now) { authHits.set(key, { count: 1, resetAt: now + 15 * 60_000 }); return next(); }
  if (++hit.count > 20) return res.status(429).json({ message: "Too many attempts. Try again in 15 minutes." });
  next();
}

export const SERVER_START_VERSION = Date.now().toString();
