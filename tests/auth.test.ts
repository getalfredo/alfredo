import { test, expect, describe, beforeAll } from "bun:test";
import Database from "bun:sqlite";
import { createAuth } from "../src/lib/auth";
import { setupTestAuth, createTestUser, extractCookies, loginAs } from "./helpers";

let auth: ReturnType<typeof createAuth>["auth"];
let db: Database;

beforeAll(async () => {
  const setup = await setupTestAuth();
  auth = setup.auth;
  db = setup.database;
  await createTestUser(db, "user@test.com", "password123");
});

describe("sign-in", () => {
  test("succeeds with valid credentials", async () => {
    const { response, body } = await loginAs(auth, "user@test.com", "password123");

    expect(response.status).toBe(200);
    expect(body.user.email).toBe("user@test.com");
    expect(body.token).toBeDefined();
  });

  test("fails with wrong password", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@test.com", password: "wrongpassword" }),
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  test("fails with nonexistent email", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@test.com", password: "password123" }),
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });
});

describe("sign-up", () => {
  test("is disabled", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@test.com", password: "password123", name: "New" }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  });
});

describe("session", () => {
  test("returns session with valid cookies", async () => {
    const { cookies } = await loginAs(auth, "user@test.com", "password123");

    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { Cookie: cookies },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session).toBeDefined();
    expect(body.user.email).toBe("user@test.com");
  });

  test("returns null without cookies", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session")
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeNull();
  });
});

describe("protected routes", () => {
  test("getSession returns user info for auth middleware", async () => {
    const { cookies } = await loginAs(auth, "user@test.com", "password123");

    // Simulates what withAuth does
    const session = await auth.api.getSession({
      headers: new Headers({ Cookie: cookies }),
    });

    expect(session).not.toBeNull();
    expect(session!.user.email).toBe("user@test.com");
  });

  test("getSession returns null without auth", async () => {
    const session = await auth.api.getSession({
      headers: new Headers({}),
    });

    expect(session).toBeNull();
  });
});

describe("sign-out", () => {
  test("invalidates session", async () => {
    const { cookies } = await loginAs(auth, "user@test.com", "password123");

    // Sign out
    const signOutRes = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: { Cookie: cookies },
      })
    );
    expect(signOutRes.status).toBe(200);

    // Session should be invalid now
    const session = await auth.api.getSession({
      headers: new Headers({ Cookie: cookies }),
    });
    expect(session).toBeNull();
  });
});
