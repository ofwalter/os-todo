import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock storage BEFORE importing the auth module — the module captures the
// `storage` reference at import time.
const mockStorage = {
  getUserByGoogleId: vi.fn(),
  getUserById: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  getSettings: vi.fn(),
  upsertSettings: vi.fn(),
};

vi.mock("../storage.js", () => ({ storage: mockStorage }));

const {
  ensureBypassUser,
  _findDonorRefreshToken,
  _resetBypassUserCache,
  _BYPASS_INTERNALS,
  DEV_BYPASS_SHEET_ID,
} = await import("./index.js");

const BYPASS_GID = _BYPASS_INTERNALS.DEV_BYPASS_GOOGLE_ID;

beforeEach(() => {
  vi.clearAllMocks();
  _resetBypassUserCache();
});

describe("_findDonorRefreshToken", () => {
  it("returns null when no users exist", async () => {
    mockStorage.listUsers.mockResolvedValue([]);
    expect(await _findDonorRefreshToken()).toBeNull();
  });

  it("returns null when only the bypass user exists", async () => {
    mockStorage.listUsers.mockResolvedValue([
      { id: 1, googleId: BYPASS_GID, refreshToken: "should-not-pick" },
    ]);
    expect(await _findDonorRefreshToken()).toBeNull();
  });

  it("skips users without a refresh token", async () => {
    mockStorage.listUsers.mockResolvedValue([
      { id: 1, googleId: "real-user-1", refreshToken: null },
      { id: 2, googleId: "real-user-2", refreshToken: "donor-token" },
    ]);
    expect(await _findDonorRefreshToken()).toBe("donor-token");
  });

  it("picks the first eligible non-bypass user", async () => {
    mockStorage.listUsers.mockResolvedValue([
      { id: 1, googleId: BYPASS_GID, refreshToken: "bypass-tok" },
      { id: 2, googleId: "real-1", refreshToken: "first-real" },
      { id: 3, googleId: "real-2", refreshToken: "second-real" },
    ]);
    expect(await _findDonorRefreshToken()).toBe("first-real");
  });
});

describe("ensureBypassUser", () => {
  it("creates the bypass user if missing, borrowing a donor refresh token", async () => {
    mockStorage.getUserByGoogleId.mockResolvedValue(undefined);
    mockStorage.listUsers.mockResolvedValue([
      { id: 9, googleId: "real-user", refreshToken: "donor-tok" },
    ]);
    const created = {
      id: 100,
      googleId: BYPASS_GID,
      refreshToken: "donor-tok",
    };
    mockStorage.createUser.mockResolvedValue(created);
    mockStorage.getSettings.mockResolvedValue(undefined);
    mockStorage.upsertSettings.mockResolvedValue({});

    const user = await ensureBypassUser();
    expect(user).toBe(created);
    expect(mockStorage.createUser).toHaveBeenCalledOnce();
    expect(mockStorage.createUser.mock.calls[0][0]).toMatchObject({
      googleId: BYPASS_GID,
      refreshToken: "donor-tok",
    });
    expect(mockStorage.upsertSettings).toHaveBeenCalledWith(100, {
      spreadsheetId: DEV_BYPASS_SHEET_ID,
    });
  });

  it("re-borrows a donor token when the existing bypass user has no refresh token", async () => {
    const stale = { id: 100, googleId: BYPASS_GID, refreshToken: null };
    const refreshed = { id: 100, googleId: BYPASS_GID, refreshToken: "new-donor" };
    mockStorage.getUserByGoogleId.mockResolvedValue(stale);
    mockStorage.listUsers.mockResolvedValue([
      { id: 9, googleId: "real-user", refreshToken: "new-donor" },
    ]);
    mockStorage.updateUser.mockResolvedValue(refreshed);
    mockStorage.getSettings.mockResolvedValue({
      spreadsheetId: DEV_BYPASS_SHEET_ID,
    });

    const user = await ensureBypassUser();
    expect(user).toBe(refreshed);
    expect(mockStorage.updateUser).toHaveBeenCalledWith(100, {
      refreshToken: "new-donor",
    });
    // settings already pointed at the right sheet — no upsert
    expect(mockStorage.upsertSettings).not.toHaveBeenCalled();
  });

  it("forces the bypass sheet ID when settings point elsewhere", async () => {
    const existing = { id: 100, googleId: BYPASS_GID, refreshToken: "tok" };
    mockStorage.getUserByGoogleId.mockResolvedValue(existing);
    mockStorage.getSettings.mockResolvedValue({ spreadsheetId: "wrong-sheet" });
    mockStorage.upsertSettings.mockResolvedValue({});

    await ensureBypassUser();
    expect(mockStorage.upsertSettings).toHaveBeenCalledWith(100, {
      spreadsheetId: DEV_BYPASS_SHEET_ID,
    });
  });

  it("memoizes within a single cold start (only hits DB once)", async () => {
    mockStorage.getUserByGoogleId.mockResolvedValue({
      id: 100,
      googleId: BYPASS_GID,
      refreshToken: "tok",
    });
    mockStorage.getSettings.mockResolvedValue({
      spreadsheetId: DEV_BYPASS_SHEET_ID,
    });

    await Promise.all([ensureBypassUser(), ensureBypassUser(), ensureBypassUser()]);
    expect(mockStorage.getUserByGoogleId).toHaveBeenCalledTimes(1);
    expect(mockStorage.getSettings).toHaveBeenCalledTimes(1);
  });

  it("clears the memo on failure so the next call retries", async () => {
    mockStorage.getUserByGoogleId.mockRejectedValueOnce(new Error("db down"));
    await expect(ensureBypassUser()).rejects.toThrow("db down");

    mockStorage.getUserByGoogleId.mockResolvedValue({
      id: 100,
      googleId: BYPASS_GID,
      refreshToken: "tok",
    });
    mockStorage.getSettings.mockResolvedValue({
      spreadsheetId: DEV_BYPASS_SHEET_ID,
    });
    const user = await ensureBypassUser();
    expect(user.id).toBe(100);
    expect(mockStorage.getUserByGoogleId).toHaveBeenCalledTimes(2);
  });
});
