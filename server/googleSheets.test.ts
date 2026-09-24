import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockStorage = {
  getUserById: vi.fn(),
  updateUser: vi.fn(),
};

vi.mock("./storage.js", () => ({ storage: mockStorage }));

// Mock googleapis so refreshAccessToken is a vi.fn we can program per-test.
const refreshAccessToken = vi.fn();
const setCredentials = vi.fn();

vi.mock("googleapis", () => {
  class FakeOAuth2 {
    setCredentials = setCredentials;
    refreshAccessToken = refreshAccessToken;
  }
  return {
    google: {
      auth: { OAuth2: FakeOAuth2 },
      sheets: vi.fn().mockReturnValue({}),
    },
  };
});

const {
  _getAccessTokenForUserForTest,
  _resetTokenCacheForTest,
  _isInsufficientScopeErrorForTest,
  ReauthRequiredError,
  clearTokenCacheForUser,
} = await import("./googleSheets.js");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  _resetTokenCacheForTest();
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getAccessTokenForUser invalid_grant handling", () => {
  it("clears the stored refresh token and throws ReauthRequiredError on invalid_grant", async () => {
    mockStorage.getUserById.mockResolvedValue({
      id: 7,
      refreshToken: "stale-token",
    });
    refreshAccessToken.mockRejectedValue(
      Object.assign(new Error("invalid_grant"), { response: { data: { error: "invalid_grant" } } }),
    );

    await expect(_getAccessTokenForUserForTest(7)).rejects.toBeInstanceOf(ReauthRequiredError);

    expect(mockStorage.updateUser).toHaveBeenCalledWith(7, { refreshToken: null });
  });

  it("recognises invalid_grant when only the message string carries it", async () => {
    mockStorage.getUserById.mockResolvedValue({
      id: 8,
      refreshToken: "stale-token",
    });
    refreshAccessToken.mockRejectedValue(new Error("invalid_grant"));

    await expect(_getAccessTokenForUserForTest(8)).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(mockStorage.updateUser).toHaveBeenCalledWith(8, { refreshToken: null });
  });

  it("does NOT clear the token on unrelated errors (e.g. network)", async () => {
    mockStorage.getUserById.mockResolvedValue({
      id: 9,
      refreshToken: "good-token",
    });
    refreshAccessToken.mockRejectedValue(new Error("ECONNRESET"));

    await expect(_getAccessTokenForUserForTest(9)).rejects.toThrow("ECONNRESET");
    expect(mockStorage.updateUser).not.toHaveBeenCalled();
  });

  it("throws ReauthRequiredError when user has no refresh token at all", async () => {
    mockStorage.getUserById.mockResolvedValue({ id: 10, refreshToken: null });

    await expect(_getAccessTokenForUserForTest(10)).rejects.toBeInstanceOf(ReauthRequiredError);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("returns access token on success and caches it", async () => {
    mockStorage.getUserById.mockResolvedValue({ id: 11, refreshToken: "good" });
    refreshAccessToken.mockResolvedValue({
      credentials: { access_token: "fresh-access", expiry_date: Date.now() + 3600_000 },
    });

    const token = await _getAccessTokenForUserForTest(11);
    expect(token).toBe("fresh-access");

    // Second call should hit cache, not refresh again
    const token2 = await _getAccessTokenForUserForTest(11);
    expect(token2).toBe("fresh-access");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("clearTokenCacheForUser drops the cache so next call re-refreshes", async () => {
    mockStorage.getUserById.mockResolvedValue({ id: 12, refreshToken: "good" });
    refreshAccessToken.mockResolvedValue({
      credentials: { access_token: "tok-A", expiry_date: Date.now() + 3600_000 },
    });

    expect(await _getAccessTokenForUserForTest(12)).toBe("tok-A");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);

    clearTokenCacheForUser(12);
    refreshAccessToken.mockResolvedValueOnce({
      credentials: { access_token: "tok-B", expiry_date: Date.now() + 3600_000 },
    });

    expect(await _getAccessTokenForUserForTest(12)).toBe("tok-B");
    expect(refreshAccessToken).toHaveBeenCalledTimes(2);
  });
});

describe("isInsufficientScopeError detection", () => {
  it("recognises message 'Request had insufficient authentication scopes.'", () => {
    const err = Object.assign(new Error("Request had insufficient authentication scopes."), { code: 403 });
    expect(_isInsufficientScopeErrorForTest(err)).toBe(true);
  });

  it("recognises errors[].reason = 'insufficientPermissions'", () => {
    const err: any = new Error("forbidden");
    err.code = 403;
    err.errors = [{ reason: "insufficientPermissions", message: "..." }];
    expect(_isInsufficientScopeErrorForTest(err)).toBe(true);
  });

  it("recognises details[].reason = 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'", () => {
    const err: any = new Error("forbidden");
    err.code = 403;
    err.response = {
      data: { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } },
    };
    expect(_isInsufficientScopeErrorForTest(err)).toBe(true);
  });

  it("does NOT match a plain sheet-level 403 (no edit access)", () => {
    const err: any = new Error("The caller does not have permission");
    err.code = 403;
    err.errors = [{ reason: "forbidden", message: "..." }];
    expect(_isInsufficientScopeErrorForTest(err)).toBe(false);
  });

  it("does NOT match a non-403", () => {
    const err: any = new Error("insufficient authentication scopes");
    err.code = 401;
    expect(_isInsufficientScopeErrorForTest(err)).toBe(false);
  });
});
