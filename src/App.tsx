import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import DraftPrompt from "./components/DraftPrompt";
import FlowchartExportModal from "./components/FlowchartExportModal";
import GroupDeleteModal from "./components/GroupDeleteModal";
import EditLinkPanel from "./components/EditLinkPanel";
import EditNodePanel, { type NodeEditPreview } from "./components/EditNodePanel";
import FlowHighlightPanel from "./components/FlowHighlightPanel";
import GroupTreeCanvas from "./components/GroupTreeCanvas";
import GroupTreeInspector from "./components/GroupTreeInspector";
import LeftSidePanel from "./components/LeftSidePanel";
import PanelResizeHandle from "./components/PanelResizeHandle";
import PlusMenu from "./components/PlusMenu";
import PlusMenuButton from "./components/PlusMenuButton";
import ViewCompass from "./components/ViewCompass";
import GraphCanvas, { type GraphHandle, type LassoMode } from "./components/GraphCanvas";
import Header from "./components/Header";
import type { ExportKind } from "./components/ExportMenu";
import HistoryPanel from "./components/HistoryPanel";
import InfoPanel from "./components/InfoPanel";
import LinkContextMenu from "./components/LinkContextMenu";
import NodeContextMenu from "./components/NodeContextMenu";
import NodePreviewPanel from "./components/NodePreviewPanel";
import SelectionPanel from "./components/SelectionPanel";
import SyncChangesFeed from "./components/SyncChangesFeed";
import { nodeColor } from "./graph/colors";
import type { WorkflowStatus } from "./graph/workflowStatus";
import {
  addChildGroup,
  canAssignGroup,
  childrenOf,
  deleteGroup,
  groupDeleteImpact,
  inheritGroupFromFilter,
  type GroupDeleteImpact,
  isMapGroup,
  mapGroups,
  reorderSiblings,
  reparentGroup,
} from "./graph/groupTree";
import { ensureMapGroupTeams, groupsNeedTeamSync, setGroupLocked } from "./graph/groupTeams";
import type { GroupEditPatch } from "./components/GroupManager";
import { UNGROUPED_FILTER, groupTitle, nextGroupColor, normalizeGroupColor } from "./graph/groups";
import { addChild, addLink, blankNode, deleteNode, insertNodeBetween } from "./graph/ops";
import { GRAPH_MAX_ZOOM, GRAPH_MIN_ZOOM, mergeViewSettings } from "./graph/viewSettings";
import { degToRad, rotatePoint, viewCoverOffset } from "./graph/viewRotation";
import { directedFlowFrom } from "./graph/flow";
import { isFiltered, linkEnds, visibleGroupIdsForTree } from "./graph/visibility";
import { downloadTextFile } from "./export/csv";
import { buildFullCsv, flowchartPagesForGroups } from "./export/mapExport";
import { printDocumentationPdf, printFlowchartPdf } from "./export/print";
import { useMapSync } from "./hooks/useMapSync";
import { useResizablePanel } from "./hooks/useResizablePanel";
import { fetchMap } from "./lib/mapSync";
import { selectionPanelPlacement } from "./lib/floatPanelPlacement";
import { DEFAULT_SETTINGS, parseGroupNotes } from "./schema/graph";
import {
  downloadJson,
  loadViewRotation,
  loadViewSettings,
  newId,
  readJsonFile,
  saveDocument,
  saveViewRotation,
  saveViewSettings,
} from "./storage";
import { discardDrafts, hasDrafts, saveDrafts } from "./store/drafts";
import {
  applyGroupsRefresh,
  commitGraph,
  graphStore,
  persistPositions,
  redoNext,
  replaceGraph,
  undoLast,
  undoTo,
} from "./store/graph";
import { patchUi, showToast, toggleHistory, toggleInfo, uiStore } from "./store/ui";
import { ctxBox, cx } from "./styles";
import type { ArrowStyle, GraphLink, GraphNode, GraphSettings } from "./types";

type MenuState =
  | { kind: "node"; id: string; x: number; y: number }
  | { kind: "link"; id: string; x: number; y: number }
  | { kind: "canvas"; x: number; y: number };

type PickState = { kind: "node" | "link"; id: string };
type PlaceState = { parentId?: string; size?: number };
type PendingEdit = { kind: "node"; id: string } | { kind: "link"; id: string };

const POSITION_EPSILON = 0.5;

