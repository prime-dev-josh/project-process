import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  childrenOf,
  descendantMemberCount,
  groupPath,
  isLeaf,
  memberCount,
  rootGroups,
  subtreeIds,
} from "../graph/groupTree";
import { groupPaintColor, groupTitle } from "../graph/groups";
import { cx, dangerText, field, ghostBtn, primaryBtn, toolBtn } from "../styles";
import type { GraphGroup, GraphNode } from "../types";
import HexColorField from "./HexColorField";

const BOX_W = 200;
const BOX_H = 48;
const EDIT_BOX_W = 252;
const EDIT_BOX_H = 224;
const V_GAP = 72;
const SIB_GAP = 28;

type Box = { id: string; x: number; y: number };
export type GroupTreeDrop =
  | { kind: "child"; parentId: string }
  | { kind: "adopt"; childId: string }
  | { kind: "reorder"; parentId: string | null; beforeId: string | null }
  | { kind: "root" };

type Drop = GroupTreeDrop | { kind: "invalid" };

const REORDER_EDGE = 22;
const ADOPT_TOP_FRAC = 0.3;

type Props = {
  groups: GraphGroup[];
  nodes: GraphNode[];
  onSelect: (id: string | null) => void;
  onPlace: (id: string, drop: GroupTreeDrop) => void;
  onInvalid: () => void;
  onAddRoot: () => void;
  onRename: (groupId: string, title: string) => void;
  onColor: (groupId: string, color: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (groupId: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  /** When set, groups not in the set render at 50% opacity. */
  filterVisibleIds: Set<string> | null;
};

function layoutForest(groups: GraphGroup[]): Box[] {
  const widthOf = new Map<string, number>();
  const measure = (id: string, stack: Set<string>): number => {
    const cached = widthOf.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) return BOX_W;
    const next = new Set(stack);
    next.add(id);
    const kids = childrenOf(groups, id).filter((kid) => !next.has(kid.id));
    const width = kids.length
      ? Math.max(
          BOX_W,
          kids.reduce((sum, kid, index) => sum + measure(kid.id, next) + (index ? SIB_GAP : 0), 0),
        )
      : BOX_W;
    widthOf.set(id, width);
    return width;
  };

  const boxes: Box[] = [];
  const placed = new Set<string>();
  const place = (id: string, left: number, depth: number, stack: Set<string>) => {
    if (placed.has(id) || stack.has(id)) return;
    placed.add(id);
    const next = new Set(stack);
    next.add(id);
    const width = measure(id, stack);
    boxes.push({ id, x: left + (width - BOX_W) / 2, y: depth * (BOX_H + V_GAP) });
    const kids = childrenOf(groups, id).filter((kid) => !next.has(kid.id));
    if (!kids.length) return;
    const kidsWidth = kids.reduce((sum, kid, index) => sum + measure(kid.id, next) + (index ? SIB_GAP : 0), 0);
    let cursor = left + (width - kidsWidth) / 2;
    for (const kid of kids) {
      place(kid.id, cursor, depth + 1, next);
      cursor += measure(kid.id, next) + SIB_GAP;
    }
  };

  let cursor = 0;
  const placeRoot = (id: string) => {
    place(id, cursor, 0, new Set());
    cursor += measure(id, new Set()) + SIB_GAP;
  };
  for (const root of rootGroups(groups)) placeRoot(root.id);
  for (const group of groups) {
    if (!placed.has(group.id)) placeRoot(group.id);
  }
  return boxes;
}

function clip(title: string) {
  const text = groupTitle(title);
  return text.length > 26 ? `${text.slice(0, 25)}…` : text;
}

function nodeCountLabel(count: number) {
  return `${count} node${count === 1 ? "" : "s"}`;
}

function editCardLayout(box: Box) {
  return {
    x: box.x + (BOX_W - EDIT_BOX_W) / 2,
    y: box.y,
    w: EDIT_BOX_W,
    h: EDIT_BOX_H,
  };
}

export default function GroupTreeCanvas({
  groups,
  nodes,
  onSelect,
  onPlace,
  onInvalid,
  onAddRoot,
  onRename,
  onColor,
  onAddChild,
  onDelete,
  onRefresh,
  refreshing = false,
  filterVisibleIds,
}: Props) {
  const dimTree = (id: string) => filterVisibleIds !== null && !filterVisibleIds.has(id);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 48, y: 48 });
  const [zoom, setZoom] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const boxHeight = (id: string) => (editingId === id ? EDIT_BOX_H : BOX_H);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; drop: Drop | null } | null>(null);
  const [middlePan, setMiddlePan] = useState(false);
  const dropRef = useRef<Drop | null>(null);
  const clickRef = useRef<{ id: string; t: number } | null>(null);
  const spaceHeld = useRef(false);
  const pointer = useRef<
    | {
        mode: "pan";
        pointerId: number;
        startX: number;
        startY: number;
        panX: number;
        panY: number;
        moved: boolean;
      }
    | {
        mode: "group";
        pointerId: number;
        id: string;
        startX: number;
        startY: number;
        grabX: number;
        grabY: number;
        moved: boolean;
      }
    | null
  >(null);

  const boxes = useMemo(() => layoutForest(groups), [groups]);
  const boxById = useMemo(() => new Map(boxes.map((box) => [box.id, box])), [boxes]);
  const byId = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  const edges = useMemo(() => {
    const paths: { key: string; d: string }[] = [];
    for (const group of groups) {
      const parent = boxById.get(group.id);
      const kids = childrenOf(groups, group.id);
      if (!parent || !kids.length) continue;
      const x1 = parent.x + BOX_W / 2;
      const y1 = parent.y + BOX_H;
      const busY = y1 + V_GAP / 2;
      for (const kid of kids) {
        const child = boxById.get(kid.id);
        if (!child) continue;
        const x2 = child.x + BOX_W / 2;
        paths.push({
          key: `${group.id}->${kid.id}`,
          d: `M ${x1} ${y1} L ${x1} ${busY} L ${x2} ${busY} L ${x2} ${child.y}`,
        });
      }
    }
    return paths;
  }, [groups, boxById]);

  function toGraph(clientX: number, clientY: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }

  function boxHits(gx: number, gy: number, dragId: string) {
    return boxes
      .filter(
        (box) =>
          box.id !== dragId &&
          gx >= box.x &&
          gx <= box.x + BOX_W &&
          gy >= box.y &&
          gy <= box.y + boxHeight(box.id),
      )
      .sort((a, b) => b.y - a.y || a.x - b.x);
  }

  function resolveDrop(id: string, gx: number, gy: number): Drop | null {
    const blocked = new Set(subtreeIds(groups, id));
    const hit = boxHits(gx, gy, id)[0];
    if (hit) {
      if (blocked.has(hit.id)) return { kind: "invalid" };
      const dragGroup = byId.get(id);
      const target = byId.get(hit.id);
      const sameParent = (dragGroup?.parentId ?? null) === (target?.parentId ?? null);
      const localX = gx - hit.x;
      const localY = gy - hit.y;

      if (sameParent && localX < REORDER_EDGE) {
        return { kind: "reorder", parentId: target?.parentId ?? null, beforeId: hit.id };
      }
      if (sameParent && localX > BOX_W - REORDER_EDGE) {
        const sibs = childrenOf(groups, target?.parentId ?? null).filter((sib) => sib.id !== id);
        const index = sibs.findIndex((sib) => sib.id === hit.id);
        return {
          kind: "reorder",
          parentId: target?.parentId ?? null,
          beforeId: sibs[index + 1]?.id ?? null,
        };
      }
      const hitH = boxHeight(hit.id);
      if (localY <= hitH * ADOPT_TOP_FRAC) {
        return { kind: "adopt", childId: hit.id };
      }
      return { kind: "child", parentId: hit.id };
    }

    for (const box of boxes) {
      if (box.id === id || blocked.has(box.id)) continue;
      const bandTop = box.y + BOX_H;
      const bandBottom = box.y + BOX_H + V_GAP * 0.62;
      if (gy < bandTop || gy > bandBottom) continue;
      if (gx < box.x - 12 || gx > box.x + BOX_W + 12) continue;
      return { kind: "child", parentId: box.id };
    }

    if (gy < -16) return { kind: "root" };

    const rows = new Map<string, Box[]>();
    for (const box of boxes) {
      if (box.id === id) continue;
      const parentKey = byId.get(box.id)?.parentId ?? "";
      const row = rows.get(parentKey) ?? [];
      row.push(box);
      rows.set(parentKey, row);
    }
    for (const [key, row] of rows) {
      const parentId = key || null;
      if (parentId && blocked.has(parentId)) continue;
      const minY = Math.min(...row.map((box) => box.y)) - 12;
      const maxY = Math.max(...row.map((box) => box.y)) + BOX_H + 12;
      if (gy < minY || gy > maxY) continue;
      const sorted = [...row].sort((a, b) => a.x - b.x);
      if (gx < sorted[0].x - SIB_GAP / 2) return { kind: "reorder", parentId, beforeId: sorted[0].id };
      for (let index = 0; index < sorted.length; index += 1) {
        const current = sorted[index];
        const next = sorted[index + 1];
        const gapStart = current.x + BOX_W;
        const gapEnd = next ? next.x : gapStart + SIB_GAP;
        if (!next && gx > gapStart + SIB_GAP / 2) {
          return { kind: "reorder", parentId, beforeId: null };
        }
        if (next && gx >= gapStart && gx <= gapEnd) {
          return { kind: "reorder", parentId, beforeId: next.id };
        }
      }
    }
    return null;
  }

  function fit() {
    const el = rootRef.current;
    if (!el || !boxes.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const box of boxes) {
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + BOX_W);
      maxY = Math.max(maxY, box.y + BOX_H);
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const pad = 56;
    const nextZoom = Math.min(1.6, Math.max(0.08, Math.min((el.clientWidth - pad * 2) / width, (el.clientHeight - pad * 2) / height)));
    setZoom(nextZoom);
    setPan({
      x: (el.clientWidth - width * nextZoom) / 2 - minX * nextZoom,
      y: (el.clientHeight - height * nextZoom) / 2 - minY * nextZoom,
    });
  }

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const nextZoom = Math.min(2.2, Math.max(0.08, zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
      const scale = nextZoom / zoom;
      setPan({ x: mx - (mx - pan.x) * scale, y: my - (my - pan.y) * scale });
      setZoom(nextZoom);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pan, zoom]);

  const didFit = useRef(false);
  const lastFitSig = useRef("");
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (didFit.current || !boxes.length || el.clientWidth < 40 || el.clientHeight < 40) return;
      didFit.current = true;
      lastFitSig.current = `${boxes.length}:${groups.length}`;
      fitRef.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [boxes.length, groups.length]);

  useEffect(() => {
    if (!boxes.length) return;
    const sig = `${boxes.length}:${groups.length}`;
    if (sig === lastFitSig.current) return;
    lastFitSig.current = sig;
    fitRef.current();
  }, [boxes, groups.length]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing) return;
      if (event.code === "Space") {
        event.preventDefault();
        spaceHeld.current = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function chordPan(event: ReactPointerEvent<HTMLDivElement>) {
    return event.button === 1 || (event.button === 0 && (spaceHeld.current || event.altKey));
  }

  function startEdit(id: string) {
    setEditingId(id);
    onSelect(id);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as Element;
    const forcePan = chordPan(event);
    if (!forcePan && target.closest?.("[data-group-edit], [data-edit-trigger], [data-group-editing]")) return;
    const id = target.closest?.("[data-group-id]")?.getAttribute("data-group-id") ?? null;
    if (!forcePan && editingId && id !== editingId) setEditingId(null);
    if (!forcePan && editingId === id) return;
    if (forcePan) event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!forcePan && id) {
      const box = boxById.get(id);
      const point = toGraph(event.clientX, event.clientY);
      pointer.current = {
        mode: "group",
        pointerId: event.pointerId,
        id,
        startX: event.clientX,
        startY: event.clientY,
        grabX: box ? point.x - box.x : BOX_W / 2,
        grabY: box ? point.y - box.y : BOX_H / 2,
        moved: false,
      };
      return;
    }
    if (event.button === 1) setMiddlePan(true);
    pointer.current = {
      mode: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.mode === "pan") {
      if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 3) active.moved = true;
      setPan({ x: active.panX + event.clientX - active.startX, y: active.panY + event.clientY - active.startY });
      return;
    }
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 4) active.moved = true;
    if (!active.moved) return;
    const point = toGraph(event.clientX, event.clientY);
    const x = point.x - active.grabX;
    const y = point.y - active.grabY;
    const drop = resolveDrop(active.id, point.x, point.y);
    dropRef.current = drop;
    setDrag({ id: active.id, x, y, drop });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const active = pointer.current;
    pointer.current = null;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.mode === "pan") {
      setMiddlePan(false);
      if (!active.moved) onSelect(null);
      return;
    }
    if (!active.moved) {
      const now = Date.now();
      const prev = clickRef.current;
      if (prev && prev.id === active.id && now - prev.t < 450) {
        clickRef.current = null;
        startEdit(active.id);
      } else {
        clickRef.current = { id: active.id, t: now };
        onSelect(active.id);
      }
      setDrag(null);
      return;
    }
    clickRef.current = null;
    const drop = dropRef.current;
    dropRef.current = null;
    setDrag(null);
    if (!drop) return;
    if (drop.kind === "invalid") {
      onInvalid();
      return;
    }
    onPlace(active.id, drop);
  }

  const bounds = boxes.reduce(
    (acc, box) => ({
      minX: Math.min(acc.minX, box.x),
      maxX: Math.max(acc.maxX, box.x + BOX_W),
      minY: Math.min(acc.minY, box.y),
      maxY: Math.max(acc.maxY, box.y + boxHeight(box.id)),
    }),
    { minX: 0, maxX: BOX_W, minY: 0, maxY: BOX_H },
  );
  const backdropPad = 480;
  const backdrop = {
    x: bounds.minX - backdropPad,
    y: bounds.minY - backdropPad,
    w: Math.max(BOX_W, bounds.maxX - bounds.minX) + backdropPad * 2,
    h: Math.max(BOX_H, bounds.maxY - bounds.minY) + backdropPad * 2,
  };

  return (
    <div ref={rootRef} className="relative h-full w-full overflow-hidden bg-[var(--graph-bg)]">
      <div
        className={cx(
          "absolute inset-0 touch-none",
          drag ? "cursor-grabbing" : middlePan ? "cursor-grabbing" : "cursor-default",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg className="h-full w-full select-none font-sans">
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            <rect
              data-group-canvas-bg
              x={backdrop.x}
              y={backdrop.y}
              width={backdrop.w}
              height={backdrop.h}
              fill="transparent"
            />
            {edges.map((edge) => {
              const childId = edge.key.split("->")[1] ?? "";
              return (
                <path
                  key={edge.key}
                  d={edge.d}
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth={1.5}
                  opacity={dimTree(childId) ? 0.5 : 1}
                />
              );
            })}
            {drag?.drop?.kind === "reorder" ? (
              <ReorderMark groups={groups} boxes={boxes} dragId={drag.id} parentId={drag.drop.parentId} beforeId={drag.drop.beforeId} />
            ) : null}
            {drag?.drop?.kind === "child" ? (
              <ChildDropHint boxes={boxes} parentId={drag.drop.parentId} />
            ) : null}
            {drag?.drop?.kind === "adopt" ? (
              <AdoptDropHint boxes={boxes} childId={drag.drop.childId} />
            ) : null}
            {drag ? (
              <rect
                x={bounds.minX}
                y={-40}
                width={Math.max(BOX_W, bounds.maxX - bounds.minX)}
                height={28}
                rx={6}
                fill="color-mix(in srgb, var(--accent) 12%, transparent)"
                stroke="var(--accent)"
                strokeDasharray="4 3"
              />
            ) : null}
            {boxes.map((box) => {
              const group = byId.get(box.id);
              if (!group || drag?.id === box.id || editingId === group.id) return null;
              return (
                <GroupTreeCard
                  key={group.id}
                  box={box}
                  group={group}
                  groups={groups}
                  nodes={nodes}
                  dimmed={dimTree(group.id)}
                  dropHot={
                    (drag?.drop?.kind === "child" && drag.drop.parentId === group.id) ||
                    (drag?.drop?.kind === "adopt" && drag.drop.childId === group.id)
                  }
                  onStartEdit={startEdit}
                />
              );
            })}
            {drag ? <Ghost group={byId.get(drag.id)} nodes={nodes} groups={groups} x={drag.x} y={drag.y} /> : null}
            {editingId ? (() => {
              const box = boxById.get(editingId);
              const group = byId.get(editingId);
              if (!box || !group) return null;
              const layout = editCardLayout(box);
              return (
                <g
                  key={`${group.id}-edit`}
                  data-group-id={group.id}
                  data-group-editing
                  role="group"
                  aria-label={`Editing ${groupTitle(group.title)}`}
                  className="cursor-default"
                  opacity={dimTree(group.id) ? 0.5 : 1}
                >
                  <rect
                    x={layout.x - 6}
                    y={layout.y - 6}
                    width={layout.w + 12}
                    height={layout.h + 12}
                    rx={12}
                    fill="var(--graph-bg)"
                    opacity={0.92}
                  />
                  <rect
                    x={layout.x}
                    y={layout.y}
                    width={layout.w}
                    height={layout.h}
                    rx={10}
                    fill="var(--card)"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                  />
                  <GroupCardEditForm
                    group={group}
                    x={layout.x}
                    y={layout.y}
                    width={layout.w}
                    height={layout.h}
                    onRename={onRename}
                    onColor={onColor}
                    onAddChild={onAddChild}
                    onDelete={onDelete}
                    onClose={() => setEditingId(null)}
                  />
                </g>
              );
            })() : null}
          </g>
        </svg>
      </div>
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button
          type="button"
          className={cx(toolBtn, "disabled:cursor-not-allowed disabled:opacity-60")}
          aria-label="Refresh groups from the shared map"
          title="Reload groups without restarting the map"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        {groups.length > 0 ? (
          <button type="button" className={toolBtn} onClick={fit}>
            Fit
          </button>
        ) : null}
      </div>
      {groups.length > 0 ? null : (
        <div className="absolute inset-0 z-[2] flex items-center justify-center p-6">
          <div className="max-w-sm rounded-xl border border-[var(--line)] bg-[var(--card)] px-6 py-5 text-center shadow-[var(--shadow)]">
            <p className="m-0 text-sm font-semibold text-[var(--text)]">No groups yet</p>
            <p className="mt-1 mb-3 text-[12px] leading-snug text-[var(--muted)]">
              Create a root group, then add children. Only groups without children can hold nodes on the map.
            </p>
            <button type="button" className={primaryBtn} onClick={onAddRoot}>
              Create a group
            </button>
          </div>
        </div>
      )}
      {groups.length > 0 ? (
        <p className="pointer-events-none absolute bottom-3 left-3 z-10 text-[11px] text-[var(--muted)]">
          Drag empty space to pan (Space, Alt, or middle mouse over cards too) · scroll to zoom · drop on the lower part of a box (or the band below it) to nest as its child · top band to make it your child · left/right edges between siblings to reorder only
        </p>
      ) : null}
    </div>
  );
}

function ChildDropHint({ boxes, parentId }: { boxes: Box[]; parentId: string }) {
  const box = boxes.find((item) => item.id === parentId);
  if (!box) return null;
  const y = box.y + BOX_H + 4;
  const h = Math.max(18, V_GAP * 0.45);
  return (
    <rect
      x={box.x + 8}
      y={y}
      width={BOX_W - 16}
      height={h}
      rx={6}
      fill="color-mix(in srgb, var(--accent) 18%, transparent)"
      stroke="var(--accent)"
      strokeDasharray="4 3"
    />
  );
}

function AdoptDropHint({ boxes, childId }: { boxes: Box[]; childId: string }) {
  const box = boxes.find((item) => item.id === childId);
  if (!box) return null;
  return (
    <rect
      x={box.x + 6}
      y={box.y + 4}
      width={BOX_W - 12}
      height={BOX_H * ADOPT_TOP_FRAC - 4}
      rx={4}
      fill="color-mix(in srgb, var(--accent) 14%, transparent)"
      stroke="var(--accent)"
      strokeDasharray="3 2"
    />
  );
}

function ReorderMark({
  groups,
  boxes,
  dragId,
  parentId,
  beforeId,
}: {
  groups: GraphGroup[];
  boxes: Box[];
  dragId: string;
  parentId: string | null;
  beforeId: string | null;
}) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const row = boxes
    .filter((box) => box.id !== dragId && (byId.get(box.id)?.parentId ?? null) === parentId)
    .sort((a, b) => a.x - b.x);
  if (!row.length) return null;
  const target = beforeId ? row.find((box) => box.id === beforeId) : undefined;
  const anchor = target ?? row[row.length - 1];
  const x = target ? anchor.x - SIB_GAP / 2 : anchor.x + BOX_W + SIB_GAP / 2;
  return <line x1={x} x2={x} y1={anchor.y - 8} y2={anchor.y + BOX_H + 8} stroke="var(--accent)" strokeWidth={2} />;
}

