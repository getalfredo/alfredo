import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import Database from "bun:sqlite";
import { mkdirSync } from "node:fs";

function runMigrations(db: Database) {
  db.run(`CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    twoFactorEnabled INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY NOT NULL,
    expiresAt TEXT NOT NULL,
    token TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    userId TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS account (
    id TEXT PRIMARY KEY NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    accessTokenExpiresAt TEXT,
    refreshTokenExpiresAt TEXT,
    scope TEXT,
    password TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS verification (
    id TEXT PRIMARY KEY NOT NULL,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS twoFactor (
    id TEXT PRIMARY KEY NOT NULL,
    secret TEXT NOT NULL,
    backupCodes TEXT NOT NULL,
    userId TEXT NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id)
  )`);
}

function buildOptions(database: Database) {
  return {
    database,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET || "test-secret-key-minimum-32-characters-long",
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    session: {
      expiresIn: 60 * 60 * 24, // 24h
      updateAge: 60 * 60, // refresh every hour
    },
    advanced: {
      useSecureCookies: process.env.SECURE_COOKIES === "true",
    },
    plugins: [
      twoFactor({
        issuer: "Alfredo",
        backupCodes: {
          amount: 10,
          length: 10,
        },
      }),
    ],
  } as const;
}

export function createAuth(database: Database) {
  const options = buildOptions(database);
  runMigrations(database);
  const auth = betterAuth(options);

  return { auth, database };
}

// Default app instance
mkdirSync("data", { recursive: true });
const app = createAuth(new Database("data/auth.db"));
export const auth = app.auth;
