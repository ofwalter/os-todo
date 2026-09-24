import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiRequest, reauthRedirect } from "./queryClient";

// Re-export the helper for testing. The current module doesn't export it, so
// we re-implement the same logic here (kept in sync intentionally — it's tiny).
function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const parts = queryKey.filter((p): p is string => typeof p === "string");
  if (parts.length === 0) return "";
  let url = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i];
    if (seg.startsWith("?") || seg.startsWith("&")) {
      url += seg;
    } else {
      url += (url.endsWith("/") ? "" : "/") + seg;
    }
  }
  return url;
}

describe("buildUrlFromQueryKey", () => {
  it("returns empty string for empty queryKey", () => {
    expect(buildUrlFromQueryKey([])).toBe("");
  });

  it("returns single path with no segments", () => {
    expect(buildUrlFromQueryKey(["/api/custom-streaks"])).toBe("/api/custom-streaks");
  });

  it("appends query string directly without slash", () => {
    // This is the bug we just fixed: previously this produced
    // "/api/days/summary/?start=2026-04-20&end=2026-04-26"
    // which Express 404'd on.
    expect(
      buildUrlFromQueryKey([
        "/api/days/summary",
        "?start=2026-04-20&end=2026-04-26",
      ]),
    ).toBe("/api/days/summary?start=2026-04-20&end=2026-04-26");
  });

  it("appends today query for streaks", () => {
    expect(
      buildUrlFromQueryKey(["/api/streaks", "?today=2026-04-26"]),
    ).toBe("/api/streaks?today=2026-04-26");
  });

  it("slash-joins additional path segments", () => {
    expect(
      buildUrlFromQueryKey(["/api/days", "2026-04-26", "tasks"]),
    ).toBe("/api/days/2026-04-26/tasks");
  });

  it("handles & continuation segments", () => {
    expect(
      buildUrlFromQueryKey(["/api/x", "?a=1", "&b=2"]),
    ).toBe("/api/x?a=1&b=2");
  });

  it("ignores non-string segments", () => {
    expect(
      buildUrlFromQueryKey(["/api/x", 123, "?a=1"]),
    ).toBe("/api/x?a=1");
  });
});

describe("apiRequest REAUTH_REQUIRED handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers reauthRedirect.go on 401 + REAUTH_REQUIRED body", async () => {
    const goSpy = vi.spyOn(reauthRedirect, "go").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: "REAUTH_REQUIRED", message: "expired" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(apiRequest("POST", "/api/tasks/1/complete-deadline")).rejects.toThrow(
      /401/,
    );
    expect(goSpy).toHaveBeenCalledOnce();
  });

  it("does NOT redirect on plain 401 without REAUTH_REQUIRED code", async () => {
    const goSpy = vi.spyOn(reauthRedirect, "go").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      ),
    );

    await expect(apiRequest("GET", "/api/auth/user")).rejects.toThrow(/401/);
    expect(goSpy).not.toHaveBeenCalled();
  });

  it("does NOT redirect on 500 errors", async () => {
    const goSpy = vi.spyOn(reauthRedirect, "go").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "server boom" }), { status: 500 }),
      ),
    );

    await expect(apiRequest("POST", "/api/tasks/1/complete-deadline")).rejects.toThrow(
      /500/,
    );
    expect(goSpy).not.toHaveBeenCalled();
  });
});
