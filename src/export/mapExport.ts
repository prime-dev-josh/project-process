import { childrenOf as nodeChildren, linkEnds } from "../graph/visibility";
import { childrenOf as groupChildren, groupPath, isLeaf, leafGroups, rootGroups } from "../graph/groupTree";
import { groupPaintColor, groupTitle, UNGROUPED_FILTER } from "../graph/groups";
import { nodeClassFromSize, nodeClassLabel } from "../graph/nodeClass";
import { KIND_LABEL } from "../graph/ops";
import { nodeWorkflowStatus, WORKFLOW_STATUS_META } from "../graph/workflowStatus";
import type { GraphGroup, GraphLink, GraphNode } from "../types";
import { csvTable } from "./csv";

export type FlowchartBox = {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "start" | "process" | "end";
};

export type FlowchartEdge = {
  id: string;
  from: string;
  to: string;
  arrows: GraphLink["arrows"];
  kind: GraphLink["kind"];
  label: string;
};

export type FlowchartLayout = {
  boxes: FlowchartBox[];
  edges: FlowchartEdge[];
  width: number;
  height: number;
  /** Vertical rail label, usually the group name. */
  label: string;
  color: string;
};

export type FlowchartGroupPage = {
  groupId: string;
  title: string;
  path: string;
  color: string;
  nodes: GraphNode[];
  links: GraphLink[];
};

export type DocSection = {
  id: string;
  number: string;
  title: string;
  depth: number;
  description: string;
  status: string;
  assignee: string;
  groupId: string | null;
  groupPath: string;
  nodeClass: string;
  kind: string;
  children: string[];
  inbound: string[];
  outbound: string[];
};

/** Portrait content box. One chart page stays inside these bounds so print does not shrink titles. */
const PAGE_W = 720;
const CHART_H = 760;
const RAIL_W = 46;
const GAP_X = 16;
const GAP_Y = 34;
const CONTENT_X = RAIL_W + 18;
const CONTENT_W = PAGE_W - CONTENT_X - 16;
const MIN_BOX_W = 150;

function nodeTitle(node: GraphNode) {
  const title = node.title.trim();
  return title || "Untitled";
}

function statusLabel(node: GraphNode) {
  const id = nodeWorkflowStatus(node, "custom");
  return WORKFLOW_STATUS_META.find((item) => item.id === id)?.label ?? id;
}

function nodePath(nodes: GraphNode[], id: string): GraphNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: GraphNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function nodeHierarchyRoots(nodes: GraphNode[]): GraphNode[] {
  const known = new Set(nodes.map((node) => node.id));
  return nodes
    .filter((node) => !node.parentId || !known.has(node.parentId))
    .sort((a, b) => nodeTitle(a).localeCompare(nodeTitle(b)) || a.id.localeCompare(b.id));
}

export function walkNodeForest(
  nodes: GraphNode[],
  visit: (node: GraphNode, depth: number, indexPath: number[]) => void,
) {
  const walk = (parentId: string | null, depth: number, path: number[]) => {
    const kids =
      parentId == null
        ? nodeHierarchyRoots(nodes)
        : nodeChildren(nodes, parentId).sort(
            (a, b) => nodeTitle(a).localeCompare(nodeTitle(b)) || a.id.localeCompare(b.id),
          );
    kids.forEach((kid, index) => {
      const next = [...path, index + 1];
      visit(kid, depth, next);
      walk(kid.id, depth + 1, next);
    });
  };
  walk(null, 0, []);
}

export function outlineNumber(path: number[]) {
  return path.join(".");
}

export function nodeLinkLists(nodes: GraphNode[], links: GraphLink[]) {
  const titles = new Map(nodes.map((node) => [node.id, nodeTitle(node)]));
  const inbound = new Map<string, string[]>();
  const outbound = new Map<string, string[]>();
  for (const node of nodes) {
    inbound.set(node.id, []);
    outbound.set(node.id, []);
  }
  for (const link of links) {
    const ends = linkEnds(link);
    if (!titles.has(ends.source) || !titles.has(ends.target)) continue;
    outbound.get(ends.source)?.push(titles.get(ends.target) ?? ends.target);
    inbound.get(ends.target)?.push(titles.get(ends.source) ?? ends.source);
  }
  return { inbound, outbound };
}

