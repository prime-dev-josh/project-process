import { linkEnds } from "./visibility";
import type { GraphLink, GraphNode } from "../types";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function neighborsOf(nodes: GraphNode[], links: GraphLink[]) {
  const known = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const link of links) {
    const e = linkEnds(link);
    if (!known.has(e.source) || !known.has(e.target) || e.source === e.target) continue;
    add(e.source, e.target);
    add(e.target, e.source);
  }
  for (const node of nodes) {
    if (node.parentId && known.has(node.parentId)) {
      add(node.parentId, node.id);
      add(node.id, node.parentId);
    }
  }
  return adj;
}

/** Parent first, then BFS along links, so each added node already has a neighbor on the map. */
export function revealOrder(nodes: GraphNode[], links: GraphLink[]): string[] {
  if (!nodes.length) return [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = neighborsOf(nodes, links);
  const rank = (id: string) => {
    const node = byId.get(id);
    return [(node?.level ?? 99), node?.title ?? id] as const;
  };
  const roots = nodes
    .filter((n) => !n.parentId || !byId.has(n.parentId))
    .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const order: string[] = [];
  const walk = (start: string) => {
    const queue = [start];
    for (let i = 0; i < queue.length; i += 1) {
      const id = queue[i];
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      order.push(id);
      const next = (adj.get(id) ?? [])
        .filter((other) => !seen.has(other) && byId.has(other))
        .sort((a, b) => {
          const ra = rank(a);
          const rb = rank(b);
          return ra[0] - rb[0] || ra[1].localeCompare(rb[1]) || a.localeCompare(b);
        });
      queue.push(...next);
    }
  };
  for (const root of roots) walk(root.id);
  for (const node of nodes) {
    if (!seen.has(node.id)) walk(node.id);
  }
  return order;
}

export function topologyKey(nodes: { id: string }[], links: { id: string }[]) {
  return `${nodes.map((n) => n.id).sort().join(",")}|${links.map((l) => l.id).sort().join(",")}`;
}

/** Place a new node beside an already-visible neighbor. Ignores stored x/y so the map can grow instead of stacking. */
export function placeRevealedNode(
  node: GraphNode,
  neighbor: { x?: number; y?: number } | undefined,
  index: number,
  distance: number,
) {
  const reach = Math.max(36, distance);
  if (!neighbor) {
    node.x = Math.cos(index * GOLDEN_ANGLE) * reach;
    node.y = Math.sin(index * GOLDEN_ANGLE) * reach;
  } else {
    node.x = (neighbor.x ?? 0) + Math.cos(index * GOLDEN_ANGLE) * reach;
    node.y = (neighbor.y ?? 0) + Math.sin(index * GOLDEN_ANGLE) * reach;
  }
  node.vx = 0;
  node.vy = 0;
}

export function revealedNeighbor(
  id: string,
  visible: Set<string>,
  nodes: GraphNode[],
  links: GraphLink[],
) {
  const node = nodes.find((item) => item.id === id);
  if (node?.parentId && visible.has(node.parentId)) {
    return nodes.find((item) => item.id === node.parentId);
  }
  for (const link of links) {
    const e = linkEnds(link);
    if (e.source === id && visible.has(e.target)) return nodes.find((item) => item.id === e.target);
    if (e.target === id && visible.has(e.source)) return nodes.find((item) => item.id === e.source);
  }
  return undefined;
}
