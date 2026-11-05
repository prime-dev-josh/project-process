export const GROUP_LABEL_H = 26;
export const GROUP_LABEL_GRIP_W = 18;
export const GROUP_LABEL_PAD = 11;
export const GROUP_LABEL_FONT = '700 13px "Segoe UI", sans-serif';
export const GROUP_LABEL_GAP = 8;
/** Screen pixels above the hull anchor to the badge center. */
export const GROUP_LABEL_ANCHOR_LIFT = 20;

export type GroupLabelAnchor = {
  id: string;
  sx: number;
  sy: number;
  title: string;
};

export type GroupLabelPlacement = {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

export type ScreenRect = { left: number; top: number; right: number; bottom: number; id: string };

export function measureGroupLabelWidth(ctx: CanvasRenderingContext2D, title: string) {
  ctx.font = GROUP_LABEL_FONT;
  return GROUP_LABEL_GRIP_W + ctx.measureText(title).width + GROUP_LABEL_PAD * 2;
}

function rectFromCenter(cx: number, cy: number, w: number, h: number): ScreenRect {
  return {
    id: "",
    left: cx - w / 2,
    top: cy - h / 2,
    right: cx + w / 2,
    bottom: cy + h / 2,
  };
}

function overlaps(a: ScreenRect, b: ScreenRect, gap: number) {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

/** Place badge centers so labels do not overlap; user offsets are in screen pixels. */
export function layoutGroupLabels(
  anchors: GroupLabelAnchor[],
  widths: Map<string, number>,
  userOffset: Map<string, { dx: number; dy: number }>,
  pinnedIds?: Set<string>,
): GroupLabelPlacement[] {
  const h = GROUP_LABEL_H;
  const pinned = pinnedIds ?? new Set<string>();
  const items = anchors.map((a) => {
    const w = widths.get(a.id) ?? 80;
    const nudge = userOffset.get(a.id);
    return {
      id: a.id,
      cx: a.sx + (nudge?.dx ?? 0),
      cy: a.sy - GROUP_LABEL_ANCHOR_LIFT + (nudge?.dy ?? 0),
      w,
      h,
      pinned: pinned.has(a.id),
    };
  });

  for (let pass = 0; pass < 32; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const ra = rectFromCenter(a.cx, a.cy, a.w, a.h);
        ra.id = a.id;
        const rb = rectFromCenter(b.cx, b.cy, b.w, b.h);
        rb.id = b.id;
        if (!overlaps(ra, rb, GROUP_LABEL_GAP)) continue;

        const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const push =
          overlapY > 0 && overlapY <= overlapX
            ? { x: 0, y: overlapY + GROUP_LABEL_GAP }
            : { x: overlapX + GROUP_LABEL_GAP, y: 0 };

        if (Math.abs(push.y) > Math.abs(push.x)) {
          if (!b.pinned) {
            b.cy -= push.y;
            moved = true;
          } else if (!a.pinned) {
            a.cy += push.y;
            moved = true;
          }
        } else if (!b.pinned) {
          b.cx += push.x * (b.cx >= a.cx ? 1 : -1);
          moved = true;
        } else if (!a.pinned) {
          a.cx -= push.x * (b.cx >= a.cx ? 1 : -1);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return items.map(({ id, cx, cy, w, h }) => ({ id, cx, cy, w, h }));
}

export function paintGroupLabelBadge(
  ctx: CanvasRenderingContext2D,
  opts: { title: string; fill: string; ink: string; w: number },
) {
  const { title, fill, ink, w } = opts;
  const h = GROUP_LABEL_H;
  const x0 = -w / 2;
  const y0 = -h / 2;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, h / 2);
  ctx.fill();

  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.55;
  for (const dy of [-5, 0, 5]) {
    ctx.beginPath();
    ctx.arc(x0 + 8, dy, 1.65, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.font = GROUP_LABEL_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.fillText(title, x0 + GROUP_LABEL_GRIP_W + 3, 0);
}
