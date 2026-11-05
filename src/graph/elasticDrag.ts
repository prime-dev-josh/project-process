import type { GraphLink } from "../types";
import { linkEnds } from "./visibility";

export function buildUndirectedAdjacency(
  links: GraphLink[],
  allowLink?: (sourceId: string, targetId: string) => boolean,
) {
  const adj = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const link of links) {
    const { source, target } = linkEnds(link);
    if (allowLink && !allowLink(source, target)) continue;
    connect(source, target);
  }
  return adj;
}

/** Node ids within `maxHops` link steps of `roots`, not including the roots themselves. */
export function nodesWithinHops(roots: Set<string>, adj: Map<string, Set<string>>, maxHops: number) {
  if (maxHops <= 0) return new Set<string>();
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of roots) {
    depth.set(id, 0);
    queue.push(id);
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const d = depth.get(id)!;
    if (d >= maxHops) continue;
    for (const nb of adj.get(id) ?? []) {
      if (depth.has(nb)) continue;
      depth.set(nb, d + 1);
      queue.push(nb);
    }
  }
  const out = new Set<string>();
  for (const [id, d] of depth) {
    if (d > 0 && d <= maxHops) out.add(id);
  }
  return out;
}
