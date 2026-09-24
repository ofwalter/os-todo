import { describe, it, expect, beforeEach, vi } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

// Mock storage BEFORE importing the auth module — the module captures the
// `storage` reference at import time.
const mockStorage = {
  getUserByUsername: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
};

vi.mock("../storage.js", () => ({ storage: mockStorage }));

const { ensureOwnerUser, _resetOwnerCache, OWNER_USERNAME } = await import("./index.js");

beforeEach(() => {
  vi.clearAllMocks();
  _resetOwnerCache();
});

describe("password hashing", () => {
  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("battery staple", hash)).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "plaintext")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$aa$bb")).toBe(false);
  });
});

describe("ensureOwnerUser", () => {
  it("returns the existing owner", async () => {
    const owner = { id: 1, username: OWNER_USERNAME, displayName: "Me" };
    mockStorage.getUserByUsername.mockResolvedValue(owner);
    expect(await ensureOwnerUser()).toBe(owner);
    expect(mockStorage.createUser).not.toHaveBeenCalled();
  });

  it("creates the owner if missing", async () => {
    const created = { id: 1, username: OWNER_USERNAME, displayName: "Me" };
    mockStorage.getUserByUsername.mockResolvedValue(undefined);
    mockStorage.createUser.mockResolvedValue(created);
    expect(await ensureOwnerUser()).toBe(created);
    expect(mockStorage.createUser).toHaveBeenCalledWith({
      username: OWNER_USERNAME,
      displayName: "Me",
    });
  });

  it("memoizes within a single cold start", async () => {
    mockStorage.getUserByUsername.mockResolvedValue({ id: 1, username: OWNER_USERNAME });
    await ensureOwnerUser();
    await ensureOwnerUser();
    expect(mockStorage.getUserByUsername).toHaveBeenCalledTimes(1);
  });

  it("clears the memo on failure so the next call retries", async () => {
    mockStorage.getUserByUsername
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ id: 1, username: OWNER_USERNAME });
    await expect(ensureOwnerUser()).rejects.toThrow("db down");
    expect(await ensureOwnerUser()).toEqual({ id: 1, username: OWNER_USERNAME });
  });
});