export default function App() {
  const nodes = useStore(graphStore, (s) => s.nodes);
  const links = useStore(graphStore, (s) => s.links);
  const groups = useStore(graphStore, (s) => s.groups ?? []);
  const actions = useStore(graphStore, (s) => s.actions);
  const future = useStore(graphStore, (s) => s.future);
  const hydration = useStore(graphStore, (s) => s.hydration);
  const liveStatus = useMapSync();
  const [settings, setSettings] = useState<GraphSettings>(() => loadViewSettings(DEFAULT_SETTINGS) ?? DEFAULT_SETTINGS);
  const theme = useStore(uiStore, (s) => s.theme);
  const historyOpen = useStore(uiStore, (s) => s.historyOpen);
  const infoOpen = useStore(uiStore, (s) => s.infoOpen);
  const toast = useStore(uiStore, (s) => s.toast);
  const leftRail = useResizablePanel("left");
  const editRail = useResizablePanel("edit");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [canvasView, setCanvasView] = useState<"map" | "groups">("map");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickState | null>(null);
  const [connect, setConnect] = useState<{ arrows: ArrowStyle; from?: string } | null>(null);
  const [placing, setPlacing] = useState<PlaceState | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<WorkflowStatus[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null);
  const [groupFilters, setGroupFilters] = useState<string[]>([]);
  /** Session-only flow highlight; never written to map storage or SQL. */
  const [highlightOriginId, setHighlightOriginId] = useState<string | null>(null);
  const [flowTrail, setFlowTrail] = useState<string[]>([]);
  const [draftPrompt, setDraftPrompt] = useState<{ proceed: () => void } | null>(null);
  const [groupDelete, setGroupDelete] = useState<GroupDeleteImpact | null>(null);
  const [flowchartExportOpen, setFlowchartExportOpen] = useState(false);
  const [groupsRefreshing, setGroupsRefreshing] = useState(false);
  const groupsRefreshingRef = useRef(false);
  const hideFiltered = statusFilters.length > 0 || employeeFilter != null || groupFilters.length > 0;
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [zoom, setZoom] = useState(1);
  const [viewRotation, setViewRotation] = useState(loadViewRotation);
  const [viewSpinning, setViewSpinning] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphHandle | undefined>(undefined);
  const importRef = useRef<HTMLInputElement>(null);
  const persistTimer = useRef<number | null>(null);
  const persistedPositions = useRef(new Map<string, { x: number; y: number }>());
  const persistLayoutAfterReorg = useRef(false);
  const [mapRevealing, setMapRevealing] = useState(true);
  const mapLoading = mapRevealing;
  const saveViewTimer = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const fittedOnce = useRef(false);
  const editSaveRef = useRef<(() => void) | null>(null);
  const [editLocked, setEditLocked] = useState(false);
  const [previewAnchorId, setPreviewAnchorId] = useState<string | null>(null);
  const [groupLabelHover, setGroupLabelHover] = useState(false);
  const [nodesMoving, setNodesMoving] = useState(false);
  const previewOverRef = useRef(false);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [editVisual, setEditVisual] = useState<NodeEditPreview | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const treeFilterVisibleIds = useMemo(
    () =>
      visibleGroupIdsForTree(groups, nodes, search, settings.colorBy, {
        statusFilters,
        employeeEmail: employeeFilter,
        groupIds: canvasView === "groups" ? [] : groupFilters,
      }),
    [groups, nodes, search, settings.colorBy, statusFilters, employeeFilter, groupFilters, canvasView],
  );
  const highlightFlow = useMemo(() => {
    if (!highlightOriginId) return null;
    if (!nodeById.has(highlightOriginId)) return null;
    return directedFlowFrom(highlightOriginId, links);
  }, [highlightOriginId, links, nodeById]);
  const highlightIds = useMemo(
    () => (highlightFlow ? [...highlightFlow.hops.keys()] : null),
    [highlightFlow],
  );
  const flowStepId = useMemo(() => {
    for (let i = flowTrail.length - 1; i >= 0; i -= 1) {
      const id = flowTrail[i];
      if (nodeById.has(id) && highlightFlow?.hops.has(id)) return id;
    }
    return highlightOriginId;
  }, [flowTrail, highlightFlow, highlightOriginId, nodeById]);
  const editing = editingId ? nodeById.get(editingId) ?? null : null;
  const editingLink = links.find((l) => l.id === editingLinkId) ?? null;

  /** Runs `proceed` now, or after the user resolves unsaved Title/Description drafts. */
  const guardDraft = useCallback((proceed: () => void) => {
    if (!hasDrafts()) {
      proceed();
      return;
    }
    setDraftPrompt({ proceed });
  }, []);

  useEffect(() => {
    if (groupLabelHover) {
      setPreviewAnchorId(null);
      return;
    }
    if (hoveredId) {
      setPreviewAnchorId(hoveredId);
      return;
    }
    if (previewOverRef.current) return;
    const timer = window.setTimeout(() => setPreviewAnchorId(null), 120);
    return () => window.clearTimeout(timer);
  }, [hoveredId, groupLabelHover]);

  const previewTargetId =
    !groupLabelHover && !editingLink && !menu && !placing && !connect && !editLocked
      ? (hoveredId ?? previewAnchorId)
      : null;
  const preview = previewTargetId ? nodeById.get(previewTargetId) ?? null : null;
  const graphNodes = useMemo(() => {
    if (!editVisual || !editingId) return nodes;
    return nodes.map((n) => (n.id === editingId ? { ...n, size: editVisual.size, color: editVisual.color } : n));
  }, [nodes, editingId, editVisual]);
  const previewNode = preview && editVisual && preview.id === editingId ? { ...preview, ...editVisual } : preview;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    saveViewRotation(viewRotation);
  }, [viewRotation]);

  useEffect(() => {
    if (saveViewTimer.current) window.clearTimeout(saveViewTimer.current);
    saveViewTimer.current = window.setTimeout(() => {
      saveViewTimer.current = 0;
      saveViewSettings(settings);
    }, 300);
    return () => {
      if (saveViewTimer.current) window.clearTimeout(saveViewTimer.current);
    };
  }, [settings]);

  useEffect(() => {
    if (!mapRevealing) fittedOnce.current = false;
    persistedPositions.current = new Map(
      graphStore.state.nodes.flatMap((n) => (n.x != null && n.y != null ? [[n.id, { x: n.x, y: n.y }] as const] : [])),
    );
  }, [hydration, mapRevealing]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(200, r.width), h: Math.max(200, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      saveDocument({ nodes, links, groups, settings: settingsRef.current });
    }, 450);
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [nodes, links, groups]);

  useEffect(() => {
    if (!editing && !editingLink) setEditLocked(false);
  }, [editing, editingLink]);

  // Remote deletes or undo can remove what the UI is pointing at.
  useEffect(() => {
    const linkIds = new Set(links.map((l) => l.id));
    setEditingId((cur) => (cur && !nodeById.has(cur) ? null : cur));
    setEditingLinkId((cur) => (cur && !linkIds.has(cur) ? null : cur));
    setSelectedIds((prev) => (prev.every((id) => nodeById.has(id)) ? prev : prev.filter((id) => nodeById.has(id))));
    setPicked((cur) => {
      if (!cur) return null;
      if (cur.kind === "node" && !nodeById.has(cur.id)) return null;
      if (cur.kind === "link" && !linkIds.has(cur.id)) return null;
      return cur;
    });
    setMenu((cur) => {
      if (!cur || cur.kind === "canvas") return cur;
      if (cur.kind === "node" && !nodeById.has(cur.id)) return null;
      if (cur.kind === "link" && !linkIds.has(cur.id)) return null;
      return cur;
    });
    const assignableIds = new Set(mapGroups(groups).map((group) => group.id));
    setGroupFilters((prev) => prev.filter((id) => id === UNGROUPED_FILTER || assignableIds.has(id)));
    setSelectedGroupId((current) => (current && groups.some((group) => group.id === current) ? current : null));
  }, [nodeById, links, groups]);

  useEffect(() => {
    if (!hydration || !groups.length) return;
    const next = groupsNeedTeamSync(groups);
    if (!next) return;
    commitGraph("Attached teams to map groups", { groups: next });
  }, [hydration, groups]);

  const dismissEditPanel = useCallback(() => {
    setEditLocked(false);
    setEditingId(null);
    setEditingLinkId(null);
    setPreviewAnchorId(null);
    setPendingEdit(null);
    setEditVisual(null);
  }, []);

  useEffect(() => {
    if (!pendingEdit) return;
    if (editingId !== null || editingLinkId !== null) return;
    const next = pendingEdit;
    const timer = window.setTimeout(() => {
      setPendingEdit(null);
      if (next.kind === "node") {
        setSelectedIds([next.id]);
        setPicked({ kind: "node", id: next.id });
        setEditingLinkId(null);
        setEditingId(next.id);
      } else {
        setSelectedIds([]);
        setPicked({ kind: "link", id: next.id });
        setEditingId(null);
        setEditingLinkId(next.id);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingEdit, editingId, editingLinkId]);

  const dismissPreview = useCallback(() => {
    setPreviewAnchorId(null);
    setSelectedIds([]);
    setPicked(null);
    setEditingId(null);
    setEditVisual(null);
  }, []);

  useEffect(() => {
    const linkEditing = editingLinkId !== null;
    if (!menu && !linkEditing) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const onGraph = Boolean(target.closest(".graph-host"));
      if (menu && !target.closest(".ctx, .plus-menu-floating")) {
        setMenu(null);
      }
      if (linkEditing && !editLocked && !target.closest(".edit-float") && !onGraph) {
        dismissEditPanel();
        setSelectedIds([]);
        setPicked(null);
      }
    };
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", onPointerDown, true), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [menu, editingLinkId, editLocked, dismissEditPanel]);

  function clearInteraction() {
    setMenu(null);
    setConnect(null);
    setPlacing(null);
    setPlusOpen(false);
    setEditingId(null);
    setEditingLinkId(null);
    setPicked(null);
    setSelectedIds([]);
    setPreviewAnchorId(null);
    setPendingEdit(null);
    setEditVisual(null);
    patchUi({ historyOpen: false, infoOpen: false });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        if (editLocked || draftPrompt || groupDelete || flowchartExportOpen) return;
        if (connect || placing) {
          guardDraft(clearInteraction);
          return;
        }
        if (highlightOriginId) {
          setHighlightOriginId(null);
          setFlowTrail([]);
          return;
        }
        guardDraft(clearInteraction);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editLocked) editSaveRef.current?.();
        else if (hasDrafts()) saveDrafts();
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (!editLocked) undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        if (!editLocked) redo();
      }
      if (e.key === "Delete") {
        if (editLocked || editingLinkId || groupDelete || flowchartExportOpen) return;
        if (canvasView === "groups") {
          if (selectedGroupId) deleteGroupFromTree(selectedGroupId);
          return;
        }
        if (picked?.kind === "link") removeLink(picked.id);
        else if (selectedIds.length) removeNodes(selectedIds);
      }
      if (canvasView === "map" && e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
        startPlace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function undo() {
    if (undoLast()) showToast("Undid action");
  }

  function redo() {
    if (redoNext()) showToast("Redid action");
  }

  function openContextMenu(next: MenuState) {
    if (editLocked) return;
    setMenu(next);
    setPlusOpen(false);
  }

  function liveGraphNodes() {
    const fg = graphRef.current as (GraphHandle & { graphData?: unknown }) | undefined;
    const raw = fg?.graphData;
    try {
      const data = typeof raw === "function" ? (raw as () => { nodes?: GraphNode[] })() : raw as { nodes?: GraphNode[] } | undefined;
      return data?.nodes ?? [];
    } catch {
      return [];
    }
  }

  function liveNode(id: string) {
    return liveGraphNodes().find((n) => n.id === id) ?? nodeById.get(id);
  }

  function savePositions(positions: { id: string; x: number; y: number }[], label: string) {
    for (const p of positions) persistedPositions.current.set(p.id, { x: p.x, y: p.y });
    persistPositions(positions, label);
  }

  function patchSettings(patch: Partial<GraphSettings>) {
    const forceOnly =
      (patch.charge !== undefined || patch.linkDistance !== undefined || patch.collide !== undefined) &&
      patch.physics === undefined &&
      patch.enlarge === undefined &&
      patch.textScale === undefined &&
      patch.cardScale === undefined &&
      patch.colorBy === undefined &&
      patch.showText === undefined;
    setSettings((current) => {
      const next = mergeViewSettings(current, patch);
      settingsRef.current = next;
      if (forceOnly) {
        graphRef.current?.applyViewForces?.({ reheat: next.physics, rebuildStructure: true });
      } else if (patch.physics !== undefined) {
        graphRef.current?.applyViewForces?.({ rebuildStructure: true, reheat: Boolean(next.physics) });
      } else if (
        patch.showText !== undefined ||
        patch.textScale !== undefined ||
        patch.cardScale !== undefined ||
        patch.enlarge !== undefined ||
        patch.colorBy !== undefined
      ) {
        graphRef.current?.resumeAnimation?.();
      }
      return next;
    });
  }

  function updateNode(id: string, patch: Partial<GraphNode>) {
    if (patch.groupId != null && !canAssignGroup(graphStore.state.groups, patch.groupId)) {
      showToast("Only locked groups can hold nodes");
      return;
    }
    const current = graphStore.state.nodes.find((n) => n.id === id);
    if (!current) return;
    const name = current.title.trim() || "node";
    let label = `Edited ${name}`;
    if (patch.color && Object.keys(patch).length === 1) {
      label = `Changed status of ${name}`;
    } else if (patch.size !== undefined && Object.keys(patch).length === 1) {
      label = `Changed class of ${name}`;
    } else if (patch.employee !== undefined && Object.keys(patch).length <= 2) {
      label = `Assigned ${name}`;
    } else if (patch.groupId !== undefined && Object.keys(patch).length === 1) {
      const groupName = patch.groupId
        ? groupTitle(graphStore.state.groups.find((g) => g.id === patch.groupId)?.title)
        : null;
      label = groupName ? `Moved ${name} into ${groupName}` : `Ungrouped ${name}`;
    }
    const nextNodes = graphStore.state.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
    commitGraph(label, { nodes: nextNodes }, `node:${id}:edit`);
  }

  function updateSelectedNodes(patch: Partial<GraphNode>, label: string) {
    if (patch.groupId != null && !canAssignGroup(graphStore.state.groups, patch.groupId)) {
      showToast("Only locked groups can hold nodes");
      return;
    }
    const ids = new Set(selectedIds);
    const nextNodes = graphStore.state.nodes.map((n) => (ids.has(n.id) ? { ...n, ...patch } : n));
    commitGraph(label, { nodes: nextNodes }, `selection:${Object.keys(patch).sort().join(",")}`);
  }

  function openNodeEditor(id: string) {
    if (mapLoading) return;
    setSelectedIds([id]);
    setPicked({ kind: "node", id });
    setEditingId(id);
    setEditVisual(null);
  }

  function addLooseNode(at: { x: number; y: number }) {
    const { nodes: current, links: currentLinks, groups: currentGroups } = graphStore.state;
    const parentId = placing?.parentId;
    const parent = parentId ? (liveNode(parentId) ?? null) : null;
    if (parent) {
      const next = addChild(current, currentLinks, parent, at, placing?.size);
      commitGraph(`Added node under ${parent.title || "node"}`, { nodes: next.nodes, links: next.links });
      openNodeEditor(next.id);
      setPlacing(null);
      return;
    }
    const created = blankNode({
      title: "New idea",
      level: 2,
      type: "concept",
      size: placing?.size,
      groupId: inheritGroupFromFilter(groupFilters, currentGroups),
      x: at.x,
      y: at.y,
    });
    commitGraph(`Added ${created.title}`, { nodes: [...current, created] });
    openNodeEditor(created.id);
    setPlacing(null);
  }

  function startPlace(parentId?: string, size?: number) {
    if (editLocked) return;
    guardDraft(() => {
      setConnect(null);
      setMenu(null);
      setEditingId(null);
      setEditingLinkId(null);
      setPlacing({ parentId, size });
      if (parentId) {
        setSelectedIds([parentId]);
        setPicked({ kind: "node", id: parentId });
      }
    });
  }

  function startLink(arrows: ArrowStyle, from?: string) {
    if (editLocked) return;
    guardDraft(() => {
      setPlacing(null);
      setMenu(null);
      setEditingId(null);
      setEditingLinkId(null);
      setConnect({ arrows, from });
      if (from) setSelectedIds([from]);
    });
  }

  function removeNode(id: string, branch: boolean) {
    const { nodes: current, links: currentLinks } = graphStore.state;
    const target = current.find((n) => n.id === id);
    const next = deleteNode(current, currentLinks, id, branch);
    commitGraph(
      branch ? `Deleted branch of ${target?.title || "node"}` : `Deleted ${target?.title || "node"}`,
      { nodes: next.nodes, links: next.links },
    );
    setMenu(null);
  }

  function removeNodes(ids: string[]) {
    let { nodes: nextNodes, links: nextLinks } = graphStore.state;
    for (const id of ids) {
      const next = deleteNode(nextNodes, nextLinks, id, false);
      nextNodes = next.nodes;
      nextLinks = next.links;
    }
    commitGraph(`Deleted ${ids.length} nodes`, { nodes: nextNodes, links: nextLinks });
    setSelectedIds([]);
    setPicked(null);
    setMenu(null);
  }

  function showCanvas(next: "map" | "groups") {
    if (next === "groups") {
      setMapRevealing(false);
      setPlacing(null);
      setConnect(null);
      setMenu(null);
      setPlusOpen(false);
      setPicked(null);
      setSelectedIds([]);
      setEditingId(null);
      setEditingLinkId(null);
    }
    setCanvasView(next);
  }

  function addGroup(parentId: string | null) {
    const currentGroups = graphStore.state.groups;
    const currentNodes = graphStore.state.nodes;
    if (parentId && !currentGroups.some((group) => group.id === parentId)) return;
    const id = newId();
    const parent = parentId ? currentGroups.find((group) => group.id === parentId) : null;
    const next = addChildGroup(currentGroups, currentNodes, parentId, {
      id,
      title: parent && isMapGroup(currentGroups, parent.id) ? "New team" : "New group",
      color: nextGroupColor(currentGroups),
    });
    const createdEarly = next.groups.find((group) => group.id === id);
    const groups =
      createdEarly && isMapGroup(next.groups, createdEarly.id)
        ? ensureMapGroupTeams(next.groups, newId, createdEarly.id)
        : next.groups;
    const created = groups.find((group) => group.id === id);
    const label = !parent
      ? "Added group"
      : created?.kind === "team"
        ? `Added team under ${groupTitle(parent.title)}`
        : `Added group under ${groupTitle(parent.title)}`;
    commitGraph(label, { ...next, groups });
    setSelectedGroupId(id);
    setCanvasView("groups");
  }

  function applyGroupTreeDrop(
    id: string,
    drop: { kind: "child"; parentId: string } | { kind: "adopt"; childId: string } | { kind: "reorder"; parentId: string | null; beforeId: string | null } | { kind: "root" },
  ) {
    const currentGroups = graphStore.state.groups;
    const currentNodes = graphStore.state.nodes;
    const current = currentGroups.find((group) => group.id === id);
    if (!current) return;

    if (drop.kind === "adopt") {
      if (drop.childId === id) return;
      const moved = reparentGroup(currentGroups, currentNodes, drop.childId, id);
      if (!moved) {
        showToast("That move would put a group inside itself");
        return;
      }
      const child = currentGroups.find((group) => group.id === drop.childId);
      commitGraph(`Moved ${groupTitle(child?.title)} under ${groupTitle(current.title)}`, {
        groups: moved.groups,
        nodes: moved.nodes,
      });
      return;
    }

    const parentId = drop.kind === "root" ? null : drop.parentId;
    const beforeId = drop.kind === "reorder" ? drop.beforeId : null;
    let nextGroups = currentGroups;
    let nextNodes = currentNodes;
    if ((current.parentId ?? null) !== parentId) {
      const moved = reparentGroup(nextGroups, nextNodes, id, parentId);
      if (!moved) {
        showToast("That move would put a group inside itself");
        return;
      }
      nextGroups = moved.groups;
      nextNodes = moved.nodes;
    }
    const sibs = childrenOf(nextGroups, parentId)
      .map((group) => group.id)
      .filter((groupId) => groupId !== id);
    const index = beforeId == null ? sibs.length : sibs.indexOf(beforeId);
    sibs.splice(index < 0 ? sibs.length : index, 0, id);
    const reparented = (current.parentId ?? null) !== parentId;
    const label = reparented ? "Moved group" : drop.kind === "reorder" ? "Reordered groups" : "Moved group";
    commitGraph(label, {
      groups: reorderSiblings(nextGroups, parentId, sibs),
      nodes: nextNodes,
    });
  }

  function deleteGroupFromTree(id: string) {
    const currentGroups = graphStore.state.groups;
    const currentNodes = graphStore.state.nodes;
    const group = currentGroups.find((item) => item.id === id);
    if (!group) return;
    setGroupDelete(groupDeleteImpact(currentGroups, currentNodes, id));
  }

  function confirmDeleteGroup() {
    const impact = groupDelete;
    if (!impact) return;
    const currentGroups = graphStore.state.groups;
    const currentNodes = graphStore.state.nodes;
    const removed = deleteGroup(currentGroups, currentNodes, impact.id);
    commitGraph(`Deleted ${impact.title}`, removed);
    setSelectedGroupId((current) => (current && impact.ids.includes(current) ? null : current));
    setGroupDelete(null);
  }

  async function refreshGroupsTree() {
    if (groupsRefreshingRef.current) return;
    groupsRefreshingRef.current = true;
    setGroupsRefreshing(true);
    try {
      const data = await fetchMap();
      if (data.kind !== "full") {
        showToast("Couldn't refresh groups");
        return;
      }
      applyGroupsRefresh(data);
      setSelectedGroupId((current) =>
        current && graphStore.state.groups.some((group) => group.id === current) ? current : null,
      );
      showToast("Groups refreshed");
    } catch {
      showToast("Couldn't refresh groups");
    } finally {
      groupsRefreshingRef.current = false;
      setGroupsRefreshing(false);
    }
  }

  function updateGroup(groupId: string, patch: GroupEditPatch) {
    const currentGroups = graphStore.state.groups;
    const currentNodes = graphStore.state.nodes;
    const current = currentGroups.find((group) => group.id === groupId);
    if (!current) return;
    if (patch.locked !== undefined) {
      const result = setGroupLocked(currentGroups, currentNodes, groupId, patch.locked, newId);
      if (result.error) {
        showToast(result.error);
        return;
      }
      commitGraph(patch.locked ? `Locked ${groupTitle(current.title)}` : `Unlocked ${groupTitle(current.title)}`, result);
      return;
    }
    const title = patch.title !== undefined ? groupTitle(patch.title) : current.title;
    const color = patch.color !== undefined ? normalizeGroupColor(patch.color) ?? current.color : current.color;
    const assignees = patch.assignees ?? current.assignees ?? [];
    const notes = patch.notes !== undefined ? parseGroupNotes(patch.notes) : (current.notes ?? "");
    const sameTitle = title === current.title;
    const sameColor = (color ?? "") === (current.color ?? "");
    const samePeople = JSON.stringify(assignees) === JSON.stringify(current.assignees ?? []);
    const sameNotes = notes === (current.notes ?? "");
    if (sameTitle && sameColor && sameNotes && (patch.assignees === undefined || samePeople)) return;
    const nextGroups = currentGroups.map((group) =>
      group.id === groupId ? { ...group, title, color, assignees, notes } : group,
    );
    const label = !samePeople
      ? `Updated people on ${groupTitle(current.title)}`
      : !sameNotes
        ? `Updated notes on ${groupTitle(current.title)}`
        : !sameColor
          ? "Changed group color"
          : "Renamed group";
    commitGraph(label, { groups: nextGroups });
  }

  function ungroup(ids: string[]) {
    const set = new Set(ids);
    const nextNodes = graphStore.state.nodes.map((n) => (set.has(n.id) ? { ...n, groupId: null } : n));
    commitGraph(`Ungrouped ${ids.length} nodes`, { nodes: nextNodes });
  }

  function removeLink(id: string) {
    commitGraph("Deleted connection", { links: graphStore.state.links.filter((l) => l.id !== id) });
    setMenu(null);
  }

  function insertNodeOnLink(linkId: string) {
    const { nodes: current, links: currentLinks } = graphStore.state;
    const next = insertNodeBetween(current, currentLinks, linkId, graphStore.state.groups);
    if (!next) return;
    commitGraph("Inserted node on connection", { nodes: next.nodes, links: next.links });
    openNodeEditor(next.id);
    setEditingLinkId(null);
    setMenu(null);
    showToast("Inserted node on connection");
  }

  function updateLink(id: string, patch: Partial<GraphLink>) {
    commitGraph(
      "Edited connection",
      { links: graphStore.state.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) },
      `link:${id}`,
    );
  }

  function flipLink(id: string) {
    commitGraph(
      "Flipped connection",
      {
        links: graphStore.state.links.map((l) => {
          if (l.id !== id) return l;
          const e = linkEnds(l);
          return { ...l, source: e.target, target: e.source };
        }),
      },
      `link:${id}`,
    );
  }

  function pickNode(id: string, additive = false) {
    if (mapLoading || editLocked) return;
    const leavesEditor = additive || (editingId !== null && editingId !== id);
    const apply = () => {
      setSelectedIds((prev) => {
        if (additive) return prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
        return [id];
      });
      setPicked({ kind: "node", id });
      setEditingLinkId(null);
      setMenu(null);
      setPlusOpen(false);
      if (additive) {
        setEditingId(null);
        setEditVisual(null);
        return;
      }
      if (editingId !== id) setEditVisual(null);
      setEditingId(id);
    };
    if (leavesEditor) guardDraft(apply);
    else apply();
  }

  function pickLink(id: string) {
    if (mapLoading || editLocked) return;
    guardDraft(() => {
      setSelectedIds([]);
      setPicked({ kind: "link", id });
      setEditingId(null);
      setEditVisual(null);
      setMenu(null);
      setPlusOpen(false);
    });
  }

  function requestLinkEdit(id: string) {
    if (editLocked) return;
    setMenu(null);
    setPlusOpen(false);
    if (editingLinkId === id && editingId === null) return;
    guardDraft(() => {
      if (editingId !== null || editingLinkId !== null) {
        setEditLocked(false);
        setPendingEdit({ kind: "link", id });
        setEditingId(null);
        setEditingLinkId(null);
        return;
      }
      setSelectedIds([]);
      setPicked({ kind: "link", id });
      setEditingId(null);
      setEditingLinkId(id);
    });
  }

  const nodeEditFocus = canvasView === "map" && Boolean(editing) && !placing && !connect;
  const flowFocus = canvasView === "map" && Boolean(highlightFlow) && !placing && !connect;
  const leftRailSize = nodeEditFocus || flowFocus ? editRail : leftRail;

  function centerOn(x: number, y: number) {
    const fg = graphRef.current as
      | (GraphHandle & {
          centerAt?: (x: number, y: number, ms?: number) => void;
          zoom?: (k?: number, ms?: number) => number;
        })
      | undefined;
    const k = fg?.zoom?.() ?? zoom;
    const rail = Math.min(Math.max(0, leftRailSize.width), Math.max(0, size.w - 48));
    const shift = rotatePoint(rail / 2, 0, 0, 0, -degToRad(viewRotation));
    fg?.centerAt?.(x - shift.x / Math.max(k, 1e-4), y - shift.y / Math.max(k, 1e-4), 400);
  }

  function stepFlow(id: string) {
    if (!highlightFlow?.hops.has(id)) return;
    const hop = highlightFlow.hops.get(id) ?? 0;
    setFlowTrail((prev) => {
      const idx = prev.indexOf(id);
      if (idx >= 0) return prev.slice(0, idx + 1);
      const prefix = prev.filter((item) => (highlightFlow.hops.get(item) ?? 0) < hop);
      const start = prefix.length ? prefix : highlightOriginId ? [highlightOriginId] : [];
      return [...start, id];
    });
  }

  function backFlow() {
    setFlowTrail((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

  useEffect(() => {
    if (highlightOriginId && !nodeById.has(highlightOriginId)) {
      setHighlightOriginId(null);
      setFlowTrail([]);
    }
  }, [highlightOriginId, nodeById]);

  useEffect(() => {
    if (!highlightOriginId) {
      setFlowTrail((prev) => (prev.length ? [] : prev));
      return;
    }
    setFlowTrail((prev) => {
      if (prev[0] === highlightOriginId && prev.length > 0) return prev;
      return [highlightOriginId];
    });
    setEditingId(null);
    setEditVisual(null);
  }, [highlightOriginId]);

  useEffect(() => {
    if (!highlightOriginId || !flowStepId) return;
    setSelectedIds([flowStepId]);
    setPicked({ kind: "node", id: flowStepId });
    const live = liveNode(flowStepId);
    if (live?.x != null && live.y != null) centerOn(live.x, live.y);
  }, [flowStepId, highlightOriginId]);

  function focusNode(id: string) {
    if (editLocked) return;
    const live = liveNode(id);
    if (!live) {
      showToast("That node no longer exists");
      return;
    }
    guardDraft(() => {
      setMenu(null);
      setPlacing(null);
      setConnect(null);
      setEditingLinkId(null);
      openNodeEditor(id);
      if (live.x != null && live.y != null) centerOn(live.x, live.y);
    });
  }

  function focusLink(id: string) {
    const link = graphStore.state.links.find((l) => l.id === id);
    if (!link) {
      showToast("That connection no longer exists");
      return;
    }
    const e = linkEnds(link);
    const a = liveNode(e.source);
    const b = liveNode(e.target);
    pickLink(id);
    if (a?.x != null && a.y != null && b?.x != null && b.y != null) centerOn((a.x + b.x) / 2, (a.y + b.y) / 2);
  }

  const visibleNodeBounds = useCallback(() => {
    const filterOptions = { statusFilters, employeeEmail: employeeFilter, groupIds: groupFilters };
    const toFit = nodes.filter((n) => {
      if (typeof n.x !== "number" || typeof n.y !== "number") return false;
      if (hideFiltered && !isFiltered(n, "", settings.colorBy, filterOptions)) return false;
      if (search.trim() && !isFiltered(n, search, settings.colorBy, filterOptions)) return false;
      return true;
    });
    if (!toFit.length) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of toFit) {
      minX = Math.min(minX, n.x!);
      maxX = Math.max(maxX, n.x!);
      minY = Math.min(minY, n.y!);
      maxY = Math.max(maxY, n.y!);
    }
    const pad = 180;
    const bboxW = Math.max(maxX - minX, 48);
    const bboxH = Math.max(maxY - minY, 48);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rail = Math.min(Math.max(0, leftRailSize.width), Math.max(0, size.w - 48));
    const visibleW = Math.max(48, size.w - rail);
    const fitZoom = Math.max(
      GRAPH_MIN_ZOOM,
      Math.min(Math.max(48, visibleW - pad * 2) / bboxW, Math.max(48, size.h - pad * 2) / bboxH, GRAPH_MAX_ZOOM),
    );
    const shift = rotatePoint(rail / 2, 0, 0, 0, -degToRad(viewRotation));
    return { cx: cx - shift.x / fitZoom, cy: cy - shift.y / fitZoom, fitZoom };
  }, [nodes, size.w, size.h, hideFiltered, search, settings.colorBy, statusFilters, employeeFilter, groupFilters, leftRailSize.width, viewRotation]);

  const fitGraph = useCallback(() => {
    const fg = graphRef.current as
      | (GraphHandle & {
          centerAt?: (x: number, y: number, ms?: number) => void;
          zoom?: (k?: number, ms?: number) => number;
        })
      | undefined;
    const bounds = visibleNodeBounds();
    if (!fg || !bounds) {
      if (!bounds) showToast("Nothing to fit — clear search or filters");
      return;
    }
    fg.centerAt?.(bounds.cx, bounds.cy, 400);
    window.setTimeout(() => fg.zoom?.(bounds.fitZoom, 400), 0);
  }, [visibleNodeBounds]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusFilters([]);
    setEmployeeFilter(null);
    setGroupFilters([]);
  }, []);

  useEffect(() => {
    const options = { statusFilters, employeeEmail: employeeFilter, groupIds: groupFilters };
    const onMap = (id: string) => {
      const node = nodeById.get(id);
      if (!node) return false;
      if (!hideFiltered) return true;
      return isFiltered(node, "", settings.colorBy, options);
    };
    setSelectedIds((prev) => {
      const next = prev.filter(onMap);
      return next.length === prev.length ? prev : next;
    });
    setEditingId((cur) => (cur && !onMap(cur) ? null : cur));
    setPicked((cur) => {
      if (!cur || cur.kind !== "node") return cur;
      return onMap(cur.id) ? cur : null;
    });
  }, [hideFiltered, search, statusFilters, employeeFilter, groupFilters, nodeById, settings.colorBy]);

  useEffect(() => {
    if (mapLoading || !nodes.length || size.w < 200) return;
    if (fittedOnce.current) return;
    const timer = window.setTimeout(() => {
      fitGraph();
      fittedOnce.current = true;
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mapLoading, nodes.length, size.w, size.h, fitGraph]);

  function reheat() {
    persistLayoutAfterReorg.current = true;
    setSettings((current) => {
      const next = mergeViewSettings(current, { physics: true });
      settingsRef.current = next;
      return next;
    });
    window.setTimeout(
      () => graphRef.current?.applyViewForces?.({ rebuildStructure: true, reheat: true, detangle: true }),
      20,
    );
  }

  function screenOf(x: number, y: number) {
    const s = graphRef.current?.graph2ScreenCoords(x, y) ?? { x: 80, y: 80 };
    const { ox, oy } = viewCoverOffset(size.w, size.h);
    const rotated = rotatePoint(s.x + ox, s.y + oy, size.w / 2, size.h / 2, degToRad(viewRotation));
    const rect = stageRef.current?.getBoundingClientRect();
    return { left: (rect?.left ?? 0) + rotated.x, top: (rect?.top ?? 0) + rotated.y };
  }

  const previewPos = useMemo(() => {
    if (!previewNode) return { left: 80, top: 80 };
    const live = liveNode(previewNode.id);
    if (!live || live.x == null || live.y == null) return { left: 80, top: 80 };
    const s = screenOf(live.x, live.y);
    const k = zoom || 1;
    const enlarge = Number.isFinite(settings.enlarge) ? settings.enlarge : 1;
    const base = (2.7 + previewNode.size * 2 + Math.max(0, 2.1 - previewNode.level * 0.32)) * enlarge;
    const r = Math.min(base * k, 6.5 + previewNode.size * 4.5 * enlarge);
    const gap = 14;
    const cardW = 240;
    const cardH = 84;
    let left = s.left + r + gap;
    let top = s.top - r - gap - cardH * 0.45;
    if (left + cardW > window.innerWidth - 12) {
      left = s.left - r - gap - cardW;
    }
    if (top < 56) {
      top = s.top + r + gap;
    }
    if (top + cardH > window.innerHeight - 12) {
      top = Math.max(56, s.top - r - gap - cardH);
    }
    return {
      left: Math.min(window.innerWidth - cardW - 12, Math.max(12, left)),
      top: Math.min(window.innerHeight - cardH - 12, Math.max(56, top)),
    };
  }, [previewNode, size, zoom, settings.enlarge, viewRotation]);

  const editLinkPos = useMemo(() => {
    if (!editingLink) return { left: 80, top: 80 };
    const e = linkEnds(editingLink);
    const a = liveNode(e.source);
    const b = liveNode(e.target);
    if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) return { left: 80, top: 80 };
    const s = screenOf((a.x + b.x) / 2, (a.y + b.y) / 2);
    return {
      left: Math.min(window.innerWidth - 300, Math.max(12, s.left + 18)),
      top: Math.min(window.innerHeight - 260, Math.max(60, s.top - 20)),
    };
  }, [editingLink, links, size, zoom, viewRotation]);

  const actionPos = useMemo(() => {
    if (selectedIds.length > 1) {
      const lives = selectedIds.map((id) => liveNode(id)).filter((n): n is GraphNode => Boolean(n && n.x != null && n.y != null));
      if (!lives.length) return { left: 80, top: 80 };
      const k = zoom || 1;
      const enlarge = Number.isFinite(settings.enlarge) ? settings.enlarge : 1;
      const screens = lives.map((n) => {
        const s = screenOf(n.x!, n.y!);
        const base = (2.7 + n.size * 2 + Math.max(0, 2.1 - n.level * 0.32)) * enlarge;
        const r = Math.min(base * k, 6.5 + n.size * 4.5 * enlarge) + 8;
        return { left: s.left, top: s.top, r };
      });
      return selectionPanelPlacement(screens);
    }
    if (!picked) return { left: 80, top: 80 };
    if (picked.kind === "node") {
      const live = liveNode(picked.id);
      if (!live || live.x == null || live.y == null) return { left: 80, top: 80 };
      const s = screenOf(live.x, live.y);
      return {
        left: Math.min(window.innerWidth - 160, Math.max(12, s.left + 16)),
        top: Math.min(window.innerHeight - 56, Math.max(60, s.top - 18)),
      };
    }
    const link = links.find((l) => l.id === picked.id);
    if (!link) return { left: 80, top: 80 };
    const e = linkEnds(link);
    const a = liveNode(e.source);
    const b = liveNode(e.target);
    if (!a || !b || a.x == null || a.y == null || b.x == null || b.y == null) return { left: 80, top: 80 };
    const s = screenOf((a.x + b.x) / 2, (a.y + b.y) / 2);
    return {
      left: Math.min(window.innerWidth - 160, Math.max(12, s.left + 12)),
      top: Math.min(window.innerHeight - 56, Math.max(60, s.top - 18)),
    };
  }, [picked, selectedIds, links, nodes, size, zoom, viewRotation, settings.enlarge, nodesMoving]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        nodeCount={nodes.length}
        linkCount={links.length}
        canvasView={canvasView}
        onCanvasView={showCanvas}
        liveStatus={liveStatus}
        historyCount={actions.length}
        historyOpen={historyOpen}
        infoOpen={infoOpen}
        theme={theme}
        onTheme={(next) => patchUi({ theme: next })}
        onExport={(kind: ExportKind) => {
          if (kind === "flowchart") {
            setFlowchartExportOpen(true);
            return;
          }
          showToast("Preparing export…");
          window.setTimeout(() => {
            void (async () => {
              try {
                if (kind === "csv") {
                  downloadTextFile(buildFullCsv(nodes, links, groups), "project-process.csv");
                  showToast("Exported CSV");
                  return;
                }
                if (kind === "docs") {
                  const delivery = await printDocumentationPdf(nodes, links, groups);
                  showToast(delivery === "downloaded" ? "Downloaded documentation PDF" : "Opened documentation PDF");
                  return;
                }
                downloadJson({ nodes, links, groups, settings });
                showToast("Exported JSON");
              } catch {
                showToast("Export failed");
              }
            })();
          }, 0);
        }}
        onImport={() => importRef.current?.click()}
        onHistory={toggleHistory}
        canUndo={actions.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onInfo={toggleInfo}
      />

      <div className="relative min-h-0 min-w-0 flex-1">
        <div
          className="stage relative h-full min-h-0 w-full overflow-hidden bg-[var(--graph-bg)]"
          ref={stageRef}
          style={{ ["--map-rail-w" as string]: `${leftRailSize.width}px` }}
        >
        {canvasView === "groups" ? (
          <GroupTreeCanvas
            groups={groups}
            nodes={nodes}
            onSelect={setSelectedGroupId}
            onPlace={applyGroupTreeDrop}
            onInvalid={() => showToast("That move would put a group inside itself")}
            onAddRoot={() => addGroup(null)}
            onUpdateGroup={updateGroup}
            onAddChild={(parentId) => addGroup(parentId)}
            onDelete={deleteGroupFromTree}
            onRefresh={refreshGroupsTree}
            refreshing={groupsRefreshing}
            filterVisibleIds={treeFilterVisibleIds}
            obscuredLeft={leftRailSize.width}
          />
        ) : (
        <>
        <div
          className="graph-wrap absolute inset-0 overflow-hidden"
          onContextMenu={(e) => e.preventDefault()}
        >
          <GraphCanvas
            nodes={graphNodes}
            links={links}
            groups={groups}
            settings={settings}
            settingsRef={settingsRef}
            selectedIds={selectedIds}
            selectedLinkId={picked?.kind === "link" ? picked.id : null}
            hoveredId={hoveredId}
            connectFrom={connect?.from ?? null}
            connectArmed={Boolean(connect)}
            placeArmed={Boolean(placing)}
            placeFrom={placing?.parentId ?? null}
            placeSize={placing?.size}
            linkArrows={connect?.arrows ?? "none"}
            search={search}
            statusFilters={statusFilters}
            employeeFilter={employeeFilter}
            groupFilters={groupFilters}
            hideFiltered={hideFiltered}
            highlightIds={highlightIds}
            highlightFlow={highlightFlow}
            spotlightId={flowFocus ? flowStepId : null}
            theme={theme}
            rotation={degToRad(viewRotation)}
            uprightText={!viewSpinning}
            width={size.w}
            height={size.h}
            graphRef={graphRef}
            onSelect={(id, additive) => {
              if (editLocked) return;
              if (id && highlightFlow?.hops.has(id) && !additive) {
                stepFlow(id);
                return;
              }
              if (id) pickNode(id, additive);
              else guardDraft(dismissPreview);
            }}
            onMarquee={(ids, mode: LassoMode) => {
              if (editLocked) return;
              guardDraft(() => {
                const next =
                  mode === "add"
                    ? Array.from(new Set([...selectedIds, ...ids]))
                    : mode === "subtract"
                      ? selectedIds.filter((id) => !ids.includes(id))
                      : ids;
                setSelectedIds(next);
                if (next.length === 1) {
                  setPicked({ kind: "node", id: next[0] });
                  setEditingId(next[0]);
                } else {
                  setPicked(null);
                  setEditingId(null);
                }
                setEditVisual(null);
                setEditingLinkId(null);
                setMenu(null);
              });
            }}
            onGroupMoveEnd={(positions) => savePositions(positions, `Moved ${positions.length} nodes`)}
            onNodesMoving={setNodesMoving}
            onSelectLink={pickLink}
            onHover={setHoveredId}
            onGroupLabelHover={setGroupLabelHover}
            onEditLink={(id) => requestLinkEdit(id)}
            onNodeMenu={(id, x, y) => {
              if (editLocked) return;
              const open = () => {
                setSelectedIds((prev) => (prev.includes(id) ? prev : [id]));
                if (editingId !== id) setEditVisual(null);
                setEditingId(id);
                setPicked({ kind: "node", id });
                openContextMenu({ kind: "node", id, x, y });
              };
              if (editingId !== null && editingId !== id) guardDraft(open);
              else open();
            }}
            onLinkMenu={(id, x, y) => openContextMenu({ kind: "link", id, x, y })}
            onBackgroundMenu={(x, y) => openContextMenu({ kind: "canvas", x, y })}
            onBackground={(_x, _y, graph) => {
              if (editLocked) return;
              if (placing) {
                addLooseNode(graph);
                return;
              }
              if (connect) {
                setMenu(null);
                return;
              }
              setMenu(null);
              setHighlightOriginId(null);
              setFlowTrail([]);
              guardDraft(() => {
                dismissEditPanel();
                dismissPreview();
              });
            }}
            onPlace={addLooseNode}
            onDragEnd={(id, x, y) => savePositions([{ id, x, y }], "Moved node")}
            onConnectTarget={(id) => {
              if (!connect) return;
              const from = connect.from;
              if (!from) {
                setConnect({ ...connect, from: id });
                setSelectedIds([id]);
                return;
              }
              commitGraph("Linked nodes", { links: addLink(graphStore.state.links, from, id, "cross", connect.arrows) });
              setConnect(null);
              showToast("Linked");
            }}
            onZoom={setZoom}
            onRevealActive={setMapRevealing}
            onSettle={() => {
              const moved = liveGraphNodes().flatMap((n) => {
                if (n.x == null || n.y == null) return [];
                const prev = persistedPositions.current.get(n.id);
                if (prev && Math.abs(prev.x - n.x) < POSITION_EPSILON && Math.abs(prev.y - n.y) < POSITION_EPSILON) return [];
                return [{ id: n.id, x: n.x, y: n.y }];
              });
              if (persistLayoutAfterReorg.current && moved.length && graphStore.state.hydrated) {
                persistLayoutAfterReorg.current = false;
                savePositions(moved, "Updated positions");
              } else {
                persistLayoutAfterReorg.current = false;
              }
              if (!mapRevealing && !fittedOnce.current) {
                fittedOnce.current = true;
                fitGraph();
              }
            }}
          />
        </div>

        {canvasView === "map" && !mapLoading && !nodeEditFocus && !flowFocus ? (
          <div className="absolute top-2 z-[10] w-fit pl-1.5" style={{ left: "var(--map-rail-w)" }}>
            <PlusMenuButton
              open={plusOpen}
              armed={Boolean(placing) || Boolean(connect)}
              onOpen={(open) => {
                if (open) {
                  setMenu(null);
                  setPicked(null);
                }
                setPlusOpen(open);
              }}
              onAddNode={(size) => startPlace(undefined, size)}
              onLink={(arrows) => startLink(arrows)}
            />
          </div>
        ) : null}

        {!mapLoading ? (
          <ViewCompass degrees={viewRotation} onChange={setViewRotation} onHoldChange={setViewSpinning} />
        ) : null}

        {(placing || connect || highlightOriginId || selectedIds.length > 1) && (
          <div className="absolute top-3 left-1/2 z-[8] -translate-x-1/2 rounded-full bg-[rgba(36,51,138,0.94)] px-3 py-1.5 text-xs font-bold tracking-wide text-white">
            {placing
              ? "Click to place a node · Esc to cancel"
              : connect?.from
                ? "Click the next node · Esc to cancel"
                : connect
                  ? "Click the first node · Esc to cancel"
                  : highlightOriginId
                    ? "Stepping through flow · Esc to clear"
                    : `${selectedIds.length} selected · Drag a selected node to move · − removes one · Esc to clear`}
          </div>
        )}

        </>
        )}

        <aside
            className="site-left-rail absolute top-0 left-0 z-[11] flex h-full flex-col overflow-visible border-r border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow)]"
            style={{ width: leftRailSize.width }}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {canvasView === "groups" ? (
              <GroupTreeInspector
                groups={groups}
                nodes={nodes}
                colorBy={settings.colorBy}
                search={search}
                statusFilters={statusFilters}
                employeeFilter={employeeFilter}
                groupFilters={groupFilters}
                onSearch={setSearch}
                onStatusFilters={setStatusFilters}
                onEmployeeFilter={setEmployeeFilter}
                onGroupFilters={setGroupFilters}
                onClearFilters={clearFilters}
                onAddRoot={() => addGroup(null)}
                onUpdateGroup={updateGroup}
              />
            ) : flowFocus && highlightFlow && highlightOriginId ? (
              <FlowHighlightPanel
                originId={highlightOriginId}
                currentId={flowStepId ?? highlightOriginId}
                flow={highlightFlow}
                nodes={nodes}
                links={links}
                groups={groups}
                canBack={flowTrail.length > 1}
                onClear={() => {
                  setHighlightOriginId(null);
                  setFlowTrail([]);
                }}
                onBack={backFlow}
                onStep={stepFlow}
              />
            ) : nodeEditFocus && editing ? (
              <div
                className="left-panel-edit is-tinted flex h-full min-h-0 flex-col overflow-hidden"
                style={{ ["--edit-accent" as string]: nodeColor(editing, settings.colorBy) }}
              >
                <EditNodePanel
                  key={editing.id}
                  variant="embedded"
                  node={editing}
                  nodes={nodes}
                  groups={groups}
                  colorBy={settings.colorBy}
                  flowHighlighted={highlightOriginId === editing.id}
                  onHighlightFlow={() => setHighlightOriginId((prev) => (prev === editing.id ? null : editing.id))}
                  onSave={(patch) => updateNode(editing.id, patch)}
                />
              </div>
            ) : (
              <LeftSidePanel
                search={search}
                statusFilters={statusFilters}
                employeeFilter={employeeFilter}
                groups={groups}
                groupFilters={groupFilters}
                nodes={nodes}
                settings={settings}
                colorBy={settings.colorBy}
                onSearch={setSearch}
                onStatusFilters={setStatusFilters}
                onEmployeeFilter={setEmployeeFilter}
                onGroupFilters={setGroupFilters}
                onClearFilters={clearFilters}
                onSettings={patchSettings}
                onResetSettings={() => {
                  const next = mergeViewSettings(DEFAULT_SETTINGS);
                  settingsRef.current = next;
                  setSettings(next);
                  graphRef.current?.applyViewForces?.({ rebuildStructure: true, reheat: false });
                }}
                onFit={fitGraph}
                onReorg={reheat}
                onTogglePhysics={() => {
                  const next = !settings.physics;
                  patchSettings({ physics: next });
                  if (next) persistLayoutAfterReorg.current = true;
                  window.setTimeout(
                    () => graphRef.current?.applyViewForces?.({ rebuildStructure: true, reheat: next }),
                    40,
                  );
                }}
                onUpdateGroup={updateGroup}
              />
            )}
            </div>
            <PanelResizeHandle
              side="left"
              value={leftRailSize.width}
              min={leftRailSize.min}
              max={leftRailSize.max}
              label={flowFocus ? "Resize flow panel" : nodeEditFocus ? "Resize edit panel" : "Resize side panel"}
              onChange={leftRailSize.setWidth}
              onCommit={leftRailSize.commit}
              onReset={leftRailSize.reset}
            />
          </aside>
        </div>
      </div>

      {canvasView === "map" && selectedIds.length > 1 && !menu && !editingLink && !connect && !placing && !nodesMoving && (
        <SelectionPanel
          key={selectedIds.join("|")}
          nodes={nodes.filter((n) => selectedIds.includes(n.id))}
          allNodes={nodes}
          groups={groups}
          colorBy={settings.colorBy}
          style={actionPos}
          onStatus={(_status, color) =>
            updateSelectedNodes({ color }, `Changed status of ${selectedIds.length} nodes`)
          }
          onAssign={(next) =>
            updateSelectedNodes(
              { employee: next.name, employeeEmail: next.email },
              next.name ? `Assigned ${selectedIds.length} nodes` : `Cleared assignees on ${selectedIds.length} nodes`,
            )
          }
          onDelete={() => removeNodes(selectedIds)}
          onAssignGroup={(groupId) => {
            if (!groupId) {
              ungroup(selectedIds);
              return;
            }
            const groupName = groupTitle(graphStore.state.groups.find((g) => g.id === groupId)?.title);
            updateSelectedNodes({ groupId }, `Moved ${selectedIds.length} nodes into ${groupName}`);
          }}
          onUpdateGroup={updateGroup}
        />
      )}

      {canvasView === "map" && menu?.kind === "node" && (() => {
        const ctxNode = nodeById.get(menu.id);
        if (!ctxNode) return null;
        return (
          <NodeContextMenu
            x={menu.x}
            y={menu.y}
            accent={nodeColor(ctxNode, settings.colorBy)}
            flowHighlighted={highlightOriginId === menu.id}
            onAddNode={(size) => startPlace(menu.id, size)}
            onLink={(arrows) => startLink(arrows, menu.id)}
            onHighlightFlow={() => {
              setHighlightOriginId((prev) => (prev === menu.id ? null : menu.id));
              setMenu(null);
            }}
            onDelete={() => removeNode(menu.id, false)}
            onDeleteBranch={() => removeNode(menu.id, true)}
          />
        );
      })()}

      {canvasView === "map" && menu?.kind === "link" && (() => {
        const ctxLink = links.find((l) => l.id === menu.id);
        if (!ctxLink) return null;
        return (
          <LinkContextMenu
            x={menu.x}
            y={menu.y}
            arrows={ctxLink.arrows}
            onArrows={(arrows) => {
              updateLink(menu.id, { arrows });
              setMenu(null);
            }}
            onFlip={() => flipLink(menu.id)}
            onInsert={() => insertNodeOnLink(menu.id)}
            onDelete={() => removeLink(menu.id)}
          />
        );
      })()}

      {canvasView === "map" && menu?.kind === "canvas" && (
        <div className={cx("plus-menu plus-menu-floating ctx", ctxBox, "w-[196px] min-w-0 rounded-lg p-1")} style={{ left: menu.x, top: menu.y }}>
          <PlusMenu
            onAddNode={(size) => startPlace(undefined, size)}
            onLink={(arrows) => startLink(arrows)}
            onClose={() => setMenu(null)}
          />
        </div>
      )}

      {editLocked && (
        <div
          className="edit-lock fixed inset-0 z-[85] bg-[rgba(12,16,24,0.38)]"
          onClick={() => window.alert("Save or cancel your edits before leaving this panel.")}
          onContextMenu={(e) => {
            e.preventDefault();
            window.alert("Save or cancel your edits before leaving this panel.");
          }}
        />
      )}

      {canvasView === "map" && previewNode && !flowFocus && (
        <NodePreviewPanel
          node={previewNode}
          colorBy={settings.colorBy}
          scale={settings.cardScale ?? settings.textScale ?? 1}
          style={previewPos}
          onPointerEnter={() => {
            previewOverRef.current = true;
          }}
          onPointerLeave={() => {
            previewOverRef.current = false;
            if (!hoveredId) setPreviewAnchorId(null);
          }}
        />
      )}

      {canvasView === "map" && editingLink && (
        <EditLinkPanel
          key={editingLink.id}
          link={editingLink}
          style={editLinkPos}
          saveRef={editSaveRef}
          onDirty={setEditLocked}
          onSave={(patch) => {
            updateLink(editingLink.id, patch);
            dismissEditPanel();
          }}
          onClose={() => {
            dismissEditPanel();
          }}
          onDelete={() => removeLink(editingLink.id)}
        />
      )}

      <SyncChangesFeed
        onJumpNode={focusNode}
        onJumpLink={focusLink}
        onJumpGroup={(id) => {
          if (canvasView === "groups" || !graphStore.state.nodes.some((node) => node.groupId === id)) {
            showCanvas("groups");
            setSelectedGroupId(id);
            if (canvasView !== "groups") showToast("Opened that group in the tree");
            return;
          }
          const member = graphStore.state.nodes.find((node) => node.groupId === id);
          if (member) focusNode(member.id);
        }}
      />

      <HistoryPanel
        open={historyOpen}
        history={actions}
        onUndo={(id) => {
          if (undoTo(id)) showToast("Undid action");
        }}
        onClose={() => patchUi({ historyOpen: false })}
      />

      <InfoPanel open={infoOpen} onClose={() => patchUi({ infoOpen: false })} />

      {groupDelete ? (
        <GroupDeleteModal
          impact={groupDelete}
          onConfirm={confirmDeleteGroup}
          onCancel={() => setGroupDelete(null)}
        />
      ) : null}

      {flowchartExportOpen ? (
        <FlowchartExportModal
          groups={groups}
          nodes={nodes}
          onCancel={() => setFlowchartExportOpen(false)}
          onExport={(groupIds) => {
            setFlowchartExportOpen(false);
            showToast("Preparing export…");
            window.setTimeout(() => {
              void (async () => {
                try {
                  const pages = flowchartPagesForGroups(nodes, links, groups, groupIds);
                  const delivery = await printFlowchartPdf(pages);
                  const opened = delivery === "downloaded" ? "Downloaded" : "Opened";
                  showToast(pages.length === 1 ? `${opened} flowchart PDF` : `${opened} flowchart PDF for ${pages.length} groups`);
                } catch {
                  showToast("Export failed");
                }
              })();
            }, 0);
          }}
        />
      ) : null}

      {draftPrompt && (
        <DraftPrompt
          onSave={() => {
            saveDrafts();
            const { proceed } = draftPrompt;
            setDraftPrompt(null);
            proceed();
          }}
          onDiscard={() => {
            discardDrafts();
            const { proceed } = draftPrompt;
            setDraftPrompt(null);
            proceed();
          }}
          onCancel={() => setDraftPrompt(null)}
        />
      )}

      {toast && <div className="fixed bottom-[18px] left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-[#1b1b1b] px-3 py-2 text-xs text-white dark:bg-[#f3f2f1] dark:text-[#1b1b1b]">{toast}</div>}
      <input
        ref={importRef}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const doc = await readJsonFile(file);
            replaceGraph(doc, "Imported graph");
            setSettings(mergeViewSettings(settings, doc.settings));
            fittedOnce.current = false;
            showToast("Imported graph");
          } catch {
            showToast("Could not import that file");
          }
        }}
      />
    </div>
  );
}
