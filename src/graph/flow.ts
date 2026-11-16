import { linkEnds } from "./visibility";
import type { GraphLink } from "../types";

function addEdge(adj: Map<string, string[]>, from: string, to: string) {
  const list = adj.get(from);
  if (!list || list.includes(to)) return;
  list.push(to);
}

function directedAdjacency(links: GraphLink[]) {
  const adj = new Map<string, string[]>();
  const touch = (id: string) => {
    if (!adj.has(id)) adj.set(id, []);
  };
  for (const link of links) {
    const e = linkEnds(link);
    touch(e.source);
    touch(e.target);
    addEdge(adj, e.source, e.target);
    if (link.arrows === "both") addEdge(adj, e.target, e.source);
  }
  return adj;
}

export type DirectedFlow = {
  hops: Map<string, number>;
  maxHop: number;
};

/** Nodes reachable from `originId` following link direction (both-ways links are traversable in either direction). */
export function directedFlowFrom(originId: string, links: GraphLink[]): DirectedFlow {
  const adj = directedAdjacency(links);
  if (!adj.has(originId)) adj.set(originId, []);
  const hops = new Map<string, number>([[originId, 0]]);
  const queue = [originId];
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    const hop = hops.get(id) ?? 0;
    for (const next of adj.get(id) ?? []) {
      if (hops.has(next)) continue;
      hops.set(next, hop + 1);
      queue.push(next);
    }
  }
  let maxHop = 0;
  for (const hop of hops.values()) if (hop > maxHop) maxHop = hop;
  return { hops, maxHop };
}

/** Next nodes one hop downstream of `id` on the highlighted flow. */
export function flowOutgoing(id: string, links: GraphLink[], hops: Map<string, number>): string[] {
  const hop = hops.get(id);
  if (hop == null) return [];
  const next: string[] = [];
  for (const link of links) {
    if (!isFlowLink(link, hops)) continue;
    const e = linkEnds(link);
    if (e.source === id && hops.get(e.target) === hop + 1) next.push(e.target);
    else if (link.arrows === "both" && e.target === id && hops.get(e.source) === hop + 1) next.push(e.source);
  }
  return [...new Set(next)];
}

/** True when this link lies on the highlighted flow (respects arrow direction). */
export function isFlowLink(link: GraphLink, hops: Map<string, number>): boolean {
  const e = linkEnds(link);
  const fromHop = hops.get(e.source);
  const toHop = hops.get(e.target);
  if (fromHop == null || toHop == null) return false;
  if (toHop === fromHop + 1) return true;
  if (link.arrows === "both" && fromHop === toHop + 1) return true;
  return false;
}
