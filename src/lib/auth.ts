import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import Database from "bun:sqlite";
import { mkdirSync } from "node:fs";

async function loadGetMigrations() {
  // @ts-ignore - not in package exports
  const mod = await import(
    require.resolve("better-auth").replace("/dist/index.mjs", "/dist/db/get-migration.mjs")
  );
  return mod.getMigrations;
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
  const auth = betterAuth(options);

  async function migrate() {
    const getMigrations = await loadGetMigrations();
    const { runMigrations } = await getMigrations(options);
    await runMigrations();
  }

  return { auth, migrate, database };
}

// Default app instance
mkdirSync("data", { recursive: true });
const app = createAuth(new Database("data/auth.db"));
export const auth = app.auth;
export const migrate = app.migrate;
