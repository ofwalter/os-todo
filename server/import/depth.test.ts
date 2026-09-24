import { describe, it, expect } from "vitest";
import { groupByDepth, chunk } from "./depth.js";

describe("groupByDepth", () => {
  it("returns empty when given empty input", () => {
    expect(groupByDepth([])).toEqual([]);
  });

  it("puts all roots at depth 0", () => {
    const nodes = [
      { id: 1, parentId: null },
      { id: 2, parentId: null },
      { id: 3, parentId: undefined },
    ];
    const out = groupByDepth(nodes);
    expect(out).toHaveLength(1);
    expect(out[0].map((n) => n.id)).toEqual([1, 2, 3]);
  });

  it("places children one depth below their parent", () => {
    const nodes = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 2 },
      { id: 4, parentId: 1 },
    ];
    const out = groupByDepth(nodes);
    expect(out).toHaveLength(3);
    expect(out[0].map((n) => n.id).sort()).toEqual([1]);
    expect(out[1].map((n) => n.id).sort()).toEqual([2, 4]);
    expect(out[2].map((n) => n.id).sort()).toEqual([3]);
  });

  it("preserves input order within a depth band", () => {
    const nodes = [
      { id: 10, parentId: null },
      { id: 11, parentId: null },
      { id: 12, parentId: null },
    ];
    const out = groupByDepth(nodes);
    expect(out[0].map((n) => n.id)).toEqual([10, 11, 12]);
  });

  it("treats orphans (parent not in input) as roots", () => {
    const nodes = [
      { id: 1, parentId: 999 }, // dangling
      { id: 2, parentId: 1 },
    ];
    const out = groupByDepth(nodes);
    expect(out).toHaveLength(2);
    expect(out[0].map((n) => n.id)).toEqual([1]);
    expect(out[1].map((n) => n.id)).toEqual([2]);
  });

  it("does not infinite-loop on a cycle", () => {
    const nodes = [
      { id: 1, parentId: 2 },
      { id: 2, parentId: 1 },
    ];
    const out = groupByDepth(nodes);
    // Both end up at depth 0 via cycle protection.
    expect(out.flat().map((n) => n.id).sort()).toEqual([1, 2]);
  });

  it("handles a deep chain (100 levels)", () => {
    const nodes = [{ id: 0, parentId: null as number | null }];
    for (let i = 1; i < 100; i++) {
      nodes.push({ id: i, parentId: i - 1 });
    }
    const out = groupByDepth(nodes);
    expect(out).toHaveLength(100);
    for (let i = 0; i < 100; i++) {
      expect(out[i]).toHaveLength(1);
      expect(out[i][0].id).toBe(i);
    }
  });
});

describe("chunk", () => {
  it("returns empty for empty input", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("returns a single chunk when input fits", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("splits evenly when input is a multiple of size", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("puts the remainder in a final smaller chunk", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("throws on non-positive size", () => {
    expect(() => chunk([1], 0)).toThrow();
    expect(() => chunk([1], -1)).toThrow();
  });
});
