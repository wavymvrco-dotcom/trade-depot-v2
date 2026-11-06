// Copyright © 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import bcrypt from "bcrypt";
import { isBcryptHash, verifyPassword } from "../server/password";

test("a correct password matches its bcrypt hash", async () => {
  const hash = await bcrypt.hash("correct horse", 4);
  assert.equal(await verifyPassword("correct horse", hash), true);
  assert.equal(await verifyPassword("wrong horse", hash), false);
});

test("a plain-text stored password never matches, even when identical", async () => {
  assert.equal(await verifyPassword("hunter22", "hunter22"), false);
  assert.equal(await verifyPassword("$2", "$2"), false);
  assert.equal(await verifyPassword("$2bogus", "$2bogus"), false);
});

test("empty or non-string input never matches", async () => {
  const hash = await bcrypt.hash("x", 4);
  assert.equal(await verifyPassword("", hash), false);
  assert.equal(await verifyPassword(undefined, hash), false);
  assert.equal(await verifyPassword({ length: 1 }, hash), false);
  assert.equal(await verifyPassword("x", null), false);
});

test("hash detection accepts $2a/$2b/$2y and rejects plain text", () => {
  assert.equal(isBcryptHash("$2b$12$" + "a".repeat(53)), true);
  assert.equal(isBcryptHash("$2a$10$" + "a".repeat(53)), true);
  assert.equal(isBcryptHash("$2y$10$" + "a".repeat(53)), true);
  assert.equal(isBcryptHash("password123"), false);
  assert.equal(isBcryptHash("$2x$10$abc"), false);
});

test("login route has no plain-text comparison path", () => {
  const src = readFileSync(new URL("../server/routes/auth.ts", import.meta.url), "utf8");
  const login = src.slice(src.indexOf('app.post("/api/auth/login"'), src.indexOf('app.post("/api/auth/register"'));
  assert.ok(login.includes("verifyPassword("), "login must use verifyPassword");
  assert.ok(!/user\.password\s*===/.test(login), "login must not compare stored passwords directly");
});
