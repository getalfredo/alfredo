import { test, expect, describe, beforeAll, beforeEach } from "bun:test";
import Database from "bun:sqlite";
import { verifyPassword } from "better-auth/crypto";
import { createAuth } from "../src/lib/auth";
import { createUser, listUsers, resetPassword, remove2FA } from "../src/cli";

let db: Database;

beforeAll(async () => {
  db = new Database(":memory:");
  const { migrate } = createAuth(db);
  await migrate();
});

beforeEach(() => {
  db.run("DELETE FROM twoFactor");
  db.run("DELETE FROM session");
  db.run("DELETE FROM account");
  db.run("DELETE FROM user");
});

describe("createUser", () => {
  test("creates user successfully", async () => {
    const result = await createUser(db, "admin@test.com", "password123");

    expect(result.email).toBe("admin@test.com");
    expect(result.id).toBeDefined();

    const user = db.query("SELECT * FROM user WHERE email = ?").get("admin@test.com") as any;
    expect(user).not.toBeNull();
    expect(user.email).toBe("admin@test.com");
    expect(user.twoFactorEnabled).toBe(0);
    expect(user.emailVerified).toBe(1);
  });

  test("password is hashed", async () => {
    await createUser(db, "admin@test.com", "password123");

    const account = db.query(
      "SELECT password FROM account WHERE providerId = 'credential'"
    ).get() as any;

    expect(account.password).not.toBe("password123");
    expect(await verifyPassword({ hash: account.password, password: "password123" })).toBe(true);
  });

  test("rejects duplicate email", async () => {
    await createUser(db, "admin@test.com", "password123");

    expect(
      createUser(db, "admin@test.com", "password456")
    ).rejects.toThrow("User already exists");
  });

  test("rejects short password", async () => {
    expect(
      createUser(db, "admin@test.com", "short")
    ).rejects.toThrow("Password must be at least 8 characters");
  });
});

describe("listUsers", () => {
  test("returns empty array when no users", () => {
    const users = listUsers(db);
    expect(users).toHaveLength(0);
  });

  test("returns all created users", async () => {
    await createUser(db, "one@test.com", "password123");
    await createUser(db, "two@test.com", "password456");

    const users = listUsers(db);
    expect(users).toHaveLength(2);

    const emails = users.map((u) => u.email).sort();
    expect(emails).toEqual(["one@test.com", "two@test.com"]);
  });
});

describe("resetPassword", () => {
  test("updates password successfully", async () => {
    await createUser(db, "admin@test.com", "oldpassword1");
    await resetPassword(db, "admin@test.com", "newpassword1");

    const account = db.query(
      "SELECT password FROM account WHERE providerId = 'credential'"
    ).get() as any;

    expect(await verifyPassword({ hash: account.password, password: "newpassword1" })).toBe(true);
    expect(await verifyPassword({ hash: account.password, password: "oldpassword1" })).toBe(false);
  });

  test("rejects nonexistent user", async () => {
    expect(
      resetPassword(db, "nobody@test.com", "password123")
    ).rejects.toThrow("User not found");
  });

  test("rejects short password", async () => {
    await createUser(db, "admin@test.com", "password123");

    expect(
      resetPassword(db, "admin@test.com", "short")
    ).rejects.toThrow("Password must be at least 8 characters");
  });
});

describe("remove2FA", () => {
  test("returns changed:false when 2FA not enabled", async () => {
    await createUser(db, "admin@test.com", "password123");
    const result = remove2FA(db, "admin@test.com");

    expect(result.changed).toBe(false);
  });

  test("removes 2FA when enabled", async () => {
    await createUser(db, "admin@test.com", "password123");

    // Simulate 2FA being enabled
    const user = db.query("SELECT id FROM user WHERE email = ?").get("admin@test.com") as any;
    db.run("UPDATE user SET twoFactorEnabled = 1 WHERE id = ?", [user.id]);
    db.run("INSERT INTO twoFactor (id, secret, backupCodes, userId) VALUES (?, ?, ?, ?)", [
      "tf-1", "SECRETKEY", "code1,code2", user.id,
    ]);

    const result = remove2FA(db, "admin@test.com");
    expect(result.changed).toBe(true);

    // Verify it was removed
    const updated = db.query("SELECT twoFactorEnabled FROM user WHERE id = ?").get(user.id) as any;
    expect(updated.twoFactorEnabled).toBe(0);

    const twoFactor = db.query("SELECT * FROM twoFactor WHERE userId = ?").get(user.id);
    expect(twoFactor).toBeNull();
  });

  test("rejects nonexistent user", () => {
    expect(() => remove2FA(db, "nobody@test.com")).toThrow("User not found");
  });
});