export function buildFullCsv(nodes: GraphNode[], links: GraphLink[], groups: GraphGroup[]) {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeRows: Array<Array<string | number>> = [];
  walkNodeForest(nodes, (node, _depth, path) => {
    const groupId = node.groupId ?? "";
    nodeRows.push([
      node.id,
      nodeTitle(node),
      node.description,
      outlineNumber(path),
      node.parentId ?? "",
      node.parentId ? nodeTitle(nodeById.get(node.parentId) ?? ({ title: "" } as GraphNode)) : "",
      KIND_LABEL[node.type] ?? node.type,
      nodeClassLabel(nodeClassFromSize(node.size)),
      statusLabel(node),
      node.employee,
      node.employeeEmail,
      groupId,
      groupId ? groupPath(groups, groupId).join(" / ") : "",
      node.level,
      node.x ?? "",
      node.y ?? "",
    ]);
  });

  const groupRows: Array<Array<string | number | boolean>> = [];
  const walkGroups = (parentId: string | null, path: number[]) => {
    const kids = parentId == null ? rootGroups(groups) : groupChildren(groups, parentId);
    kids.forEach((group, index) => {
      const next = [...path, index + 1];
      groupRows.push([
        group.id,
        groupTitle(group.title),
        outlineNumber(next),
        group.parentId ?? "",
        group.parentId ? groupTitle(groupById.get(group.parentId)?.title) : "",
        groupPath(groups, group.id).join(" / "),
        isLeaf(groups, group.id) ? "group" : "folder",
        groupPaintColor(group),
        group.sortOrder ?? 0,
      ]);
      walkGroups(group.id, next);
    });
  };
  walkGroups(null, []);

  const linkRows = links.map((link) => {
    const ends = linkEnds(link);
    return [
      link.id,
      ends.source,
      nodeTitle(nodeById.get(ends.source) ?? ({ title: ends.source } as GraphNode)),
      ends.target,
      nodeTitle(nodeById.get(ends.target) ?? ({ title: ends.target } as GraphNode)),
      link.kind,
      link.arrows,
    ];
  });

  const nodesCsv = csvTable(
    [
      "id",
      "title",
      "description",
      "outline",
      "parent_id",
      "parent_title",
      "kind",
      "class",
      "status",
      "assignee",
      "assignee_email",
      "group_id",
      "group_path",
      "level",
      "x",
      "y",
    ],
    nodeRows,
  );
  const groupsCsv = csvTable(
    ["id", "title", "outline", "parent_id", "parent_title", "path", "kind", "color", "sort_order"],
    groupRows,
  );
  const linksCsv = csvTable(
    ["id", "source_id", "source_title", "target_id", "target_title", "kind", "arrows"],
    linkRows,
  );

  return ["# Nodes", nodesCsv, "", "# Groups", groupsCsv, "", "# Links", linksCsv].join("\r\n");
}

export function buildDocumentation(nodes: GraphNode[], links: GraphLink[], groups: GraphGroup[]): DocSection[] {
  const { inbound, outbound } = nodeLinkLists(nodes, links);
  const sections: DocSection[] = [];
  walkNodeForest(nodes, (node, depth, path) => {
    const groupId = node.groupId ?? null;
    sections.push({
      id: node.id,
      number: outlineNumber(path),
      title: nodeTitle(node),
      depth,
      description: node.description.trim(),
      status: statusLabel(node),
      assignee: node.employee.trim() || node.employeeEmail.trim() || "Unassigned",
      groupId,
      groupPath: groupId ? groupPath(groups, groupId).join(" / ") : "Ungrouped",
      nodeClass: nodeClassLabel(nodeClassFromSize(node.size)),
      kind: KIND_LABEL[node.type] ?? node.type,
      children: nodeChildren(nodes, node.id).map(nodeTitle),
      inbound: inbound.get(node.id) ?? [],
      outbound: outbound.get(node.id) ?? [],
    });
  });
  return sections;
}

export type DocStep = {
  id: string;
  /** Outline number under its section, such as `1.2.3` or `1.2.3.1.1`. */
  number: string;
  title: string;
  description: string;
  /** Side paths that leave this step. The main continuation stays in the parent process. */
  branches: DocProcess[];
};

export type DocProcess = {
  id: string;
  /** `1.2` for a process, `1.2.3.1` for a branch under that step. */
  number: string;
  /** `From {start}` for a process root; the first step's title for a nested branch. */
  title: string;
  kind: "process" | "branch";
  steps: DocStep[];
};

export type DocBookPart = {
  id: string;
  number: number;
  title: string;
  path: string;
  color: string;
  processes: DocProcess[];
  /** Subsection number for leftovers, after the processes in this section. */
  otherNumber: string;
  other: DocStep[];
};

