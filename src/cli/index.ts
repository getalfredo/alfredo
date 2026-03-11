import { hashPassword } from "better-auth/crypto";
import Database from "bun:sqlite";
import fs from "node:fs";
import crypto from "node:crypto";

const db = new Database("data/auth.db");
const isTTY = process.stdin.isTTY;

// Single fd for stdin to handle piped input properly
const stdinFd = fs.openSync("/dev/stdin", "r");
const stdinBuf = Buffer.alloc(4096);

function readLine(): string {
  let line = "";
  while (true) {
    const bytesRead = fs.readSync(stdinFd, stdinBuf, 0, 1, null);
    if (bytesRead === 0) break;
    const ch = stdinBuf.toString("utf8", 0, 1);
    if (ch === "\n") break;
    line += ch;
  }
  return line.trim();
}

function prompt(message: string): string {
  process.stdout.write(message);
  return readLine();
}

async function promptPassword(message: string): Promise<string> {
  process.stdout.write(message);
  if (isTTY) {
    const proc = Bun.spawn(["stty", "-echo"], { stdin: "inherit" });
    await proc.exited;
  }

  const value = readLine();

  if (isTTY) {
    const proc = Bun.spawn(["stty", "echo"], { stdin: "inherit" });
    await proc.exited;
    console.log();
  }

  return value;
}

// ─── Core logic (testable) ───

export async function createUser(db: Database, email: string, password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const existing = db.query("SELECT id FROM user WHERE email = ?").get(email);
  if (existing) {
    throw new Error(`User already exists: ${email}`);
  }

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

export function listUsers(db: Database) {
  return db.query("SELECT id, email, name, createdAt, twoFactorEnabled FROM user").all() as Array<{
    id: string;
    email: string;
    name: string;
    createdAt: string;
    twoFactorEnabled: number;
  }>;
}

export async function resetPassword(db: Database, email: string, newPassword: string) {
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const user = db.query("SELECT id FROM user WHERE email = ?").get(email) as { id: string } | null;
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const hashed = await hashPassword(newPassword);
  db.run(
    "UPDATE account SET password = ? WHERE userId = ? AND providerId = 'credential'",
    [hashed, user.id]
  );

  return { id: user.id, email };
}

export function remove2FA(db: Database, email: string) {
  const user = db.query("SELECT id, twoFactorEnabled FROM user WHERE email = ?").get(email) as {
    id: string;
    twoFactorEnabled: number;
  } | null;

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  if (!user.twoFactorEnabled) {
    return { changed: false, id: user.id, email };
  }

  db.run("UPDATE user SET twoFactorEnabled = 0 WHERE id = ?", [user.id]);
  db.run("DELETE FROM twoFactor WHERE userId = ?", [user.id]);

  return { changed: true, id: user.id, email };
}

// ─── CLI wrappers (interactive) ───

async function userCreateCLI() {
  const email = prompt("Email: ");
  if (!email) {
    console.error("Email is required.");
    process.exit(1);
  }

  const password = await promptPassword("Password: ");
  if (!password) {
    console.error("Password is required.");
    process.exit(1);
  }

  const confirm = await promptPassword("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  try {
    const user = await createUser(db, email, password);
    console.log(`User created: ${user.email} (${user.id})`);
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
}

async function userListCLI() {
  const users = listUsers(db);

  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  console.log("\nUsers:");
  console.log("─".repeat(80));
  for (const user of users) {
    const twoFA = user.twoFactorEnabled ? "enabled" : "disabled";
    console.log(`  ${user.email} (${user.id}) — 2FA: ${twoFA} — created: ${user.createdAt}`);
  }
  console.log(`\nTotal: ${users.length} user(s)`);
}

async function userResetPasswordCLI() {
  const email = prompt("Email: ");
  if (!email) {
    console.error("Email is required.");
    process.exit(1);
  }

  const password = await promptPassword("New password: ");
  if (!password) {
    console.error("Password is required.");
    process.exit(1);
  }

  const confirm = await promptPassword("Confirm new password: ");
  if (password !== confirm) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  try {
    await resetPassword(db, email, password);
    console.log(`Password updated for ${email}.`);
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
}

async function user2faRemoveCLI() {
  const email = prompt("Email: ");
  if (!email) {
    console.error("Email is required.");
    process.exit(1);
  }

  try {
    const result = remove2FA(db, email);
    if (result.changed) {
      console.log(`2FA removed for ${email}.`);
    } else {
      console.log(`2FA is already disabled for ${email}.`);
    }
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }
}

export async function runCLI(command: string) {
  switch (command) {
    case "user:create":
      await userCreateCLI();
      break;
    case "user:list":
      await userListCLI();
      break;
    case "user:reset-pw":
      await userResetPasswordCLI();
      break;
    case "user:2fa-remove":
      await user2faRemoveCLI();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log("\nAvailable commands:");
      console.log("  serve           Start the server");
      console.log("  user:create     Create a new user");
      console.log("  user:list       List all users");
      console.log("  user:reset-pw   Reset a user's password");
      console.log("  user:2fa-remove Remove 2FA from a user");
      process.exit(1);
  }
}
