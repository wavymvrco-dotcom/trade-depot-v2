// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import bcrypt from "bcrypt";

export const BCRYPT_ROUNDS = 12;

/** True when the stored value is a bcrypt hash ($2a$, $2b$ or $2y$). */
export function isBcryptHash(stored: string | null | undefined): boolean {
  return typeof stored === "string" && /^\$2[aby]\$\d{2}\$/.test(stored);
}

/**
 * Check a login password. Only bcrypt hashes are accepted: a stored value that
 * is not a hash (e.g. a legacy plain-text password) never matches, so there is
 * no plain-text comparison path anywhere in login.
 */
export async function verifyPassword(given: unknown, stored: string | null | undefined): Promise<boolean> {
  if (typeof given !== "string" || !given || !isBcryptHash(stored)) return false;
  return bcrypt.compare(given, stored as string);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
