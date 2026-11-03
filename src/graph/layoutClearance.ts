/** Conservative world-space disc radius, independent of camera zoom. */
export function layoutRadius(node: { size: number; level: number }, enlarge = 1) {
  return (2.7 + node.size * 2 + Math.max(0, 2.1 - node.level * 0.32)) * enlarge;
}

type LayoutNode = {
  id: string;
  size: number;
  level: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
};
type LayoutLink = { source: string | { id: string }; target: string | { id: string } };
const endId = (end: LayoutLink["source"]) => typeof end === "string" ? end : end.id;
const held = (node: LayoutNode) => node.fx != null || node.fy != null;

/** Finite, deterministic projection pass, NOT a perpetual d3 force.
 * Yields every 256 comparisons so callers can budget work across animation frames.
 * Only nonincident edges repel a node. Pinned nodes are never moved.
 */
export function* clearLayoutOverlaps(
  nodes: LayoutNode[], links: LayoutLink[], enlarge: number, sweeps = 72, pad = 8,
): Generator<void, void, unknown> {
  const live = nodes.filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  const byId = new Map(live.map((n) => [n.id, n]));
  const radii = new Map(live.map((n) => [n.id, layoutRadius(n, enlarge) + pad]));
  const edges = links.flatMap((l) => {
    const a = byId.get(endId(l.source));
    const b = byId.get(endId(l.target));
    return a && b && a !== b ? [{ a, b }] : [];
  });
  let comparisons = 0;
  for (let pass = 0; pass < sweeps; pass++) {
    let worst = 0;
    for (const n of live) {
      if (held(n)) continue;
      const r = radii.get(n.id)!;
      for (const { a, b } of edges) {
        if (++comparisons % 256 === 0) yield;
        if (a === n || b === n) continue;
        const dx = b.x! - a.x!;
        const dy = b.y! - a.y!;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-8) continue;
        const t = Math.max(0, Math.min(1, ((n.x! - a.x!) * dx + (n.y! - a.y!) * dy) / len2));
        let nx = n.x! - (a.x! + t * dx);
        let ny = n.y! - (a.y! + t * dy);
        const distance = Math.hypot(nx, ny);
        if (distance >= r) continue;
        if (distance < 1e-8) {
          // Stable side choice for exactly collinear nodes.
          const sign = n.id < a.id ? -1 : 1;
          nx = -dy / Math.sqrt(len2) * sign;
          ny = dx / Math.sqrt(len2) * sign;
        } else { nx /= distance; ny /= distance; }
        const shift = Math.min(22, r - distance);
        n.x! += nx * shift;
        n.y! += ny * shift;
        n.vx = n.vy = 0;
        worst = Math.max(worst, r - distance);
      }
    }
    // Finish each sweep with disc separation, including pairs on the same edge.
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        if (++comparisons % 256 === 0) yield;
        const b = live[j];
        const aw = held(a) ? 0 : 1;
        const bw = held(b) ? 0 : 1;
        if (!aw && !bw) continue;
        let dx = b.x! - a.x!;
        let dy = b.y! - a.y!;
        const distance = Math.hypot(dx, dy);
        const overlap = radii.get(a.id)! + radii.get(b.id)! - distance;
        if (overlap <= 0) continue;
        if (distance < 1e-8) { dx = 1; dy = 0; }
        else { dx /= distance; dy /= distance; }
        const shift = overlap / (aw + bw);
        if (aw) { a.x! -= dx * shift; a.y! -= dy * shift; a.vx = a.vy = 0; }
        if (bw) { b.x! += dx * shift; b.y! += dy * shift; b.vx = b.vy = 0; }
        worst = Math.max(worst, overlap);
      }
    }
    if (worst < 0.12) return;
  }
}
