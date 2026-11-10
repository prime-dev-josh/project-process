import { forceCollide } from "d3-force";
import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { users } from "../data/users";
import { personStyle } from "../data/personStyle";
import { NODE_FILL, graphTheme, nodeColor, sizeForLevel, withAlpha } from "../graph/colors";
import { nodeClassFromSize, type NodeClass } from "../graph/nodeClass";
import { groupColorInk, groupPaintColor } from "../graph/groups";
import {
  layoutGroupLabels,
  measureGroupLabelWidth,
  paintGroupLabelBadge,
  type ScreenRect,
} from "../graph/groupLabelLayout";
import {
  groupBlobHull,
  groupMemberRadius,
  hullApex,
  pointInCell,
  traceCellPath,
} from "../graph/groupHull";
import { employeeInitials } from "../graph/employee";
import { findSelfIntersection, lassoRegion, pointInPolygon, type Point } from "../graph/lasso";
import { rotatePoint, viewCoverOffset } from "../graph/viewRotation";
import { type DirectedFlow, isFlowLink } from "../graph/flow";
import {
  FLOW_HIGHLIGHT_PULSE_SPEED,
  pulseAmountOnLink,
  pulseFront,
  pulseHalo,
  pulseStroke,
} from "../graph/pulse";
import { detangleLayout } from "../graph/detangle";
import { buildUndirectedAdjacency, nodesWithinHops } from "../graph/elasticDrag";
import { GRAPH_MAX_ZOOM, GRAPH_MIN_ZOOM } from "../graph/viewSettings";
import { placeRevealedNode, revealedNeighbor, revealOrder, topologyKey } from "../graph/stagedReveal";
import { filterGraph, isFiltered, linkEnds } from "../graph/visibility";
import { STATUS_COLORS, type WorkflowStatus } from "../graph/workflowStatus";
import { loadPersonPhoto } from "../lib/personPhoto";
import type { ArrowStyle, GraphGroup, GraphLink, GraphNode, GraphSettings } from "../types";

export type GraphHandle = ForceGraphMethods<GraphNode, GraphLink> & {
  applyViewForces?: (opts?: { reheat?: boolean; rebuildStructure?: boolean; detangle?: boolean }) => void;
};

/** Shift adds to the selection, Ctrl/⌘ subtracts from it, otherwise the lasso replaces it. */
export type LassoMode = "replace" | "add" | "subtract";

type Props = {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GraphGroup[];
  settings: GraphSettings;
  settingsRef: MutableRefObject<GraphSettings>;
  selectedIds: string[];
  selectedLinkId: string | null;
  hoveredId: string | null;
  connectFrom: string | null;
  connectArmed: boolean;
  placeArmed: boolean;
  placeFrom: string | null;
  placeSize?: number;
  linkArrows: ArrowStyle;
  search: string;
  statusFilters: WorkflowStatus[];
  employeeFilter: string | null;
  groupFilters: string[];
  hideFiltered: boolean;
  highlightIds?: string[] | null;
  highlightFlow?: DirectedFlow | null;
  theme: "light" | "dark";
  rotation?: number;
  uprightText?: boolean;
  width: number;
  height: number;
  onSelect: (id: string | null, additive?: boolean) => void;
  onMarquee: (ids: string[], mode: LassoMode) => void;
  onGroupMoveEnd: (positions: { id: string; x: number; y: number }[]) => void;
  /** True while a node/group drag is actually moving the map. */
  onNodesMoving?: (moving: boolean) => void;
  onSelectLink: (id: string) => void;
  onHover: (id: string | null) => void;
  /** Fired when the pointer enters or leaves a group name pill on the map. */
  onGroupLabelHover?: (over: boolean) => void;
  onEditLink: (id: string) => void;
  onNodeMenu: (id: string, x: number, y: number) => void;
  onLinkMenu: (id: string, x: number, y: number) => void;
  onBackgroundMenu: (x: number, y: number) => void;
  onBackground: (x: number, y: number, graph: { x: number; y: number }) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onConnectTarget: (id: string) => void;
  onPlace: (graph: { x: number; y: number }) => void;
  onZoom: (k: number) => void;
  onSettle: () => void;
  onRevealActive?: (active: boolean) => void;
  graphRef: MutableRefObject<GraphHandle | undefined>;
};

const REVEAL_MS = 22;
const REVEAL_FADE_MS = 320;
/** Intro camera: never zoom in past this; grows with the revealed bounds. */
const REVEAL_ZOOM_MAX = 0.095;
/** Pan/zoom easing time constant (ms) — higher = smoother, less jitter. */
const REVEAL_CAMERA_SMOOTH_MS = 680;

function initRevealViewport(
  nodes: Array<{ x?: number; y?: number }>,
  viewW: number,
  viewH: number,
) {
  const pad = 132;
  const minSpan = 100;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const node of nodes) {
    if (typeof node.x !== "number" || typeof node.y !== "number") continue;
    count += 1;
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  if (!count) return { cx: 0, cy: 0, k: REVEAL_ZOOM_MAX * 0.85 };
  const bboxW = Math.max(maxX - minX, minSpan);
  const bboxH = Math.max(maxY - minY, minSpan);
  const fit = Math.min((viewW - pad * 2) / bboxW, (viewH - pad * 2) / bboxH);
  const k = Math.max(GRAPH_MIN_ZOOM, Math.min(REVEAL_ZOOM_MAX, fit));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, k };
}

function fadeColor(color: string, fade: number) {
  if (fade >= 0.999) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) {
    const a = (m[4] == null ? 1 : Number(m[4])) * fade;
    return `rgba(${m[1]},${m[2]},${m[3]},${a})`;
  }
  return withAlpha(color, fade);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function dotRadius(node: GraphNode, globalScale: number, enlarge: number) {
  const base = (2.7 + node.size * 2 + Math.max(0, 2.1 - node.level * 0.32)) * enlarge;
  const screenCap = Math.min(360, 20 * enlarge + node.size * 14 * enlarge);
  const screen = Math.min(base * globalScale, screenCap);
  return screen / globalScale;
}

/** Hit target in graph space: disc + halo/ring paint + screen slack. */
function nodePickRadius(node: GraphNode, globalScale: number, enlarge: number, extraScreenPx = 14) {
  const k = Math.max(globalScale, 1e-4);
  return dotRadius(node, globalScale, enlarge) + (3.2 + 2.2 + extraScreenPx) / k;
}

/** Screen-px radius of the "−" deselect badge; tracks the node's on-screen size so it never hides small nodes. */
function deselectBadgePx(node: GraphNode, globalScale: number, enlarge: number) {
  return Math.min(7, Math.max(4.5, dotRadius(node, globalScale, enlarge) * globalScale * 0.75));
}

function cardBox(node: GraphNode, globalScale: number, enlarge: number) {
  const w = (172 * enlarge * Math.min(node.size, 1.35)) / globalScale;
  const h = ((node.description ? 74 : 42) * enlarge) / globalScale;
  return { w, h };
}

function cardsAtZoom(cardInfo: boolean, globalScale: number) {
  return Boolean(cardInfo) && globalScale > 1.4;
}

function viewScale(value: number | undefined, fallback = 1) {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function assigneeEmail(node: GraphNode) {
  const email = node.employeeEmail?.trim();
  if (email) return email.toLowerCase();
  const name = node.employee?.trim().toLowerCase();
  if (!name) return "";
  return users.find((user) => user.name.toLowerCase() === name)?.email.toLowerCase() ?? "";
}

function inScreenSpace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  globalScale: number,
  paint: (scale: number) => void,
  unrotate = 0,
) {
  const k = Math.max(globalScale, 1e-4);
  ctx.save();
  ctx.translate(x, y);
  if (unrotate) ctx.rotate(unrotate);
  ctx.scale(1 / k, 1 / k);
  paint(k);
  ctx.restore();
}

function traceNodeClassPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  cls: NodeClass,
) {
  if (cls === "start") {
    const h = r * Math.sqrt(3);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x - r * 0.5, y - h / 2);
    ctx.lineTo(x - r * 0.5, y + h / 2);
    ctx.closePath();
    return;
  }
  if (cls === "end") {
    const half = r * 0.86;
    ctx.beginPath();
    ctx.roundRect(x - half, y - half, half * 2, half * 2, half * 0.28);
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function drawUnassignedIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const size = r * 1.42;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2 + size * 0.06);
  ctx.scale(size / 24, size / 24);
  ctx.fillStyle = "#1a1208";
  ctx.beginPath();
  ctx.arc(12, 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4, 20);
  ctx.bezierCurveTo(4, 16, 8, 14, 12, 14);
  ctx.bezierCurveTo(16, 14, 20, 16, 20, 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function paintNodeDisc(
  ctx: CanvasRenderingContext2D,
  args: {
    x: number;
    y: number;
    r: number;
    fill: string;
    border: string;
    globalScale: number;
    cls?: NodeClass;
    selected?: boolean;
    hovered?: boolean;
    photo?: HTMLImageElement;
    initials?: string;
    unassigned?: boolean;
    unrotate?: number;
  },
) {
  const { x, y, r, fill, border, globalScale, selected, hovered, photo, initials, unassigned, unrotate = 0 } = args;
  const cls = args.cls ?? "general";
  const statusW = (selected || hovered ? 2.8 : 2.2) / globalScale;
  const inkW = Math.max(1.05 / globalScale, r * 0.08);
  const innerR = Math.max(r * 0.62, r - statusW - inkW);

  traceNodeClassPath(ctx, x, y, innerR, cls);
  ctx.fillStyle = fill;
  ctx.fill();

  inScreenSpace(ctx, x, y, globalScale, (k) => {
    const innerScreen = innerR * k;
    const face = Math.min(innerScreen, 12);
    traceNodeClassPath(ctx, 0, 0, innerScreen, cls);
    ctx.clip();
    if (photo && photo.naturalWidth) {
      const cover = innerScreen * 2;
      const scale = Math.max(cover / photo.naturalWidth, cover / photo.naturalHeight);
      const dw = photo.naturalWidth * scale;
      const dh = photo.naturalHeight * scale;
      ctx.drawImage(photo, -dw / 2, -dh / 2, dw, dh);
    } else if (initials) {
      ctx.fillStyle = "#1a1208";
      ctx.font = `700 ${Math.max(6, face * 0.72)}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials, 0, 0);
    } else if (unassigned) {
      drawUnassignedIcon(ctx, 0, 0, face);
    }
  }, unrotate);

  traceNodeClassPath(ctx, x, y, innerR, cls);
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = inkW;
  ctx.stroke();

  traceNodeClassPath(ctx, x, y, innerR + inkW * 0.5 + statusW * 0.5, cls);
  ctx.strokeStyle = border;
  ctx.lineWidth = statusW;
  ctx.stroke();
}

function shouldLabel(
  node: GraphNode,
  globalScale: number,
  selected: boolean,
  hovered: boolean,
  searchHit: boolean,
) {
  if (selected || hovered || searchHit) return true;
  if (node.level <= 1) return globalScale > 0.32;
  if (node.level <= 2) return globalScale > 0.72;
  return globalScale > 1.1;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - 0.45), y2 - size * Math.sin(angle - 0.45));
  ctx.lineTo(x2 - size * Math.cos(angle + 0.45), y2 - size * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (len <= 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

const LABEL_FONT = '"Segoe UI", sans-serif';

/** Split long tokens so every word fits after font shrink hits the floor. */
function tokenizeForWrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, breakLongWords: boolean) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!breakLongWords) return words;
  const tokens: string[] = [];
  for (const word of words) {
    if (ctx.measureText(word).width <= maxWidth) {
      tokens.push(word);
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const test = chunk + ch;
      if (ctx.measureText(test).width > maxWidth && chunk) {
        tokens.push(chunk);
        chunk = ch;
      } else {
        chunk = test;
      }
    }
    if (chunk) tokens.push(chunk);
  }
  return tokens;
}

/** Wrap all tokens into at most maxLines; return null if the text needs more lines at this font size. */
function wrapAllWords(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  breakLongWords = false,
): string[] | null {
  const tokens = tokenizeForWrap(ctx, text, maxWidth, breakLongWords);
  if (!tokens.length) return [""];

  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const test = line ? `${line} ${token}` : token;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = token;
      if (lines.length >= maxLines) return null;
    } else if (ctx.measureText(token).width > maxWidth) {
      return null;
    } else {
      line = test;
    }
  }
  if (line) {
    if (lines.length >= maxLines) return null;
    lines.push(line);
  }
  for (const ln of lines) {
    if (ctx.measureText(ln).width > maxWidth) return null;
  }
  return lines;
}

/** Shrink font until the full string fits in maxWidth × maxLines (no ellipsis or dropped words). */
function fitWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  baseFontPx: number,
  fontWeight: number | string = 600,
) {
  const minFontPx = 6;
  for (let fontPx = baseFontPx; fontPx >= minFontPx; fontPx -= 0.5) {
    ctx.font = `${fontWeight} ${fontPx}px ${LABEL_FONT}`;
    const lines = wrapAllWords(ctx, text, maxWidth, maxLines, false);
    if (lines) return { lines, fontPx };
  }
  const fontPx = minFontPx;
  ctx.font = `${fontWeight} ${fontPx}px ${LABEL_FONT}`;
  const lines = wrapAllWords(ctx, text, maxWidth, maxLines, true) ?? [text];
  return { lines, fontPx };
}

function GraphCanvas({
  nodes,
  links,
  groups = [],
  settings,
  settingsRef,
  selectedIds,
  selectedLinkId,
  hoveredId,
  connectFrom,
  connectArmed,
  placeArmed,
  placeFrom,
  placeSize,
  linkArrows,
  search,
  statusFilters,
  employeeFilter,
  groupFilters = [],
  hideFiltered,
  highlightIds = null,
  highlightFlow = null,
  theme,
  rotation = 0,
  uprightText = true,
  width,
  height,
  onSelect,
  onMarquee,
  onGroupMoveEnd,
  onNodesMoving,
  onSelectLink,
  onHover,
  onGroupLabelHover,
  onEditLink,
  onNodeMenu,
  onLinkMenu,
  onBackgroundMenu,
  onBackground,
  onDragEnd,
  onConnectTarget,
  onPlace,
  onZoom,
  onSettle,
  onRevealActive,
  graphRef,
}: Props) {
  const handlersRef = useRef({
    onSelect,
    onMarquee,
    onGroupMoveEnd,
    onNodesMoving,
    onSelectLink,
    onHover,
    onEditLink,
    onNodeMenu,
    onLinkMenu,
    onBackgroundMenu,
    onBackground,
    onDragEnd,
    onConnectTarget,
    onPlace,
    onZoom,
    onSettle,
  });
  handlersRef.current = {
    onSelect,
    onMarquee,
    onGroupMoveEnd,
    onNodesMoving,
    onSelectLink,
    onHover,
    onEditLink,
    onNodeMenu,
    onLinkMenu,
    onBackgroundMenu,
    onBackground,
    onDragEnd,
    onConnectTarget,
    onPlace,
    onZoom,
    onSettle,
  };
  const lastClick = useRef<{ key: string; t: number } | null>(null);
  const cursorGraph = useRef<{ x: number; y: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const labelCanvasRef = useRef<HTMLCanvasElement>(null);
  const spaceHeld = useRef(false);
  const skipBg = useRef(false);
  const armedClickHandled = useRef(false);
  const fgContextHandled = useRef(false);
  const interaction = useRef<
    | { type: "marquee"; points: Point[]; mode: LassoMode; sx0: number; sy0: number }
    | { type: "group"; lastX: number; lastY: number; moved: boolean }
    | {
        type: "groupLabel";
        id: string;
        memberIds: string[];
        lastGx: number;
        lastGy: number;
        moved: boolean;
      }
    | { type: "pan"; sx: number; sy: number; cx: number; cy: number }
    | { type: "drag"; ids: string[]; lastX: number; lastY: number; sx: number; sy: number; moved: boolean }
    | null
  >(null);
  const groupLabelOffsetRef = useRef(new Map<string, { dx: number; dy: number }>());
  const groupLabelPinnedRef = useRef(new Set<string>());
  const groupLabelHitRef = useRef<ScreenRect[]>([]);
  /** True while the pointer is over a group name pill (blocks node hover cards). */
  const suppressNodeHoverRef = useRef(false);
  const nodesMovingRef = useRef(false);

  function setNodesMoving(moving: boolean) {
    if (nodesMovingRef.current === moving) return;
    nodesMovingRef.current = moving;
    handlersRef.current.onNodesMoving?.(moving);
  }
  const groupLabelPointerRef = useRef(false);
  const [gesture, setGesture] = useState<"marquee" | "group" | "pan" | "drag" | null>(null);
  const [dragLivePreview, setDragLivePreview] = useState(false);
  const [overBadge, setOverBadge] = useState(false);
  const rotationRef = useRef(rotation);
  rotationRef.current = rotation;
  useEffect(() => {
    graphRef.current?.resumeAnimation?.();
  }, [graphRef, rotation, uprightText]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const palette = graphTheme(theme);

  const filterOptions = useMemo(
    () => ({ statusFilters, employeeEmail: employeeFilter, groupIds: groupFilters }),
    [statusFilters, employeeFilter, groupFilters],
  );
  const [mapSearch, setMapSearch] = useState(search);
  useEffect(() => {
    const delay = search.trim() ? 220 : 0;
    const timer = window.setTimeout(() => setMapSearch(search), delay);
    return () => window.clearTimeout(timer);
  }, [search]);
  const { nodes: mapNodes, links: mapLinks } = useMemo(
    () => filterGraph(nodes, links, mapSearch, settings.colorBy, filterOptions),
    [nodes, links, mapSearch, settings.colorBy, filterOptions],
  );
  const filterKey = `${mapSearch.trim()}|${statusFilters.join(",")}|${employeeFilter ?? ""}|${groupFilters.join(",")}`;

  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [initReveal, setInitReveal] = useState(true);
  const revealedRef = useRef<string[]>([]);
  const orderRef = useRef<string[]>([]);
  const topologyRef = useRef("");
  const filterKeyRef = useRef(filterKey);
  const revealingRef = useRef(false);
  const initRevealRef = useRef(false);
  const growLayoutRef = useRef(false);
  const revealBornRef = useRef(new Map<string, number>());
  const revealCamRef = useRef({ cx: 0, cy: 0, k: REVEAL_ZOOM_MAX, armed: false });
  const bootOverlayRef = useRef(true);
  const onRevealActiveRef = useRef(onRevealActive);
  onRevealActiveRef.current = onRevealActive;
  revealedRef.current = revealedIds;

  const graphKey = useMemo(() => topologyKey(mapNodes, mapLinks), [mapNodes, mapLinks]);
  const revealing = revealedIds.length < mapNodes.length;
  revealingRef.current = revealing;
  initRevealRef.current = initReveal;

  function revealOpacity(id: string) {
    if (!initRevealRef.current) return 1;
    const born = revealBornRef.current.get(id);
    if (born == null) return 1;
    return smoothstep(0, REVEAL_FADE_MS, performance.now() - born);
  }

  useEffect(() => {
    if (!bootOverlayRef.current) return;
    onRevealActiveRef.current?.(initReveal);
    if (!initReveal) bootOverlayRef.current = false;
  }, [initReveal]);

  useEffect(() => {
    const order = revealOrder(mapNodes, mapLinks);
    orderRef.current = order;
    const prevKey = topologyRef.current;
    const filterChanged = filterKeyRef.current !== filterKey;
    filterKeyRef.current = filterKey;
    const have = new Set(revealedRef.current.filter((id) => mapNodes.some((n) => n.id === id)));
    const added = mapNodes.filter((n) => !have.has(n.id)).length;
    const smallEdit =
      !filterChanged && Boolean(prevKey) && have.size > 0 && added <= 3 && have.size >= mapNodes.length - 3;
    topologyRef.current = graphKey;
    if (!mapNodes.length) {
      growLayoutRef.current = false;
      revealBornRef.current.clear();
      setInitReveal(false);
      setRevealedIds([]);
      return;
    }
    if (smallEdit) {
      setRevealedIds(order.filter((id) => have.has(id) || mapNodes.some((n) => n.id === id && !have.has(n.id))));
      return;
    }
    growLayoutRef.current = true;
    revealBornRef.current.clear();
    setInitReveal(true);
    setRevealedIds([]);
  }, [graphKey, filterKey]);

  useEffect(() => {
    const order = orderRef.current;
    if (!order.length || revealedIds.length >= order.length) return;
    const visible = new Set(revealedIds);
    const nextId = order[revealedIds.length];
    const timer = window.setTimeout(() => {
      const node = nodesRef.current.find((item) => item.id === nextId);
      if (node) {
        const live = liveFrameRef.current?.nodes ?? nodesRef.current;
        const neighbor = revealedNeighbor(nextId, visible, live, linksRef.current);
        placeRevealedNode(node, neighbor, revealedIds.length, settingsRef.current.linkDistance || 50);
        if (initRevealRef.current) revealBornRef.current.set(nextId, performance.now());
      }
      setRevealedIds(order.slice(0, revealedIds.length + 1));
    }, REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [graphKey, revealedIds, graphRef]);

  useEffect(() => {
    if (initRevealRef.current) return;
    if (!selectedIds.length || !revealingRef.current) return;
    const order = orderRef.current;
    let last = -1;
    for (const id of selectedIds) {
      const at = order.indexOf(id);
      if (at > last) last = at;
    }
    if (last < revealedIds.length) return;
    const visible = new Set(revealedIds);
    const jump = order.slice(0, last + 1);
    for (let i = revealedIds.length; i < jump.length; i += 1) {
      const node = nodesRef.current.find((item) => item.id === jump[i]);
      if (!node) continue;
      const neighbor = revealedNeighbor(jump[i], visible, nodesRef.current, linksRef.current);
      placeRevealedNode(node, neighbor, i, settingsRef.current.linkDistance || 50);
      visible.add(jump[i]);
    }
    setRevealedIds(jump);
  }, [selectedIds, revealedIds]);

  useEffect(() => {
    if (!initReveal) {
      revealCamRef.current.armed = false;
      return;
    }
    revealCamRef.current.armed = false;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!initRevealRef.current) return;
      const fg = graphRef.current as
        | (GraphHandle & {
            centerAt?: (x?: number, y?: number, ms?: number) => { x: number; y: number };
            zoom?: (k?: number, ms?: number) => number;
          })
        | undefined;
      if (!fg?.zoom) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const visible = new Set(revealedRef.current);
      const placed = nodesRef.current.filter((n) => visible.has(n.id));
      const target = initRevealViewport(placed, width, height);
      const cam = revealCamRef.current;
      if (!cam.armed) {
        const center = fg.centerAt?.() ?? { x: 0, y: 0 };
        cam.cx = center.x;
        cam.cy = center.y;
        cam.k = fg.zoom?.() ?? target.k;
        cam.armed = true;
      }
      const dt = Math.min(48, Math.max(1, now - last));
      last = now;
      const blend = 1 - Math.exp(-dt / REVEAL_CAMERA_SMOOTH_MS);
      cam.cx += (target.cx - cam.cx) * blend;
      cam.cy += (target.cy - cam.cy) * blend;
      cam.k += (target.k - cam.k) * blend;
      fg.centerAt?.(cam.cx, cam.cy, 0);
      fg.zoom(cam.k, 0);
      fg.resumeAnimation?.();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [initReveal, graphKey, graphRef, width, height]);

  useEffect(() => {
    if (!initReveal || revealing) return;
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      let left = 0;
      for (const born of revealBornRef.current.values()) {
        left = Math.max(left, REVEAL_FADE_MS - (now - born));
      }
      graphRef.current?.resumeAnimation?.();
      if (left > 0) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      setInitReveal(false);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [initReveal, revealing]);

  useEffect(() => {
    if (initReveal || !mapNodes.length) return;
    const timer = window.setTimeout(() => {
      graphRef.current?.applyViewForces?.({ rebuildStructure: true, reheat: Boolean(settingsRef.current.physics) });
      handlersRef.current.onSettle();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [initReveal, mapNodes.length, graphKey]);

  const visibleIdSet = useMemo(() => new Set(revealedIds), [revealedIds]);
  const graphData = useMemo(
    () => {
      const shown = revealing ? mapNodes.filter((n) => visibleIdSet.has(n.id)) : mapNodes;
      const shownIds = new Set(shown.map((n) => n.id));
      return {
        nodes: shown,
        links: mapLinks.flatMap((l) => {
          const e = linkEnds(l);
          if (!shownIds.has(e.source) || !shownIds.has(e.target)) return [];
          return [{ id: l.id, source: e.source, target: e.target, kind: l.kind, arrows: l.arrows ?? "none" }];
        }),
      };
    },
    [mapNodes, mapLinks, revealing, visibleIdSet],
  );

  function isShown(node: GraphNode | undefined) {
    if (!node) return false;
    if (!hideFiltered && !mapSearch.trim()) return true;
    return isFiltered(node, mapSearch, settings.colorBy, filterOptions);
  }

  const highlightSet = useMemo(
    () => (highlightIds?.length ? new Set(highlightIds) : null),
    [highlightIds],
  );

  function isFlowDim(node: GraphNode | undefined) {
    if (!highlightSet || !node) return false;
    return !highlightSet.has(node.id);
  }

  function isFlowLinkDim(link: GraphLink) {
    if (!highlightFlow) return false;
    return !isFlowLink(link, highlightFlow.hops);
  }

  const flowPulseAt = useRef(0);
  useEffect(() => {
    if (!highlightFlow) return;
    let frame = 0;
    const tick = (now: number) => {
      flowPulseAt.current = now;
      graphRef.current?.resumeAnimation?.();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    graphRef.current?.resumeAnimation?.();
    return () => cancelAnimationFrame(frame);
  }, [highlightFlow, graphRef]);

  function flowPulseAmount(link: GraphLink) {
    if (!highlightFlow || !isFlowLink(link, highlightFlow.hops)) return 0;
    const front = pulseFront(flowPulseAt.current, FLOW_HIGHLIGHT_PULSE_SPEED, highlightFlow.maxHop);
    return pulseAmountOnLink(link, highlightFlow.hops, front, highlightFlow.maxHop);
  }

  const photosRef = useRef(new Map<string, HTMLImageElement>());
  const photoAsked = useRef(new Set<string>());
  const [, setPhotoGen] = useState(0);
  useEffect(() => {
    const emails = new Set(graphData.nodes.map(assigneeEmail).filter(Boolean));
    for (const email of emails) {
      if (photoAsked.current.has(email)) continue;
      photoAsked.current.add(email);
      loadPersonPhoto(email).then((url) => {
        if (!url) return;
        const img = new Image();
        img.onload = () => {
          photosRef.current.set(email, img);
          setPhotoGen((n) => n + 1);
        };
        img.src = url;
      });
    }
  }, [graphData.nodes]);

  useEffect(() => {
    if (!placeArmed) return;
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(".plus-wrap, .filter-panel, .canvas-tools, .view-compass, .history-panel, .info-panel, .item-actions, .edit-float, .ctx, .omp-header")) return;
      onPlace(graphAtClient(e.clientX, e.clientY));
    };
    window.addEventListener("pointerup", onUp, true);
    return () => window.removeEventListener("pointerup", onUp, true);
  }, [placeArmed, onPlace, graphRef]);

  const lastPhysicsStructureKey = useRef<string | null>(null);
  const nodesRef = useRef(nodes);
  const linksRef = useRef(links);
  const groupsRef = useRef(groups);
  const collideRef = useRef(settings.collide);
  const enlargeRef = useRef(settings.enlarge);
  const simulatingRef = useRef(false);
  const hullCacheRef = useRef(new Map<string, { sig: string; hulls: Point[][]; cheap: boolean }>());
  const hullFrameRef = useRef(0);
  const liveFrameRef = useRef<{ nodes: GraphNode[]; byId: Map<string, GraphNode> } | null>(null);
  const DRAG_LINK_STRENGTH = 0.94;
  const REST_LINK_STRENGTH = 0.28;
  const ELASTIC_HOPS_PHYSICS = 5;
  const ELASTIC_HOPS_NO_PHYSICS = 512;
  nodesRef.current = mapNodes;
  linksRef.current = mapLinks;
  groupsRef.current = groups;
  collideRef.current = settingsRef.current.collide;
  enlargeRef.current = settingsRef.current.enlarge;

  useEffect(() => {
    if (!initReveal) return;
    hullCacheRef.current.clear();
    lastPhysicsStructureKey.current = null;
  }, [graphKey, initReveal]);

  function applyViewForces(opts?: { reheat?: boolean; rebuildStructure?: boolean; detangle?: boolean }) {
    const fg = graphRef.current;
    if (!fg) return;
    const s = settingsRef.current;
    collideRef.current = s.collide;
    enlargeRef.current = s.enlarge;
    const charge = fg.d3Force("charge") as { strength?: (n: number) => void } | undefined;
    charge?.strength?.(s.physics ? s.charge : 0);
    const linkForce = fg.d3Force("link") as
      | { distance?: (n: number) => unknown; strength?: (n: number) => unknown }
      | undefined;
    linkForce?.distance?.(Math.max(36, s.linkDistance || 50));
    linkForce?.strength?.(opts?.detangle ? 0.85 : 0.28);
    fg.d3Force("center", null);
    fg.d3Force("radial", null);
    const forceKey = `${s.physics}:${s.charge}:${s.linkDistance}:${s.collide}`;
    const structureChanged = opts?.rebuildStructure || lastPhysicsStructureKey.current !== forceKey;
    if (structureChanged) {
      lastPhysicsStructureKey.current = forceKey;
      fg.d3Force(
        "collide",
        forceCollide((d: GraphNode) => collideRef.current + d.size * 8 + Math.max(0, 4 - d.level)).strength(0.92).iterations(opts?.detangle ? 4 : 3) as never,
      );
      fg.d3Force("groupField", null);
    }
    if (opts?.detangle) {
      growLayoutRef.current = true;
      detangleLayout(nodesRef.current, linksRef.current, Math.max(36, s.linkDistance || 50));
    }
    if (opts?.reheat && s.physics) {
      fg.d3ReheatSimulation?.();
      (fg as { d3Alpha?: (a: number) => void }).d3Alpha?.(0.35);
    }
  }

  useEffect(() => {
    const handle = graphRef.current;
    if (handle) handle.applyViewForces = applyViewForces;
  });

  useEffect(() => {
    applyViewForces({ rebuildStructure: lastPhysicsStructureKey.current == null, reheat: settings.physics });
  }, []);

  useEffect(() => {
    if (lastPhysicsStructureKey.current == null) return;
    applyViewForces({ reheat: settings.physics, rebuildStructure: true });
  }, [settings.charge, settings.linkDistance, settings.collide, settings.physics]);

  function canvasAtClient(clientX: number, clientY: number) {
    const rect = hostRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    const cx = (rect?.width ?? width) / 2;
    const cy = (rect?.height ?? height) / 2;
    const { ox, oy } = viewCoverOffset(width, height);
    const rotated = rotatePoint(sx, sy, cx, cy, -rotationRef.current);
    return { x: rotated.x - ox, y: rotated.y - oy };
  }

  function overlayLabels() {
    return uprightText && Math.abs(rotationRef.current) > 1e-6;
  }

  function graphAtClient(clientX: number, clientY: number) {
    const p = canvasAtClient(clientX, clientY);
    return graphRef.current?.screen2GraphCoords(p.x, p.y) ?? { x: 0, y: 0 };
  }

  function groupLabelAt(clientX: number, clientY: number) {
    const p = canvasAtClient(clientX, clientY);
    for (const hit of groupLabelHitRef.current) {
      if (p.x >= hit.left && p.x <= hit.right && p.y >= hit.top && p.y <= hit.bottom) return hit.id;
    }
    return null;
  }

  function zoomK() {
    const fg = graphRef.current as (GraphHandle & { zoom?: () => number }) | undefined;
    const k = fg?.zoom?.();
    return typeof k === "number" && k > 0 ? k : 1;
  }

  function labelUnrotate() {
    return uprightText && Math.abs(rotationRef.current) > 1e-6 ? -rotationRef.current : 0;
  }

  function liveEngineNodes(): GraphNode[] {
    if (liveFrameRef.current) return liveFrameRef.current.nodes;
    const fg = graphRef.current as (GraphHandle & { graphData?: unknown }) | undefined;
    const raw = fg?.graphData;
    let list = graphData.nodes;
    try {
      const data = typeof raw === "function" ? (raw as () => { nodes?: GraphNode[] })() : raw as { nodes?: GraphNode[] } | undefined;
      list = data?.nodes ?? graphData.nodes;
    } catch {
      list = graphData.nodes;
    }
    liveFrameRef.current = { nodes: list, byId: new Map(list.map((n) => [n.id, n])) };
    return list;
  }

  function liveNodeById(id: string) {
    liveEngineNodes();
    return liveFrameRef.current?.byId.get(id);
  }

  function paintUprightLabels(globalScale: number) {
    const canvas = labelCanvasRef.current;
    if (!canvas) return;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!overlayLabels() || settings.showText === false) return;
    const fg = graphRef.current;
    if (!fg?.graph2ScreenCoords) return;
    const { ox, oy } = viewCoverOffset(width, height);
    const nodeScale = viewScale(settings.enlarge);
    const cardScale = viewScale(settings.cardScale, nodeScale);
    const textScale = viewScale(settings.textScale, nodeScale);
    const asCard = cardsAtZoom(Boolean(settings.cardInfo), globalScale);

    const screenOfNode = (x: number, y: number) => {
      const s = fg.graph2ScreenCoords(x, y);
      return rotatePoint(s.x + ox, s.y + oy, width / 2, height / 2, rotationRef.current);
    };

    for (const node of liveEngineNodes()) {
      if (node.x == null || node.y == null) continue;
      if (!isShown(node)) continue;
      const matched = isFiltered(node, mapSearch, settings.colorBy, filterOptions);
      const dim = !matched || isFlowDim(node);
      const selected = selectedSet.has(node.id);
      const hovered = node.id === hoveredId;
      const connecting = node.id === connectFrom;
      const r = dotRadius(node, globalScale, nodeScale);
      const p = screenOfNode(node.x, node.y);
      ctx.save();
      ctx.globalAlpha = (dim ? 0.16 : 1) * revealOpacity(node.id);
      if (asCard) {
        const { w, h } = cardBox(node, globalScale, cardScale);
        const sw = w * globalScale;
        const sh = h * globalScale;
        const rx = p.x - sw / 2;
        const ry = p.y + r * globalScale + 6;
        const rad = 7;
        ctx.fillStyle = palette.card;
        ctx.strokeStyle = selected || connecting ? palette.ring : withAlpha(nodeColor(node, settings.colorBy), 0.85);
        ctx.lineWidth = selected ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(rx + rad, ry);
        ctx.arcTo(rx + sw, ry, rx + sw, ry + sh, rad);
        ctx.arcTo(rx + sw, ry + sh, rx, ry + sh, rad);
        ctx.arcTo(rx, ry + sh, rx, ry, rad);
        ctx.arcTo(rx, ry, rx + sw, ry, rad);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(rx, ry, sw, sh);
        ctx.clip();
        const titlePad = sw - 16;
        const titleFit = fitWrappedText(ctx, node.title, titlePad, 1, 12 * textScale, 600);
        ctx.fillStyle = palette.cardText;
        ctx.font = `600 ${titleFit.fontPx}px ${LABEL_FONT}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        titleFit.lines.forEach((line, i) => {
          ctx.fillText(line, rx + 8, ry + 8 + i * (titleFit.fontPx + 3));
        });
        if (node.description) {
          const bodyFit = fitWrappedText(ctx, node.description, titlePad, 2, 10.5 * textScale, 400);
          ctx.fillStyle = palette.cardMuted;
          ctx.font = `400 ${bodyFit.fontPx}px ${LABEL_FONT}`;
          const bodyY = ry + 8 + titleFit.lines.length * (titleFit.fontPx + 3) + 4;
          bodyFit.lines.forEach((line, i) => {
            ctx.fillText(line, rx + 8, bodyY + i * (bodyFit.fontPx + 3));
          });
        }
      } else if (shouldLabel(node, globalScale, selected, hovered, Boolean(search && matched))) {
        ctx.globalAlpha = (dim ? 0.16 : 1) * (selected || hovered || node.level <= 1 ? 1 : smoothstep(0.28, 0.7, globalScale || 0.3));
        const weight = node.level === 0 ? 700 : 600;
        const titleFit = fitWrappedText(ctx, node.title, 148 * textScale, 2, 11 * textScale, weight);
        const rScreen = r * globalScale;
        ctx.font = `${weight} ${titleFit.fontPx}px ${LABEL_FONT}`;
        ctx.fillStyle = dim ? palette.labelDim : palette.label;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        titleFit.lines.forEach((line, i) => {
          ctx.fillText(line, p.x, p.y + rScreen + 4 + i * (titleFit.fontPx + 2));
        });
      }
      ctx.restore();
    }

    const cur = cursorGraph.current;
    if (placeArmed && cur) {
      const p = screenOfNode(cur.x, cur.y);
      const src = placeFrom ? graphData.nodes.find((n) => n.id === placeFrom) : null;
      const ghostLevel = src ? src.level + 1 : 2;
      const ghostSize = placeSize ?? sizeForLevel(ghostLevel);
      const r = dotRadius({ size: ghostSize, level: ghostLevel } as GraphNode, globalScale, nodeScale);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = palette.label;
      ctx.font = '600 11px "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("New idea", p.x, p.y + r * globalScale + 4);
      ctx.restore();
    }
  }

  function nodeAt(clientX: number, clientY: number, extraPad = 0) {
    const g = graphAtClient(clientX, clientY);
    const k = zoomK();
    const nodeScale = viewScale(settings.enlarge);
    const cardScale = viewScale(settings.cardScale, nodeScale);
    const cards = cardsAtZoom(Boolean(settings.cardInfo), k);
    const pickSlack = connectArmed || placeArmed ? 20 : 14;
    let best: GraphNode | null = null;
    let bestD = Infinity;
    for (const n of liveEngineNodes()) {
      if (n.x == null || n.y == null || !isShown(n)) continue;
      const r = nodePickRadius(n, k, nodeScale, pickSlack + extraPad);
      const d = Math.hypot(n.x - g.x, n.y - g.y);
      if (d <= r && d < bestD) {
        best = n;
        bestD = d;
      }
      if (cards) {
        const box = cardBox(n, k, cardScale);
        const discR = dotRadius(n, k, nodeScale);
        const local = labelUnrotate()
          ? rotatePoint(g.x, g.y, n.x, n.y, rotationRef.current)
          : { x: g.x, y: g.y };
        const lx = local.x - n.x;
        const ly = local.y - n.y;
        const top = discR + 6 / k;
        if (lx >= -box.w / 2 && lx <= box.w / 2 && ly >= top && ly <= top + box.h && d < bestD + box.w) {
          best = n;
          bestD = Math.min(bestD, d);
        }
      }
    }
    return best;
  }

  function isDouble(key: string) {
    const now = Date.now();
    const hit = Boolean(lastClick.current && lastClick.current.key === key && now - lastClick.current.t < 500);
    lastClick.current = { key, t: now };
    return hit;
  }

  function handleGraphClick(clientX: number, clientY: number, additive: boolean, forceDbl = false) {
    if (initRevealRef.current) return true;
    if (placeArmed) return false;
    const node = nodeAt(clientX, clientY);
    if (node) {
      skipBg.current = true;
      if (connectArmed) {
        onConnectTarget(node.id);
        return true;
      }
      onSelect(node.id, additive);
      return true;
    }
    if (connectArmed) return false;
    const linkId = linkAtId(clientX, clientY);
    if (linkId) {
      skipBg.current = true;
      if (forceDbl || isDouble(`link:${linkId}`)) {
        lastClick.current = null;
        onEditLink(linkId);
        return true;
      }
      onSelectLink(linkId);
      return true;
    }
    return false;
  }

  function linkAtId(clientX: number, clientY: number) {
    const g = graphAtClient(clientX, clientY);
    const k = zoomK();
    const thresh = 9 / k;
    const live = liveEngineNodes();
    const byId = new Map(live.map((n) => [n.id, n]));
    let bestId: string | null = null;
    let bestD = Infinity;
    for (const l of graphData.links) {
      const e = linkEnds(l);
      const src = byId.get(e.source);
      const tgt = byId.get(e.target);
      if (!src || !tgt || !isShown(src) || !isShown(tgt) || src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue;
      const d = distToSeg(g.x, g.y, src.x, src.y, tgt.x, tgt.y);
      if (d <= thresh && d < bestD) {
        bestId = l.id;
        bestD = d;
      }
    }
    return bestId;
  }

  function selectionHull(pad = 16) {
    const ids = selectedSet;
    if (ids.size < 1) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (const n of liveEngineNodes()) {
      if (!ids.has(n.id) || n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
      count += 1;
    }
    if (!count) return null;
    const p = pad / zoomK();
    return { x: minX - p, y: minY - p, w: maxX - minX + p * 2, h: maxY - minY + p * 2 };
  }

  function paintHighlightFlowLinks(ctx: CanvasRenderingContext2D, globalScale: number) {
    if (!highlightFlow) return;
    const k = Math.max(globalScale, 1e-4);
    for (const link of links) {
      if (isFlowLinkDim(link)) continue;
      const e = linkEnds(link);
      const src = liveNodeById(e.source) ?? nodeById.get(e.source);
      const tgt = liveNodeById(e.target) ?? nodeById.get(e.target);
      if (!src || !tgt || src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue;
      if (!isShown(src) || !isShown(tgt)) continue;
      const amount = flowPulseAmount(link);
      if (amount <= 0.08) continue;
      ctx.save();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = pulseHalo(amount, theme);
      ctx.lineWidth = (6 + amount * 10) / k;
      ctx.stroke();
      ctx.restore();
    }
  }

  function paintNamedGroups(ctx: CanvasRenderingContext2D, globalScale: number) {
    if (initRevealRef.current || !groups.length) return;
    const enlarge = viewScale(settings.enlarge);
    const k = Math.max(globalScale, 1e-4);
    const live = liveEngineNodes();
    const membersByGroup = new Map<string, GraphNode[]>();
    for (const node of live) {
      if (!node.groupId || node.x == null || node.y == null || !isShown(node)) continue;
      const list = membersByGroup.get(node.groupId);
      if (list) list.push(node);
      else membersByGroup.set(node.groupId, [node]);
    }
    const pointer = cursorGraph.current;
    const painted = groups.flatMap((group) => {
      const members = membersByGroup.get(group.id);
      if (!members?.length) return [];
      const disks = members.map((n) => ({
        x: n.x as number,
        y: n.y as number,
        r: groupMemberRadius(n, enlarge),
      }));
      return [{
        group,
        members,
        disks,
      }];
    });
    const cheap = simulatingRef.current;
    hullFrameRef.current += 1;
    const refreshCheap = cheap && hullFrameRef.current % 3 === 0;
    const fg = graphRef.current as (GraphHandle & {
      graph2ScreenCoords?: (x: number, y: number) => { x: number; y: number };
      screen2GraphCoords?: (x: number, y: number) => { x: number; y: number };
    }) | undefined;
    const labelAnchors: { id: string; sx: number; sy: number; title: string }[] = [];
    const labelWidths = new Map<string, number>();
    const labelPaint: {
      id: string;
      color: string;
      fade: number;
      hovered: boolean;
      title: string;
    }[] = [];
    for (const spec of painted) {
      const sig = spec.disks.map((d) => `${d.x | 0},${d.y | 0}`).join(";");
      const cached = hullCacheRef.current.get(spec.group.id);
      let hulls: Point[][];
      if (cached && cached.sig === sig && cached.cheap === cheap && (!cheap || !refreshCheap)) {
        hulls = cached.hulls;
      } else {
        const hull = groupBlobHull(spec.disks);
        hulls = hull.length >= 3 ? [hull] : [];
        hullCacheRef.current.set(spec.group.id, { sig, hulls, cheap });
      }
      if (!hulls.length) continue;
      const { group, members, disks } = spec;
      const color = groupPaintColor(group);
      const fade = members.reduce((least, node) => Math.min(least, revealOpacity(node.id)), 1);
      const hovered =
        members.some((n) => n.id === hoveredId) ||
        Boolean(pointer && hulls.some((hull) => pointInCell(pointer.x, pointer.y, hull)));
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = withAlpha(color, theme === "dark" ? 0.1 : 0.08);
      ctx.strokeStyle = color;
      ctx.lineWidth = hovered ? 1.8 / k : 1.15 / k;
      ctx.lineJoin = "round";
      for (const hull of hulls) {
        traceCellPath(ctx, hull);
        ctx.fill();
        ctx.stroke();
      }
      const apex = hulls.reduce<ReturnType<typeof hullApex>>((best, hull) => {
        const tip = hullApex(hull);
        if (!tip) return best;
        if (!best || tip.y < best.y) return tip;
        return best;
      }, null);
      const title = group.title.trim() || "Untitled group";
      const ax = apex?.x ?? disks[0].x;
      const ay = apex?.y ?? disks[0].y;
      const screen = fg?.graph2ScreenCoords?.(ax, ay) ?? { x: 0, y: 0 };
      labelWidths.set(group.id, measureGroupLabelWidth(ctx, title));
      labelAnchors.push({ id: group.id, sx: screen.x, sy: screen.y, title });
      labelPaint.push({ id: group.id, color, fade, hovered, title });
      ctx.restore();
    }

    const placements = layoutGroupLabels(
      labelAnchors,
      labelWidths,
      groupLabelOffsetRef.current,
      groupLabelPinnedRef.current,
    );
    groupLabelHitRef.current = placements.map((p) => ({
      id: p.id,
      left: p.cx - p.w / 2,
      top: p.cy - p.h / 2,
      right: p.cx + p.w / 2,
      bottom: p.cy + p.h / 2,
    }));

    for (const place of placements) {
      const meta = labelPaint.find((m) => m.id === place.id);
      if (!meta) continue;
      const graphPt = fg?.screen2GraphCoords?.(place.cx, place.cy) ?? { x: 0, y: 0 };
      const pointer = cursorGraph.current;
      const pointerCanvas = pointer && fg?.graph2ScreenCoords?.(pointer.x, pointer.y);
      const labelHovered =
        meta.hovered ||
        Boolean(
          pointerCanvas &&
            pointerCanvas.x >= place.cx - place.w / 2 &&
            pointerCanvas.x <= place.cx + place.w / 2 &&
            pointerCanvas.y >= place.cy - place.h / 2 &&
            pointerCanvas.y <= place.cy + place.h / 2,
        );
      ctx.save();
      ctx.globalAlpha = meta.fade;
      inScreenSpace(ctx, graphPt.x, graphPt.y, globalScale, () => {
        paintGroupLabelBadge(ctx, {
          title: meta.title,
          fill: withAlpha(meta.color, labelHovered ? 0.98 : 0.95),
          ink: groupColorInk(meta.color),
          w: place.w,
        });
      }, labelUnrotate());
      ctx.restore();
    }
  }

  function restoreDragLinkForces() {
    const linkForce = graphRef.current?.d3Force("link") as { strength?: (n: number) => void } | undefined;
    linkForce?.strength?.(REST_LINK_STRENGTH);
  }

  function applyElasticDragDelta(pinnedIds: Set<string>, dx: number, dy: number) {
    if (!dx && !dy) return;
    const physics = settingsRef.current.physics;
    const adj = buildUndirectedAdjacency(linksRef.current, (source, target) => {
      return isShown(nodeById.get(source)) && isShown(nodeById.get(target));
    });
    const hopLimit = physics ? ELASTIC_HOPS_PHYSICS : ELASTIC_HOPS_NO_PHYSICS;
    const followers = nodesWithinHops(pinnedIds, adj, hopLimit);

    for (const n of liveEngineNodes()) {
      const pin = pinnedIds.has(n.id);
      const follow = followers.has(n.id);
      if (!pin && !follow) continue;
      n.x = (n.x ?? 0) + dx;
      n.y = (n.y ?? 0) + dy;
      if (pin) {
        n.fx = n.x;
        n.fy = n.y;
        n.vx = 0;
        n.vy = 0;
      } else {
        n.fx = undefined;
        n.fy = undefined;
      }
    }

    if (physics) {
      const fg = graphRef.current;
      const linkForce = fg?.d3Force("link") as { strength?: (n: number) => void } | undefined;
      linkForce?.strength?.(DRAG_LINK_STRENGTH);
      fg?.d3ReheatSimulation?.();
      const fgAlpha = fg as { d3Alpha?: (a?: number) => number | undefined };
      const cur = fgAlpha.d3Alpha?.();
      fgAlpha.d3Alpha?.(Math.max(0.42, typeof cur === "number" ? cur : 0));
    }
  }

  function elasticDragSaveIds(pinnedIds: Set<string>) {
    const physics = settingsRef.current.physics;
    const adj = buildUndirectedAdjacency(linksRef.current, (source, target) => {
      return isShown(nodeById.get(source)) && isShown(nodeById.get(target));
    });
    const hopLimit = physics ? ELASTIC_HOPS_PHYSICS : ELASTIC_HOPS_NO_PHYSICS;
    const followers = nodesWithinHops(pinnedIds, adj, hopLimit);
    return new Set([...pinnedIds, ...followers]);
  }

  function moveSelected(dx: number, dy: number) {
    applyElasticDragDelta(selectedSet, dx, dy);
  }

  function moveGroupMembers(ids: Set<string>, dx: number, dy: number) {
    if (!dx && !dy) return;
    for (const n of liveEngineNodes()) {
      if (!ids.has(n.id)) continue;
      n.x = (n.x ?? 0) + dx;
      n.y = (n.y ?? 0) + dy;
      n.fx = n.x;
      n.fy = n.y;
      n.vx = 0;
      n.vy = 0;
    }
  }

  /** Drops the temporary engine hold placed on nodes while they were being dragged. */
  function releaseHeld(ids: Set<string>) {
    for (const n of liveEngineNodes()) {
      if (!ids.has(n.id)) continue;
      n.fx = undefined;
      n.fy = undefined;
    }
  }

  function showDeselectBadges() {
    return selectedSet.size > 1 && !placeArmed && !connectArmed;
  }

  /** Graph-space center of the "−" badge at a selected node's upper right, kept upright when the view is rotated. */
  function deselectBadgeCenter(n: GraphNode, k: number) {
    const enlarge = viewScale(settings.enlarge);
    const reach = ((dotRadius(n, k, enlarge) * k + deselectBadgePx(n, k, enlarge) * 0.4) * Math.SQRT1_2) / k;
    const a = labelUnrotate();
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return { x: (n.x ?? 0) + reach * cos + reach * sin, y: (n.y ?? 0) + reach * sin - reach * cos };
  }

  function deselectBadgeAt(clientX: number, clientY: number) {
    if (!showDeselectBadges()) return null;
    const g = graphAtClient(clientX, clientY);
    const k = zoomK();
    const enlarge = viewScale(settings.enlarge);
    let best: string | null = null;
    let bestD = Infinity;
    for (const n of liveEngineNodes()) {
      if (!selectedSet.has(n.id) || n.x == null || n.y == null) continue;
      const c = deselectBadgeCenter(n, k);
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      if (d <= (deselectBadgePx(n, k, enlarge) + 2) / k && d < bestD) {
        best = n.id;
        bestD = d;
      }
    }
    return best;
  }

  function nodesInLasso(points: Point[]) {
    const region = lassoRegion(points);
    if (region.length < 3) return [];
    return liveEngineNodes().filter((n) => isShown(n) && n.x != null && n.y != null && pointInPolygon(n.x, n.y, region));
  }

  function selectedPositions() {
    return liveEngineNodes()
      .filter((n) => selectedSet.has(n.id) && n.x != null && n.y != null)
      .map((n) => ({ id: n.id, x: n.x as number, y: n.y as number }));
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing) return;
      if (e.code === "Space") {
        e.preventDefault();
        spaceHeld.current = true;
        setGesture((g) => g ?? "pan");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
        setGesture((g) => (g === "pan" && !interaction.current ? null : g));
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const block = (e: Event) => e.preventDefault();
    host.addEventListener("auxclick", block);
    return () => host.removeEventListener("auxclick", block);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const trapWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const fg = graphRef.current;
      if (!fg) return;
      if (initRevealRef.current) return;
      const oldK = zoomK();
      const nextK = Math.max(GRAPH_MIN_ZOOM, Math.min(GRAPH_MAX_ZOOM, oldK * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      if (nextK === oldK) return;
      const g = graphAtClient(e.clientX, e.clientY);
      fg.zoom(nextK, 0);
      const after = graphAtClient(e.clientX, e.clientY);
      const c = fg.centerAt?.() ?? { x: 0, y: 0 };
      fg.centerAt(c.x + (g.x - after.x), c.y + (g.y - after.y), 0);
      onZoom(nextK);
    };
    host.addEventListener("wheel", trapWheel, { passive: false, capture: true });
    return () => host.removeEventListener("wheel", trapWheel, { capture: true });
  }, [graphRef, onZoom]);

  const cover = viewCoverOffset(width, height);

  return (
    <div
      ref={hostRef}
      className={`graph-host absolute inset-0${initReveal ? " pointer-events-none" : ""}${placeArmed || connectArmed ? " is-draw" : ""}${gesture === "marquee" ? " is-select" : ""}${gesture === "group" ? " is-grab" : ""}${gesture === "pan" ? " is-pan" : ""}${overBadge && !gesture ? " is-badge" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        if (initRevealRef.current) return;
        const handledByFg = fgContextHandled.current;
        fgContextHandled.current = false;
        const target = e.target as HTMLElement | null;
        if (target?.closest(".plus-wrap, .filter-panel, .site-left-rail, .left-panel-top, .left-panel-bottom, .canvas-tools, .view-compass, .history-panel, .info-panel, .item-actions, .edit-float, .ctx, .omp-header")) return;
        if (handledByFg) return;

        const node = nodeAt(e.clientX, e.clientY);
        if (node) {
          onNodeMenu(node.id, e.clientX, e.clientY);
          return;
        }
        const linkId = linkAtId(e.clientX, e.clientY);
        if (linkId) {
          onLinkMenu(linkId, e.clientX, e.clientY);
          return;
        }
        onBackgroundMenu(e.clientX, e.clientY);
      }}
      onDoubleClick={(e) => {
        if (e.button !== 0 || initRevealRef.current) return;
        handleGraphClick(e.clientX, e.clientY, e.shiftKey, true);
      }}
      onPointerDown={(e) => {
        skipBg.current = false;
        if (initRevealRef.current || placeArmed || connectArmed) return;
        if (e.button === 1 || (e.button === 0 && (spaceHeld.current || e.altKey))) {
          e.preventDefault();
          const c = graphRef.current?.centerAt?.() ?? { x: 0, y: 0 };
          interaction.current = { type: "pan", sx: e.clientX, sy: e.clientY, cx: c.x, cy: c.y };
          setGesture("pan");
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          return;
        }
        if (e.button !== 0) return;
        if (spaceHeld.current || e.altKey) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest(".plus-wrap, .filter-panel, .site-left-rail, .left-panel-top, .left-panel-bottom, .canvas-tools, .view-compass, .history-panel, .info-panel, .item-actions, .edit-float, .ctx, .omp-header")) return;
        const badgeId = deselectBadgeAt(e.clientX, e.clientY);
        if (badgeId) {
          skipBg.current = true;
          setOverBadge(false);
          onMarquee([badgeId], "subtract");
          return;
        }
        const groupLabelId = groupLabelAt(e.clientX, e.clientY);
        if (groupLabelId) {
          skipBg.current = true;
          const memberIds = liveEngineNodes()
            .filter((n) => n.groupId === groupLabelId && isShown(n))
            .map((n) => n.id);
          if (memberIds.length) handlersRef.current.onMarquee(memberIds, "replace");
          const g = graphAtClient(e.clientX, e.clientY);
          interaction.current = {
            type: "groupLabel",
            id: groupLabelId,
            memberIds,
            lastGx: g.x,
            lastGy: g.y,
            moved: false,
          };
          setDragLivePreview(true);
          setGesture("group");
          hostRef.current?.style.setProperty("cursor", "grabbing");
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          return;
        }
        const hit = nodeAt(e.clientX, e.clientY);
        if (hit) {
          skipBg.current = true;
          onSelect(hit.id, e.shiftKey);
          const g = graphAtClient(e.clientX, e.clientY);
          const ids = e.shiftKey
            ? (selectedSet.has(hit.id) ? [...selectedSet] : [...selectedSet, hit.id])
            : selectedSet.has(hit.id) && selectedSet.size > 1
              ? [...selectedSet]
              : [hit.id];
          interaction.current = { type: "drag", ids, lastX: g.x, lastY: g.y, sx: e.clientX, sy: e.clientY, moved: false };
          setDragLivePreview(true);
          setGesture("drag");
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          return;
        }
        if (linkAtId(e.clientX, e.clientY)) return;
        const g = graphAtClient(e.clientX, e.clientY);
        const hull = selectedSet.size > 1 ? selectionHull() : null;
        if (hull && g.x >= hull.x && g.x <= hull.x + hull.w && g.y >= hull.y && g.y <= hull.y + hull.h) {
          interaction.current = { type: "group", lastX: g.x, lastY: g.y, moved: false };
          setDragLivePreview(true);
          setGesture("group");
          skipBg.current = true;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          return;
        }
        skipBg.current = false;
        interaction.current = {
          type: "marquee",
          points: [{ x: g.x, y: g.y }],
          mode: e.shiftKey ? "add" : e.ctrlKey || e.metaKey ? "subtract" : "replace",
          sx0: e.clientX,
          sy0: e.clientY,
        };
        setGesture("marquee");
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (initRevealRef.current) return;
        cursorGraph.current = graphAtClient(e.clientX, e.clientY);
        if (!interaction.current) {
          const overGroupLabel = Boolean(groupLabelAt(e.clientX, e.clientY));
          suppressNodeHoverRef.current = overGroupLabel;
          if (overGroupLabel !== groupLabelPointerRef.current) {
            groupLabelPointerRef.current = overGroupLabel;
            onGroupLabelHover?.(overGroupLabel);
          }
          const badge = deselectBadgeAt(e.clientX, e.clientY);
          setOverBadge(badge != null);
          onHover(overGroupLabel ? null : badge ?? nodeAt(e.clientX, e.clientY, 12)?.id ?? null);
          const host = hostRef.current;
          if (host) host.style.cursor = overGroupLabel ? "grab" : "";
        }
        const it = interaction.current;
        if (!it) return;
        if (it.type === "groupLabel") {
          hostRef.current?.style.setProperty("cursor", "grabbing");
        }
        if (it.type === "marquee") {
          const g = graphAtClient(e.clientX, e.clientY);
          const k = zoomK();
          const last = it.points[it.points.length - 1];
          if (!last || Math.hypot(g.x - last.x, g.y - last.y) > 4 / k) {
            it.points.push({ x: g.x, y: g.y });
          } else {
            last.x = g.x;
            last.y = g.y;
          }
          if (Math.hypot(e.clientX - it.sx0, e.clientY - it.sy0) > 5) skipBg.current = true;
        } else if (it.type === "group") {
          const g = graphAtClient(e.clientX, e.clientY);
          const dx = g.x - it.lastX;
          const dy = g.y - it.lastY;
          if (dx || dy) {
            if (!it.moved) setNodesMoving(true);
            it.moved = true;
            moveSelected(dx, dy);
            it.lastX = g.x;
            it.lastY = g.y;
            hullCacheRef.current.clear();
          }
          graphRef.current?.resumeAnimation?.();
          skipBg.current = true;
        } else if (it.type === "groupLabel") {
          const g = graphAtClient(e.clientX, e.clientY);
          const dx = g.x - it.lastGx;
          const dy = g.y - it.lastGy;
          if (dx || dy) {
            if (!it.moved) setNodesMoving(true);
            moveGroupMembers(new Set(it.memberIds), dx, dy);
            it.lastGx = g.x;
            it.lastGy = g.y;
            it.moved = true;
            hullCacheRef.current.clear();
          }
          graphRef.current?.resumeAnimation?.();
          skipBg.current = true;
        } else if (it.type === "drag") {
          const g = graphAtClient(e.clientX, e.clientY);
          if (!it.moved && Math.hypot(e.clientX - it.sx, e.clientY - it.sy) < 4) return;
          if (!it.moved) setNodesMoving(true);
          it.moved = true;
          const idSet = new Set(it.ids);
          const dx = g.x - it.lastX;
          const dy = g.y - it.lastY;
          applyElasticDragDelta(idSet, dx, dy);
          it.lastX = g.x;
          it.lastY = g.y;
          hullCacheRef.current.clear();
          graphRef.current?.resumeAnimation?.();
          skipBg.current = true;
        } else if (it.type === "pan") {
          const k = zoomK();
          const delta = rotatePoint(e.clientX - it.sx, e.clientY - it.sy, 0, 0, -rotationRef.current);
          graphRef.current?.centerAt(it.cx - delta.x / k, it.cy - delta.y / k);
        }
      }}
      onPointerUp={(e) => {
        const it = interaction.current;
        const endDragLivePreview =
          it?.type === "groupLabel" || it?.type === "drag" || it?.type === "group" || dragLivePreview;
        interaction.current = null;
        if (endDragLivePreview) setDragLivePreview(false);
        setGesture(spaceHeld.current ? "pan" : null);
        const host = hostRef.current;
        if (host) {
          host.style.cursor = groupLabelAt(e.clientX, e.clientY) ? "grab" : "";
        }
        if (!it && e.button === 0 && (connectArmed || placeArmed)) {
          armedClickHandled.current = false;
          skipBg.current = true;
          if (handleGraphClick(e.clientX, e.clientY, e.shiftKey)) {
            armedClickHandled.current = true;
            return;
          }
          if (placeArmed) {
            const g = graphAtClient(e.clientX, e.clientY);
            onBackground(e.clientX, e.clientY, g);
            armedClickHandled.current = true;
          }
          return;
        }
        if (!it) return;
        if (it.type === "marquee") {
          if (Math.hypot(e.clientX - it.sx0, e.clientY - it.sy0) < 6) {
            skipBg.current = true;
            if (handleGraphClick(e.clientX, e.clientY, it.mode === "add")) return;
            const g = graphAtClient(e.clientX, e.clientY);
            onBackground(e.clientX, e.clientY, g);
            return;
          }
          skipBg.current = true;
          onMarquee(nodesInLasso(it.points).map((n) => n.id), it.mode);
        } else if (it.type === "group") {
          releaseHeld(selectedSet);
          restoreDragLinkForces();
          const saveIds = elasticDragSaveIds(selectedSet);
          onGroupMoveEnd(
            liveEngineNodes()
              .filter((n) => saveIds.has(n.id) && n.x != null && n.y != null)
              .map((n) => ({ id: n.id, x: n.x as number, y: n.y as number })),
          );
        } else if (it.type === "drag" && it.moved) {
          const idSet = new Set(it.ids);
          releaseHeld(idSet);
          restoreDragLinkForces();
          const saveIds = elasticDragSaveIds(idSet);
          onGroupMoveEnd(
            liveEngineNodes()
              .filter((n) => saveIds.has(n.id) && n.x != null && n.y != null)
              .map((n) => ({ id: n.id, x: n.x as number, y: n.y as number })),
          );
        } else if (it.type === "drag") {
          restoreDragLinkForces();
        } else if (it.type === "groupLabel") {
          const idSet = new Set(it.memberIds);
          releaseHeld(idSet);
          if (it.moved) {
            onGroupMoveEnd(
              liveEngineNodes()
                .filter((n) => idSet.has(n.id) && n.x != null && n.y != null)
                .map((n) => ({ id: n.id, x: n.x as number, y: n.y as number })),
            );
          }
        }
        setNodesMoving(false);
      }}
      onPointerLeave={() => {
        suppressNodeHoverRef.current = false;
        if (groupLabelPointerRef.current) {
          groupLabelPointerRef.current = false;
          onGroupLabelHover?.(false);
        }
        if (!interaction.current) {
          cursorGraph.current = null;
          onHover(null);
        }
      }}
    >
    <div
      className="graph-spin pointer-events-none absolute origin-center"
      style={{
        transform: `rotate(${rotation}rad)`,
        left: cover.ox,
        top: cover.oy,
        width: cover.cover,
        height: cover.cover,
      }}
    >
    <ForceGraph2D<GraphNode, GraphLink>
      ref={graphRef as never}
      width={cover.cover}
      height={cover.cover}
      graphData={graphData}
      backgroundColor={palette.bg}
      nodeId="id"
      nodeLabel={() => ""}
      nodeVisibility={(n) => isShown(n)}
      linkVisibility={(l) => {
        const e = linkEnds(l);
        return isShown(nodeById.get(e.source)) && isShown(nodeById.get(e.target));
      }}
      linkSource="source"
      linkTarget="target"
      cooldownTicks={settings.physics ? (revealing ? 40 : 320) : 0}
      d3VelocityDecay={0.32}
      d3AlphaDecay={0.018}
      minZoom={GRAPH_MIN_ZOOM}
      maxZoom={GRAPH_MAX_ZOOM}
      enableNodeDrag={false}
      enablePanInteraction={false}
      enableZoomInteraction={false}
      enablePointerInteraction={connectArmed || placeArmed}
      autoPauseRedraw={!highlightFlow && !dragLivePreview}
      warmupTicks={settings.physics && !revealing ? 20 : 0}
      nodeCanvasObjectMode={() => "replace"}
      onZoom={(t) => onZoom(t.k)}
      onEngineTick={() => {
        simulatingRef.current = true;
      }}
      onEngineStop={() => {
        simulatingRef.current = false;
        hullCacheRef.current.clear();
        graphRef.current?.resumeAnimation?.();
        if (!revealingRef.current) handlersRef.current.onSettle();
      }}
      onNodeHover={(n) => {
        if (initRevealRef.current) {
          onHover(null);
          return;
        }
        if (suppressNodeHoverRef.current) {
          onHover(null);
          return;
        }
        onHover(n?.id ?? null);
      }}
      onNodeDrag={(n, translate) => {
        if (!selectedSet.has(n.id) || selectedSet.size < 2) return;
        applyElasticDragDelta(selectedSet, translate.x, translate.y);
      }}
      onNodeDragEnd={(n) => {
        restoreDragLinkForces();
        if (selectedSet.has(n.id) && selectedSet.size > 1) {
          releaseHeld(selectedSet);
          onGroupMoveEnd(selectedPositions());
          return;
        }
        releaseHeld(new Set([n.id]));
        onDragEnd(n.id, n.x ?? 0, n.y ?? 0);
      }}
      onNodeClick={(n, ev) => {
        if (initRevealRef.current) return;
        if (armedClickHandled.current) {
          armedClickHandled.current = false;
          return;
        }
        skipBg.current = true;
        if (placeArmed) return;
        if (connectArmed) {
          onConnectTarget(n.id);
          return;
        }
        onSelect(n.id, ev.shiftKey);
      }}
      onNodeRightClick={(n, ev) => {
        ev.preventDefault();
        if (initRevealRef.current) return;
        fgContextHandled.current = true;
        onNodeMenu(n.id, ev.clientX, ev.clientY);
      }}
      onLinkRightClick={(l, ev) => {
        ev.preventDefault();
        if (initRevealRef.current) return;
        fgContextHandled.current = true;
        onLinkMenu(l.id, ev.clientX, ev.clientY);
      }}
      onLinkClick={(l, ev) => {
        if (initRevealRef.current) return;
        skipBg.current = true;
        if (placeArmed || connectArmed) return;
        if (ev.detail === 2 || isDouble(`link:${l.id}`)) {
          lastClick.current = null;
          onEditLink(l.id);
          return;
        }
        onSelectLink(l.id);
      }}
      linkHoverPrecision={10}
      onBackgroundClick={(ev) => {
        if (ev.button !== 0 || initRevealRef.current) return;
        if (armedClickHandled.current) {
          armedClickHandled.current = false;
          return;
        }
        if (placeArmed) return;
        if (connectArmed) return;
        if (skipBg.current) {
          skipBg.current = false;
          return;
        }
        if (handleGraphClick(ev.clientX, ev.clientY, ev.shiftKey, ev.detail === 2)) return;
        const g = graphAtClient(ev.clientX, ev.clientY);
        onBackground(ev.clientX, ev.clientY, g);
      }}
      linkColor={(l) => {
        const e = linkEnds(l);
        const fade = Math.min(revealOpacity(e.source), revealOpacity(e.target));
        const src = nodeById.get(e.source);
        const tgt = nodeById.get(e.target);
        const filterDim =
          (src && !isFiltered(src, mapSearch, settings.colorBy, filterOptions)) ||
          (tgt && !isFiltered(tgt, mapSearch, settings.colorBy, filterOptions));
        if (filterDim || isFlowLinkDim(l)) return fadeColor(palette.linkDim, fade);
        const pulse = flowPulseAmount(l);
        if (pulse > 0.05) return fadeColor(pulseStroke(pulse, theme), fade);
        const onFlow = highlightFlow && isFlowLink(l, highlightFlow.hops);
        const hot = l.id === selectedLinkId || selectedSet.has(e.source) || selectedSet.has(e.target);
        if (onFlow || hot) return fadeColor(palette.linkHot, fade);
        return fadeColor(palette.link, fade);
      }}
      linkWidth={(l) => {
        const e = linkEnds(l);
        const pulse = flowPulseAmount(l);
        const onFlow = highlightFlow && isFlowLink(l, highlightFlow.hops);
        const hot = l.id === selectedLinkId || selectedSet.has(e.source) || selectedSet.has(e.target);
        const base = onFlow
          ? theme === "dark" ? 2.55 : 2
          : hot
            ? theme === "dark" ? 2.1 : 1.5
            : theme === "dark" ? 1.45 : 0.95;
        return base + pulse * 2.4;
      }}
      linkDirectionalArrowLength={0}
      linkDirectionalArrowRelPos={0.82}
      linkDirectionalArrowColor={(l) => {
        const e = linkEnds(l);
        const fade = Math.min(revealOpacity(e.source), revealOpacity(e.target));
        const src = nodeById.get(e.source);
        const tgt = nodeById.get(e.target);
        const filterDim =
          (src && !isFiltered(src, mapSearch, settings.colorBy, filterOptions)) ||
          (tgt && !isFiltered(tgt, mapSearch, settings.colorBy, filterOptions));
        if (filterDim || isFlowLinkDim(l)) return fadeColor(palette.linkDim, fade);
        const pulse = flowPulseAmount(l);
        if (pulse > 0.05) return fadeColor(pulseStroke(pulse, theme), fade);
        const onFlow = highlightFlow && isFlowLink(l, highlightFlow.hops);
        const hot = l.id === selectedLinkId || selectedSet.has(e.source) || selectedSet.has(e.target);
        if (onFlow || hot) return fadeColor(palette.linkHot, fade);
        return fadeColor(palette.link, fade);
      }}
      linkCanvasObjectMode={(l) => (l.arrows === "one" || l.arrows === "both" ? "after" : undefined)}
      linkCanvasObject={(link, ctx, globalScale) => {
        if (link.arrows !== "one" && link.arrows !== "both") return;
        const src = typeof link.source === "object" ? link.source as GraphNode : nodeById.get(String(link.source));
        const tgt = typeof link.target === "object" ? link.target as GraphNode : nodeById.get(String(link.target));
        if (!src || !tgt || !isShown(src) || !isShown(tgt) || src.x == null || src.y == null || tgt.x == null || tgt.y == null) return;
        ctx.globalAlpha = Math.min(revealOpacity(src.id), revealOpacity(tgt.id));
        const e = linkEnds(link);
        const filterDim =
          !isFiltered(src, mapSearch, settings.colorBy, filterOptions) ||
          !isFiltered(tgt, mapSearch, settings.colorBy, filterOptions);
        const pulse = flowPulseAmount(link);
        const hot = link.id === selectedLinkId || selectedSet.has(e.source) || selectedSet.has(e.target);
        const onFlow = highlightFlow && isFlowLink(link, highlightFlow.hops);
        ctx.fillStyle = filterDim || isFlowLinkDim(link)
          ? palette.linkDim
          : pulse > 0.05
            ? pulseStroke(pulse, theme)
            : onFlow || hot
              ? palette.linkHot
              : palette.link;
        const size = 9 / globalScale;
        const along = (t: number) => ({
          x: src.x! + (tgt.x! - src.x!) * t,
          y: src.y! + (tgt.y! - src.y!) * t,
        });
        const tip = along(0.78);
        drawArrowHead(ctx, src.x, src.y, tip.x, tip.y, size);
        if (link.arrows === "both") {
          const back = along(0.22);
          drawArrowHead(ctx, tgt.x, tgt.y, back.x, back.y, size);
        }
      }}
      nodePointerAreaPaint={(node, color, ctx, globalScale) => {
        if (!isShown(node)) return;
        ctx.fillStyle = color;
        const nodeScale = viewScale(settings.enlarge);
        const cardScale = viewScale(settings.cardScale, nodeScale);
        const showCard = cardsAtZoom(Boolean(settings.cardInfo), globalScale);
        const pickSlack = connectArmed || placeArmed ? 20 : 14;
        if (showCard) {
          const r = dotRadius(node, globalScale, nodeScale);
          const { w, h } = cardBox(node, globalScale, cardScale);
          ctx.fillRect((node.x ?? 0) - w / 2, (node.y ?? 0) + r + 6 / globalScale, w, h);
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, nodePickRadius(node, globalScale, nodeScale, pickSlack), 0, Math.PI * 2);
          ctx.fill();
        } else {
          const r = nodePickRadius(node, globalScale, nodeScale, pickSlack);
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }}
      nodeCanvasObject={(node, ctx, globalScale) => {
        if (!isShown(node)) return;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const border = nodeColor(node, settings.colorBy);
        const matched = isFiltered(node, mapSearch, settings.colorBy, filterOptions);
        const dim = !matched || isFlowDim(node);
        const selected = selectedSet.has(node.id);
        const hovered = node.id === hoveredId;
        const connecting = node.id === connectFrom;
        const nodeScale = viewScale(settings.enlarge);
        const cardScale = viewScale(settings.cardScale, nodeScale);
        const textScale = viewScale(settings.textScale, nodeScale);
        const r = dotRadius(node, globalScale, nodeScale);
        const asCard = cardsAtZoom(Boolean(settings.cardInfo), globalScale);
        const showText = settings.showText !== false;
        const unrotate = labelUnrotate();
        const alpha = (dim ? 0.16 : 1) * revealOpacity(node.id);
        ctx.save();
        ctx.globalAlpha = alpha;

        const email = assigneeEmail(node);
        const photo = email ? photosRef.current.get(email) : undefined;
        const fill = email ? personStyle(email).color : NODE_FILL;
        const cls = nodeClassFromSize(node.size);
        traceNodeClassPath(ctx, x, y, r + 3.2 / globalScale, cls);
        ctx.fillStyle = withAlpha(fill, hovered || selected ? 0.28 : 0.12);
        ctx.fill();
        paintNodeDisc(ctx, {
          x,
          y,
          r,
          fill,
          border,
          globalScale,
          cls,
          selected,
          hovered,
          photo,
          initials: email && !(photo && photo.naturalWidth) ? employeeInitials(node.employee || email) : undefined,
          unassigned: !email,
          unrotate,
        });
        if (selected || connecting) {
          traceNodeClassPath(ctx, x, y, r + 2.2 / globalScale, cls);
          ctx.strokeStyle = connecting ? palette.connectRing : palette.ring;
          ctx.lineWidth = 1.2 / globalScale;
          ctx.stroke();
        }
        if (connectArmed && hovered && !connecting) {
          traceNodeClassPath(ctx, x, y, r + 4.5 / globalScale, cls);
          ctx.strokeStyle = palette.connectRing;
          ctx.lineWidth = 2.4 / globalScale;
          ctx.setLineDash([4 / globalScale, 3 / globalScale]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (overlayLabels()) {
          /* labels/cards paint on the unrotated overlay so they stay sharp */
        } else if (asCard) {
          const { w, h } = cardBox(node, globalScale, cardScale);
          ctx.globalAlpha = alpha;
          inScreenSpace(ctx, x, y, globalScale, (k) => {
            const sw = w * k;
            const sh = h * k;
            const rx = -sw / 2;
            const ry = r * k + 6;
            const rad = 7;
            ctx.fillStyle = palette.card;
            ctx.strokeStyle = selected || connecting ? palette.ring : withAlpha(border, 0.85);
            ctx.lineWidth = selected ? 1.5 : 1;
            ctx.beginPath();
            ctx.moveTo(rx + rad, ry);
            ctx.arcTo(rx + sw, ry, rx + sw, ry + sh, rad);
            ctx.arcTo(rx + sw, ry + sh, rx, ry + sh, rad);
            ctx.arcTo(rx, ry + sh, rx, ry, rad);
            ctx.arcTo(rx, ry, rx + sw, ry, rad);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            if (!showText) return;
            ctx.beginPath();
            ctx.rect(rx, ry, sw, sh);
            ctx.clip();
            const titlePad = sw - 16;
            const titleFit = fitWrappedText(ctx, node.title, titlePad, 1, 12 * textScale, 600);
            ctx.fillStyle = palette.cardText;
            ctx.font = `600 ${titleFit.fontPx}px ${LABEL_FONT}`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            titleFit.lines.forEach((line, i) => {
              ctx.fillText(line, rx + 8, ry + 8 + i * (titleFit.fontPx + 3));
            });
            if (node.description) {
              const bodyFit = fitWrappedText(ctx, node.description, titlePad, 2, 10.5 * textScale, 400);
              ctx.fillStyle = palette.cardMuted;
              ctx.font = `400 ${bodyFit.fontPx}px ${LABEL_FONT}`;
              const bodyY = ry + 8 + titleFit.lines.length * (titleFit.fontPx + 3) + 4;
              bodyFit.lines.forEach((line, i) => {
                ctx.fillText(line, rx + 8, bodyY + i * (bodyFit.fontPx + 3));
              });
            }
          }, unrotate);
        } else if (showText && shouldLabel(node, globalScale, selected, hovered, Boolean(search && matched))) {
          ctx.globalAlpha = alpha * smoothstep(0.28, 0.7, globalScale || 0.3);
          if (selected || hovered || node.level <= 1) ctx.globalAlpha = alpha;
          inScreenSpace(ctx, x, y, globalScale, (k) => {
            const weight = node.level === 0 ? 700 : 600;
            const rScreen = r * k;
            const outward = Math.hypot(x, y) > 80;
            const maxW = (outward ? 108 : 140) * textScale;
            const titleFit = fitWrappedText(ctx, node.title, maxW, 2, 11 * textScale, weight);
            ctx.font = `${weight} ${titleFit.fontPx}px ${LABEL_FONT}`;
            ctx.fillStyle = dim ? palette.labelDim : palette.label;
            if (outward) {
              const ang = Math.atan2(y, x);
              const lift = rScreen + 10;
              const lx = Math.cos(ang) * lift;
              const ly = Math.sin(ang) * lift;
              ctx.textAlign = Math.abs(Math.cos(ang)) < 0.35 ? "center" : Math.cos(ang) > 0 ? "left" : "right";
              ctx.textBaseline = Math.sin(ang) > 0.35 ? "top" : Math.sin(ang) < -0.35 ? "bottom" : "middle";
              titleFit.lines.forEach((line, i) => {
                const dy = (i - (titleFit.lines.length - 1) / 2) * (titleFit.fontPx + 2);
                ctx.fillText(line, lx, ly + dy);
              });
            } else {
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              titleFit.lines.forEach((line, i) => {
                ctx.fillText(line, 0, rScreen + 4 + i * (titleFit.fontPx + 2));
              });
            }
          }, unrotate);
        }

        ctx.restore();
      }}
      onRenderFramePost={(ctx, globalScale) => {
        try {
        paintHighlightFlowLinks(ctx, globalScale);
        paintNamedGroups(ctx, globalScale);
        const box = interaction.current;
        if (box?.type === "marquee" && box.points.length >= 1) {
          const pts = box.points;
          const cross = findSelfIntersection(pts);
          const region = lassoRegion(pts);
          const subtract = box.mode === "subtract";
          ctx.save();
          ctx.fillStyle = subtract
            ? "rgba(244, 63, 94, 0.12)"
            : theme === "dark" ? "rgba(91, 155, 213, 0.14)" : "rgba(27, 58, 107, 0.08)";
          ctx.strokeStyle = subtract ? "#f43f5e" : palette.ring;
          ctx.lineWidth = 1.1 / globalScale;
          if (region.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(region[0].x, region[0].y);
            for (let i = 1; i < region.length; i++) ctx.lineTo(region[i].x, region[i].y);
            ctx.closePath();
            ctx.fill();
          }
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.setLineDash([]);
          ctx.stroke();
          if (!cross && pts.length >= 2) {
            ctx.setLineDash([6 / globalScale, 4 / globalScale]);
            ctx.beginPath();
            ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            ctx.lineTo(pts[0].x, pts[0].y);
            ctx.stroke();
          }
          const tip = pts[pts.length - 1];
          if (region.length >= 3 && tip) {
            const count = nodesInLasso(pts).length;
            const sign = box.mode === "add" ? "+" : subtract ? "−" : "";
            const text = `${sign}${count} node${count === 1 ? "" : "s"}`;
            ctx.setLineDash([]);
            inScreenSpace(ctx, tip.x, tip.y, globalScale, () => {
              ctx.font = "600 11px \"Segoe UI\", sans-serif";
              const w = ctx.measureText(text).width + 12;
              ctx.fillStyle = subtract ? "#be123c" : "rgba(27, 58, 107, 0.92)";
              ctx.beginPath();
              ctx.roundRect(12, 10, w, 20, 10);
              ctx.fill();
              ctx.fillStyle = "#f3f2f1";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillText(text, 18, 20);
            }, labelUnrotate());
          }
          ctx.restore();
        } else if (selectedSet.size > 1) {
          const hull = selectionHull();
          if (hull) {
            ctx.save();
            ctx.strokeStyle = palette.ring;
            ctx.fillStyle = theme === "dark" ? "rgba(245, 245, 245, 0.04)" : "rgba(27, 58, 107, 0.04)";
            ctx.lineWidth = 1 / globalScale;
            ctx.setLineDash([5 / globalScale, 4 / globalScale]);
            ctx.fillRect(hull.x, hull.y, hull.w, hull.h);
            ctx.strokeRect(hull.x, hull.y, hull.w, hull.h);
            ctx.restore();
          }
          if (showDeselectBadges()) {
            for (const n of liveEngineNodes()) {
              if (!selectedSet.has(n.id) || n.x == null || n.y == null) continue;
              const c = deselectBadgeCenter(n, globalScale);
              const hot = n.id === hoveredId;
              const br = deselectBadgePx(n, globalScale, viewScale(settings.enlarge));
              inScreenSpace(ctx, c.x, c.y, globalScale, () => {
                ctx.beginPath();
                ctx.arc(0, 0, br, 0, Math.PI * 2);
                ctx.fillStyle = hot ? "#9f1239" : "#be123c";
                ctx.fill();
                ctx.lineWidth = 1.25;
                ctx.strokeStyle = palette.card;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-br * 0.5, 0);
                ctx.lineTo(br * 0.5, 0);
                ctx.lineWidth = Math.max(1.2, br * 0.26);
                ctx.lineCap = "round";
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
              });
            }
          }
        }
        const cur = cursorGraph.current;
        if (!cur) {
          paintUprightLabels(globalScale);
          return;
        }
        if (placeArmed) {
          const src = placeFrom ? graphData.nodes.find((n) => n.id === placeFrom) : null;
          const ghostLevel = src ? src.level + 1 : 2;
          const ghostSize = placeSize ?? sizeForLevel(ghostLevel);
          const ghostClass = nodeClassFromSize(ghostSize);
          const nodeScale = viewScale(settings.enlarge);
          const r = dotRadius({ size: ghostSize, level: ghostLevel } as GraphNode, globalScale, nodeScale);
          ctx.save();
          if (src && src.x != null && src.y != null) {
            ctx.strokeStyle = palette.linkHot;
            ctx.lineWidth = 1.35 / globalScale;
            ctx.setLineDash([5 / globalScale, 4 / globalScale]);
            ctx.beginPath();
            ctx.moveTo(src.x, src.y);
            ctx.lineTo(cur.x, cur.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.globalAlpha = 0.55;
          traceNodeClassPath(ctx, cur.x, cur.y, r + 3 / globalScale, ghostClass);
          ctx.fillStyle = withAlpha(NODE_FILL, 0.22);
          ctx.fill();
          paintNodeDisc(ctx, {
            x: cur.x,
            y: cur.y,
            r,
            fill: NODE_FILL,
            border: STATUS_COLORS.incomplete,
            globalScale,
            cls: ghostClass,
            unassigned: true,
            unrotate: labelUnrotate(),
          });
          ctx.fillStyle = palette.label;
          ctx.globalAlpha = 0.9;
          if (!overlayLabels()) {
            ctx.fillStyle = palette.label;
            ctx.globalAlpha = 0.9;
            inScreenSpace(ctx, cur.x, cur.y, globalScale, (k) => {
              ctx.font = "600 11px \"Segoe UI\", sans-serif";
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText("New idea", 0, r * k + 4);
            });
          }
          ctx.restore();
          paintUprightLabels(globalScale);
          return;
        }
        if (!connectFrom) {
          paintUprightLabels(globalScale);
          return;
        }
        const src = graphData.nodes.find((n) => n.id === connectFrom);
        if (!src || src.x == null || src.y == null) return;
        ctx.save();
        ctx.strokeStyle = palette.linkHot;
        ctx.fillStyle = palette.linkHot;
        ctx.lineWidth = 1.35 / globalScale;
        ctx.setLineDash([5 / globalScale, 4 / globalScale]);
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(cur.x, cur.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const head = 5.2 / globalScale;
        if (linkArrows === "one" || linkArrows === "both") {
          drawArrowHead(ctx, src.x, src.y, cur.x, cur.y, head);
        }
        if (linkArrows === "both") {
          drawArrowHead(ctx, cur.x, cur.y, src.x, src.y, head);
        }
        ctx.restore();
        paintUprightLabels(globalScale);
        } finally {
          liveFrameRef.current = null;
        }
      }}
    />
    </div>
    <canvas ref={labelCanvasRef} className="graph-labels pointer-events-none absolute inset-0" width={width} height={height} />
    </div>
  );
}

function lookSettingsEqual(a: GraphSettings, b: GraphSettings) {
  return (
    a.physics === b.physics &&
    a.charge === b.charge &&
    a.linkDistance === b.linkDistance &&
    a.collide === b.collide &&
    a.enlarge === b.enlarge &&
    a.textScale === b.textScale &&
    a.cardScale === b.cardScale &&
    a.colorBy === b.colorBy &&
    a.cardInfo === b.cardInfo &&
    a.showText === b.showText
  );
}

function canvasPropsEqual(prev: Props, next: Props) {
  return (
    prev.nodes === next.nodes &&
    prev.links === next.links &&
    prev.groups === next.groups &&
    prev.selectedIds === next.selectedIds &&
    prev.selectedLinkId === next.selectedLinkId &&
    prev.hoveredId === next.hoveredId &&
    prev.connectFrom === next.connectFrom &&
    prev.connectArmed === next.connectArmed &&
    prev.placeArmed === next.placeArmed &&
    prev.placeFrom === next.placeFrom &&
    prev.placeSize === next.placeSize &&
    prev.linkArrows === next.linkArrows &&
    prev.search === next.search &&
    prev.statusFilters === next.statusFilters &&
    prev.employeeFilter === next.employeeFilter &&
    prev.groupFilters === next.groupFilters &&
    prev.hideFiltered === next.hideFiltered &&
    prev.highlightIds === next.highlightIds &&
    prev.highlightFlow === next.highlightFlow &&
    prev.theme === next.theme &&
    prev.rotation === next.rotation &&
    prev.uprightText === next.uprightText &&
    prev.width === next.width &&
    prev.height === next.height &&
    lookSettingsEqual(prev.settings, next.settings)
  );
}

export default memo(GraphCanvas, canvasPropsEqual);
