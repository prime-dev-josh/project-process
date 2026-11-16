import { linkEnds } from "./visibility";
import type { GraphLink, GraphNode } from "../types";

export const CORE_ORIGIN_ID = "prime-pm-root";

/** Fixed speed for highlight-flow link pulse (not user-configurable). */
export const FLOW_HIGHLIGHT_PULSE_SPEED = 1.6;

export function findOriginId(nodes: GraphNode[]): string | null {
  if (!nodes.length) return null;
  return nodes.find((n) => n.id === CORE_ORIGIN_ID)?.id ?? nodes.find((n) => n.level === 0)?.id ?? nodes[0].id;
}

function addEdge(adj: Map<string, string[]>, from: string, to: string) {
  const list = adj.get(from);
  if (!list || list.includes(to)) return;
  list.push(to);
}

export function hopDistances(nodes: GraphNode[], links: GraphLink[], originId: string): Map<string, number> {
  const adj = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    incoming.set(n.id, 0);
  }
  for (const link of links) {
    const e = linkEnds(link);
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    addEdge(adj, e.source, e.target);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    if (link.arrows === "both") {
      addEdge(adj, e.target, e.source);
      incoming.set(e.source, (incoming.get(e.source) ?? 0) + 1);
    }
  }
  const seeds = new Set<string>([originId]);
  for (const n of nodes) {
    if ((incoming.get(n.id) ?? 0) === 0) seeds.add(n.id);
  }
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const id of seeds) {
    dist.set(id, 0);
    queue.push(id);
  }
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i];
    const hop = dist.get(id) ?? 0;
    for (const next of adj.get(id) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, hop + 1);
      queue.push(next);
    }
  }
  return dist;
}

/** Glow a link only while the wave is crossing it in an allowed arrow direction. */
export function pulseAmountOnLink(
  link: GraphLink,
  hops: Map<string, number>,
  front: number,
  maxHop: number,
) {
  const e = linkEnds(link);
  const fromHop = hops.get(e.source);
  const toHop = hops.get(e.target);
  if (fromHop == null || toHop == null) return 0;
  const forward = toHop === fromHop + 1;
  const backward = link.arrows === "both" && fromHop === toHop + 1;
  if (!forward && !backward) return 0;
  return Math.max(hopGlow(fromHop, front, maxHop), hopGlow(toHop, front, maxHop));
}

export function pulseFront(nowMs: number, speed: number, maxHop: number) {
  const period = Math.max(3, maxHop + 3);
  return ((nowMs / 1000) * (0.7 + speed * 3.2)) % period;
}

export function hopGlow(hop: number, front: number, maxHop: number) {
  const period = Math.max(3, maxHop + 3);
  const delta = Math.abs(hop - front);
  const wrapped = Math.min(delta, period - delta);
  if (wrapped > 2.4) return 0;
  return Math.exp(-0.5 * (wrapped / 0.85) ** 2);
}

export function pulseStroke(amount: number, theme: "light" | "dark") {
  const a = Math.min(1, Math.max(0, amount));
  if (theme === "dark") return `rgba(241, 93, 42, ${0.55 + a * 0.45})`;
  return `rgba(35, 27, 75, ${0.4 + a * 0.55})`;
}

export function pulseHalo(amount: number, theme: "light" | "dark") {
  const a = Math.min(1, Math.max(0, amount));
  if (theme === "dark") return `rgba(241, 93, 42, ${0.16 + a * 0.34})`;
  return `rgba(36, 51, 138, ${0.1 + a * 0.2})`;
}
