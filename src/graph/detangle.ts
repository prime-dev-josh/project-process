import { linkEnds } from "./visibility";
import type { GraphLink } from "../types";

type Live = {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  size?: number;
};

function closestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

/** Spread overlaps and lift nodes off unrelated links. Does not pull toward the center. */
export function detangleLayout(
  nodes: Live[],
  links: GraphLink[],
  distance: number,
  sweeps = 18,
) {
  const live = nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  const byId = new Map(live.map((n) => [n.id, n]));
  const minLen = Math.max(36, distance);
  const pad = Math.max(14, minLen * 0.22);
  const ends = links.map((link) => {
    const e = linkEnds(link);
    return { source: e.source, target: e.target };
  });

  for (const node of live) {
    node.fx = undefined;
    node.fy = undefined;
    node.vx = 0;
    node.vy = 0;
  }

  for (let pass = 0; pass < sweeps; pass += 1) {
    for (const edge of ends) {
      const a = byId.get(edge.source);
      const b = byId.get(edge.target);
      if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      if (len >= minLen) continue;
      const push = (minLen - len) * 0.5;
      const nx = dx / len;
      const ny = dy / len;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }

    for (let i = 0; i < live.length; i += 1) {
      const a = live[i];
      if (a.x == null || a.y == null) continue;
      for (let j = i + 1; j < live.length; j += 1) {
        const b = live[j];
        if (b.x == null || b.y == null) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const need = pad * 2;
        if (len >= need || len < 1e-6) continue;
        const push = (need - len) * 0.5;
        const nx = dx / (len || 1);
        const ny = dy / (len || 1);
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }

    for (const node of live) {
      if (node.x == null || node.y == null) continue;
      for (const edge of ends) {
        if (edge.source === node.id || edge.target === node.id) continue;
        const a = byId.get(edge.source);
        const b = byId.get(edge.target);
        if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) continue;
        const hit = closestOnSegment(node.x, node.y, a.x, a.y, b.x, b.y);
        const dx = node.x - hit.x;
        const dy = node.y - hit.y;
        const len = Math.hypot(dx, dy);
        if (len >= pad || len < 1e-6) continue;
        const push = (pad - len);
        node.x += (dx / len) * push;
        node.y += (dy / len) * push;
      }
    }
  }
}