function GroupTreeCard({
  box,
  group,
  groups,
  nodes,
  dimmed,
  dropHot,
  onStartEdit,
}: {
  box: Box;
  group: GraphGroup;
  groups: GraphGroup[];
  nodes: GraphNode[];
  dimmed: boolean;
  dropHot: boolean;
  onStartEdit: (id: string) => void;
}) {
  const leaf = isLeaf(groups, group.id);
  const color = groupPaintColor(group);
  const count = leaf ? memberCount(nodes, group.id) : descendantMemberCount(groups, nodes, group.id);

  return (
    <g
      data-group-id={group.id}
      role="button"
      tabIndex={0}
      aria-label={`${groupTitle(group.title)}, ${leaf ? "group" : "folder"}, ${nodeCountLabel(count)}`}
      className="cursor-default"
      opacity={dimmed ? 0.5 : 1}
    >
      <rect
        x={box.x}
        y={box.y}
        width={BOX_W}
        height={BOX_H}
        rx={8}
        fill="var(--card)"
        stroke={dropHot ? "var(--accent)" : leaf ? color : "var(--line)"}
        strokeWidth={dropHot ? 2.5 : 2}
      />
      <text x={box.x + BOX_W / 2} y={box.y + 20} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">
        {clip(group.title)}
      </text>
      <text x={box.x + BOX_W / 2} y={box.y + 36} textAnchor="middle" fontSize={10} fill="var(--muted)">
        {nodeCountLabel(count)}
      </text>
      <g
        data-edit-trigger
        role="button"
        tabIndex={-1}
        aria-label={`Edit ${groupTitle(group.title)}`}
        className="cursor-pointer"
        transform={`translate(${box.x + BOX_W - 26} ${box.y + 6})`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onStartEdit(group.id);
        }}
      >
        <rect x={0} y={0} width={20} height={20} rx={4} fill="color-mix(in srgb, var(--text) 12%, transparent)" />
        <path
          d="M4 15 L4.6 12.8 L11.2 6.2 C11.6 5.8 12.2 5.8 12.6 6.2 L12.8 6.4 C13.2 6.8 13.2 7.4 12.8 7.8 L6.2 14.4 Z"
          fill="none"
          stroke="var(--muted)"
          strokeWidth={1.1}
          strokeLinejoin="round"
        />
      </g>
      <title>{groupPath(groups, group.id).join(" / ")}</title>
    </g>
  );
}

