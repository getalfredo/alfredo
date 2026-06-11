import { existsSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";

if (!existsSync(".env")) {
  // Values already present in the process environment win over the defaults,
  // so the generated file reflects how the app is actually being run.
  const secret = process.env.BETTER_AUTH_SECRET || crypto.randomBytes(32).toString("hex");
  const url = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const secureCookies = process.env.SECURE_COOKIES || "false";
  const content = [
    "# Auth",
    `BETTER_AUTH_SECRET=${secret}`,
    `BETTER_AUTH_URL=${url}`,
    "# Set to \"true\" when using HTTPS (reverse proxy)",
    `SECURE_COOKIES=${secureCookies}`,
    "",
  ].join("\n");

  writeFileSync(".env", content);
  console.log("Generated .env with a new BETTER_AUTH_SECRET.");

  // Bun already tried to load .env at startup and it didn't exist,
  // so we manually inject the values into process.env.
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#\s][^=]*)=(.*)/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}
