import Database from "bun:sqlite";
import { hashPassword } from "better-auth/crypto";
import crypto from "node:crypto";
import { createAuth } from "../src/lib/auth";

export async function setupTestAuth() {
  const database = new Database(":memory:");
  const { auth, migrate } = createAuth(database);
  await migrate();
  return { auth, database };
}

export async function createTestUser(db: Database, email: string, password: string) {
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const hashed = await hashPassword(password);

  db.run(
    "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, twoFactorEnabled) VALUES (?, ?, ?, 1, ?, ?, 0)",
    [userId, email, email, now, now]
  );
  db.run(
    "INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) VALUES (?, ?, 'credential', ?, ?, ?, ?)",
    [accountId, userId, userId, hashed, now, now]
  );

  return { id: userId, email };
}

export function extractCookies(response: Response): string {
  const setCookies = response.headers.getSetCookie();
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

export async function loginAs(
  auth: ReturnType<typeof createAuth>["auth"],
  email: string,
  password: string
) {
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: false }),
    })
  );
  const cookies = extractCookies(res);
  const body = await res.json();
  return { response: res, cookies, body };
}