function GroupCardEditForm({
  group,
  x,
  y,
  width,
  height,
  onRename,
  onColor,
  onAddChild,
  onDelete,
  onClose,
}: {
  group: GraphGroup;
  x: number;
  y: number;
  width: number;
  height: number;
  onRename: (groupId: string, title: string) => void;
  onColor: (groupId: string, color: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (groupId: string) => void;
  onClose: () => void;
}) {
  const committed = groupTitle(group.title);
  const [name, setName] = useState(committed);
  const nameRef = useRef(name);
  const inputRef = useRef<HTMLInputElement>(null);
  nameRef.current = name;

  useEffect(() => {
    setName(committed);
  }, [committed, group.id]);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [group.id]);

  useEffect(() => {
    const id = group.id;
    const base = committed;
    return () => {
      const next = groupTitle(nameRef.current);
      if (next !== base) onRename(id, next);
    };
  }, [group.id, committed, onRename]);

  function commitName() {
    const next = groupTitle(name);
    setName(next);
    if (next !== committed) onRename(group.id, next);
  }

  return (
    <foreignObject
      x={x + 8}
      y={y + 8}
      width={width - 16}
      height={height - 16}
      data-group-edit
      style={{ overflow: "visible" }}
    >
      <div
        className="flex h-full min-h-0 flex-col gap-2 rounded-lg bg-[var(--card)] p-1 shadow-[var(--shadow)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          id={`group-card-name-${group.id}`}
          className={cx(field, "w-full py-1.5 text-[13px] font-semibold")}
          value={name}
          aria-label="Group name"
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
              onClose();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setName(committed);
              onClose();
            }
          }}
        />
        <HexColorField
          value={groupPaintColor(group)}
          ariaLabel={`Color for ${committed}`}
          onChange={(color) => onColor(group.id, color)}
        />
        <div className="mt-auto flex gap-1.5 pt-1">
          <button
            type="button"
            className={cx(ghostBtn, "min-w-0 flex-1 px-2 py-1.5 text-[11px]")}
            onClick={() => {
              commitName();
              onClose();
              onAddChild(group.id);
            }}
          >
            Add child
          </button>
          <button
            type="button"
            className={cx(ghostBtn, dangerText, "min-w-0 flex-1 px-2 py-1.5 text-[11px]")}
            onClick={() => {
              commitName();
              onClose();
              onDelete(group.id);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </foreignObject>
  );
}

function Ghost({
  group,
  groups,
  nodes,
  x,
  y,
}: {
  group: GraphGroup | undefined;
  groups: GraphGroup[];
  nodes: GraphNode[];
  x: number;
  y: number;
}) {
  if (!group) return null;
  const leaf = isLeaf(groups, group.id);
  const color = groupPaintColor(group);
  const count = leaf ? memberCount(nodes, group.id) : descendantMemberCount(groups, nodes, group.id);
  return (
    <g opacity={0.92} pointerEvents="none">
      <rect
        x={x}
        y={y}
        width={BOX_W}
        height={BOX_H}
        rx={8}
        fill="var(--card)"
        stroke={leaf ? color : "var(--line)"}
        strokeWidth={2}
      />
      <text x={x + BOX_W / 2} y={y + 20} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--text)">
        {clip(group.title)}
      </text>
      <text x={x + BOX_W / 2} y={y + 36} textAnchor="middle" fontSize={10} fill="var(--muted)">
        {nodeCountLabel(count)}
      </text>
    </g>
  );
}