type WalkEdge = { to: string; kind: GraphLink["kind"] };
type PathScore = { reachesEnd: boolean; hops: number };

function compareNodes(a: GraphNode, b: GraphNode) {
  return nodeTitle(a).localeCompare(nodeTitle(b)) || a.id.localeCompare(b.id);
}

/** Directed in-group edges: map links (both-ways either direction) plus parent → child. */
function documentationWalkGraph(nodes: GraphNode[], links: GraphLink[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, Map<string, GraphLink["kind"]>>();
  const inbound = new Map<string, number>();
  for (const id of ids) {
    outgoing.set(id, new Map());
    inbound.set(id, 0);
  }
  const add = (from: string, to: string, kind: GraphLink["kind"]) => {
    if (!ids.has(from) || !ids.has(to) || from === to) return;
    const edges = outgoing.get(from);
    if (!edges) return;
    const prev = edges.get(to);
    if (prev == null) {
      edges.set(to, kind);
      inbound.set(to, (inbound.get(to) ?? 0) + 1);
      return;
    }
    if (prev !== "parent" && kind === "parent") edges.set(to, "parent");
  };
  for (const link of links) {
    const ends = linkEnds(link);
    add(ends.source, ends.target, link.kind);
    if (link.arrows === "both") add(ends.target, ends.source, link.kind);
  }
  for (const node of nodes) {
    for (const child of nodeChildren(nodes, node.id)) add(node.id, child.id, "parent");
  }
  return { outgoing, inbound };
}

function isDocEnd(node: GraphNode) {
  return nodeClassFromSize(node.size) === "end";
}

function isDocStart(node: GraphNode) {
  return nodeClassFromSize(node.size) === "start";
}

/** Longest remaining walk to an in-group End. Already-written nodes are not remaining. */
function scoreToEnd(
  id: string,
  outgoing: Map<string, Map<string, GraphLink["kind"]>>,
  byId: Map<string, GraphNode>,
  written: Set<string>,
  visiting: Set<string>,
  memo: Map<string, PathScore>,
): PathScore {
  if (written.has(id)) return { reachesEnd: false, hops: 0 };
  const cached = memo.get(id);
  if (cached) return cached;
  const node = byId.get(id);
  if (!node) return { reachesEnd: false, hops: 0 };
  if (isDocEnd(node)) {
    const score = { reachesEnd: true, hops: 0 };
    memo.set(id, score);
    return score;
  }
  if (visiting.has(id)) return { reachesEnd: false, hops: 0 };
  visiting.add(id);
  let best: PathScore = { reachesEnd: false, hops: 0 };
  for (const to of outgoing.get(id)?.keys() ?? []) {
    if (written.has(to)) continue;
    const sub = scoreToEnd(to, outgoing, byId, written, visiting, memo);
    const hops = sub.hops + 1;
    const betterReach = sub.reachesEnd && !best.reachesEnd;
    const longerReach = sub.reachesEnd && best.reachesEnd && hops > best.hops;
    const longerDead = !sub.reachesEnd && !best.reachesEnd && hops > best.hops;
    if (betterReach || longerReach || longerDead) best = { reachesEnd: sub.reachesEnd, hops };
  }
  visiting.delete(id);
  memo.set(id, best);
  return best;
}

function rankedSuccessors(
  id: string,
  outgoing: Map<string, Map<string, GraphLink["kind"]>>,
  byId: Map<string, GraphNode>,
  written: Set<string>,
): WalkEdge[] {
  const edges: WalkEdge[] = [];
  for (const [to, kind] of outgoing.get(id) ?? []) {
    if (!written.has(to)) edges.push({ to, kind });
  }
  const memo = new Map<string, PathScore>();
  edges.sort((a, b) => {
    const left = scoreToEnd(a.to, outgoing, byId, written, new Set(), memo);
    const right = scoreToEnd(b.to, outgoing, byId, written, new Set(), memo);
    if (left.reachesEnd !== right.reachesEnd) return left.reachesEnd ? -1 : 1;
    if (left.hops !== right.hops) return right.hops - left.hops;
    if (a.kind !== b.kind) return a.kind === "parent" ? -1 : 1;
    const aNode = byId.get(a.to);
    const bNode = byId.get(b.to);
    if (aNode && bNode) return compareNodes(aNode, bNode);
    return a.to.localeCompare(b.to);
  });
  return edges;
}

function stepFrom(node: GraphNode, branches: DocProcess[] = []): DocStep {
  return {
    id: node.id,
    number: "",
    title: nodeTitle(node),
    description: node.description.trim(),
    branches,
  };
}

/**
 * Follow the longest route to an End first so a branch stops when it merges
 * back onto nodes already written.
 */
function walkProcess(
  rootId: string,
  kind: DocProcess["kind"],
  outgoing: Map<string, Map<string, GraphLink["kind"]>>,
  byId: Map<string, GraphNode>,
  written: Set<string>,
): DocProcess | null {
  const root = byId.get(rootId);
  if (!root || written.has(rootId)) return null;
  const steps: DocStep[] = [];
  const pending: { index: number; to: string }[] = [];
  let current: string | null = rootId;
  while (current && !written.has(current)) {
    const node = byId.get(current);
    if (!node) break;
    written.add(current);
    const index = steps.length;
    steps.push(stepFrom(node));
    if (isDocEnd(node)) break;
    const next = rankedSuccessors(current, outgoing, byId, written);
    for (const edge of next.slice(1)) pending.push({ index, to: edge.to });
    current = next[0]?.to ?? null;
  }
  for (const branch of pending) {
    const nested = walkProcess(branch.to, "branch", outgoing, byId, written);
    if (!nested) continue;
    const step = steps[branch.index];
    if (step) step.branches.push(nested);
  }
  if (!steps.length) return null;
  const title = kind === "process" ? `From ${steps[0]?.title ?? rootId}` : (steps[0]?.title ?? rootId);
  return { id: rootId, number: "", title, kind, steps };
}

/** Section → process → step → branch → step. Other follows the processes in the same section. */
function numberDocumentationOutline(partNumber: number, processes: DocProcess[], other: DocStep[]) {
  const numberSteps = (steps: DocStep[], parent: string) => {
    steps.forEach((step, index) => {
      step.number = `${parent}.${index + 1}`;
      step.branches.forEach((branch, branchIndex) => {
        branch.number = `${step.number}.${branchIndex + 1}`;
        numberSteps(branch.steps, branch.number);
      });
    });
  };
  processes.forEach((process, index) => {
    process.number = `${partNumber}.${index + 1}`;
    numberSteps(process.steps, process.number);
  });
  const otherNumber = `${partNumber}.${processes.length + 1}`;
  numberSteps(other, otherNumber);
  return otherNumber;
}

function documentationOutline(nodes: GraphNode[], links: GraphLink[]): { processes: DocProcess[]; other: DocStep[] } {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const { outgoing, inbound } = documentationWalkGraph(nodes, links);
  const written = new Set<string>();
  const processes: DocProcess[] = [];
  const starts = nodes.filter(isDocStart).sort(compareNodes);
  const roots = starts.length
    ? starts
    : nodes
        .filter((node) => (inbound.get(node.id) ?? 0) === 0 && (outgoing.get(node.id)?.size ?? 0) > 0)
        .sort(compareNodes);
  for (const root of roots) {
    const process = walkProcess(root.id, "process", outgoing, byId, written);
    if (process) processes.push(process);
  }
  const other = nodes
    .filter((node) => !written.has(node.id))
    .sort(compareNodes)
    .map((node) => stepFrom(node));
  return { processes, other };
}

/** One section per leaf group. Inside it, Start→End processes with nested branches, then leftovers. */
export function buildDocumentationBook(
  nodes: GraphNode[],
  links: GraphLink[],
  groups: GraphGroup[],
): { parts: DocBookPart[] } {
  const leaves = leafGroups(groups);
  const leafIds = new Set(leaves.map((group) => group.id));
  const parts: DocBookPart[] = [];
  let partNo = 1;
  const pushPart = (id: string, title: string, path: string, color: string, members: GraphNode[]) => {
    if (!members.length) return;
    const outline = documentationOutline(members, links);
    const otherNumber = numberDocumentationOutline(partNo, outline.processes, outline.other);
    parts.push({ id, number: partNo, title, path, color, otherNumber, ...outline });
    partNo += 1;
  };
  for (const group of leaves) {
    pushPart(
      group.id,
      groupTitle(group.title),
      groupPath(groups, group.id).join(" / "),
      groupPaintColor(group),
      nodes.filter((node) => node.groupId === group.id),
    );
  }
  pushPart(
    UNGROUPED_FILTER,
    "Ungrouped",
    "Ungrouped",
    "#94a3b8",
    nodes.filter((node) => !node.groupId || !leafIds.has(node.groupId)),
  );
  return { parts };
}

function flowchartKind(node: GraphNode): FlowchartBox["kind"] {
  const cls = nodeClassFromSize(node.size);
  if (cls === "start") return "start";
  if (cls === "end") return "end";
  return "process";
}

function rankNodes(nodes: GraphNode[], links: GraphLink[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, []);
  }
  for (const link of links) {
    const ends = linkEnds(link);
    if (!ids.has(ends.source) || !ids.has(ends.target)) continue;
    incoming.set(ends.target, (incoming.get(ends.target) ?? 0) + 1);
    outgoing.get(ends.source)?.push(ends.target);
  }
  const rank = new Map<string, number>();
  for (const node of nodes) {
    const roots = !node.parentId || !ids.has(node.parentId);
    if ((incoming.get(node.id) ?? 0) === 0 && roots) {
      rank.set(node.id, 0);
    }
  }
  if (!rank.size) {
    for (const root of nodeHierarchyRoots(nodes)) {
      rank.set(root.id, 0);
    }
  }
  for (const node of nodes) {
    if (!rank.has(node.id)) rank.set(node.id, 0);
  }
  // Longest-path layering on cyclic graphs can grow ranks forever in a queue loop; relax with a bounded pass count.
  const maxPasses = Math.max(1, nodes.length);
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const node of nodes) {
      const r = rank.get(node.id) ?? 0;
      for (const child of nodeChildren(nodes, node.id)) {
        const next = r + 1;
        if (next > (rank.get(child.id) ?? 0)) {
          rank.set(child.id, next);
          changed = true;
        }
      }
      for (const target of outgoing.get(node.id) ?? []) {
        const next = r + 1;
        if (next > (rank.get(target) ?? 0)) {
          rank.set(target, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  for (const node of nodes) {
    if (!rank.has(node.id)) {
      const depth = nodePath(nodes, node.id).length - 1;
      rank.set(node.id, Math.max(0, depth));
    }
  }
  return rank;
}

export function flowchartPagesForGroups(
  nodes: GraphNode[],
  links: GraphLink[],
  groups: GraphGroup[],
  groupIds: string[],
): FlowchartGroupPage[] {
  const wanted = new Set(groupIds);
  const pages: FlowchartGroupPage[] = [];

  function pageFor(
    groupId: string,
    title: string,
    path: string,
    color: string,
    members: GraphNode[],
  ): FlowchartGroupPage {
    const ids = new Set(members.map((node) => node.id));
    const pageLinks = links.filter((link) => {
      const ends = linkEnds(link);
      return ids.has(ends.source) && ids.has(ends.target);
    });
    return { groupId, title, path, color, nodes: members, links: pageLinks };
  }

  for (const group of leafGroups(groups)) {
    if (!wanted.has(group.id)) continue;
    const path = groupPath(groups, group.id);
    pages.push(
      pageFor(
        group.id,
        groupTitle(group.title),
        path.join(" / "),
        groupPaintColor(group),
        nodes.filter((node) => node.groupId === group.id),
      ),
    );
  }
  if (wanted.has(UNGROUPED_FILTER)) {
    pages.push(
      pageFor(
        UNGROUPED_FILTER,
        "Ungrouped",
        "Ungrouped",
        "#94a3b8",
        nodes.filter((node) => !node.groupId),
      ),
    );
  }
  return pages;
}

/** Word-wrap a node title so the printed box keeps every character. */
export function wrapFlowchartTitle(title: string, innerWidth: number): string[] {
  const maxChars = Math.max(12, Math.floor(innerWidth / 6.7));
  const words = title.split(/\s+/).filter(Boolean);
  if (!words.length) return ["Untitled"];
  const lines: string[] = [];
  let line = "";
  const pushWord = (word: string) => {
    if (word.length <= maxChars) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
      return;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    for (let index = 0; index < word.length; index += maxChars) {
      lines.push(word.slice(index, index + maxChars));
    }
  };
  for (const word of words) pushWord(word);
  if (line) lines.push(line);
  return lines;
}

function boxHeightForLines(lineCount: number) {
  return 14 + lineCount * 16 + 12;
}

function edgesAmong(nodes: GraphNode[], links: GraphLink[], boxes: FlowchartBox[]): FlowchartEdge[] {
  const byId = new Set(boxes.map((box) => box.id));
  const edges: FlowchartEdge[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    const ends = linkEnds(link);
    if (!byId.has(ends.source) || !byId.has(ends.target)) continue;
    const key = `${ends.source}->${ends.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: link.id,
      from: ends.source,
      to: ends.target,
      arrows: link.arrows,
      kind: link.kind,
      label: link.kind === "parent" ? "" : "link",
    });
  }
  for (const node of nodes) {
    if (!byId.has(node.id)) continue;
    for (const child of nodeChildren(nodes, node.id)) {
      const key = `${node.id}->${child.id}`;
      if (seen.has(key) || !byId.has(child.id)) continue;
      seen.add(key);
      edges.push({
        id: `parent-${node.id}-${child.id}`,
        from: node.id,
        to: child.id,
        arrows: "one",
        kind: "parent",
        label: "",
      });
    }
  }
  return edges;
}

function finishPage(
  nodes: GraphNode[],
  links: GraphLink[],
  boxes: FlowchartBox[],
  label: string,
  color: string,
): FlowchartLayout {
  const maxY = boxes.reduce((max, box) => Math.max(max, box.y + box.h), 48);
  return {
    boxes,
    edges: edgesAmong(nodes, links, boxes),
    width: PAGE_W,
    height: Math.max(200, maxY + 18),
    label,
    color,
  };
}

/** Top-down portrait pages. A group continues onto another page instead of shrinking the type. */
export function layoutFlowchartPages(nodes: GraphNode[], links: GraphLink[], label = "", color = "#24338a"): FlowchartLayout[] {
  if (!nodes.length) {
    return [{ boxes: [], edges: [], width: PAGE_W, height: 220, label, color }];
  }
  const rank = rankNodes(nodes, links);
  const rows = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const r = rank.get(node.id) ?? 0;
    const row = rows.get(r) ?? [];
    row.push(node);
    rows.set(r, row);
  }
  const ranks = [...rows.keys()].sort((a, b) => a - b);
  for (const r of ranks) {
    rows.get(r)?.sort((a, b) => nodeTitle(a).localeCompare(nodeTitle(b)) || a.id.localeCompare(b.id));
  }

  const perRow = Math.max(1, Math.floor((CONTENT_W + GAP_X) / (MIN_BOX_W + GAP_X)));
  const pages: FlowchartBox[][] = [];
  let pageBoxes: FlowchartBox[] = [];
  let y = 16;

  function flush() {
    pages.push(pageBoxes);
    pageBoxes = [];
    y = 16;
  }

  for (const r of ranks) {
    const row = rows.get(r) ?? [];
    for (let index = 0; index < row.length; index += perRow) {
      const slice = row.slice(index, index + perRow);
      const boxW =
        slice.length === 1 ? Math.min(CONTENT_W, 520) : (CONTENT_W - (slice.length - 1) * GAP_X) / slice.length;
      const inner = boxW - 22;
      const rowH = Math.max(
        ...slice.map((node) => boxHeightForLines(wrapFlowchartTitle(nodeTitle(node), inner).length)),
      );
      if (pageBoxes.length && y + rowH > CHART_H - 12) flush();
      const rowW = slice.length * boxW + (slice.length - 1) * GAP_X;
      let x = CONTENT_X + Math.max(0, (CONTENT_W - rowW) / 2);
      for (const node of slice) {
        pageBoxes.push({
          id: node.id,
          title: nodeTitle(node),
          x,
          y,
          w: boxW,
          h: rowH,
          kind: flowchartKind(node),
        });
        x += boxW + GAP_X;
      }
      y += rowH + GAP_Y;
    }
  }
  if (pageBoxes.length) pages.push(pageBoxes);
  return pages.map((boxes) => finishPage(nodes, links, boxes, label, color));
}

export function layoutFlowchart(nodes: GraphNode[], links: GraphLink[]): FlowchartLayout {
  return (
    layoutFlowchartPages(nodes, links)[0] ?? {
      boxes: [],
      edges: [],
      width: PAGE_W,
      height: 220,
      label: "",
      color: "#24338a",
    }
  );
}

export function groupForestOutline(groups: GraphGroup[]) {
  const rows: { id: string; number: string; title: string; path: string; kind: string }[] = [];
  const walk = (parentId: string | null, path: number[]) => {
    const kids = parentId == null ? rootGroups(groups) : groupChildren(groups, parentId);
    kids.forEach((group, index) => {
      const next = [...path, index + 1];
      rows.push({
        id: group.id,
        number: outlineNumber(next),
        title: groupTitle(group.title),
        path: groupPath(groups, group.id).join(" / "),
        kind: isLeaf(groups, group.id) ? "Group" : "Folder",
      });
      walk(group.id, next);
    });
  };
  walk(null, []);
  return rows;
}
