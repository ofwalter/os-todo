/**
 * Helpers for the bulk import path. Pure functions only — no DB, no I/O —
 * so they're cheap to unit test.
 */

export interface NodeWithParent {
  id: number;
  parentId: number | null | undefined;
}

/**
 * Group nodes by depth in their parent tree. Depth 0 = roots (no parent, or
 * parent not present in the input set). Each subsequent depth contains nodes
 * whose parent is at depth - 1.
 *
 * Nodes whose parentId references something not in the input are treated as
 * roots (orphans) — this matches the user-facing behavior of "import what's
 * importable; don't drop data because of a dangling pointer".
 *
 * Within each depth band, nodes are returned in the order they appeared in
 * the input. Stable ordering matters because callers rely on it for
 * `position` continuity.
 */
export function groupByDepth<T extends NodeWithParent>(nodes: T[]): T[][] {
  const byId = new Map<number, T>();
  for (const n of nodes) byId.set(n.id, n);

  // Memoized depth lookup with cycle protection.
  const depthCache = new Map<number, number>();
  function depthOf(node: T, seen: Set<number> = new Set()): number {
    const cached = depthCache.get(node.id);
    if (cached !== undefined) return cached;
    if (seen.has(node.id)) {
      // Cycle — treat as root to avoid infinite recursion. Shouldn't happen
      // in well-formed exports but we never want to hang the import.
      depthCache.set(node.id, 0);
      return 0;
    }
    if (node.parentId == null) {
      depthCache.set(node.id, 0);
      return 0;
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      // Orphan — parent not in input. Treat as root.
      depthCache.set(node.id, 0);
      return 0;
    }
    seen.add(node.id);
    const d = depthOf(parent, seen) + 1;
    seen.delete(node.id);
    depthCache.set(node.id, d);
    return d;
  }

  const buckets: T[][] = [];
  for (const n of nodes) {
    const d = depthOf(n);
    while (buckets.length <= d) buckets.push([]);
    buckets[d].push(n);
  }
  return buckets;
}

/**
 * Chunk an array into pieces of at most `size`. Used to keep bulk INSERT
 * statements under Postgres's 65535-bind-parameter limit.
 *
 * For a table with ~14 columns, a chunk size of 1000 yields ~14000 params,
 * well under the cap. Tune per table if needed.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
